import { useMemo, useState, useEffect, useCallback, useId } from 'react';
import summary from '../../results/summary.json';
import env from '../../results/env.json';
import fixtures from '../../results/fixtures.json';
import rawMain from '../../results/raw_main.json';
import rawFault from '../../results/raw_fault.json';
import tasksPy from '../../study/tasks.py?raw';
import roadmapMd from '../../ROADMAP.md?raw';
import {
  fixturesHash, drawTable, simulate, passk, clopperPearson, median, pairWall, bootstrapRatio,
  verdictH1, verdictH2, verdictH3, recomputeCounts, pyConst,
} from './lab.js';

const REPO = 'https://github.com/JesunAhmadUshno/langgraph-vs-native-study';
const blob = (p) => `${REPO}/blob/main/${p}`;
const f3 = (x) => x.toFixed(3);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const ARMS = [['native', 'Native loop', 'var(--primary)'], ['langgraph', 'LangGraph', 'var(--warn)']];
const armName = (a) => (a === 'langgraph' ? 'LangGraph' : 'Native loop');
const armColor = (a) => (a === 'langgraph' ? 'var(--warn)' : 'var(--primary)');

// Everything below is derived from the imported files.
const RETRY = pyConst(tasksPy, 'RETRY_BUDGET');
const STEP_BUDGET = pyConst(tasksPy, 'STEP_BUDGET');
const SEEDS = env.trial_seeds;
const N_TASKS = fixtures.length;
const runsPerArm = (rows, arm) => rows.filter((r) => r.arm === arm).length;
const MAIN_PER_ARM = runsPerArm(rawMain, 'native');
const FAULT_PER_ARM = runsPerArm(rawFault, 'native');
const RC = recomputeCounts(rawFault);
const TH = summary.thresholds;
const A1 = summary.axis1, A3 = summary.axis3, A4 = summary.axis4;
const CS = A3.code_surface;
const TIMELINE = __TIMELINE__; // eslint-disable-line no-undef
const FAMILIES = [...new Set(fixtures.map((t) => t.family))];
const MAX_SEEDS = 400, MAX_BUDGET = 5;
const K_MAX = Object.keys(summary.axis2.native).length;
const KS = Array.from({ length: K_MAX }, (_, i) => i + 1);
const N_CLASSES = new Set(rawFault.map((r) => r.fault_class)).size;
const H123 = ['H1', 'H2', 'H3'].every((h) => summary.verdicts[h].startsWith('Supported'));
const DEEP_PASS = (roadmapMd.split('## Deep pass')[1] || '').split('\n## ')[0]
  .split(/\n(?=\d+\. )/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /^\d+\. /.test(s))
  .map((s) => { const body = s.replace(/^\d+\. /, ''); const m = body.match(/[.:] /); const i = m ? m.index : -1; return { head: (i > 0 ? body.slice(0, i) : body).replace(/\.$/, ''), rest: i > 0 ? body.slice(i + 2) : '' }; });

const SECTIONS = [['top', 'Verdict', '◎'], ['prereg', 'Hypotheses', '✓'], ['design', 'Design', '⇄'], ['sim', 'Simulator', '▶'], ['passk', 'Consistency', '∿'], ['replay', 'Crash replay', '⚡'], ['cost', 'Cost', '◷'], ['code', 'Code surface', '≡'], ['runs', 'Run browser', '▦'], ['limits', 'Limits', '!']];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

function MenuBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return (
    <div className="menubar" role="banner">
      <span className="apple" aria-hidden="true">◆</span>
      <a className="app" href="#top">LangGraph vs Native</a>
      <a className="m" href={blob('SPEC.md')}>Spec</a>
      <a className="m" href={blob('METHODS.md')}>Methods</a>
      <a className="m" href={blob('RESULTS.md')}>Results</a>
      <span className="spacer" />
      <span className="status"><i /> Pre-registered</span>
      <a href={REPO}>GitHub ↗</a>
      <span className="clock">{now.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  );
}

function Dock() {
  const [active, setActive] = useState('top');
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="dock" aria-label="Sections">
      {SECTIONS.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>
          <span className="ico" aria-hidden="true">{icon}</span><span className="lbl">{label}</span>
        </a>
      ))}
    </nav>
  );
}

function Range({ label, value, min, max, step, onChange, show }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label} <span>{show}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

const Recorded = () => <span className="pill rec">● Recorded</span>;
const Live = () => <span className="pill good">● Live in your browser</span>;

export default function App() {
  useReveal();
  return (
    <div className="wrap">
      <MenuBar />
      <div className="glow" aria-hidden="true" />
      <Hero />
      <Prereg />
      <Design />
      <Simulator />
      <Consistency />
      <Replay />
      <Cost />
      <CodeSurface />
      <RunBrowser />
      <Limits />
      <Dock />
      <footer>
        Code: Apache-2.0. Every number on this page is read from <code>results/</code>, <code>study/tasks.py</code> or <code>ROADMAP.md</code> at build time, or computed in your browser from those files; a build-time check reproduces each browser computation against the committed results. Crash and cost panels replay recorded runs; nothing here re-executes either arm.
      </footer>
    </div>
  );
}

