import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSuspectSummaries, summarizeAlerts } from "./sensor-scan.js";

const SUSPECT_ROWS = [
  { device_id: "pyro-01", metric: "carbonization_temp_c", value: 1400, received_at: "2026-08-13T10:00:00Z" },
  { device_id: "pyro-01", metric: "carbonization_temp_c", value: 1395, received_at: "2026-08-13T10:05:00Z" },
  { device_id: "feed-02", metric: "feedstock_moisture_pct", value: 95, received_at: "2026-08-13T09:00:00Z" },
];

function fakeClient(rows) {
  return {
    from: (table) => ({
      select: () => ({
        lt: (col, val) => ({
          eq: (col2, val2) => ({
            order: () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

test("collectSuspectSummaries returns [] when no rows", async () => {
  const client = fakeClient([]);
  const out = await collectSuspectSummaries(client, 6);
  assert.deepEqual(out, []);
});

test("collectSuspectSummaries groups rows by device+metric, keeps latest value", async () => {
  const client = fakeClient(SUSPECT_ROWS);
  const out = await collectSuspectSummaries(client, 6);
  assert.equal(out.length, 2, "two device+metric groups");
  const pyro = out.find((s) => s.device_id === "pyro-01" && s.metric === "carbonization_temp_c");
  assert.equal(pyro.latest_value, 1395, "keeps the most recent (10:05) value");
  assert.equal(pyro.count, 2);
  const feed = out.find((s) => s.device_id === "feed-02");
  assert.equal(feed.latest_value, 95);
});

test("summarizeAlerts formats a human-readable alert row", () => {
  const summary = [
    { device_id: "pyro-01", metric: "carbonization_temp_c", latest_value: 1395, count: 2 },
  ];
  const row = summarizeAlerts(summary);
  assert.equal(row.kind, "sensor_suspect");
  assert.equal(row.severity, "high");
  assert.match(row.message, /pyro-01/);
  assert.match(row.message, /carbonization_temp_c/);
  assert.match(row.message, /1395/);
});
