import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

// The site reads ../results/*.json and ../study/*.py at build time, so every number on the page is generated, never typed.
// The pre-registration timeline is read from git: the commit that first added each file.
function firstCommit(path) {
  try {
    const out = execFileSync('git', ['-C', '..', 'log', '--diff-filter=A', '--format=%h|%ad', '--date=short', '--', path], { encoding: 'utf8' }).trim().split('\n').pop();
    const [hash, date] = out.split('|');
    return hash ? { path, hash, date } : null;
  } catch { return null; }
}
const timeline = ['HYPOTHESES.md', 'study/arm_native.py', 'results/raw_main.json'].map((p) => firstCommit(p)).filter(Boolean);

export default defineConfig({
  base: '/langgraph-vs-native-study/',
  plugins: [react()],
  define: { __TIMELINE__: JSON.stringify(timeline) },
  server: { fs: { allow: ['..'] } },
});