function Hero() {
  const [hash, setHash] = useState(null);
  useEffect(() => { fixturesHash(fixtures).then(setHash).catch(() => setHash('')); }, []);
  const lgF1 = Object.keys(RC.langgraph.F1), ntF1 = Object.keys(RC.native.F1);
  const ok = hash === env.fixtures_sha256;
  const pa = A4.per_arm, c = A3.per_arm;
  return (
    <header className="card hero window" id="top" data-title="verdict.md — langgraph-vs-native-study">
      <div className="head">
        <p className="eyebrow">Pre-registered paired study · orchestration layer only</p>
        <span className={`pill ${H123 ? 'good' : 'warn'}`}>● H1–H3 {H123 ? 'supported' : 'mixed'}, H4 {summary.verdicts.H4.toLowerCase()}</span>
      </div>
      <h1>LangGraph and a hand-written loop tie on success and on crash recovery. They differ in what a crash <em>costs</em>.</h1>
      <p className="sub">
        Both arms run the same {N_TASKS} task fixtures with the same scripted policy, tools, step executor and budgets, paired by seed.
        After every kill between steps, LangGraph re-ran {lgF1.join(' or ')} already-finished step{lgF1.join() === '1' ? '' : 's'}; the native loop re-ran {ntF1.join(' or ')}.
        Exactly-once came from the idempotency check both arms apply, not from the orchestrator.
      </p>
      <div className="envstrip mono" aria-label="Environment of the recorded runs">
        <span>Python {env.python}</span><span>langgraph {env.packages.langgraph}</span><span>checkpoint-sqlite {env.packages['langgraph-checkpoint-sqlite']}</span>
        <span>fixtures sha256 {env.fixtures_sha256.slice(0, 12)}…</span>
        <span className={`pill ${hash === null ? 'info' : ok ? 'good' : 'bad'}`}>{hash === null ? 'hashing fixtures…' : ok ? '✓ re-hashed in your browser: match' : '✗ fixture hash mismatch'}</span>
      </div>
      <div className="actions">
        <a className="btn primary" href="#sim">Run the retry simulator</a>
        <a className="btn ghost" href="#replay">Replay a crash</a>
        <span className="hint">Values below: native · LangGraph</span>
      </div>
      <div className="tiles">
        <div className="tile"><div className="num pair">{f3(A1.overall_pass1.native)} · {f3(A1.overall_pass1.langgraph)}</div><div className="cap">pass^1 over {MAIN_PER_ARM} runs per arm</div></div>
        <div className="tile"><div className="num pair">{pa.native.passes}/{pa.native.runs} · {pa.langgraph.passes}/{pa.langgraph.runs}</div><div className="cap">exactly-once recoveries after SIGKILL</div></div>
        <div className="tile"><div className="num pair">{f3(c.native.wall_median)} · {f3(c.langgraph.wall_median)}</div><div className="cap">median wall seconds; implementation-sensitive (native commits every step)</div></div>
        <div className="tile"><div className="num pair">{CS['native arm'].code_lines} · {CS['langgraph arm'].code_lines}</div><div className="cap">arm-specific code lines</div></div>
      </div>
    </header>
  );
}

function Prereg() {
  const v1 = verdictH1(A1.ci90, TH.h1_margin);
  const v2 = verdictH2(A3.invocation_ratio, A3.wall_ratio, TH.h2_invocation_bound, TH.h2_wall_bound);
  const v3 = verdictH3(A4.rate_gap, TH.h3_rate_gap);
  const rows = [
    { h: 'H1', name: 'Success equivalence', rule: `${pct(TH.h1_ci_level, 0)} CI of the mean paired pass^1 difference inside ±${TH.h1_margin}`, measured: `mean ${f3(A1.mean_paired_diff)}, CI [${f3(A1.ci90[0])}, ${f3(A1.ci90[1])}]`, v: v1, rec: summary.verdicts.H1 },
    { h: 'H2', name: 'Cost', rule: `invocation ratio ≤ ${TH.h2_invocation_bound}, median wall ratio ≤ ${TH.h2_wall_bound.toFixed(2)}`, measured: `${f3(A3.invocation_ratio)} and ${f3(A3.wall_ratio)}`, v: v2, rec: summary.verdicts.H2 },
    { h: 'H3', name: 'Recovery', rule: `LangGraph minus native pass rate: > ${TH.h3_rate_gap} advantage, within ±${TH.h3_rate_gap} tie`, measured: `gap ${f3(A4.rate_gap)}`, v: v3, rec: summary.verdicts.H3 },
    { h: 'H4', name: 'Debugging surface', rule: 'fixed scripted-diagnostician procedure, or report Not yet measured', measured: '—', v: summary.verdicts.H4, rec: summary.verdicts.H4 },
  ];
  const pill = (v) => (v.startsWith('Supported') ? 'good' : v.startsWith('Not yet') ? 'warn' : v.startsWith('Partially') ? 'warn' : 'bad');
  return (
    <section id="prereg" className="card window reveal" data-title="HYPOTHESES.md — scoreboard">
      <div className="head">
        <div>
          <p className="eyebrow">Pre-registration scoreboard</p>
          <h2>Thresholds fixed before any experiment code. Verdicts re-derived here.</h2>
          <p className="sub">Each verdict is recomputed in your browser from the measured value and the registered threshold in <a href={blob('results/summary.json')}>summary.json</a>, then compared with the verdict the analysis script wrote.</p>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Hypothesis</th><th>Registered rule</th><th>Measured</th><th>Verdict (computed)</th><th>Matches RESULTS.md</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.h}><td><b>{r.h}</b> {r.name}</td><td>{r.rule}</td><td className="mono">{r.measured}</td>
                <td><span className={`pill ${pill(r.v)}`}>{r.v.replace(/ \(tie.*\)/, ' (tie)')}</span></td><td className={r.v === r.rec ? 'ok' : 'no'}>{r.v === r.rec ? '✓' : '✗'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        {A1.degenerate && (
          <div className="tile">
            <div className="head" style={{ marginBottom: 6 }}><h3>H1 is a degenerate test</h3><span className="pill warn">Caveat</span></div>
            <p className="hint" style={{ margin: 0, fontSize: 13 }}>Every per-task paired difference is exactly 0 (sd {A1.sd}), so the interval is [{f3(A1.ci90[0])}, {f3(A1.ci90[1])}] by construction. Same policy, same seeded draws: the test can only catch orchestration-caused success loss, not differences in reasoning.</p>
          </div>
        )}
        <div className="tile">
          <div className="head" style={{ marginBottom: 6 }}><h3>H4 not measured</h3><span className="pill warn">Deferred</span></div>
          <p className="hint" style={{ margin: 0, fontSize: 13 }}>{summary.axis5.reason}</p>
        </div>
      </div>
      {TIMELINE.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Order of commits (from git history)</h3>
          <ol className="timeline">
            {TIMELINE.map((t) => <li key={t.path}><a className="mono" href={`${REPO}/commit/${t.hash}`}>{t.hash}</a> <span className="hint">{t.date}</span> <span>first adds <code>{t.path}</code></span></li>)}
          </ol>
        </>
      )}
    </section>
  );
}

