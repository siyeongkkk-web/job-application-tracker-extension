import { AI_FIELDS, canAdoptSuggestion, shouldAutoAdopt, DEFAULT_AI_PROVIDER, requestAiEnrichment } from "./lib/ai-enrichment.js";
import { captureCurrentPage } from "./lib/capture-page.js";
import { findApplicationByUrl, saveApplication } from "./lib/db.js";
import { makeId, normalizeSnapshot, STATUSES } from "./lib/normalize.js";

const form = document.querySelector("#applicationForm");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#error");
const statusSelect = document.querySelector("#status");
let captured = null;
let aiRunning = false;
let pageSnapshot = null;
let sourceTab = null;
let aiSettingsState = { provider: DEFAULT_AI_PROVIDER, deepseekApiKey: "", openaiApiKey: "" };
let aiSettingsReady = Promise.resolve();

for (const status of STATUSES) {
  const option = document.createElement("option");
  option.value = status;
  option.textContent = status;
  statusSelect.append(option);
}

function field(id) {
  return document.querySelector(`#${id}`);
}

function showError(message) {
  loading.hidden = true;
  form.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = message;
}

const sourceLabels = {
  structured: "网页结构化信息",
  explicit: "网页明确标注",
  "official-domain": "官方招聘域名",
  "site-metadata": "网页站点信息",
  "page-brand": "页面品牌信息",
  "page-title": "浏览器标题推测",
  visual: "网页标题线索",
  fallback: "页面标题推测",
  "page-rule": "网页规则提取，请核对",
  ai: "AI 建议",
  manual: "手动填写",
  missing: "网页未明确",
};

function renderFieldSource(key) {
  const evidence = captured?.fieldEvidence?.[key] || { source: field(key).value ? "page-rule" : "missing", evidence: "", confidence: "low" };
  const label = sourceLabels[evidence.source] || evidence.source;
  const detail = evidence.evidence && evidence.evidence !== field(key).value ? ` · 证据：“${evidence.evidence}”` : "";
  field(`${key}Source`).textContent = `${label}${detail}`;
}

function setFieldEvidence(key, evidence) {
  captured.fieldEvidence ||= {};
  captured.fieldEvidence[key] = evidence;
  renderFieldSource(key);
}

function providerName(provider) {
  return provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "AI";
}

function providerKey(provider) {
  return provider === "deepseek" ? "deepseekApiKey" : "openaiApiKey";
}

function renderAiSettings() {
  const provider = field("aiProvider").value;
  const disabled = provider === "none";
  const name = providerName(provider);
  const saved = !disabled && Boolean(aiSettingsState[providerKey(provider)]);
  field("aiApiKeyLabel").hidden = disabled;
  field("aiApiKeyLabel").childNodes[0].textContent = disabled ? "API Key" : `${name} API Key`;
  field("aiApiKey").placeholder = saved ? "已保存，留空保持不变" : `输入 ${name} API Key`;
  field("aiApiKey").value = "";
  field("aiEnrich").disabled = disabled || aiRunning;
  field("aiSettings").querySelector("summary").textContent = disabled
    ? "AI 服务设置 · 已关闭"
    : `AI 服务设置 · ${name}${saved ? " 已配置" : " 未配置"}`;
}

async function loadAiSettings() {
  const stored = await chrome.storage.local.get(["aiProvider", "deepseekApiKey", "openaiApiKey"]);
  aiSettingsState = {
    provider: stored.aiProvider || DEFAULT_AI_PROVIDER,
    deepseekApiKey: stored.deepseekApiKey || "",
    openaiApiKey: stored.openaiApiKey || "",
  };
  field("aiProvider").value = aiSettingsState.provider;
  renderAiSettings();
}

async function loadCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) {
      showError("请先打开一个岗位详情网页，再点击投递助手。浏览器设置页和空白页无法采集。");
      return;
    }
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureCurrentPage });
    sourceTab = tab;
    pageSnapshot = result;
    captured = normalizeSnapshot(result);
    for (const key of ["role", "company", "location", "department", "businessDirection", "url", "jdText"]) field(key).value = captured[key] || "";
    for (const key of AI_FIELDS) renderFieldSource(key);
    const qualityMessages = {
      structured: "网页提供了规范岗位数据；请快速确认公司和岗位即可。",
      "visible-text": "已从当前页面正文提取；已配置 AI 时会自动识别，请核对结果后保存。",
      "metadata-only": "这个页面没有可读正文。链接已保留，请手动补充 JD 后再保存。",
    };
    field("qualityMessage").textContent = qualityMessages[captured.captureQuality];
    loading.hidden = true;
    form.hidden = false;
  } catch (error) {
    showError(`没有成功读取这个页面：${error.message || "未知原因"}`);
  }
}

function adoptSuggestion(key, suggestion) {
  if (!canAdoptSuggestion(key, suggestion)) return;
  field(key).value = suggestion.value;
  setFieldEvidence(key, {
    value: suggestion.value,
    source: "ai",
    evidence: suggestion.evidence,
    confidence: suggestion.confidence,
    basis: suggestion.basis,
  });
}

