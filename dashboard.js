import { deduplicateApplicationsByUrl, deleteApplication, getApplication, listApplications, saveApplication } from "./lib/db.js";
import { exportApplicationsXlsx } from "./lib/excel-export.js";
import { STATUSES } from "./lib/normalize.js";

const rows = document.querySelector("#applicationRows");
const empty = document.querySelector("#empty");
const detail = document.querySelector("#detail");
const summary = document.querySelector("#summary");
const search = document.querySelector("#search");
const statusFilter = document.querySelector("#statusFilter");
let applications = [];
let selectedId = null;
let historicalDuplicatesCleaned = false;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function renderSummary() {
  const active = applications.filter((item) => !["感谢信", "主动终止"].includes(item.status)).length;
  const interviews = applications.filter((item) => ["一面", "二面", "HR面"].includes(item.status)).length;
  const metrics = [["全部投递", applications.length], ["进行中", active], ["面试阶段", interviews], ["Offer", applications.filter((item) => item.status === "Offer").length]];
  summary.innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function filteredApplications() {
  const query = search.value.trim().toLowerCase();
  return applications.filter((item) => {
    const matchesStatus = !statusFilter.value || item.status === statusFilter.value;
    const haystack = `${item.company} ${item.role} ${item.department || ""} ${item.businessDirection || ""} ${item.location} ${item.jdText}`.toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function evidenceText(item, key) {
  const evidence = item.fieldEvidence?.[key];
  if (!evidence) return "旧记录未保存识别依据";
  const sources = { structured: "网页结构化信息", explicit: "网页明确标注", "official-domain": "官方招聘域名", "site-metadata": "网页站点信息", "page-brand": "页面品牌信息", "page-title": "浏览器标题推测", ai: "AI 建议", manual: "手动填写", missing: "网页未明确" };
  return `${sources[evidence.source] || evidence.source}${evidence.evidence ? ` · 证据：“${evidence.evidence}”` : ""}`;
}

function manualEvidence(value) {
  return { value, source: "manual", evidence: "", confidence: "high" };
}

function renderRows() {
  const filtered = filteredApplications();
  rows.innerHTML = filtered.map((item) => `
    <tr data-id="${escapeHtml(item.id)}" class="${item.id === selectedId ? "selected" : ""}" tabindex="0">
      <td><div class="company">${escapeHtml(item.company)}</div></td>
      <td><div class="role-name">${escapeHtml(item.role)}</div></td>
      <td>${formatDate(item.appliedAt)}</td>
      <td>${escapeHtml(item.resumeVersion || "—")}</td>
      <td><span class="status">${escapeHtml(item.status)}</span></td>
    </tr>`).join("");
  empty.hidden = filtered.length !== 0;
}

async function selectApplication(id) {
  const item = await getApplication(id);
  if (!item) return;
  selectedId = id;
  renderRows();
  detail.innerHTML = `
    <h2>${escapeHtml(item.role)}</h2>
    <p class="detail-company">${escapeHtml(item.company)}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</p>
    <div class="detail-grid">
      <label>公司<input id="detailCompany" value="${escapeHtml(item.company)}" /><span class="evidence-note">${escapeHtml(evidenceText(item, "company"))}</span></label>
      <label>岗位<input id="detailRole" value="${escapeHtml(item.role)}" /></label>
      <label>当前进度<select id="detailStatus">${STATUSES.map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
      <label>简历版本<input id="detailResume" value="${escapeHtml(item.resumeVersion || "")}" /></label>
      <label>部门<input id="detailDepartment" value="${escapeHtml(item.department || "")}" /><span class="evidence-note">${escapeHtml(evidenceText(item, "department"))}</span></label>
      <label>地点<input id="detailLocation" value="${escapeHtml(item.location || "")}" /></label>
      <label class="full">业务方向 / 团队<input id="detailBusinessDirection" value="${escapeHtml(item.businessDirection || "")}" /><span class="evidence-note">${escapeHtml(evidenceText(item, "businessDirection"))}</span></label>
      <label class="full">JD 原文<textarea id="detailJd" rows="16">${escapeHtml(item.jdText)}</textarea></label>
      <label class="full">备注<textarea id="detailNotes" rows="4">${escapeHtml(item.notes || "")}</textarea></label>
    </div>
    <a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开原岗位网页 ↗</a>
    <div class="detail-actions"><button id="deleteRecord" class="danger" type="button">删除这条记录</button><button id="saveChanges" class="primary" type="button">保存更新</button></div>`;

  detail.querySelector("#saveChanges").addEventListener("click", async () => {
    const company = detail.querySelector("#detailCompany").value.trim();
    const department = detail.querySelector("#detailDepartment").value.trim();
    const businessDirection = detail.querySelector("#detailBusinessDirection").value.trim();
    const updated = {
      ...item,
      company,
      role: detail.querySelector("#detailRole").value.trim(),
      status: detail.querySelector("#detailStatus").value,
      resumeVersion: detail.querySelector("#detailResume").value.trim(),
      department,
      businessDirection,
      location: detail.querySelector("#detailLocation").value.trim(),
      jdText: detail.querySelector("#detailJd").value.trim(),
      notes: detail.querySelector("#detailNotes").value.trim(),
      updatedAt: new Date().toISOString(),
      fieldEvidence: {
        ...(item.fieldEvidence || {}),
        company: company === item.company ? item.fieldEvidence?.company : manualEvidence(company),
        department: department === (item.department || "") ? item.fieldEvidence?.department : manualEvidence(department),
        businessDirection: businessDirection === (item.businessDirection || "") ? item.fieldEvidence?.businessDirection : manualEvidence(businessDirection),
      },
    };
    await saveApplication(updated);
    await refresh();
    await selectApplication(updated.id);
  });

  detail.querySelector("#deleteRecord").addEventListener("click", async () => {
    if (!confirm(`确定删除“${item.company}－${item.role}”吗？此操作不能撤销。`)) return;
    await deleteApplication(item.id);
    selectedId = null;
    detail.innerHTML = '<div class="detail-placeholder">选择左侧的一条记录，查看完整 JD 和更新进度。</div>';
    await refresh();
  });
}

async function refresh() {
  if (!historicalDuplicatesCleaned) {
    await deduplicateApplicationsByUrl();
    historicalDuplicatesCleaned = true;
  }
  applications = await listApplications();
  renderSummary();
  renderRows();
}

rows.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (row) selectApplication(row.dataset.id);
});
rows.addEventListener("keydown", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (row && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    selectApplication(row.dataset.id);
  }
});
search.addEventListener("input", renderRows);
statusFilter.addEventListener("change", renderRows);

for (const status of STATUSES) {
  const option = document.createElement("option");
  option.value = status;
  option.textContent = status;
  statusFilter.append(option);
}

document.querySelector("#exportExcel").addEventListener("click", async () => {
  const records = await listApplications();
  if (!globalThis.XLSX) {
    alert("Excel 导出组件没有加载成功，请刷新扩展后重试。");
    return;
  }
  exportApplicationsXlsx(globalThis.XLSX, records);
});

window.addEventListener("focus", refresh);
refresh();
