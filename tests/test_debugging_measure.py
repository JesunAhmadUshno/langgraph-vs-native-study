"""Tests for the RTL-S candidate debugging measure (DECISIONS.md D9).

The stores used here are synthetic fixtures built to the real schemas
(the LangGraph schema is created by SqliteSaver itself; the native
schema copies study/arm_native.py). No committed or uncommitted run
artifacts are read.
"""

import json
import os
import sqlite3

from study import debugging_measure as dm
from study.tasks import TASKS_BY_ID

T07 = TASKS_BY_ID["T07"]


def _item(step, completes=None, recovered=(), kind="checkpoint"):
    return {
        "kind": kind,
        "step": step,
        "completes": step if completes is None else completes,
        "recovered": set(recovered),
    }


def test_key_to_step_maps_append_and_branch_tasks():
    assert dm.key_to_step(T07) == {
        "t07-fx%d" % (i + 1): i for i in range(8)
    }
    # T04: step 0 is a lookup (no effect); the branch step 1 and the
    # append step 2 carry the two intended keys.
    assert dm.key_to_step(TASKS_BY_ID["T04"]) == {"t04-fx1": 1, "t04-fx3": 2}


def test_diagnose_stops_at_recovered_marker():
    items = [_item(0), _item(1), _item(2, recovered={2}), _item(3)]
    rtl_s, output = dm.diagnose(items)
    assert rtl_s == 3
    assert output == 2


def test_diagnose_stops_at_repeat_marker():
    items = [_item(0), _item(1), _item(1), _item(2)]
    rtl_s, output = dm.diagnose(items)
    assert rtl_s == 3
    assert output == 1


def test_diagnose_without_marker_reads_everything():
    items = [_item(0), _item(1), _item(2)]
    rtl_s, output = dm.diagnose(items)
    assert rtl_s == 3
    assert output is None


def test_failing_step_is_kill_point_minus_one():
    assert dm.failing_step({"kill_point": 2}) == 1
    assert dm.failing_step({"kill_point": 6}) == 5


def _write_langgraph_store(path, observations_by_step):
    """Build a checkpoints.sqlite with SqliteSaver's own schema.

    observations_by_step maps metadata step to the observations dict
    the checkpoint carries; a step of -1 writes the input checkpoint.
    """
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
    from langgraph.checkpoint.sqlite import SqliteSaver

    serde = JsonPlusSerializer()
    conn = sqlite3.connect(path)
    saver = SqliteSaver(conn)
    saver.setup()
    parent = None
    for index, (step, observations) in enumerate(
        sorted(observations_by_step.items())
    ):
        checkpoint = {
            "v": 1,
            "id": "ckpt-%04d" % index,
            "ts": "2026-11-06T00:00:00+00:00",
            "channel_values": {"observations": observations},
            "channel_versions": {},
            "versions_seen": {},
        }
        serde_type, blob = serde.dumps_typed(checkpoint)
        metadata = {
            "source": "input" if step < 0 else "loop",
            "step": step,
            "parents": {},
        }
        checkpoint_id = "id-%04d" % index
        conn.execute(
            "INSERT INTO checkpoints (thread_id, checkpoint_ns, "
            "checkpoint_id, parent_checkpoint_id, type, checkpoint, "
            "metadata) VALUES ('run', '', ?, ?, ?, ?, ?)",
            (
                checkpoint_id,
                parent,
                serde_type,
                blob,
                json.dumps(metadata).encode(),
            ),
        )
        parent = checkpoint_id
    conn.commit()
    conn.close()