async function recognizePage() {
  const button = field("aiEnrich");
  const status = field("aiStatus");
  await aiSettingsReady;
  if (!captured || aiRunning) return;
  const provider = aiSettingsState.provider;
  const apiKey = aiSettingsState[providerKey(provider)];
  if (provider === "none") {
    status.className = "ai-status";
    status.textContent = "AI 补全已关闭，可在下方设置中重新开启。";
    return;
  }
  if (!apiKey) {
    field("aiSettings").open = true;
    status.className = "ai-status error";
    status.textContent = `请先在下方填写并保存 ${providerName(provider)} API Key。`;
    field("aiApiKey").focus();
    return;
  }
  aiRunning = true;
  field("saveAiSettings").disabled = true;
  field("aiProvider").disabled = true;
  button.disabled = true;
  button.textContent = "识别中…";
  status.className = "ai-status";
  status.textContent = "正在读取页面截图与文字，识别五项岗位信息…";
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id !== sourceTab.id || activeTab.url !== sourceTab.url) throw new Error("岗位页面已切换，请重新打开投递助手再识别。");
    const [{ result: freshSnapshot }] = await chrome.scripting.executeScript({ target: { tabId: sourceTab.id }, func: captureCurrentPage });
    const screenshot = await chrome.tabs.captureVisibleTab(sourceTab.windowId, { format: "png" });
    const extraImages = await Promise.all([...field("aiScreenshots").files].map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("补充截图读取失败，请重新选择。"));
      reader.readAsDataURL(file);
    })));
    pageSnapshot = { ...freshSnapshot, images: [screenshot, ...extraImages] };
    const current = { ...captured, ...Object.fromEntries(AI_FIELDS.map(key => [key, field(key).value.trim()])) };
    const result = await requestAiEnrichment({ provider, apiKey, snapshot: pageSnapshot, current });
    for (const key of AI_FIELDS) {
      const currentEvidence = captured.fieldEvidence?.[key];
      if (shouldAutoAdopt(key, result[key], field(key).value.trim(), currentEvidence)) adoptSuggestion(key, result[key]);
    }
    status.textContent = "识别结果已自动填入，可直接修改后保存。";
  } catch (error) {
    status.className = "ai-status error";
    status.textContent = error.message || "AI 补全失败，请稍后重试。";
  } finally {
    aiRunning = false;
    field("saveAiSettings").disabled = false;
    field("aiProvider").disabled = false;
    button.disabled = aiSettingsState.provider === "none";
    button.textContent = "重新识别";
  }
}

field("aiEnrich").addEventListener("click", recognizePage);

field("openAiSettings").addEventListener("click", () => {
  field("aiSettings").open = true;
  field("aiSettings").scrollIntoView({ block: "nearest" });
});

field("saveAiSettings").addEventListener("click", async () => {
  if (aiRunning) return;
  const provider = field("aiProvider").value;
  const apiKey = field("aiApiKey").value.trim();
  const status = field("aiStatus");
  const storageKey = provider === "none" ? "" : providerKey(provider);
  if (provider !== "none" && !apiKey && !aiSettingsState[storageKey]) {
    status.className = "ai-status error";
    status.textContent = `${providerName(provider)} API Key 不能为空。`;
    return;
  }
  const changes = { aiProvider: provider };
  if (apiKey && storageKey) changes[storageKey] = apiKey;
  await chrome.storage.local.set(changes);
  aiSettingsState = { ...aiSettingsState, ...changes, provider };
  field("aiApiKey").value = "";
  field("aiSettings").open = false;
  renderAiSettings();
  status.className = "ai-status";
  status.textContent = provider === "none" ? "AI 补全已关闭。" : `${providerName(provider)} API Key 已保存在本机，以后无需重复填写。`;
  if (provider !== "none") await recognizePage();
});

field("aiProvider").addEventListener("change", renderAiSettings);

field("aiApiKey").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    field("saveAiSettings").click();
  }
});

for (const key of AI_FIELDS) {
  field(key).addEventListener("input", () => setFieldEvidence(key, {
    value: field(key).value.trim(),
    source: "manual",
    evidence: "",
    confidence: "high",
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const now = new Date().toISOString();
    const url = field("url").value.trim();
    const existing = await findApplicationByUrl(url);
    await saveApplication({
      ...existing,
      id: existing?.id || makeId(),
      role: field("role").value.trim(),
      company: field("company").value.trim(),
      location: field("location").value.trim(),
      department: field("department").value.trim(),
      businessDirection: field("businessDirection").value.trim(),
      status: field("status").value,
      resumeVersion: field("resumeVersion").value.trim(),
      url,
      jdText: field("jdText").value.trim(),
      notes: field("notes").value.trim() || existing?.notes || "",
      appliedAt: existing?.appliedAt || now,
      updatedAt: now,
      sourceTitle: captured?.sourceTitle || "",
      sourceHost: captured?.sourceHost || "",
      captureQuality: captured?.captureQuality || "manual",
      fieldEvidence: captured?.fieldEvidence || {},
    });
    await chrome.storage.local.set({ lastResumeVersion: field("resumeVersion").value.trim() });
    field("savedMessage").hidden = false;
    field("savedMessage").textContent = existing ? "该岗位已经记录，本次已更新原记录。" : "已保存到投递看板。";
    submit.textContent = existing ? "已更新" : "已保存";
  } catch (error) {
    showError(`保存失败：${error.message || "未知原因"}`);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#openDashboard").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.storage.local.get("lastResumeVersion").then(({ lastResumeVersion }) => {
  if (lastResumeVersion) field("resumeVersion").value = lastResumeVersion;
});
aiSettingsReady = loadAiSettings();
loadCurrentPage().then(() => {
  if (captured) return recognizePage();
});
