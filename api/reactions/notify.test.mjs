import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifyPayload, notify } from "./notify.js";

const SUSPECT_SUMMARY = {
  device_id: "pyro-01",
  metric: "carbonization_temp_c",
  value: 1400,
  seq: 42,
  received_at: "2026-08-13T10:00:00Z",
};

test("buildNotifyPayload shapes a payload for the webhook", () => {
  const p = buildNotifyPayload(SUSPECT_SUMMARY);
  assert.equal(p.kind, "sensor_suspect_alert");
  assert.equal(p.device_id, "pyro-01");
  assert.equal(p.metric, "carbonization_temp_c");
  assert.equal(p.value, 1400);
  assert.equal(p.seq, 42);
  assert.match(p.message, /SUSPECT/);
  assert.match(p.message, /carbonization_temp_c/);
});

test("notify returns null when no webhook URL is configured", async () => {
  const r = await notify(SUSPECT_SUMMARY, null);
  assert.equal(r, null);
});

test("notify POSTs the payload to the webhook and returns the status", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { status: 202, ok: true };
  };
  const r = await notify(SUSPECT_SUMMARY, "https://hooks.example.com/alerts", fakeFetch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hooks.example.com/alerts");
  assert.equal(calls[0].body.kind, "sensor_suspect_alert");
  assert.equal(r, 202);
});

test("notify swallows a failed webhook (never throws)", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const r = await notify(SUSPECT_SUMMARY, "https://hooks.example.com/alerts", fakeFetch);
  assert.equal(r, null);
});
