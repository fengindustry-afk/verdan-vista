import { test } from "node:test";
import assert from "node:assert/strict";
import { planRuns, resolveGoals } from "./goal-verify.mjs";

// A CHECKS-shaped list (same shape as prepush-check's exported CHECKS).
const CHECKS = [
  { name: "typecheck", cost: 10, cmd: ["tsc"] },
  { name: "lint", cost: 5, cmd: ["eslint"] },
  { name: "test", cost: 20, cmd: ["vitest", "run"] },
];

test("resolveGoals returns all goals when none specified", () => {
  const r = resolveGoals(CHECKS, []);
  assert.deepEqual(r.goals, ["typecheck", "lint", "test"]);
});

test("resolveGoals filters to the named goals", () => {
  const r = resolveGoals(CHECKS, ["test", "lint"]);
  assert.deepEqual(r.goals, ["lint", "test"]);
});

test("resolveGoals reports an unknown goal instead of silently skipping", () => {
  const { goals, unknown } = resolveGoals(CHECKS, ["test", "nope"]);
  assert.deepEqual(goals, ["test"]);
  assert.deepEqual(unknown, ["nope"]);
});

test("planRuns orders selected goals by declared cost (slowest first)", () => {
  const runs = planRuns(CHECKS, ["test", "typecheck", "lint"]);
  assert.deepEqual(runs.map((r) => r.name), ["test", "typecheck", "lint"]);
});

test("planRuns ignores an unknown goal", () => {
  const runs = planRuns(CHECKS, ["test", "bogus"]);
  assert.deepEqual(runs.map((r) => r.name), ["test"]);
});