function Design() {
  return (
    <section id="design" className="card window reveal" data-title="arms.py — what differs, what is shared">
      <p className="eyebrow">Design</p>
      <h2>One shared core. Only sequencing, persistence and resume differ.</h2>
      <p className="sub">The policy, tools and per-step executor are the same code in both arms. Fault hooks are driven by environment variables that only the harness sets, so neither arm can see or special-case a kill (DECISIONS.md D7).</p>
      <div className="diagram" role="img" aria-label="Architecture: shared core of tasks, policy, tools and executor feeding two arms; harness-driven fault hooks F1 and F2">
        <div className="box core">
          <b>Shared core</b> <span className="hint">{CS['shared core'].code_lines} code lines</span>
          <div className="chips"><code>tasks.py</code><code>policy.py</code><code>tools.py</code><code>executor.py</code></div>
          <div className="hooks"><span className="pill bad">F1 hook: executor step boundary</span><span className="pill bad">F2 hook: inside append_record, after the fsync</span></div>
        </div>
        <div className="arrows" aria-hidden="true"><span>↙</span><span>↘</span></div>
        <div className="box arm" style={{ borderColor: armColor('langgraph') }}>
          <b>LangGraph arm</b> <span className="hint">{CS['langgraph arm'].code_lines} code lines</span>
          <p className="hint">StateGraph, one node per step · SqliteSaver checkpoint per superstep · resume by thread id · ledger check before each effect</p>
        </div>
        <div className="box arm" style={{ borderColor: armColor('native') }}>
          <b>Native arm</b> <span className="hint">{CS['native arm'].code_lines} code lines</span>
          <p className="hint">Hand-written loop · <code>run_state</code> committed after every step · write-ahead intent log for effects · reconcile intent rows against the ledger on restart</p>
        </div>
        <div className="box harness">
          <b>Harness</b> <span className="hint">{CS['harness and analysis'].code_lines} code lines incl. analysis</span>
          <p className="hint">run_suite.py launches each fault run as a killed subprocess, then a clean resume subprocess, and scores the ledger with scoring.py.</p>
        </div>
      </div>
    </section>
  );
}