def test_langgraph_projection_and_f2_scoring(tmp_path):
    db_path = str(tmp_path / "checkpoints.sqlite")
    plain = {"value": 1}
    _write_langgraph_store(
        db_path,
        {
            -1: {},
            0: {"0": plain},
            1: {"0": plain, "1": plain},
            # F2 pattern: the resumed step's observation is recovered.
            2: {"0": plain, "1": plain, "2": {"entry": 3, "recovered": True}},
            3: {"0": plain, "1": plain, "2": {"entry": 3, "recovered": True}},
        },
    )
    items = dm.project_langgraph_store(db_path, T07)
    # The input checkpoint is excluded; one item per loop checkpoint.
    assert [item["step"] for item in items] == [0, 1, 2, 3]
    scored = dm.score_items(items, {"kill_point": 3})
    assert scored["rtl_s"] == 3
    assert scored["output_step"] == 2
    assert scored["localized"] is True


def test_langgraph_projection_f1_pattern_not_localized(tmp_path):
    db_path = str(tmp_path / "checkpoints.sqlite")
    plain = {"value": 1}
    _write_langgraph_store(
        db_path,
        {-1: {}, 0: {"0": plain}, 1: {"0": plain, "1": plain}},
    )
    items = dm.project_langgraph_store(db_path, T07)
    scored = dm.score_items(items, {"kill_point": 2})
    # The D9 limit recorded in advance: an F1 kill leaves no marker.
    assert scored["localized"] is False
    assert scored["output_step"] is None
    assert scored["rtl_s"] == scored["items_total"] == 2


def _write_native_store(path, effect_keys, observations):
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE run_state ("
        "id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE effects (key TEXT PRIMARY KEY, status TEXT NOT NULL)"
    )
    for key in effect_keys:
        conn.execute(
            "INSERT INTO effects (key, status) VALUES (?, 'done')", (key,)
        )
    body = {
        "next_step": 8,
        "observations": observations,
        "invocations": 8,
        "status": "completed",
        "failure": None,
    }
    conn.execute(
        "INSERT INTO run_state (id, body) VALUES (1, ?)", (json.dumps(body),)
    )
    conn.commit()
    conn.close()


def test_native_projection_and_f2_scoring(tmp_path):
    db_path = str(tmp_path / "native_state.sqlite")
    observations = {
        str(i): {"entry": i} for i in range(8)
    }
    observations["2"] = {"entry": 2, "recovered": True}
    _write_native_store(db_path, T07.intended_keys(), observations)
    items = dm.project_native_store(db_path, T07)
    assert [item["step"] for item in items[:8]] == list(range(8))
    assert items[-1]["kind"] == "state"
    scored = dm.score_items(items, {"kill_point": 3})
    # Effect items carry no marker; the state snapshot, read last,
    # names the recovered step.
    assert scored["rtl_s"] == 9
    assert scored["output_step"] == 2
    assert scored["localized"] is True


def test_native_projection_f1_pattern_not_localized(tmp_path):
    db_path = str(tmp_path / "native_state.sqlite")
    observations = {str(i): {"entry": i} for i in range(8)}
    _write_native_store(db_path, T07.intended_keys(), observations)
    items = dm.project_native_store(db_path, T07)
    scored = dm.score_items(items, {"kill_point": 2})
    assert scored["localized"] is False
    assert scored["rtl_s"] == scored["items_total"] == 9


def test_run_dir_for_matches_workdir_layout():
    record = {
        "arm": "native",
        "task": "T07",
        "fault_class": "F1",
        "kill_point": 2,
        "repeat": 0,
    }
    path = dm.run_dir_for(os.path.join("workdir", "fault"), record)
    assert path.endswith(os.path.join("native", "T07", "F1-2-r0"))


def test_summarize_groups_by_arm_and_class():
    rows = [
        {"arm": "native", "fault_class": "F1", "rtl_s": 9, "localized": False},
        {"arm": "native", "fault_class": "F2", "rtl_s": 9, "localized": True},
        {"arm": "langgraph", "fault_class": "F2", "rtl_s": 3, "localized": True},
    ]
    summary = dm.summarize(rows)
    assert summary["native"]["pooled"]["runs"] == 2
    assert summary["native"]["F2"]["localized_share"] == 1.0
    assert summary["langgraph"]["F2"]["median_rtl_s"] == 3
