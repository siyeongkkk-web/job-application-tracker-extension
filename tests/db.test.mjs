import assert from "node:assert/strict";
import test from "node:test";
import { duplicateIdsToDelete } from "../lib/db.js";

test("keeps only the latest record for the same canonical job URL", () => {
  const duplicates = duplicateIdsToDelete([
    {
      id: "old",
      url: "https://jobs.bytedance.com/campus/position/123/detail?utm_source=share",
      updatedAt: "2026-08-24T01:00:00.000Z",
    },
    {
      id: "latest",
      url: "https://jobs.bytedance.com/campus/position/123/detail#top",
      updatedAt: "2026-08-24T03:00:00.000Z",
    },
    {
      id: "middle",
      url: "https://jobs.bytedance.com/campus/position/123/detail",
      updatedAt: "2026-08-24T02:00:00.000Z",
    },
  ]);
  assert.deepEqual(duplicates.sort(), ["middle", "old"]);
});

test("does not merge different job URLs or records without a URL", () => {
  const duplicates = duplicateIdsToDelete([
    { id: "a", url: "https://jobs.bytedance.com/campus/position/123/detail", updatedAt: "2026-08-24T01:00:00.000Z" },
    { id: "b", url: "https://jobs.bytedance.com/campus/position/456/detail", updatedAt: "2026-08-24T02:00:00.000Z" },
    { id: "c", url: "", updatedAt: "2026-08-24T03:00:00.000Z" },
    { id: "d", url: "", updatedAt: "2026-08-24T04:00:00.000Z" },
  ]);
  assert.deepEqual(duplicates, []);
});