function Simulator() {
  const [table, setTable] = useState(null);
  const [budget, setBudget] = useState(RETRY);
  const [mult, setMult] = useState(1);
  const [nSeeds, setNSeeds] = useState(SEEDS.length);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    const seeds = Array.from({ length: MAX_SEEDS }, (_, i) => SEEDS[0] + i);
    const t0 = performance.now();
    drawTable(fixtures, seeds, MAX_BUDGET + 1).then((t) => setTable({ t, ms: performance.now() - t0 }));
  }, []);
  const taskIds = filter === 'all' ? null : filter.startsWith('fam:') ? fixtures.filter((t) => t.family === filter.slice(4)).map((t) => t.task_id) : [filter];
  const seeds = useMemo(() => Array.from({ length: nSeeds }, (_, i) => SEEDS[0] + i), [nSeeds]);
  const res = useMemo(() => table && simulate({ fixtures, table: table.t, retryBudget: budget, mult, seeds, taskIds, kMax: K_MAX }), [table, budget, mult, seeds, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const registered = budget === RETRY && mult === 1 && nSeeds === SEEDS.length;
  const flakyCount = fixtures.reduce((n, t) => n + t.steps.filter((s) => s.flaky != null).length, 0);
  const W = 460, H = 220, pad = { l: 36, r: 10, t: 10, b: 26 };
  const sx = (k) => pad.l + ((k - 1) / (K_MAX - 1)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const recCurve = Object.values(summary.axis2.native);
  return (
    <section id="sim" className="card window reveal" data-title="executor.sim — retry budget and flakiness">
      <div className="head">
        <div>
          <p className="eyebrow">Live simulation</p>
          <h2>Change the retry budget and watch success move, identically for both arms.</h2>
          <p className="sub">
            A port of the shared executor's retry loop and the sha256 failure draw from <a href={blob('study/tools.py')}>tools.py</a>, run on the hash-verified fixtures.
            A step fails when every attempt from 0 to the retry budget draws failure. At the registered settings (budget {RETRY}, seeds {SEEDS[0]} to {SEEDS[SEEDS.length - 1]}) it reproduces the recorded per-task results exactly; the build fails if it does not.
            Both arms are the same in this model by construction, which is why the H1 test is degenerate. It models the success path only: no checkpointer, no kills.
          </p>
        </div>
        <Live />
      </div>
      <div className="controls">
        <Range label="Retry budget (retries per call)" value={budget} min={0} max={MAX_BUDGET} step={1} onChange={setBudget} show={budget} />
        <Range label="Flakiness multiplier" value={mult} min={0.25} max={3} step={0.25} onChange={setMult} show={`×${mult}`} />
        <Range label="Seeds per task" value={nSeeds} min={SEEDS.length} max={MAX_SEEDS} step={SEEDS.length} onChange={setNSeeds} show={`${SEEDS[0]}–${SEEDS[0] + nSeeds - 1}`} />
        <Select label="Tasks" value={filter} onChange={setFilter} options={[['all', `All ${N_TASKS} tasks`], ...FAMILIES.map((f) => [`fam:${f}`, `Family: ${f}`]), ...fixtures.map((t) => [t.task_id, `${t.task_id} (${t.family}${t.steps.some((s) => s.flaky != null) ? ', flaky' : ''})`])]} />
      </div>
      {!res ? <p className="hint">Hashing {flakyCount} flaky steps × {MAX_SEEDS} seeds × {MAX_BUDGET + 1} attempts…</p> : (
        <div className="grid2">
          <div>
            <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0 }}>
              <div className="tile"><div className="num">{f3(res.overall)}</div><div className="cap">overall pass^1 (mean over tasks){registered && filter === 'all' ? `; recorded ${f3(A1.overall_pass1.native)} in both arms` : ''}</div></div>
              <div className="tile"><div className="num">{res.failures.length}</div><div className="cap">failed runs of {res.rows.length * nSeeds}, per arm</div></div>
            </div>
            <div className="bars" style={{ marginTop: 16 }}>
              {res.rows.map((r) => {
                const rec = registered ? summary.per_task[r.task].native.pass1 : null;
                return (
                  <div className="bar-row" key={r.task}>
                    <div className="lab"><span>{r.task} <span className="hint">{fixtures.find((t) => t.task_id === r.task).family}</span></span><b>{f3(r.pass1)}</b></div>
                    <div className="track"><div className="fill" style={{ width: `${r.pass1 * 100}%`, background: r.pass1 < 1 ? 'var(--warn)' : 'var(--good)' }} />{rec != null && <div className="ref" style={{ left: `calc(${rec * 100}% - 1px)` }} title={`Recorded ${f3(rec)}`} />}</div>
                  </div>
                );
              })}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>{registered ? 'Black ticks mark the recorded pass^1 from summary.json.' : 'Ticks appear only at the registered settings.'} Draws computed in {table.ms.toFixed(0)} ms with Web Crypto.</p>
          </div>
          <div>
            <h3>pass^k, k = 1 to {K_MAX}</h3>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Simulated pass^k curve against the recorded curve">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line className="axis" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} /><text x={pad.l - 6} y={sy(t) + 4} textAnchor="end">{t}</text></g>)}
              <polyline fill="none" stroke="var(--muted)" strokeDasharray="5 4" strokeWidth="2" points={recCurve.map((v, i) => `${sx(i + 1)},${sy(v)}`).join(' ')} />
              <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" points={res.curve.map((v, i) => `${sx(i + 1)},${sy(v)}`).join(' ')} />
              {res.curve.map((v, i) => <circle key={i} cx={sx(i + 1)} cy={sy(v)} r="3.5" fill="var(--primary)" />)}
              {KS.map((k) => <text key={k} x={sx(k)} y={H - 8} textAnchor="middle">{k}</text>)}
            </svg>
            <div className="legend"><span><i style={{ background: 'var(--primary)' }} />simulated (both arms)</span><span><i style={{ background: 'var(--muted)' }} />recorded, all tasks, registered settings</span></div>
            <p className="hint">pass^k is the unbiased C(c,k)/C(n,k) per task, averaged over the selected tasks.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Consistency() {
  const presets = [
    ['Recovery, LangGraph', A4.per_arm.langgraph.passes, A4.per_arm.langgraph.runs],
    ['Recovery, F2 class', A4.per_arm.native.by_class.F2.passes, A4.per_arm.native.by_class.F2.runs],
    ['Pooled pass^1', A1.pass1_pooled.native.successes, A1.pass1_pooled.native.trials],
    ['T03 pass^1', summary.per_task.T03.native.successes, summary.per_task.T03.native.trials],
  ];
  const [c, setC] = useState(presets[0][1]);
  const [n, setN] = useState(presets[0][2]);
  const [level, setLevel] = useState('0.95');
  const cc = Math.min(c, n);
  const ci = clopperPearson(cc, n, 1 - +level);
  const ks = KS.filter((k) => k <= n);
  const cId = useId(), nId = useId();
  const W = 460, H = 220, pad = { l: 48, r: 18, t: 22, b: 26 };
  const sx = (k) => pad.l + ((k - 1) / (K_MAX - 1)) * (W - pad.l - pad.r);
  const lo = 0.8;
  const sy = (v) => pad.t + (1 - (Math.max(lo, v) - lo) / (1 - lo)) * (H - pad.t - pad.b);
  return (
    <section id="passk" className="card window reveal" data-title="passk.svg — consistency and intervals">
      <p className="eyebrow">Consistency</p>
      <h2>pass^k falls the same way in both arms, because the failures are the same runs.</h2>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <h3>Recorded pass^k, averaged over {N_TASKS} tasks <Recorded /></h3>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Recorded pass^k curve for both arms, k from 1 to ${K_MAX}`}>
            {[0.8, 0.85, 0.9, 0.95, 1].map((t) => <g key={t}><line className="axis" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} /><text x={pad.l - 6} y={sy(t) + 4} textAnchor="end">{t.toFixed(2)}</text></g>)}
            {ARMS.map(([arm, , col], j) => (
              <g key={arm}>
                <polyline fill="none" stroke={col} strokeWidth={j ? 2 : 5} strokeOpacity={j ? 1 : 0.35} strokeDasharray={j ? '6 5' : ''} points={Object.entries(summary.axis2[arm]).map(([k, v]) => `${sx(+k)},${sy(v)}`).join(' ')} />
              </g>
            ))}
            {Object.entries(summary.axis2.native).map(([k, v]) => <text key={k} x={sx(+k)} y={sy(v) - 9} textAnchor="middle" style={{ fill: 'var(--text)' }}>{f3(v)}</text>)}
            {KS.map((k) => <text key={k} x={sx(k)} y={H - 8} textAnchor="middle">k={k}</text>)}
          </svg>
          <div className="legend">{ARMS.map(([a, l, col]) => <span key={a}><i style={{ background: col }} />{l}</span>)}<span>(lines overlap exactly)</span></div>
        </div>
        <div>
          <h3>Calculator: pass^k and an exact interval <Live /></h3>
          <div className="seg" role="group" aria-label="Load recorded counts" style={{ flexWrap: 'wrap', margin: '10px 0' }}>
            {presets.map(([l, pc, pn]) => <button key={l} aria-pressed={c === pc && n === pn} onClick={() => { setC(pc); setN(pn); }}>{l}</button>)}
          </div>
          <div className="controls" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="field"><label htmlFor={cId}>Successes c</label><input id={cId} type="number" min={0} max={n} value={c} onChange={(e) => setC(Math.max(0, Math.round(+e.target.value) || 0))} /></div>
            <div className="field"><label htmlFor={nId}>Trials n</label><input id={nId} type="number" min={1} max={5000} value={n} onChange={(e) => setN(Math.min(5000, Math.max(1, Math.round(+e.target.value) || 1)))} /></div>
            <Select label="Confidence" value={level} onChange={setLevel} options={[['0.9', '90%'], ['0.95', '95%'], ['0.99', '99%']]} />
          </div>
          <div className="tile">
            <div className="num">[{f3(ci[0])}, {f3(ci[1])}]</div>
            <div className="cap">Clopper-Pearson {pct(+level, 0)} interval for {cc}/{n}{cc === n ? `: a perfect record still only rules out rates below ${pct(ci[0])}` : ''}</div>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table><thead><tr><th>k</th>{ks.map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody><tr><td>pass^k</td>{ks.map((k) => <td key={k}>{f3(passk(cc, n, k))}</td>)}</tr></tbody></table>
          </div>
        </div>
      </div>
    </section>
  );
}

function stepStates(nSteps, cls, kp, r, phase) {
  // Recorded fields drive this; re-run positions are inferred as the r steps before the resume point.
  const killAt = cls === 'F1' ? kp + 1 : kp; // 1-based step where SIGKILL lands
  const doneBefore = cls === 'F1' ? kp : kp - 1;
  const firstRerun = cls === 'F1' ? kp + 1 - r : kp - r + 1;
  return Array.from({ length: nSteps }, (_, i) => {
    const s = i + 1;
    if (phase === 0) return s <= doneBefore ? 'done' : s === killAt && cls === 'F2' ? 'effect' : 'todo';
    if (phase === 1) return s <= doneBefore ? 'done' : s === killAt ? 'kill' : 'todo';
    const rerun = r > 0 && s >= firstRerun && s < firstRerun + r;
    if (phase === 2) return rerun ? 'rerun' : s <= doneBefore ? 'done' : s === killAt ? 'kill' : 'todo';
    return rerun ? 'rerun' : 'done';
  });
}

function Replay() {
  const tasks = [...new Set(rawFault.map((r) => r.task))];
  const [task, setTask] = useState(tasks[0]);
  const [cls, setCls] = useState('F2');
  const points = [...new Set(rawFault.filter((r) => r.fault_class === cls).map((r) => r.kill_point))];
  const [kp, setKp] = useState(points[0]);
  const seeds = [...new Set(rawFault.map((r) => r.seed))];
  const [seed, setSeed] = useState(seeds[seeds.length - 1]);
  const [phase, setPhase] = useState(3);
  const [playing, setPlaying] = useState(false);
  const kpOk = points.includes(kp) ? kp : points[0];
  const nSteps = fixtures.find((t) => t.task_id === task).steps.length;
  const rows = ARMS.map(([arm]) => rawFault.find((r) => r.arm === arm && r.task === task && r.fault_class === cls && r.kill_point === kpOk && r.seed === seed));
  useEffect(() => {
    if (!playing) return;
    if (phase >= 3) { setPlaying(false); return; }
    const t = setTimeout(() => setPhase((p) => p + 1), 900);
    return () => clearTimeout(t);
  }, [playing, phase]);
  const play = useCallback(() => { setPhase(0); setPlaying(true); }, []);
  const phases = ['Running', 'SIGKILL', 'Resumed', 'Final ledger'];
  const desc = cls === 'F1' ? `killed before step ${kpOk + 1} starts; steps 1–${kpOk} were already durable` : `killed inside step ${kpOk}, after its effect hit the ledger and before any completion record`;
  return (
    <section id="replay" className="card window reveal" data-title="fault_suite.replay — raw_fault.json">
      <div className="head">
        <div>
          <p className="eyebrow">Crash and resume</p>
          <h2>Pick a recorded kill and see what each arm had to redo.</h2>
          <p className="sub">A replay of recorded SIGKILL runs ({FAULT_PER_ARM} per arm), driven only by fields in <a href={blob('results/raw_fault.json')}>raw_fault.json</a>. Nothing is executed here. The record stores how many steps re-ran, not which; re-run steps are drawn as the ones just before the resume point.</p>
        </div>
        <Recorded />
      </div>
      <div className="controls">
        <Select label="Task" value={task} onChange={setTask} options={tasks.map((t) => [t, `${t} (${nStepsOf(t)} steps)`])} />
        <Select label="Fault class" value={cls} onChange={(v) => { setCls(v); setPhase(3); }} options={[['F1', 'F1: kill between steps'], ['F2', 'F2: kill mid-step']]} />
        <Select label="Kill point" value={String(kpOk)} onChange={(v) => { setKp(+v); setPhase(3); }} options={points.map((p) => [String(p), cls === 'F1' ? `after step ${p}` : `inside step ${p}`])} />
        <Select label="Seed" value={String(seed)} onChange={(v) => setSeed(+v)} options={seeds.map((s) => [String(s), String(s)])} />
      </div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <button className="btn primary" onClick={play} disabled={playing}>{playing ? 'Replaying…' : '▶ Replay this run'}</button>
        <div className="seg" role="group" aria-label="Replay phase">{phases.map((p, i) => <button key={p} aria-pressed={phase === i} onClick={() => { setPlaying(false); setPhase(i); }}>{p}</button>)}</div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>{task}, {desc}.</p>
      <div className="replay">
        {rows.map((r, j) => r && (
          <div key={ARMS[j][0]} className="lane">
            <div className="lab"><b style={{ color: ARMS[j][2] }}>{ARMS[j][1]}</b><span className={`pill ${r.recomputed_steps ? 'warn' : 'good'}`}>{r.recomputed_steps} step{r.recomputed_steps === 1 ? '' : 's'} re-ran</span></div>
            <div className="cells" role="img" aria-label={`${ARMS[j][1]} step timeline, phase ${phases[phase]}`}>
              {stepStates(nSteps, cls, kpOk, r.recomputed_steps, phase).map((s, i) => <span key={i} className={`cell ${s}`} title={`step ${i + 1}: ${s}`}>{s === 'kill' ? '✕' : i + 1}</span>)}
            </div>
            {phase === 3 && (
              <div className="hint mono ledger">
                killed_as_expected {String(r.killed_as_expected)} · resume_exit {r.resume_exit} · status {r.status} · duplicates [{r.duplicates.join(', ')}] · missing [{r.missing.join(', ')}] · extra [{r.extra.join(', ')}] · <span className={r.success ? 'ok' : 'no'}>{r.success ? 'exactly once ✓' : 'failed'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="legend"><span><i className="cell-k done" />done</span><span><i className="cell-k effect" />effect written, unrecorded</span><span><i className="cell-k kill" />SIGKILL</span><span><i className="cell-k rerun" />re-ran after resume</span></div>
      <h3 style={{ marginTop: 20 }}>Recomputed steps across all {FAULT_PER_ARM} runs per arm (count of runs)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Arm</th><th>F1: kill between steps</th><th>F2: kill mid-step</th><th>Exact 95% interval, all classes</th></tr></thead>
          <tbody>{ARMS.map(([arm, l]) => (
            <tr key={arm}><td>{l}</td>{['F1', 'F2'].map((c) => <td key={c} className="mono">{Object.entries(RC[arm][c]).map(([k, v]) => `${k} step${k === '1' ? '' : 's'}: ${v} runs`).join(' · ')}</td>)}
              <td className="mono">[{f3(A4.per_arm[arm].rate_ci95_exact[0])}, {f3(A4.per_arm[arm].rate_ci95_exact[1])}]</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="hint">Off-mode runs: {A4.recompute_outliers.map((o) => `${armName(o.arm)} ${o.task} ${o.fault_class} at step ${o.kill_point}, seed ${o.seed}, ${o.recomputed_steps} steps`).join('; ')}. Their cause is not established by the record; LangGraph's default asynchronous checkpoint write is the candidate, untested (see docs/research-review.md).</p>
    </section>
  );
}
const nStepsOf = (t) => fixtures.find((x) => x.task_id === t).steps.length;

function Cost() {
  const pairs = useMemo(() => pairWall(rawMain), []);
  const [reps, setReps] = useState(String(A3.wall_ratio_bootstrap.reps));
  const [seed, setSeed] = useState(A3.wall_ratio_bootstrap.seed);
  const [bs, setBs] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(() => {
    setBusy(true);
    requestAnimationFrame(() => setTimeout(() => { const t0 = performance.now(); const r = bootstrapRatio(pairs, +reps, seed); setBs({ ...r, ms: performance.now() - t0 }); setBusy(false); }, 0));
  }, [pairs, reps, seed]);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const seedId = useId();
  const W = 960, H = 170, pad = { l: 100, r: 16, t: 14, b: 28 };
  const all = rawMain.map((r) => r.wall_seconds);
  const lmin = Math.log10(Math.min(...all) * 0.9), lmax = Math.log10(Math.max(...all) * 1.1);
  const x = (v) => pad.l + ((Math.log10(v) - lmin) / (lmax - lmin)) * (W - pad.l - pad.r);
  const ticks = [0.1, 0.2, 0.5, 1, 2, 5].filter((t) => Math.log10(t) >= lmin && Math.log10(t) <= lmax);
  const jitter = (i) => ((i * 37) % 23) / 23 - 0.5;
  const ratios = pairs.map((p) => p.lg / p.nt);
  const HW = 460, HH = 200, hp = { l: 30, r: 10, t: 10, b: 26 };
  const hist = (vals, lo, hi, bins) => { const h = new Array(bins).fill(0); vals.forEach((v) => { h[Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))]++; }); return h; };
  const rLo = 0, rHi = Math.ceil(Math.max(...ratios) * 10) / 10;
  const rh = hist(ratios, rLo, rHi, 20), rhMax = Math.max(...rh);
  // Histogram range: central 99% of draws, so a few extreme resamples do not flatten the plot.
  const bLo = bs ? bs.draws[Math.floor(0.005 * bs.draws.length)] : 0, bHi = bs ? bs.draws[Math.ceil(0.995 * bs.draws.length) - 1] : 1;
  const bh = bs ? hist(bs.draws.filter((v) => v >= bLo && v <= bHi), bLo, bHi, 30) : [], bhMax = Math.max(1, ...bh);
  const bx = (v) => hp.l + ((v - bLo) / (bHi - bLo || 1)) * (HW - hp.l - hp.r);
  const c = A3.per_arm;
  return (
    <section id="cost" className="card window reveal" data-title="cost.csv — wall time, state bytes, invocations">
      <div className="head">
        <div>
          <p className="eyebrow">Cost explorer</p>
          <h2>In these implementations LangGraph ran faster and stored more.</h2>
          <p className="sub">
            Wall time is implementation-sensitive: the native arm commits its state synchronously after every step, which dominates its time here, and a WAL-mode or batched-commit variant is untested.
            Treat the ordering as a property of these two implementations on one machine in one suite pass, not of LangGraph in general.
          </p>
        </div>
        <Recorded />
      </div>
      <div className="tiles" style={{ marginTop: 0 }}>
        <div className="tile"><div className="num pair">{f3(c.native.wall_median)} · {f3(c.langgraph.wall_median)}</div><div className="cap">median wall s, native · LangGraph (ratio {f3(A3.wall_ratio)}, bound {TH.h2_wall_bound.toFixed(2)})</div></div>
        <div className="tile"><div className="num pair">{f3(c.native.wall_p95)} · {f3(c.langgraph.wall_p95)}</div><div className="cap">p95 wall s, native · LangGraph</div></div>
        <div className="tile"><div className="num pair">{c.native.state_bytes_median / 1024} · {c.langgraph.state_bytes_median / 1024}</div><div className="cap">median durable state KiB, native · LangGraph</div></div>
        <div className="tile"><div className="num pair">{c.native.invocations_median} · {c.langgraph.invocations_median}</div><div className="cap">median policy invocations (ratio {f3(A3.invocation_ratio)})</div></div>
      </div>
      <h3 style={{ marginTop: 20 }}>Wall seconds per run, {MAIN_PER_ARM} runs per arm (log scale)</h3>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strip plot of wall seconds per run for each arm on a log scale">
        {ticks.map((t) => <g key={t}><line className="axis" x1={x(t)} x2={x(t)} y1={pad.t} y2={H - pad.b} /><text x={x(t)} y={H - 8} textAnchor="middle">{t}s</text></g>)}
        {ARMS.map(([arm, l, col], j) => {
          const yc = pad.t + 30 + j * 64;
          const rows = rawMain.filter((r) => r.arm === arm);
          return (
            <g key={arm}>
              <text x={0} y={yc + 4} style={{ fill: 'var(--text)', fontSize: 13 }}>{l}</text>
              {rows.map((r, i) => <circle key={i} cx={x(r.wall_seconds)} cy={yc + jitter(i) * 34} r="3.6" fill={col} fillOpacity={r.success ? 0.55 : 1} stroke={r.success ? 'none' : 'var(--bad)'} strokeWidth="2" />)}
              <line x1={x(c[arm].wall_median)} x2={x(c[arm].wall_median)} y1={yc - 22} y2={yc + 22} stroke="var(--text)" strokeWidth="2.5" />
            </g>
          );
        })}
      </svg>
      <p className="hint">Black bars: medians. Red rings: the {rawMain.filter((r) => !r.success).length} failed runs.</p>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div>
          <h3>Paired ratio per run, LangGraph ÷ native (same task and seed)</h3>
          <svg className="chart" viewBox={`0 0 ${HW} ${HH}`} role="img" aria-label="Histogram of per-pair wall time ratios">
            {rh.map((v, i) => { const bw = (HW - hp.l - hp.r) / rh.length; const hgt = (v / rhMax) * (HH - hp.t - hp.b); return <rect key={i} x={hp.l + i * bw + 1} width={bw - 2} y={HH - hp.b - hgt} height={hgt} rx="2" fill="var(--warn)" opacity="0.8" />; })}
            <line className="axis" x1={hp.l} x2={HW - hp.r} y1={HH - hp.b} y2={HH - hp.b} />
            <text x={hp.l} y={HH - 8}>{rLo}</text><text x={HW - hp.r} y={HH - 8} textAnchor="end">{rHi}</text>
            {rHi >= 1 && <><line x1={hp.l + ((1 - rLo) / (rHi - rLo)) * (HW - hp.l - hp.r)} x2={hp.l + ((1 - rLo) / (rHi - rLo)) * (HW - hp.l - hp.r)} y1={hp.t} y2={HH - hp.b} stroke="var(--text)" strokeDasharray="4 4" /><text x={hp.l + ((1 - rLo) / (rHi - rLo)) * (HW - hp.l - hp.r) + 4} y={hp.t + 10}>parity</text></>}
          </svg>
          <p className="hint">LangGraph faster in {A3.wall_sign_test.langgraph_faster} of {A3.wall_sign_test.pairs} pairs; exact sign test p = {A3.wall_sign_test.p_two_sided.toExponential(1)} (analysis script).</p>
        </div>
        <div>
          <h3>Bootstrap of the median ratio <Live /></h3>
          <div className="controls" style={{ gridTemplateColumns: '1fr 1fr', margin: '8px 0' }}>
            <Select label="Resamples" value={reps} onChange={setReps} options={[['2000', '2,000'], ['10000', '10,000'], ['50000', '50,000']]} />
            <div className="field"><label htmlFor={seedId}>Seed</label><input id={seedId} type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 1)} /></div>
          </div>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Resampling…' : 'Resample'}</button>
          {bs && (
            <>
              <svg className="chart" viewBox={`0 0 ${HW} ${HH}`} role="img" aria-label="Bootstrap distribution of the median wall ratio" style={{ marginTop: 10 }}>
                {bh.map((v, i) => { const bw = (HW - hp.l - hp.r) / bh.length; const hgt = (v / bhMax) * (HH - hp.t - hp.b); return <rect key={i} x={hp.l + i * bw + 0.5} width={bw - 1} y={HH - hp.b - hgt} height={hgt} fill="var(--primary)" opacity="0.7" />; })}
                {bs.ci.map((v, i) => <line key={i} x1={bx(v)} x2={bx(v)} y1={hp.t} y2={HH - hp.b} stroke="var(--text)" strokeWidth="2" />)}
                <text x={hp.l} y={HH - 8}>{f3(bLo)}</text><text x={HW - hp.r} y={HH - 8} textAnchor="end">{f3(bHi)}</text>
              </svg>
              <p className="hint">95% interval [{f3(bs.ci[0])}, {f3(bs.ci[1])}] from {(+reps).toLocaleString('en-US')} resamples of {pairs.length} pairs in {bs.ms.toFixed(0)} ms. The analysis script, with its own generator, reports [{f3(A3.wall_ratio_bootstrap.ci95[0])}, {f3(A3.wall_ratio_bootstrap.ci95[1])}].</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function CodeSurface() {
  const groups = Object.entries(CS);
  const max = Math.max(...groups.map(([, v]) => v.code_lines));
  const col = { 'shared core': 'var(--muted)', 'langgraph arm': 'var(--warn)', 'native arm': 'var(--primary)', 'harness and analysis': 'var(--good)' };
  return (
    <section id="code" className="card window reveal" data-title="loc.txt — code surface by group">
      <p className="eyebrow">Code surface</p>
      <h2>The arms are the small part. The shared core and harness carry the study.</h2>
      <p className="sub">Code lines exclude blanks and comment lines, counted by <a href={blob('study/analyze.py')}>analyze.py</a>. The harness group includes the analysis script, so it grew when the uncertainty analysis was added (DECISIONS.md D9); the core and arm counts did not change.</p>
      <div className="bars" style={{ marginTop: 16 }} role="img" aria-label="Bar chart of code lines per group">
        {groups.map(([g, v]) => (
          <div className="bar-row" key={g}>
            <div className="lab"><span>{g}</span><b>{v.code_lines} <span className="hint">of {v.physical_lines} physical</span></b></div>
            <div className="track"><div className="fill" style={{ width: `${(v.code_lines / max) * 100}%`, background: col[g] }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RunBrowser() {
  const [arm, setArm] = useState('all');
  const [task, setTask] = useState('all');
  const [status, setStatus] = useState('all');
  const tasks = [...new Set(rawMain.map((r) => r.task))];
  const rows = rawMain.filter((r) => (arm === 'all' || r.arm === arm) && (task === 'all' || r.task === task) && (status === 'all' || r.status === status));
  const fails = rawMain.filter((r) => !r.success);
  return (
    <section id="runs" className="card window reveal" data-title="raw_main.json — run browser">
      <div className="head">
        <div>
          <p className="eyebrow">Run browser</p>
          <h2>Every main-suite run, failures included.</h2>
          <p className="sub">{rawMain.length} recorded runs. The {fails.length} failures are the same {fails.length / 2} task-and-seed pairs in both arms ({[...new Set(fails.map((r) => `${r.task} seed ${r.seed}`))].join(', ')}): the shared retry budget ran out on a flaky step.</p>
        </div>
        <Recorded />
      </div>
      <div className="controls">
        <Select label="Arm" value={arm} onChange={setArm} options={[['all', 'Both arms'], ['native', 'Native loop'], ['langgraph', 'LangGraph']]} />
        <Select label="Task" value={task} onChange={setTask} options={[['all', 'All tasks'], ...tasks.map((t) => [t, t])]} />
        <Select label="Status" value={status} onChange={setStatus} options={[['all', 'Any status'], ...[...new Set(rawMain.map((r) => r.status))].map((s) => [s, s])]} />
      </div>
      <p className="hint" style={{ marginTop: 0 }} aria-live="polite">Showing {rows.length} of {rawMain.length} runs.</p>
      <div className="runs" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>Arm</th><th>Task</th><th>Seed</th><th>Status</th><th>Invocations</th><th>Wall s</th><th>State bytes</th><th>Failure</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.arm}${r.task}${r.seed}`} className={r.success ? '' : 'failrow'}>
                <td>{armName(r.arm)}</td><td>{r.task}</td><td>{r.seed}</td><td className={r.success ? 'ok' : 'no'}>{r.status}</td><td>{r.invocations}</td><td>{f3(r.wall_seconds)}</td><td>{r.state_bytes}</td><td>{r.failure || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Limits() {
  const limits = [
    ['Scripted policy, not a model', 'Routing cannot add reasoning, so the success tie is partly true by construction. Nothing here speaks to model quality or deployed agents (DECISIONS.md D1).'],
    [`${N_TASKS} small synthetic fixtures`, `Tasks run ${Math.min(...fixtures.map((t) => t.steps.length))} to ${Math.max(...fixtures.map((t) => t.steps.length))} steps with a step budget of ${STEP_BUDGET}. No external benchmark; scores are not comparable to published leaderboards (D4).`],
    ['One fault family', `Process kills only, in ${N_CLASSES} classes, on ${new Set(rawFault.map((r) => r.task)).size} tasks and ${new Set(rawFault.map((r) => r.seed)).size} seeds. A perfect ${A4.per_arm.native.passes}/${A4.per_arm.native.runs} bounds each recovery rate above ${f3(A4.per_arm.native.rate_ci95_exact[0])}, no tighter.`],
    ['Wall time is one implementation pair', 'Native synchronous commits dominate its time; WAL and batched variants are untested; one suite pass on a shared machine.'],
    ['Debugging and injection axes empty', 'H4 (debugging surface) is Not yet measured; the prompt-injection axis is deferred to a real-model pass (D2, D8).'],
    ['Same author wrote both arms', 'Mitigated by the shared executor, fixed thresholds and published code counts; no outside review of the native baseline yet.'],
  ];
  const docs = [['SPEC.md', 'Spec', 'Question, design, scope'], ['METHODS.md', 'Methods', 'Formulas, faults, threats'], ['RESULTS.md', 'Results', 'Generated by analyze.py'], ['DECISIONS.md', 'Decisions', 'D1 to D9'], ['ROADMAP.md', 'Roadmap', 'The Deep pass, in order'], ['docs/research-review.md', 'Research review', 'Rubric grades and gaps']];
  return (
    <section id="limits" className="card window reveal" data-title="ROADMAP.md — limits and what comes next">
      <p className="eyebrow">Limits and roadmap</p>
      <h2>What this study cannot tell you, and the runs that would.</h2>
      <div className="grid2" style={{ marginTop: 16 }}>
        {limits.map(([t, d]) => (
          <div className="tile" key={t}><div className="head" style={{ marginBottom: 6 }}><h3>{t}</h3><span className="pill warn">Limit</span></div><p className="hint" style={{ margin: 0, fontSize: 13 }}>{d}</p></div>
        ))}
      </div>
      <h3 style={{ marginTop: 24 }}>Deep pass, in order (from ROADMAP.md)</h3>
      <ol className="steps" style={{ marginTop: 12 }}>
        {DEEP_PASS.map((d, i) => <li key={i}><span className="n">{i + 1}</span><div><b>{d.head}.</b> <span className="hint">{d.rest}</span></div></li>)}
      </ol>
      <h3 style={{ marginTop: 24 }}>Sources</h3>
      <ul className="hint cites">
        <li>Yao, Shinn, Razavi, Narasimhan, “tau-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains”, ICLR 2025: the pass^k estimator and goal-state scoring.</li>
        <li>Kapoor, Stroebl, Siegel, Nadgir, Narayanan, TMLR 2025: cost-controlled evaluation of agent systems.</li>
        <li>LangChain changelog, “LangGraph 1.0 is now generally available”, Oct 2025: vendor source for the durability claims tested here.</li>
      </ul>
      <div className="docs" style={{ marginTop: 20 }}>
        {docs.map(([p, t, d]) => <a key={p} href={blob(p)}><b>{t}</b><small>{d}</small></a>)}
      </div>
    </section>
  );
}
