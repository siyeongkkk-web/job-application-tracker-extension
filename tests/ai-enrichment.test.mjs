import assert from "node:assert/strict";
import test from "node:test";
import { buildAiRequest, buildDeepSeekRequest, parseAiResponse, requestAiEnrichment, shouldAutoAdopt, canAdoptSuggestion } from "../lib/ai-enrichment.js";

const result = {
  role: { value: "产品实习生", evidence: "产品实习生", confidence: "high", basis: "explicit" },
  location: { value: "广州", evidence: "工作地点：广州", confidence: "high", basis: "explicit" },
  company: { value: "示例科技", evidence: "示例科技招聘", confidence: "high", basis: "explicit" },
  department: { value: "", evidence: "", confidence: "low", basis: "missing" },
  businessDirection: { value: "企业智能体", evidence: "负责企业智能体产品", confidence: "medium", basis: "inferred" },
};

test("builds a structured-output request without screenshots", () => {
  const request = buildAiRequest({ url: "https://jobs.example.com/1", mainText: "负责企业智能体产品" }, { company: "待确认公司" });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.doesNotMatch(JSON.stringify(request.input), /data:image|screenshot/i);
});

test("builds a DeepSeek JSON Output request with the current default model", () => {
  const request = buildDeepSeekRequest({ mainText: "负责企业智能体产品" }, {});
  assert.equal(request.model, "deepseek-flash");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.max_tokens, 3000);
  assert.match(request.messages[0].content, /只输出 JSON/);
  assert.doesNotMatch(JSON.stringify(request.messages[1].content), /data:image|screenshot/i);
});

test("parses evidence-backed AI enrichment fields", () => {
  const parsed = parseAiResponse({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }],
  });
  assert.equal(parsed.company.value, "示例科技");
  assert.equal(parsed.department.value, "");
  assert.equal(parsed.businessDirection.basis, "inferred");
});

test("keeps the OpenAI provider request compatible", async () => {
  let requestOptions;
  let requestUrl;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, json: async () => ({ status: "completed", output_text: JSON.stringify(result) }) };
  };
  const parsed = await requestAiEnrichment({ provider: "openai", apiKey: "test-key", snapshot: { mainText: "JD" }, current: {}, fetchImpl });
  assert.equal(requestUrl, "https://api.openai.com/v1/responses");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-key");
  assert.equal(parsed.company.value, "示例科技");
});

test("uses DeepSeek by default and retries one empty JSON response", async () => {
  let calls = 0;
  let requestUrl;
  const fetchImpl = async (url) => {
    requestUrl = url;
    calls += 1;
    return {
      ok: true,
      json: async () => ({ choices: [{ finish_reason: "stop", message: { content: calls === 1 ? "" : JSON.stringify(result) } }] }),
    };
  };
  const parsed = await requestAiEnrichment({ apiKey: "deepseek-key", snapshot: { mainText: "JD" }, current: {}, fetchImpl });
  assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
  assert.equal(calls, 2);
  assert.equal(parsed.businessDirection.value, "企业智能体");
});

test("rejects a truncated DeepSeek response instead of saving partial fields", async () => {
  await assert.rejects(
    requestAiEnrichment({
      apiKey: "deepseek-key",
      snapshot: { mainText: "JD" },
      current: {},
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: "length", message: { content: '{"company":' } }] }),
      }),
    }),
    /被截断/,
  );
});

test("reports provider API errors", async () => {
  await assert.rejects(
    requestAiEnrichment({ provider: "deepseek", apiKey: "bad", snapshot: {}, current: {}, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid key" } }) }) }),
    /invalid key/,
  );
});

for (const [provider, build] of [["DeepSeek", buildDeepSeekRequest], ["OpenAI", buildAiRequest]]) {
  test(`${provider} sends screenshots, surrounding company text and all five fields`, () => {
    const images = ["data:image/png;base64,cGFnZQ==", "data:image/jpeg;base64,ZXh0cmE="];
    const request = build({ mainText: "岗位职责", bodyText: "页头：示例科技", images }, { location: "广州" });
    const content = provider === "DeepSeek" ? request.messages[1].content : request.input[0].content;
    assert.equal(content.length, 3);
    assert.deepEqual(content.slice(1).map(part => typeof part.image_url === "string" ? part.image_url : part.image_url.url), images);
    const input = JSON.parse(content[0].text);
    assert.equal(input.page.surroundingPageText, "页头：示例科技");
    assert.equal(input.currentExtraction.location, "广州");
    if (provider === "OpenAI") assert.deepEqual(request.text.format.schema.required, ["company", "role", "location", "department", "businessDirection"]);
  });
}

test("automatically adopts conflicting and low-confidence results while preserving manual edits", () => {
  assert.equal(shouldAutoAdopt("role", result.role, "待确认岗位", { confidence: "low" }), true);
  assert.equal(shouldAutoAdopt("location", result.location, "", undefined), true);
  assert.equal(shouldAutoAdopt("role", result.role, "手动岗位", { source: "manual", confidence: "low" }), false);
  assert.equal(shouldAutoAdopt("location", result.location, "", { source: "manual" }), false);
  assert.equal(shouldAutoAdopt("location", result.location, "上海", { confidence: "high" }), true);
  assert.equal(shouldAutoAdopt("role", { ...result.role, confidence: "low" }, "旧岗位", { confidence: "high" }), true);
  assert.equal(canAdoptSuggestion("department", result.businessDirection), false);
  assert.equal(canAdoptSuggestion("location", { ...result.location, basis: "inferred" }), false);
  assert.equal(canAdoptSuggestion("businessDirection", result.businessDirection), true);
});

test("rejects missing role/location in model output and does not adopt unsupported evidence", () => {
  assert.throws(() => parseAiResponse({ output_text: JSON.stringify({ ...result, role: undefined }) }), /岗位/);
  const parsed = parseAiResponse({ output_text: JSON.stringify({ ...result, location: { ...result.location, evidence: "" } }) });
  assert.equal(parsed.location.value, "");
  assert.equal(canAdoptSuggestion("location", parsed.location), false);
});
