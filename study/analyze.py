"""Analysis: raw suite output to metrics, verdicts and RESULTS.md.

Every number in RESULTS.md is computed here from results/raw_main.json
and results/raw_fault.json. Verdict rules are the ones registered in
HYPOTHESES.md. Run: python -m study.analyze
"""

import json
import math
import os
import random
import statistics
from collections import Counter, defaultdict
from math import comb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(ROOT, "results")
ARMS = ("langgraph", "native")


# --- Student t quantile via the regularized incomplete beta ------------
def _betacf(a, b, x):
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-300:
        d = 1e-300
    d = 1.0 / d
    h = d
    for m in range(1, 201):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1.0 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1.0 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3e-7:
            break
    return h


def _betainc(a, b, x):
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def t_cdf(t, df):
    x = df / (df + t * t)
    ib = _betainc(df / 2.0, 0.5, x)
    if t >= 0:
        return 1.0 - 0.5 * ib
    return 0.5 * ib


def t_ppf(p, df):
    lo, hi = -50.0, 50.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def beta_ppf(p, a, b):
    """Quantile of the Beta(a, b) distribution, by bisection on _betainc."""
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if _betainc(a, b, mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def clopper_pearson(successes, trials, alpha=0.05):
    """Exact two-sided binomial interval for successes out of trials."""
    lower = 0.0 if successes == 0 else beta_ppf(alpha / 2, successes, trials - successes + 1)
    upper = 1.0 if successes == trials else beta_ppf(1 - alpha / 2, successes + 1, trials - successes)
    return [lower, upper]


def sign_test(wins, pairs):
    """Exact two-sided sign test p-value for wins out of pairs (no ties)."""
    tail = sum(comb(pairs, i) for i in range(0, min(wins, pairs - wins) + 1))
    return min(1.0, 2.0 * tail / 2 ** pairs)


# Registered here for the added uncertainty analysis; it never touches the raw files.
BOOTSTRAP_SEED = 20261107
BOOTSTRAP_REPS = 10000


def paired_wall(main_records):
    """Per-run wall seconds paired by (task, seed): list of (langgraph, native)."""
    by_key = {(r["task"], r["seed"], r["arm"]): r["wall_seconds"] for r in main_records}
    keys = sorted({(r["task"], r["seed"]) for r in main_records})
    return [(by_key[(t, s, "langgraph")], by_key[(t, s, "native")]) for t, s in keys]


def bootstrap_median_ratio(pairs, reps=BOOTSTRAP_REPS, seed=BOOTSTRAP_SEED, alpha=0.05):
    """Percentile CI for median(langgraph) / median(native), resampling pairs."""
    rng = random.Random(seed)
    n = len(pairs)
    ratios = []
    for _ in range(reps):
        sample = [pairs[rng.randrange(n)] for _ in range(n)]
        ratios.append(_median([a for a, _ in sample]) / _median([b for _, b in sample]))
    ratios.sort()
    return [ratios[int(math.floor(alpha / 2 * reps))], ratios[int(math.ceil((1 - alpha / 2) * reps)) - 1]]


# --- metric helpers ------------------------------------------------------
def _median(values):
    return statistics.median(values)


def _p95(values):
    ordered = sorted(values)
    idx = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return ordered[idx]


def _passk(successes, trials, k):
    if successes < k:
        return 0.0
    return comb(successes, k) / comb(trials, k)


def _code_lines(path):
    total = 0
    code = 0
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            total += 1
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                code += 1
    return total, code


def code_surface():
    groups = {
        "shared core": ["tasks.py", "policy.py", "tools.py", "executor.py"],
        "langgraph arm": ["arm_langgraph.py"],
        "native arm": ["arm_native.py"],
        "harness and analysis": [
            "run_one.py", "run_suite.py", "scoring.py", "analyze.py",
        ],
    }
    surface = {}
    for group, files in groups.items():
        total = code = 0
        for name in files:
            t, c = _code_lines(os.path.join(ROOT, "study", name))
            total += t
            code += c
        surface[group] = {"physical_lines": total, "code_lines": code}
    return surface


def analyze(main_records, fault_records, env):
    summary = {"env": env}
    # Axis 1 and 2: per-task success.
    per_task = {}
    for task_id in sorted({r["task"] for r in main_records}):
        per_task[task_id] = {}
        for arm in ARMS:
            rows = [r for r in main_records if r["task"] == task_id and r["arm"] == arm]
            wins = sum(1 for r in rows if r["success"])
            per_task[task_id][arm] = {
                "trials": len(rows),
                "successes": wins,
                "pass1": wins / len(rows),
                "passk": {
                    str(k): _passk(wins, len(rows), k) for k in range(1, 9)
                },
            }
    summary["per_task"] = per_task
    diffs = [
        per_task[t]["langgraph"]["pass1"] - per_task[t]["native"]["pass1"]
        for t in per_task
    ]
    n = len(diffs)
    mean_diff = statistics.fmean(diffs)
    if n > 1:
        sd = statistics.stdev(diffs)
    else:
        sd = 0.0
    se = sd / math.sqrt(n) if n else 0.0
    crit = t_ppf(0.95, n - 1) if n > 1 else 0.0
    ci = [mean_diff - crit * se, mean_diff + crit * se]
    if ci[0] >= -0.05 and ci[1] <= 0.05:
        h1 = "Supported"
    elif ci[1] < 0.0 or ci[0] > 0.0 or ci[1] < -0.05 or ci[0] > 0.05:
        h1 = "Refuted"
    else:
        h1 = "Inconclusive"
    pooled = {
        arm: (
            sum(per_task[t][arm]["successes"] for t in per_task),
            sum(per_task[t][arm]["trials"] for t in per_task),
        )
        for arm in ARMS
    }
    summary["axis1"] = {
        "degenerate": n > 0 and sd == 0.0 and all(d == 0.0 for d in diffs),
        "pass1_pooled": {arm: {"successes": c, "trials": t} for arm, (c, t) in pooled.items()},
        "pass1_ci95_exact": {arm: clopper_pearson(c, t) for arm, (c, t) in pooled.items()},
        "mean_paired_diff": mean_diff,
        "sd": sd,
        "ci90": ci,
        "margin": 0.05,
        "verdict": h1,
        "overall_pass1": {
            arm: statistics.fmean(
                [per_task[t][arm]["pass1"] for t in per_task]
            )
            for arm in ARMS
        },
    }
    summary["axis2"] = {
        arm: {
            str(k): statistics.fmean(
                [per_task[t][arm]["passk"][str(k)] for t in per_task]
            )
            for k in range(1, 9)
        }
        for arm in ARMS
    }
    # Axis 3: cost.
    cost = {}
    for arm in ARMS:
        rows = [r for r in main_records if r["arm"] == arm]
        cost[arm] = {
            "invocations_median": _median([r["invocations"] for r in rows]),
            "invocations_p95": _p95([r["invocations"] for r in rows]),
            "wall_median": _median([r["wall_seconds"] for r in rows]),
            "wall_p95": _p95([r["wall_seconds"] for r in rows]),
            "state_bytes_median": _median([r["state_bytes"] for r in rows]),
        }
    inv_ratio = cost["langgraph"]["invocations_median"] / cost["native"]["invocations_median"]
    wall_ratio = cost["langgraph"]["wall_median"] / cost["native"]["wall_median"]
    inv_ok = inv_ratio <= 1.05
    wall_ok = wall_ratio <= 1.10
    if inv_ok and wall_ok:
        h2 = "Supported"
    elif inv_ok or wall_ok:
        h2 = "Partially supported"
    else:
        h2 = "Refuted"
    pairs = paired_wall(main_records)
    lg_faster = sum(1 for a, b in pairs if a < b)
    summary["axis3"] = {
        "wall_ratio_bootstrap": {
            "ci95": bootstrap_median_ratio(pairs),
            "reps": BOOTSTRAP_REPS,
            "seed": BOOTSTRAP_SEED,
            "pairs": len(pairs),
        },
        "wall_sign_test": {
            "pairs": len(pairs),
            "langgraph_faster": lg_faster,
            "p_two_sided": sign_test(lg_faster, len(pairs)),
        },
        "per_arm": cost,
        "invocation_ratio": inv_ratio,
        "wall_ratio": wall_ratio,
        "verdict": h2,
        "code_surface": code_surface(),
    }
    # Axis 4: recovery.
    fault = {}
    for arm in ARMS:
        rows = [r for r in fault_records if r["arm"] == arm]
        by_class = {}
        for fault_class in ("F1", "F2"):
            sub = [r for r in rows if r["fault_class"] == fault_class]
            passes = sum(1 for r in sub if r["success"])
            by_class[fault_class] = {
                "runs": len(sub),
                "passes": passes,
                "rate": (passes / len(sub)) if sub else None,
                "rate_ci95_exact": clopper_pearson(passes, len(sub)) if sub else None,
                "recomputed_counts": {
                    str(k): v for k, v in sorted(Counter(r["recomputed_steps"] for r in sub).items())
                },
            }
        fault[arm] = {
            "runs": len(rows),
            "passes": sum(1 for r in rows if r["success"]),
            "rate": (sum(1 for r in rows if r["success"]) / len(rows)) if rows else None,
            "by_class": by_class,
            "killed_as_expected": sum(1 for r in rows if r["killed_as_expected"]),
            "duplicate_runs": sum(1 for r in rows if r["duplicates"]),
            "recomputed_median": _median([r["recomputed_steps"] for r in rows]) if rows else None,
            "rate_ci95_exact": clopper_pearson(
                sum(1 for r in rows if r["success"]), len(rows)
            ) if rows else None,
        }
    lg_rate = fault["langgraph"]["rate"]
    nt_rate = fault["native"]["rate"]
    gap = lg_rate - nt_rate
    if gap > 0.02:
        h3 = "Supported (LangGraph advantage)"
    elif gap < -0.02:
        h3 = "Refuted"
    else:
        h3 = "Supported (tie: the orchestrator adds nothing measurable on recovery in this design)"
    modal = {}
    for arm in ARMS:
        for fault_class in ("F1", "F2"):
            counts = fault[arm]["by_class"][fault_class]["recomputed_counts"]
            if counts:
                modal[(arm, fault_class)] = max(counts, key=lambda k: counts[k])
    outliers = [
        {key: r[key] for key in ("arm", "task", "fault_class", "kill_point", "seed", "recomputed_steps")}
        for r in fault_records
        if (r["arm"], r["fault_class"]) in modal
        and str(r["recomputed_steps"]) != modal[(r["arm"], r["fault_class"])]
    ]
    summary["axis4"] = {
        "per_arm": fault,
        "rate_gap": gap,
        "verdict": h3,
        "recompute_outliers": outliers,
    }
    summary["axis5"] = {
        "verdict": "Not yet measured",
        "reason": (
            "The registered procedure counts trace records read by a scripted "
            "diagnostician. The two arms persist traces in incommensurable "
            "units (LangGraph checkpoint rows in SQLite versus native event "
            "and state records), so a record count would measure the storage "
            "format, not diagnosis effort. A timed human procedure is "
            "registered in ROADMAP.md for the Deep pass instead."
        ),
    }
    summary["verdicts"] = {
        "H1": h1,
        "H2": h2,
        "H3": h3,
        "H4": "Not yet measured",
    }
    return summary


def _fmt(x, digits=4):
    if x is None:
        return "n/a"
    return ("%.*f" % (digits, x))


def render_results(summary):
    env = summary["env"]
    lines = []
    lines.append("# RESULTS (generated by study.analyze from raw result files)")
    lines.append("")
    lines.append("Environment: Python %s on %s. Packages: %s. Fixtures sha256 %s."
                 % (env["python"], env["platform"],
                    ", ".join("%s %s" % kv for kv in sorted(env["packages"].items())),
                    env["fixtures_sha256"]))
    lines.append("")
    lines.append("## Axis 1: task success, pass^1 per task (8 seeded trials each)")
    lines.append("")
    lines.append("| Task | Native pass^1 | LangGraph pass^1 | Difference |")
    lines.append("|---|---|---|---|")
    for task_id, arms in summary["per_task"].items():
        lines.append("| %s | %s | %s | %s |" % (
            task_id,
            _fmt(arms["native"]["pass1"], 3),
            _fmt(arms["langgraph"]["pass1"], 3),
            _fmt(arms["langgraph"]["pass1"] - arms["native"]["pass1"], 3),
        ))
    a1 = summary["axis1"]
    lines.append("")
    lines.append("Overall pass^1: native %s, LangGraph %s. Mean paired difference %s, "
                 "90 percent CI [%s, %s], equivalence margin plus or minus 0.05. H1 verdict: %s."
                 % (_fmt(a1["overall_pass1"]["native"], 3),
                    _fmt(a1["overall_pass1"]["langgraph"], 3),
                    _fmt(a1["mean_paired_diff"], 3),
                    _fmt(a1["ci90"][0], 3), _fmt(a1["ci90"][1], 3),
                    a1["verdict"]))
    lines.append("")
    lines.append("Pooled pass^1 with exact (Clopper-Pearson) 95 percent intervals: %s." % "; ".join(
        "%s %d of %d, [%s, %s]" % (
            arm, a1["pass1_pooled"][arm]["successes"], a1["pass1_pooled"][arm]["trials"],
            _fmt(a1["pass1_ci95_exact"][arm][0], 3), _fmt(a1["pass1_ci95_exact"][arm][1], 3))
        for arm in ("native", "langgraph")))
    if a1["degenerate"]:
        lines.append("")
        lines.append("What the H1 test can detect: every per-task paired difference is exactly 0, "
                     "so the standard deviation is 0 and the interval collapses to [0, 0]. Both arms "
                     "run the same deterministic policy against the same seeded failure draws, so any "
                     "arm that loses no state reproduces the other's outcomes exactly. The test therefore "
                     "rules out orchestration-caused success loss (lost state, budget overruns, corrupted "
                     "resumes) on these fixtures; it carries no information about reasoning quality or "
                     "about behaviour with a model in the loop.")
    lines.append("")
    lines.append("## Axis 2: consistency, pass^k averaged over tasks")
    lines.append("")
    lines.append("| k | Native | LangGraph |")
    lines.append("|---|---|---|")
    for k in range(1, 9):
        lines.append("| %d | %s | %s |" % (
            k,
            _fmt(summary["axis2"]["native"][str(k)], 3),
            _fmt(summary["axis2"]["langgraph"][str(k)], 3),
        ))
    lines.append("")
    lines.append("## Axis 3: cost")
    lines.append("")
    lines.append("| Measure | Native | LangGraph |")
    lines.append("|---|---|---|")
    c = summary["axis3"]["per_arm"]
    lines.append("| Policy invocations per run, median | %s | %s |"
                 % (_fmt(c["native"]["invocations_median"], 1),
                    _fmt(c["langgraph"]["invocations_median"], 1)))
    lines.append("| Policy invocations per run, p95 | %s | %s |"
                 % (_fmt(c["native"]["invocations_p95"], 1),
                    _fmt(c["langgraph"]["invocations_p95"], 1)))
    lines.append("| Wall seconds per run, median | %s | %s |"
                 % (_fmt(c["native"]["wall_median"], 3),
                    _fmt(c["langgraph"]["wall_median"], 3)))
    lines.append("| Wall seconds per run, p95 | %s | %s |"
                 % (_fmt(c["native"]["wall_p95"], 3),
                    _fmt(c["langgraph"]["wall_p95"], 3)))
    lines.append("| Durable state bytes per run, median | %s | %s |"
                 % (_fmt(c["native"]["state_bytes_median"], 0),
                    _fmt(c["langgraph"]["state_bytes_median"], 0)))
    lines.append("")
    lines.append("Ratios, LangGraph to native: invocations %s (bound 1.05), wall %s "
                 "(bound 1.10). H2 verdict: %s."
                 % (_fmt(summary["axis3"]["invocation_ratio"], 3),
                    _fmt(summary["axis3"]["wall_ratio"], 3),
                    summary["axis3"]["verdict"]))
    lines.append("")
    bs = summary["axis3"]["wall_ratio_bootstrap"]
    st = summary["axis3"]["wall_sign_test"]
    lines.append("Uncertainty on the wall ratio: paired bootstrap 95 percent interval [%s, %s] "
                 "(%d resamples of the %d task-and-seed pairs, seed %d). Paired sign test: LangGraph "
                 "was faster in %d of %d pairs, two-sided p = %.2g. Both describe this one suite pass "
                 "on one machine; the native arm commits synchronously after every step, and a "
                 "WAL-mode or batched-commit native variant is untested, so the ordering is "
                 "implementation-sensitive."
                 % (_fmt(bs["ci95"][0], 3), _fmt(bs["ci95"][1], 3), bs["reps"], bs["pairs"], bs["seed"],
                    st["langgraph_faster"], st["pairs"], st["p_two_sided"]))
    lines.append("")
    lines.append("Code surface, counted by script (code lines exclude blanks and comments):")
    lines.append("")
    lines.append("| Group | Physical lines | Code lines |")
    lines.append("|---|---|---|")
    for group, counts in summary["axis3"]["code_surface"].items():
        lines.append("| %s | %d | %d |" % (group, counts["physical_lines"], counts["code_lines"]))
    lines.append("")
    lines.append("## Axis 4: recovery after SIGKILL (48 fault runs per arm)")
    lines.append("")
    lines.append("| Arm | Pass rate | F1 rate | F2 rate | Runs with duplicates | Recomputed steps, median | Kills landed as registered |")
    lines.append("|---|---|---|---|---|---|---|")
    for arm in ARMS:
        f = summary["axis4"]["per_arm"][arm]
        lines.append("| %s | %s (%d of %d) | %s | %s | %d | %s | %d of %d |" % (
            arm,
            _fmt(f["rate"], 3), f["passes"], f["runs"],
            _fmt(f["by_class"]["F1"]["rate"], 3),
            _fmt(f["by_class"]["F2"]["rate"], 3),
            f["duplicate_runs"],
            _fmt(f["recomputed_median"], 1),
            f["killed_as_expected"], f["runs"],
        ))
    lines.append("")
    lines.append("Rate gap, LangGraph minus native: %s. H3 verdict: %s."
                 % (_fmt(summary["axis4"]["rate_gap"], 3), summary["axis4"]["verdict"]))
    lines.append("")
    lines.append("Exact (Clopper-Pearson) 95 percent intervals on the recovery rates, and the "
                 "full recomputed-steps distribution (value: number of runs):")
    lines.append("")
    lines.append("| Arm | Class | Passes | 95 percent interval | Recomputed steps |")
    lines.append("|---|---|---|---|---|")
    for arm in ARMS:
        f = summary["axis4"]["per_arm"][arm]
        for fault_class in ("F1", "F2"):
            b = f["by_class"][fault_class]
            lines.append("| %s | %s | %d of %d | [%s, %s] | %s |" % (
                arm, fault_class, b["passes"], b["runs"],
                _fmt(b["rate_ci95_exact"][0], 3), _fmt(b["rate_ci95_exact"][1], 3),
                ", ".join("%s: %d" % kv for kv in b["recomputed_counts"].items())))
        lines.append("| %s | all | %d of %d | [%s, %s] | |" % (
            arm, f["passes"], f["runs"],
            _fmt(f["rate_ci95_exact"][0], 3), _fmt(f["rate_ci95_exact"][1], 3)))
    lines.append("")
    outliers = summary["axis4"]["recompute_outliers"]
    if outliers:
        lines.append("Runs off their cell's modal recompute count: %s. The median alone hides these. "
                     "Their cause is not established by the recorded evidence; see "
                     "docs/research-review.md for the candidate mechanism and the check that would "
                     "settle it." % "; ".join(
                         "%s %s %s kill point %d seed %d recomputed %d" % (
                             o["arm"], o["task"], o["fault_class"], o["kill_point"], o["seed"],
                             o["recomputed_steps"]) for o in outliers))
        lines.append("")
    lines.append("## Axis 5: debugging surface")
    lines.append("")
    lines.append("H4 verdict: Not yet measured. %s" % summary["axis5"]["reason"])
    lines.append("")
    lines.append("## Verdict summary")
    lines.append("")
    lines.append("| Hypothesis | Verdict |")
    lines.append("|---|---|")
    for hyp, verdict in summary["verdicts"].items():
        lines.append("| %s | %s |" % (hyp, verdict))
    lines.append("")
    return "\n".join(lines)


def render_readme_table(summary):
    a1 = summary["axis1"]
    a3 = summary["axis3"]
    a4 = summary["axis4"]
    lines = []
    lines.append("| Measure | Native loop | LangGraph |")
    lines.append("|---|---|---|")
    lines.append("| Overall pass^1 (12 tasks, 8 trials each) | %s | %s |"
                 % (_fmt(a1["overall_pass1"]["native"], 3),
                    _fmt(a1["overall_pass1"]["langgraph"], 3)))
    lines.append("| pass^4, averaged over tasks | %s | %s |"
                 % (_fmt(summary["axis2"]["native"]["4"], 3),
                    _fmt(summary["axis2"]["langgraph"]["4"], 3)))
    lines.append("| Median wall seconds per run | %s | %s |"
                 % (_fmt(a3["per_arm"]["native"]["wall_median"], 3),
                    _fmt(a3["per_arm"]["langgraph"]["wall_median"], 3)))
    lines.append("| Recovery pass rate (48 fault runs) | %s | %s |"
                 % (_fmt(a4["per_arm"]["native"]["rate"], 3),
                    _fmt(a4["per_arm"]["langgraph"]["rate"], 3)))
    lines.append("| Arm-specific code lines | %d | %d |"
                 % (a3["code_surface"]["native arm"]["code_lines"],
                    a3["code_surface"]["langgraph arm"]["code_lines"]))
    return "\n".join(lines) + "\n"


def main():
    with open(os.path.join(RESULTS, "raw_main.json"), "r", encoding="utf-8") as fh:
        main_records = json.load(fh)
    with open(os.path.join(RESULTS, "raw_fault.json"), "r", encoding="utf-8") as fh:
        fault_records = json.load(fh)
    with open(os.path.join(RESULTS, "env.json"), "r", encoding="utf-8") as fh:
        env = json.load(fh)
    summary = analyze(main_records, fault_records, env)
    with open(os.path.join(RESULTS, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, sort_keys=True)
    with open(os.path.join(ROOT, "RESULTS.md"), "w", encoding="utf-8") as fh:
        fh.write(render_results(summary))
    with open(os.path.join(RESULTS, "readme_table.md"), "w", encoding="utf-8") as fh:
        fh.write(render_readme_table(summary))
    print(json.dumps(summary["verdicts"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
