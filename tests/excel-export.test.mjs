import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildApplicationWorkbook, EXCEL_HEADERS } from "../lib/excel-export.js";

function loadSheetJs() {
  vm.runInThisContext(fs.readFileSync(new URL("../vendor/xlsx.full.min.js", import.meta.url), "utf8"));
  return globalThis.XLSX;
}

test("creates a real xlsx workbook with application fields and dates", () => {
  const XLSX = loadSheetJs();
  const workbook = buildApplicationWorkbook(XLSX, [{
    company: "字节跳动",
    role: "AI产品经理（自助产品方向） - 抖音电商",
    department: "抖音电商",
    businessDirection: "电商自助产品",
    location: "北京、上海",
    appliedAt: "2026-08-24T01:00:00.000Z",
    updatedAt: "2026-08-24T02:00:00.000Z",
    resumeVersion: "秋招 AI PM",
    status: "已投递",
    url: "https://jobs.bytedance.com/campus/position/123/detail",
    jdText: "岗位职责\n负责产品规划",
    notes: "官网投递",
    fieldEvidence: {
      company: { source: "official-domain", evidence: "jobs.bytedance.com" },
      department: { source: "explicit", evidence: "抖音电商" },
      businessDirection: { source: "ai", basis: "inferred", evidence: "自助产品方向" },
    },
  }]);
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true });
  const parsed = XLSX.read(bytes, { type: "array", cellDates: true, cellNF: true });
  const sheet = parsed.Sheets["投递记录"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  assert.deepEqual(Array.from(rows[0]), EXCEL_HEADERS);
  assert.equal(rows[1][0], "字节跳动");
  assert.equal(rows[1][1], "AI产品经理（自助产品方向） - 抖音电商");
  assert.equal(rows[1][3], "电商自助产品");
  assert.equal(rows[1][9], "https://jobs.bytedance.com/campus/position/123/detail");
  assert.match(rows[1][12], /自助产品方向/);
  assert.match(rows[1][13], /负责产品规划/);
  assert.equal(sheet.F2.t, "d");
  assert.equal(sheet.F2.z, "yyyy-mm-dd hh:mm");
});
