from study import arm_langgraph, arm_native, scoring
from study.tasks import TASKS_BY_ID


def test_native_arm_completes_simple_task(tmp_path):
    task = TASKS_BY_ID["T01"]
    run_dir = str(tmp_path / "native-t01")
    result = arm_native.run(task, 1000, run_dir)
    scored = scoring.score_run(task, run_dir, result)
    assert result["status"] == "completed"
    assert scored["success"]


def test_langgraph_arm_completes_branch_task(tmp_path):
    task = TASKS_BY_ID["T04"]
    run_dir = str(tmp_path / "langgraph-t04")
    result = arm_langgraph.run(task, 1000, run_dir)
    scored = scoring.score_run(task, run_dir, result)
    assert result["status"] == "completed"
    assert scored["success"]


def test_native_resume_after_completion_adds_nothing(tmp_path):
    task = TASKS_BY_ID["T02"]
    run_dir = str(tmp_path / "native-t02")
    first = arm_native.run(task, 1000, run_dir)
    second = arm_native.run(task, 1000, run_dir)
    scored = scoring.score_run(task, run_dir, second)
    assert first["status"] == second["status"] == "completed"
    assert scored["success"]
    assert scored["duplicates"] == []
