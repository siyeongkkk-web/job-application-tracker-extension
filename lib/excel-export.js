export const EXCEL_HEADERS = [
  "公司",
  "岗位",
  "部门",
  "业务方向/团队",
  "地点",
  "投递日期",
  "最近更新",
  "简历版本",
  "当前进度",
  "岗位链接",
  "公司识别依据",
  "部门识别依据",
  "业务方向识别依据",
  "JD 原文",
  "备注",
];

function evidenceCell(item, key) {
  const evidence = item.fieldEvidence?.[key];
  if (!evidence) return "";
  return [evidence.source, evidence.basis, evidence.evidence].filter(Boolean).join(" | ");
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

export function buildApplicationWorkbook(XLSX, applications) {
  const rows = applications.map((item) => [
    item.company || "",
    item.role || "",
    item.department || "",
    item.businessDirection || "",
    item.location || "",
    validDate(item.appliedAt),
    validDate(item.updatedAt),
    item.resumeVersion || "",
    item.status || "",
    item.url || "",
    evidenceCell(item, "company"),
    evidenceCell(item, "department"),
    evidenceCell(item, "businessDirection"),
    item.jdText || "",
    item.notes || "",
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows], { cellDates: true });
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 32 }, { wch: 12 }, { wch: 48 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 70 }, { wch: 36 },
  ];
  worksheet["!autofilter"] = { ref: `A1:O${Math.max(rows.length + 1, 1)}` };
  for (let row = 2; row <= rows.length + 1; row += 1) {
    for (const column of ["F", "G"]) {
      const cell = worksheet[`${column}${row}`];
      if (cell?.t === "d") cell.z = "yyyy-mm-dd hh:mm";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "投递记录");
  return workbook;
}

export function exportApplicationsXlsx(XLSX, applications) {
  const workbook = buildApplicationWorkbook(XLSX, applications);
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFileXLSX(workbook, `秋招投递记录-${date}.xlsx`, { compression: true, cellDates: true });
}
