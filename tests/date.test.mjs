import assert from "node:assert/strict";
import test from "node:test";
import { dateInputValue, replaceLocalDate } from "../lib/date.js";

test("formats a saved timestamp for the dashboard date input", () => {
  const timestamp = new Date(2026, 7, 24, 9, 30, 15).toISOString();
  assert.equal(dateInputValue(timestamp), "2026-08-24");
  assert.equal(dateInputValue("not-a-date"), "");
});

test("changes only the local calendar date and preserves the saved time", () => {
  const original = new Date(2026, 7, 24, 9, 30, 15);
  const updated = new Date(replaceLocalDate(original.toISOString(), "2026-09-03"));

  assert.equal(updated.getFullYear(), 2026);
  assert.equal(updated.getMonth(), 8);
  assert.equal(updated.getDate(), 3);
  assert.equal(updated.getHours(), original.getHours());
  assert.equal(updated.getMinutes(), original.getMinutes());
  assert.equal(updated.getSeconds(), original.getSeconds());
});

test("keeps the original timestamp when the date is unchanged or invalid", () => {
  const original = new Date(2026, 7, 24, 9, 30, 15).toISOString();
  assert.equal(replaceLocalDate(original, "2026-08-24"), original);
  assert.equal(replaceLocalDate(original, "invalid"), original);
  assert.equal(replaceLocalDate(original, "2026-02-30"), original);
});
