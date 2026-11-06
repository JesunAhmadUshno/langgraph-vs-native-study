"""LangGraph arm: the shared executor inside a StateGraph.

Durability design (the framework pattern):
- One node runs exactly one executor step, then the graph loops.
- State is checkpointed after every superstep by the SQLite
  checkpointer, keyed by a thread id per run.
- The node is written to be safe to re-run: before applying an effect
  it asks the ledger (was_applied) whether the effect already landed,
  which is the idempotency discipline the LangGraph durable-execution
  documentation prescribes for side effects inside nodes.
- Resume: invoke the graph again with the same thread id and no new
  input. The graph continues from the last checkpoint.
"""

import json
import os
import sqlite3
import time
from typing import Optional, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

from . import executor
from .tools import Tools

DB_NAME = "checkpoints.sqlite"


class GraphState(TypedDict):
    next_step: int
    observations: dict
    invocations: int
    status: str
    failure: Optional[str]


def _build_graph(ctx):
    def step_node(state, config):
        plain = {
            "next_step": state["next_step"],
            "observations": json.loads(json.dumps(state["observations"])),
            "invocations": state["invocations"],
            "status": state["status"],
            "failure": state["failure"],
        }
        updated = executor.execute_one(plain, ctx)
        return updated

    def route(state):
        if state["status"] != "running":
            return END
        return "step"

    builder = StateGraph(GraphState)
    builder.add_node("step", step_node)
    builder.add_edge(START, "step")
    builder.add_conditional_edges("step", route, {"step": "step", END: END})
    return builder


def run(task, trial_seed, run_dir):
    """Run or resume one trial. Returns the result dict."""
    os.makedirs(run_dir, exist_ok=True)
    tools = Tools(run_dir, task, trial_seed)
    trace = executor.Trace(run_dir)

    def reconcile(key):
        return tools.was_applied(key)

    def commit(action):
        return tools.append_record(
            action["collection"], action["payload"], action["key"], action["step"]
        )

    ctx = executor.Context(task, tools, trace, reconcile, commit)
    db_path = os.path.join(run_dir, DB_NAME)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    saver = SqliteSaver(conn)
    if hasattr(saver, "setup"):
        saver.setup()
    graph = _build_graph(ctx).compile(checkpointer=saver)
    config = {"configurable": {"thread_id": "run"}}
    started = time.perf_counter()
    if saver.get_tuple(config) is not None:
        final = graph.invoke(None, config)
    else:
        final = graph.invoke(executor.new_state(), config)
    wall = time.perf_counter() - started
    conn.close()
    return {
        "status": final["status"],
        "failure": final["failure"],
        "invocations": final["invocations"],
        "wall_seconds": wall,
        "state_bytes": os.path.getsize(db_path),
    }
