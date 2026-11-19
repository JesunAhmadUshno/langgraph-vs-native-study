// Computations that run live in the browser. Each mirrors a function in study/
// and is checked against the committed result files by lab.check.mjs during the build.

// --- Python-compatible serialization (json.dumps(x, sort_keys=True)) --------
// Python's default separators are ', ' and ': ', and keys are sorted at every level.
export function pyDumps(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(', ')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}: ${pyDumps(v[k])}`).join(', ')}}`;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
// Web Crypto: window.crypto in the browser, globalThis.crypto in Node 19+.
const sha256 = (text) => globalThis.crypto.subtle.digest('SHA-256', enc.encode(text));

export async function fixturesHash(fixtures) { return hex(await sha256(pyDumps(fixtures))); }

// --- study/tools.py failure_draw ----------------------------------------------
// sha256("task|seed|step|attempt"), first 8 bytes big-endian, divided by 2^64.
export async function drawValue(task, seed, step, attempt) {
  const b = new Uint8Array(await sha256(`${task}|${seed}|${step}|${attempt}`));
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[i]);
  return Number(v) / 2 ** 64;
}

// Precompute every draw the simulator can need: flaky steps only.
export async function drawTable(fixtures, seeds, maxAttempts) {
  const jobs = [];
  for (const t of fixtures) t.steps.forEach((s, i) => {
    if (s.flaky == null) return;
    for (const seed of seeds) for (let a = 0; a < maxAttempts; a++) jobs.push([t.task_id, seed, i, a]);
  });
  const vals = await Promise.all(jobs.map((j) => drawValue(...j)));
  const table = new Map();
  jobs.forEach((j, n) => table.set(j.join('|'), vals[n]));
  return table;
}

// --- study/analyze.py _passk --------------------------------------------------
export function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
export const passk = (c, n, k) => (c < k ? 0 : comb(c, k) / comb(n, k));

// --- study/executor.py retry loop, success path only ---------------------------
// A step fails when attempts 0..retryBudget all draw failure; the run then stops.
// Both arms share this executor and these draws, so they are identical in this model.
export function simulate({ fixtures, table, retryBudget, mult = 1, seeds, taskIds, kMax = 8 }) {
  const rows = [];
  const failures = [];
  for (const t of fixtures) {
    if (taskIds && !taskIds.includes(t.task_id)) continue;
    let wins = 0;
    for (const seed of seeds) {
      let failedAt = null;
      for (let i = 0; i < t.steps.length && failedAt === null; i++) {
        const p = t.steps[i].flaky;
        if (p == null) continue;
        const pp = Math.min(1, p * mult);
        let ok = false;
        for (let a = 0; a <= retryBudget; a++) if (!(table.get(`${t.task_id}|${seed}|${i}|${a}`) < pp)) { ok = true; break; }
        if (!ok) failedAt = i;
      }
      if (failedAt === null) wins++; else failures.push({ task: t.task_id, seed, step: failedAt });
    }
    const n = seeds.length;
    rows.push({ task: t.task_id, successes: wins, trials: n, pass1: wins / n, passk: Array.from({ length: kMax }, (_, j) => passk(wins, n, j + 1)) });
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  return {
    rows, failures,
    overall: mean(rows.map((r) => r.pass1)),
    curve: Array.from({ length: kMax }, (_, j) => mean(rows.map((r) => r.passk[j]))),
  };
}

// --- study/analyze.py _betacf / _betainc / beta_ppf / clopper_pearson ----------
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-7) break;
  }
  return h;
}
function lgamma(z) { // Lanczos approximation, |error| < 1e-13 for z > 0
  const g = 7, cf = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1; let x = cf[0];
  for (let i = 1; i < g + 2; i++) x += cf[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function betainc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
function betaPpf(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (betainc(a, b, mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export function clopperPearson(c, n, alpha = 0.05) {
  return [c === 0 ? 0 : betaPpf(alpha / 2, c, n - c + 1), c === n ? 1 : betaPpf(1 - alpha / 2, c + 1, n - c)];
}

// --- medians, pairing and a seeded bootstrap ---------------------------------
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function pairWall(rawMain) {
  const by = new Map(rawMain.map((r) => [`${r.task}|${r.seed}|${r.arm}`, r.wall_seconds]));
  const keys = [...new Set(rawMain.map((r) => `${r.task}|${r.seed}`))].sort();
  return keys.map((k) => { const [task, seed] = k.split('|'); return { task, seed: +seed, lg: by.get(`${k}|langgraph`), nt: by.get(`${k}|native`) }; });
}
export function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Percentile interval for median(LangGraph) / median(native), resampling task-and-seed pairs.
export function bootstrapRatio(pairs, reps, seed, alpha = 0.05) {
  const rand = mulberry32(seed), n = pairs.length, out = new Float64Array(reps);
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < n; i++) { const p = pairs[Math.floor(rand() * n)]; a[i] = p.lg; b[i] = p.nt; }
    out[r] = median(a) / median(b);
  }
  out.sort();
  return { ci: [out[Math.floor((alpha / 2) * reps)], out[Math.ceil((1 - alpha / 2) * reps) - 1]], draws: out };
}

// --- verdict rules, as registered in HYPOTHESES.md and coded in analyze.py ------
export function verdictH1(ci, margin) {
  if (ci[0] >= -margin && ci[1] <= margin) return 'Supported';
  if (ci[1] < 0 || ci[0] > 0 || ci[1] < -margin || ci[0] > margin) return 'Refuted';
  return 'Inconclusive';
}
export function verdictH2(invRatio, wallRatio, invBound, wallBound) {
  const a = invRatio <= invBound, b = wallRatio <= wallBound;
  return a && b ? 'Supported' : a || b ? 'Partially supported' : 'Refuted';
}
export function verdictH3(gap, threshold) {
  if (gap > threshold) return 'Supported (LangGraph advantage)';
  if (gap < -threshold) return 'Refuted';
  return 'Supported (tie: the orchestrator adds nothing measurable on recovery in this design)';
}

// Recomputed-steps distribution per arm and fault class, from raw_fault.json.
export function recomputeCounts(rawFault) {
  const out = {};
  for (const r of rawFault) {
    const cell = ((out[r.arm] ??= {})[r.fault_class] ??= {});
    cell[r.recomputed_steps] = (cell[r.recomputed_steps] ?? 0) + 1;
  }
  return out;
}

// Integer constants read from study/tasks.py source text.
export function pyConst(src, name) {
  const m = src.match(new RegExp(`^${name}\\s*=\\s*(\\d+)`, 'm'));
  if (!m) throw new Error(`${name} not found in tasks.py`);
  return +m[1];
}
