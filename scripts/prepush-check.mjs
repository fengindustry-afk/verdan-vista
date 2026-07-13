#!/usr/bin/env node
/**
 * Pre-push code-error check.
 *
 * Runs a series of gates before code is pushed to GitHub. If any gate fails,
 * the script exits non-zero so the push is aborted (when wired to a git hook)
 * or so CI / you can see the failure.
 *
 * HOW TO EXTEND (do this whenever you add a feature or check):
 *   - Add a new entry to the CHECKS array below.
 *   - `name`     : label shown in the output.
 *   - `cmd`      : command + args to run (uses the local npm/npx binaries).
 *   - `optional` : if true, a missing script / non-zero exit only warns.
 *
 * Run manually:   npm run check
 * Skip a gate:    SKIP=test npm run check   (comma-separated names)
 */
import { spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// ---- The checks. Add to this list as the project grows. --------------------
const CHECKS = [
  {
    name: 'typecheck',
    cmd: [npx, 'tsc', '--noEmit', '-p', 'tsconfig.app.json'],
    desc: 'TypeScript type errors',
  },
  {
    name: 'lint',
    // Block on errors; warnings (e.g. shadcn UI react-refresh notes) are allowed.
    // Scope to this project's own source — NOT `.` — so the check never lints
    // sibling git worktrees under `.claude/worktrees/` (each has its own checks).
    cmd: [npx, 'eslint', 'src', 'middleware.ts'],
    desc: 'ESLint rule violations',
  },
  {
    name: 'test',
    cmd: [npx, 'vitest', 'run'],
    desc: 'Unit tests (vitest)',
  },
  {
    name: 'build',
    cmd: [npx, 'vite', 'build'],
    desc: 'Production build compiles',
  },
  {
    name: 'security',
    cmd: [process.execPath, 'security/verify-posture.mjs'],
    desc: 'Security posture verification',
    optional: true,
  },
];
// ---------------------------------------------------------------------------

const skip = new Set(
  (process.env.SKIP || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const yellow = (s) => c('33', s);
const dim = (s) => c('90', s);

console.log(c('1', '\n▶ Pre-push checks\n'));

const results = [];
let failed = false;

for (const check of CHECKS) {
  if (skip.has(check.name)) {
    console.log(yellow(`- skip  ${check.name} `) + dim(`(SKIP env)`));
    results.push({ name: check.name, status: 'skip' });
    continue;
  }

  process.stdout.write(dim(`\n─── ${check.name}: ${check.desc} ───\n`));
  const [command, ...args] = check.cmd;
  const start = Date.now();
  const run = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const secs = ((Date.now() - start) / 1000).toFixed(1);

  const ok = run.status === 0;
  if (ok) {
    console.log(green(`✔ ${check.name} passed`) + dim(` (${secs}s)`));
    results.push({ name: check.name, status: 'pass' });
  } else if (check.optional) {
    console.log(yellow(`⚠ ${check.name} failed (optional, not blocking)`));
    results.push({ name: check.name, status: 'warn' });
  } else {
    console.log(red(`X ${check.name} FAILED`) + dim(` (${secs}s)`));
    results.push({ name: check.name, status: 'fail' });
    failed = true;
    break; // stop at first hard failure — fix it, then re-run
  }
}

// ---- Summary ---------------------------------------------------------------
console.log(c('1', '\n▶ Summary'));
for (const r of results) {
  const icon =
    r.status === 'pass'
      ? green('✔')
      : r.status === 'warn'
        ? yellow('⚠')
        : r.status === 'skip'
          ? yellow('skip')
          : red('✗');
  console.log(`  ${icon}  ${r.name}`);
}

if (failed) {
  console.log(red('\n✗ Pre-push checks failed. Fix the errors above before pushing.\n'));
  process.exit(1);
}
console.log(green('\n✔ All checks passed. Safe to push.\n'));
