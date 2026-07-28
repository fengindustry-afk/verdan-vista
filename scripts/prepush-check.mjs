#!/usr/bin/env node
/**
 * Pre-push code-error check.
 *
 * Runs a series of gates before code is pushed to GitHub. If any gate fails,
 * the script exits non-zero so the push is aborted (when wired to a git hook)
 * or so CI / you can see the failure.
 *
 * The gates don't depend on each other, so two run at a time (PARALLEL=n to
 * change) and the push waits for the slower lane rather than the sum. Two, not
 * all five: vitest and vite each spawn their own workers, and running every
 * gate at once starved vitest badly enough that it silently ran 12 of 19 test
 * files. Output is captured per gate and printed in full for any failure.
 *
 * HOW TO EXTEND (do this whenever you add a feature or check):
 *   - Add a new entry to the CHECKS array below.
 *   - `name`     : label shown in the output.
 *   - `cmd`      : command + args to run (uses the local npm/npx binaries).
 *   - `optional` : if true, a missing script / non-zero exit only warns.
 *   - `cost`     : rough seconds it takes. Scheduling hint only — slowest gate
 *                  starts first so the lanes finish together. Never skips.
 *
 * Run manually:   npm run check
 * Skip a gate:    SKIP=test npm run check   (comma-separated names)
 */
import { spawn } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// ---- The checks. Add to this list as the project grows. --------------------
const CHECKS = [
  {
    name: 'typecheck',
    cost: 47,
    // Run the installed compiler directly. `npx tsc` here resolved to the
    // squatted 2016 `tsc` package on the registry, which prints "This is not
    // the tsc command you are looking for" and exits 1 — failing this gate on
    // every push regardless of the code. `npx --no` isn't the fix either: npm
    // parses the `-p` below as its own --package flag.
    cmd: [process.execPath, 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json'],
    desc: 'TypeScript type errors',
  },
  {
    name: 'lint',
    cost: 42,
    // Block on errors; warnings (e.g. shadcn UI react-refresh notes) are allowed.
    // Scope to this project's own source — NOT `.` — so the check never lints
    // sibling git worktrees under `.claude/worktrees/` (each has its own checks).
    cmd: [npx, 'eslint', 'src', 'middleware.ts'],
    desc: 'ESLint rule violations',
  },
  {
    name: 'test',
    cost: 55,
    cmd: [npx, 'vitest', 'run'],
    desc: 'Unit tests (vitest)',
  },
  {
    name: 'build',
    cost: 37,
    cmd: [npx, 'vite', 'build'],
    desc: 'Production build compiles',
  },
  {
    name: 'security',
    cost: 2,
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

/** Run one gate to completion, capturing its output instead of streaming it. */
function runCheck(check) {
  return new Promise((resolve) => {
    const [command, ...args] = check.cmd;
    const start = Date.now();
    const shell = process.platform === 'win32';
    // cmd.exe splits on spaces, so an unquoted path breaks any gate spawned via
    // process.execPath for a user whose profile has a space in it ("C:\Users\Asus
    // ROG\..." → "'C:\Users\Asus' is not recognized"). That silently failed the
    // typecheck and security gates here.
    const quote = (s) => (shell && /\s/.test(s) ? `"${s}"` : s);
    const child = spawn(quote(command), args.map(quote), {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell,
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', (e) => resolve({ ...check, code: 1, output: String(e), secs: '0.0' }));
    child.on('close', (code) =>
      resolve({ ...check, code, output, secs: ((Date.now() - start) / 1000).toFixed(1) })
    );
  });
}

for (const c of CHECKS) {
  if (skip.has(c.name)) console.log(yellow(`- skip  ${c.name} `) + dim(`(SKIP env)`));
}

// Longest gate first, so the last lane to finish isn't one that started late.
const queued = CHECKS.filter((c) => !skip.has(c.name)).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
const lanes = Math.max(1, Number(process.env.PARALLEL) || 2);
console.log(dim(`Running ${queued.length} checks, ${lanes} at a time…\n`));

const finished = [];
const pending = [...queued];
await Promise.all(
  Array.from({ length: Math.min(lanes, pending.length) }, async () => {
    for (let next = pending.shift(); next; next = pending.shift()) {
      const r = await runCheck(next);
      // Report each gate as it lands, so a slow lane isn't a silent wait.
      console.log(
        (r.code === 0 ? green(`✔ ${r.name} passed`) : yellow(`… ${r.name} finished with errors`)) +
          dim(` (${r.secs}s)`)
      );
      finished.push(r);
    }
  })
);
// Back to declaration order, so the report reads the same however they raced.
const order = CHECKS.map((c) => c.name);
finished.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

const results = CHECKS.filter((c) => skip.has(c.name)).map((c) => ({ name: c.name, status: 'skip' }));
let failed = false;

for (const r of finished) {
  if (r.code === 0) {
    results.push({ name: r.name, status: 'pass' });
    continue;
  }
  // Failures print their whole log — the reason to run the gate at all.
  process.stdout.write(dim(`\n─── ${r.name}: ${r.desc} ───\n`));
  process.stdout.write(r.output.endsWith('\n') ? r.output : `${r.output}\n`);
  if (r.optional) {
    console.log(yellow(`⚠ ${r.name} failed (optional, not blocking)`) + dim(` (${r.secs}s)`));
    results.push({ name: r.name, status: 'warn' });
  } else {
    console.log(red(`X ${r.name} FAILED`) + dim(` (${r.secs}s)`));
    results.push({ name: r.name, status: 'fail' });
    failed = true;
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
