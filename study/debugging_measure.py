"""Candidate commensurable debugging measure RTL-S (DECISIONS.md D9).

Registered 2026-11-17 under gap-closure decision 5, before any
computation. RTL-S is a candidate measure awaiting Jesun's review. It
is not an H4 verdict, and no value it produces is diagnosis time. H4
stays Not yet measured (DECISIONS.md D8) unless the measure and a
scoring rule are adopted after review.

The measure, in brief (full definition in DECISIONS.md D9): a scripted
diagnostician reads only one arm's own persisted store for a fault
run, projected to step-evidence items (one item per persisted record
that evidences exactly one executor step), in persisted order. It
stops at the first item carrying an anomaly marker stated in step
terms (a step marked recovered in the item's observations, or an item
evidencing the completion of an already-completed step) and outputs
the step the marker names. RTL-S is the number of items read. The
unit is the step-evidence item, the one indexing both arms' stores
share by construction.

Computation gate: the inputs are the arms' persisted stores under
workdir/fault/**, which .gitignore excludes from the committed
record. This module is delivered with its tests only; the CLI below
exists for the day the stores are part of the record (or Jesun
directs otherwise). It is not run against uncommitted stores for any
reported number.
"""

import json
import os
import sqlite3
import statistics

from .tasks import TASKS_BY_ID

LANGGRAPH_DB = "checkpoints.sqlite"
NATIVE_DB = "native_state.sqlite"


def key_to_step(task):
    """Map each intended effect key of a task to its fixture step.

    Every append or branch step produces exactly one intended effect,
    in step order, so the ordered intended keys zip onto the ordered
    effect-producing steps.
    """
    producing_steps = [
        index
        for index, step in enumerate(task.steps)
        if step["kind"] in ("append", "branch")
    ]
    keys = task.intended_keys()
    if len(keys) != len(producing_steps):
        raise ValueError(
            "task %s: %d intended keys for %d effect steps"
            % (task.task_id, len(keys), len(producing_steps))
        )
    return dict(zip(keys, producing_steps))


def _recovered_steps(observations):
    """Step indexes whose observation marks the step recovered."""
    recovered = set()
    for step_key, value in (observations or {}).items():
        if isinstance(value, dict) and value.get("recovered") is True:
            recovered.add(int(step_key))
    return recovered


def project_langgraph_store(db_path, task):
    """Project a LangGraph checkpoints.sqlite to step-evidence items.

    One item per checkpoints row whose metadata source is "loop", in
    rowid (persisted) order. The writes table is not read (DECISIONS
    D9). An item completes its step when the step is an executor step
    of the task (the terminal super-step completes none).
    """
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

    serde = JsonPlusSerializer()
    conn = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    try:
        rows = conn.execute(
            "SELECT type, checkpoint, metadata FROM checkpoints "
            "WHERE checkpoint_ns = '' ORDER BY rowid"
        ).fetchall()
    finally:
        conn.close()
    items = []
    for serde_type, blob, metadata_raw in rows:
        metadata = json.loads(metadata_raw)
        if metadata.get("source") != "loop":
            continue
        step = int(metadata["step"])
        checkpoint = serde.loads_typed((serde_type, blob))
        observations = checkpoint.get("channel_values", {}).get(
            "observations", {}
        )
        items.append(
            {
                "kind": "checkpoint",
                "step": step,
                "completes": step if step < len(task.steps) else None,
                "recovered": _recovered_steps(observations),
            }
        )
    return items


def project_native_store(db_path, task):
    """Project a native native_state.sqlite to step-evidence items.

    One item per effects row, in rowid (persisted) order, its step
    taken from the fixture via the effect key; plus one terminal item
    for the run_state snapshot, read last, carrying the final state's
    observations.
    """
    step_by_key = key_to_step(task)
    conn = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    try:
        effect_rows = conn.execute(
            "SELECT key FROM effects ORDER BY rowid"
        ).fetchall()
        state_row = conn.execute(
            "SELECT body FROM run_state WHERE id = 1"
        ).fetchone()
    finally:
        conn.close()
    items = []
    for (key,) in effect_rows:
        items.append(
            {
                "kind": "effect",
                "step": step_by_key[key],
                "completes": step_by_key[key],
                "recovered": set(),
            }
        )
    if state_row is not None:
        state = json.loads(state_row[0])
        items.append(
            {
                "kind": "state",
                "step": None,
                "completes": None,
                "recovered": _recovered_steps(state.get("observations", {})),
            }
        )
    return items


