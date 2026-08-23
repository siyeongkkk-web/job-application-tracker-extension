export const DEFAULT_AI_PROVIDER = "deepseek";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

const FIELD_SCHEMA = {
  type: "object",
  properties: {
    value: { type: "string" },
    evidence: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    basis: { type: "string", enum: ["explicit", "inferred", "missing"] },
  },
  required: ["value", "evidence", "confidence", "basis"],
  additionalProperties: false,
};

export const AI_ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    company: FIELD_SCHEMA,
    department: FIELD_SCHEMA,
    businessDirection: FIELD_SCHEMA,
  },
  required: ["company", "department", "businessDirection"],
  additionalProperties: false,
};

const EXTRACTION_INSTRUCTIONS = [
  "你是招聘网页字段提取器，只能根据输入页面证据提取信息。",
  "company 是发布岗位的雇主公司，不是招聘平台，也不是产品名。",
  "department 仅在页面明确说明所属部门、用人部门或招聘部门时填写；没有明确证据必须返回空字符串和 missing。",
  "businessDirection 可记录事业群、事业部、业务线、产品方向或团队；如果是语义推断，basis 必须为 inferred。",
  "evidence 必须逐字引用输入中支持该值的短语。没有证据时不得猜测。",
  "不要因为 currentExtraction 已有值就默认它正确，要用页面证据独立判断。",
];

const JSON_EXAMPLE = {
  company: { value: "示例科技", evidence: "示例科技招聘", confidence: "high", basis: "explicit" },
  department: { value: "", evidence: "", confidence: "low", basis: "missing" },
  businessDirection: { value: "企业智能体", evidence: "负责企业智能体产品", confidence: "medium", basis: "inferred" },
};

function compactCandidates(candidates = []) {
  return candidates.slice(0, 40).map(({ text, tag, fontSize, fontWeight, inMain, inNavigation, classHint }) => ({
    text,
    tag,
    fontSize,
    fontWeight,
    inMain,
    inNavigation,
    classHint,
  }));
}

export function buildAiInput(snapshot, current) {
  return JSON.stringify({
    page: {
      url: snapshot.url || current.url || "",
      hostname: snapshot.hostname || current.sourceHost || "",
      title: snapshot.title || current.sourceTitle || "",
      metadata: snapshot.metadata || {},
      companyCandidates: snapshot.companyCandidates || [],
      visualTextCandidates: compactCandidates(snapshot.visualTitleCandidates),
      structuredJobPosting: snapshot.structured || {},
      pageText: String(snapshot.mainText || snapshot.bodyText || current.jdText || "").slice(0, 50000),
    },
    currentExtraction: {
      role: current.role || "",
      company: current.company || "",
      department: current.department || "",
      businessDirection: current.businessDirection || "",
      evidence: current.fieldEvidence || {},
    },
  });
}

export function buildOpenAiRequest(snapshot, current, model = DEFAULT_OPENAI_MODEL) {
  return {
    model,
    store: false,
    max_output_tokens: 1200,
    instructions: EXTRACTION_INSTRUCTIONS.join("\n"),
    input: buildAiInput(snapshot, current),
    text: {
      format: {
        type: "json_schema",
        name: "job_page_enrichment",
        strict: true,
        schema: AI_ENRICHMENT_SCHEMA,
      },
    },
  };
}

export function buildDeepSeekRequest(snapshot, current, model = DEFAULT_DEEPSEEK_MODEL) {
  return {
    model,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "system",
        content: `${EXTRACTION_INSTRUCTIONS.join("\n")}\n必须只输出 JSON。JSON 字段和类型必须与下面示例完全一致：\n${JSON.stringify(JSON_EXAMPLE)}`,
      },
      { role: "user", content: buildAiInput(snapshot, current) },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
    stream: false,
  };
}

function openAiResponseText(payload) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "refusal") throw new Error(content.refusal || "模型拒绝处理这个页面");
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function validateField(field, name) {
  if (!field || typeof field.value !== "string" || typeof field.evidence !== "string") throw new Error(`AI 返回的 ${name} 字段不完整`);
  if (!["high", "medium", "low"].includes(field.confidence)) throw new Error(`AI 返回的 ${name} 置信状态无效`);
  if (!["explicit", "inferred", "missing"].includes(field.basis)) throw new Error(`AI 返回的 ${name} 证据状态无效`);
  if (field.basis === "missing") return { ...field, value: "", evidence: "" };
  return field;
}

export function parseAiText(text) {
  if (!text) throw new Error("AI 没有返回可用结果");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI 返回格式无法读取，请重试");
  }
  return {
    company: validateField(parsed.company, "公司"),
    department: validateField(parsed.department, "部门"),
    businessDirection: validateField(parsed.businessDirection, "业务方向"),
  };
}

export function parseOpenAiResponse(payload) {
  if (payload.status === "incomplete") throw new Error("AI 返回内容不完整，请重试");
  return parseAiText(openAiResponseText(payload));
}

async function postJson(fetchImpl, url, apiKey, body) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `AI 请求失败（${response.status}）`);
  return payload;
}

async function requestOpenAi({ apiKey, snapshot, current, fetchImpl }) {
  const payload = await postJson(fetchImpl, "https://api.openai.com/v1/responses", apiKey, buildOpenAiRequest(snapshot, current));
  return parseOpenAiResponse(payload);
}

async function requestDeepSeek({ apiKey, snapshot, current, fetchImpl }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = await postJson(fetchImpl, "https://api.deepseek.com/chat/completions", apiKey, buildDeepSeekRequest(snapshot, current));
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("DeepSeek 返回内容被截断，请重试");
    const text = choice?.message?.content || "";
    if (text) return parseAiText(text);
  }
  throw new Error("DeepSeek 连续返回空内容，请稍后重试");
}

export async function requestAiEnrichment({ provider = DEFAULT_AI_PROVIDER, apiKey, snapshot, current, fetchImpl = fetch }) {
  if (provider === "none") throw new Error("AI 补全已关闭");
  if (!apiKey?.trim()) throw new Error(`请先填写 ${provider === "deepseek" ? "DeepSeek" : "OpenAI"} API Key`);
  if (provider === "deepseek") return requestDeepSeek({ apiKey, snapshot, current, fetchImpl });
  if (provider === "openai") return requestOpenAi({ apiKey, snapshot, current, fetchImpl });
  throw new Error("不支持的 AI 服务商");
}

// Kept as an alias for existing imports and older tests.
export const buildAiRequest = buildOpenAiRequest;
export const parseAiResponse = parseOpenAiResponse;
