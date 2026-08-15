#!/usr/bin/env node
/**
 * Loop 2 (goal-based) verification harness.
 *
 * Makes "get the checks green" a repeatable goal rather than a one-off command.
 * Reuses the single gate list from scripts/prepush-check.mjs (DRY — never define
 * gates in two places). It can:
 *
 *   - Run all gates:        node scripts/goal-verify.mjs
 *   - Run one gate:         node scripts/goal-verify.mjs --goal test
 *   - Retry until green:    node scripts/goal-verify.mjs --until-green 3
 *
 * Exit code is 0 only when every selected gate passes. An unknown --goal name is
 * reported, never silently ignored.
 *
 * This is the harness an agent drives until green: point it at a goal, let it
 * iterate, stop when the verdict is PASS.
 */
import { spawn } from "node:child_process";
import { CHECKS } from "./prepush-check.mjs";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

/** Parse --goal/--until-green/--help-style flags from argv. */
export function parseArgs(argv) {
  const args = { goals: [], untilGreen: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--goal") {
      args.goals.push(String(argv[++i] ?? "").trim());
    } else if (a === "--until-green") {
      args.untilGreen = Math.max(1, Number(argv[++i]) || 1);
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

/**
 * Map requested goal names onto the gate list, in the gate list's declaration
 * order (not request order, so output is stable). Empty request = all goals.
 * Unknown names are returned so the caller can warn, and are never silently dropped.
 * @returns {{goals:string[], unknown:string[]}}
 */
export function resolveGoals(checks, requested) {
  const known = new Set(checks.map((c) => c.name));
  if (!requested.length) {
    return { goals: checks.map((c) => c.name), unknown: [] };
  }
  const unknown = requested.filter((g) => !known.has(g));
  // Filter the declaration-ordered list down to the requested set.
  const goals = checks.map((c) => c.name).filter((g) => requested.includes(g));
  return { goals, unknown };
}

/**
 * Order the selected gates slowest-first so a parallel batch's lanes finish
 * together (mirrors prepush-check's scheduling). Returns the runs in execution order.
 */
export function planRuns(checks, goals) {
  const selected = checks.filter((c) => goals.includes(c.name));
  return [...selected].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const yellow = (s) => c("33", s);
const dim = (s) => c("90", s);

/** Run one gate to completion, capturing output. */
function runCheck(check) {
  return new Promise((resolve) => {
    const [command, ...args] = check.cmd;
    const start = Date.now();
    const shell = process.platform === "win32";
    const quote = (s) => (shell && /\s/.test(s) ? `"${s}"` : s);
    const child = spawn(quote(command), args.map(quote), {
      stdio: ["ignore", "pipe", "pipe"],
      shell,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => resolve({ ...check, code: 1, output: String(e), secs: "0.0" }));
    child.on("close", (code) =>
      resolve({ ...check, code, output, secs: ((Date.now() - start) / 1000).toFixed(1) })
    );
  });
}

/** Run a plan once; returns { passed:boolean, results:[...] }. */
async function runPlan(runs) {
  const results = [];
  for (const r of runs) {
    const res = await runCheck(r);
    results.push(res);
    console.log(
      (res.code === 0 ? green(`✔ ${r.name} passed`) : red(`✗ ${r.name} FAILED`)) +
        dim(` (${res.secs}s)`)
    );
    if (res.code !== 0 && !r.optional) {
      process.stdout.write(dim(`\n─── ${r.name}: ${r.desc} ───\n`));
      process.stdout.write(res.output.endsWith("\n") ? res.output : `${res.output}\n`);
    }
  }
  return { passed: results.every((r) => r.code === 0 || r.optional), results };
}

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/goal-verify.mjs [--goal <name>]... [--until-green <n>]

Runs the project's verification gates (reuses the prepush-check gate list) until
green or the retry cap. Available goals: ${CHECKS.map((g) => g.name).join(", ")}`);
  process.exit(0);
}

const { goals, unknown } = resolveGoals(CHECKS, args.goals);
for (const u of unknown) {
  console.log(yellow(`⚠ unknown goal "${u}" ignored (known: ${CHECKS.map((g) => g.name).join(", ")})`));
}

const runs = planRuns(CHECKS, goals.length ? goals : CHECKS.map((g) => g.name));
console.log(c("1", `\n▶ Goal verify: ${runs.map((r) => r.name).join(", ")} (up to ${args.untilGreen} attempt${args.untilGreen > 1 ? "s" : ""})\n`));

let attempt = 0;
let passed = false;
while (attempt < args.untilGreen && !passed) {
  attempt += 1;
  if (attempt > 1) console.log(dim(`\nRetry ${attempt}/${args.untilGreen}…`));
  const result = await runPlan(runs);
  passed = result.passed;
  if (!passed && attempt >= args.untilGreen) {
    console.log(red(`\n✗ Goal NOT met after ${attempt} attempt${attempt > 1 ? "s" : ""}. Fix and re-run.\n`));
    process.exit(1);
  }
}
console.log(green(`\n✔ Goal met (attempt ${attempt}). All selected gates green.\n`));
process.exit(0);
}