def diagnose(items):
    """Run the scripted diagnostician over projected items.

    Returns (rtl_s, output_step). output_step is None when no item
    carries an anomaly marker; rtl_s is then the total item count.
    The marker rule is DECISIONS D9's, identical for both arms.
    """
    completed = set()
    for index, item in enumerate(items):
        if item["recovered"]:
            return index + 1, sorted(item["recovered"])[0]
        completes = item.get("completes")
        if completes is not None:
            if completes in completed:
                return index + 1, completes
            completed.add(completes)
    return len(items), None


def failing_step(raw_record):
    """The step a fault run's kill interrupted (kill points are 1-based)."""
    return int(raw_record["kill_point"]) - 1


def score_items(items, raw_record):
    rtl_s, output_step = diagnose(items)
    target = failing_step(raw_record)
    return {
        "rtl_s": rtl_s,
        "output_step": output_step,
        "failing_step": target,
        "localized": output_step == target,
        "items_total": len(items),
    }


def run_dir_for(workdir_root, raw_record):
    cell = "F%s-%s-r%s" % (
        raw_record["fault_class"][-1],
        raw_record["kill_point"],
        raw_record["repeat"],
    )
    return os.path.join(
        workdir_root, raw_record["arm"], raw_record["task"], cell
    )


def score_run(workdir_root, raw_record):
    """Project one fault run's store and score the diagnostician.

    Reads the arm's persisted store only; the raw record supplies the
    ground truth (arm, task, fault class, kill point) used to find the
    run directory and to score the output after the scan.
    """
    task = TASKS_BY_ID[raw_record["task"]]
    directory = run_dir_for(workdir_root, raw_record)
    if raw_record["arm"] == "langgraph":
        items = project_langgraph_store(
            os.path.join(directory, LANGGRAPH_DB), task
        )
    elif raw_record["arm"] == "native":
        items = project_native_store(os.path.join(directory, NATIVE_DB), task)
    else:
        raise ValueError("unknown arm %r" % (raw_record["arm"],))
    scored = score_items(items, raw_record)
    scored.update(
        {
            "arm": raw_record["arm"],
            "task": raw_record["task"],
            "fault_class": raw_record["fault_class"],
        }
    )
    return scored


def summarize(scored_runs):
    """Per-arm median RTL-S and localized share, split by fault class."""
    summary = {}
    for arm in sorted({row["arm"] for row in scored_runs}):
        arm_rows = [row for row in scored_runs if row["arm"] == arm]
        entry = {}
        for label, rows in (
            ("F1", [r for r in arm_rows if r["fault_class"] == "F1"]),
            ("F2", [r for r in arm_rows if r["fault_class"] == "F2"]),
            ("pooled", arm_rows),
        ):
            if not rows:
                continue
            entry[label] = {
                "runs": len(rows),
                "median_rtl_s": statistics.median(
                    row["rtl_s"] for row in rows
                ),
                "localized_share": sum(
                    1 for row in rows if row["localized"]
                )
                / len(rows),
            }
        summary[arm] = entry
    return summary


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "RTL-S candidate debugging measure (DECISIONS.md D9). "
            "Not an H4 verdict. Requires the arms' persisted stores, "
            "which are not part of the committed record."
        )
    )
    parser.add_argument(
        "--workdir",
        default=os.path.join("workdir", "fault"),
        help="fault workdir root holding <arm>/<task>/<cell> run dirs",
    )
    parser.add_argument(
        "--fault-json",
        default=os.path.join("results", "raw_fault.json"),
        help="committed fault record with the ground truth per run",
    )
    args = parser.parse_args(argv)
    with open(args.fault_json, encoding="utf-8") as fh:
        records = json.load(fh)
    scored = [score_run(args.workdir, record) for record in records]
    print(json.dumps(summarize(scored), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
