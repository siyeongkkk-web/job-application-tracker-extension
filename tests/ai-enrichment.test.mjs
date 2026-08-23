import assert from "node:assert/strict";
import test from "node:test";
import { buildAiRequest, buildDeepSeekRequest, parseAiResponse, requestAiEnrichment } from "../lib/ai-enrichment.js";

const result = {
  company: { value: "示例科技", evidence: "示例科技招聘", confidence: "high", basis: "explicit" },
  department: { value: "", evidence: "", confidence: "low", basis: "missing" },
  businessDirection: { value: "企业智能体", evidence: "负责企业智能体产品", confidence: "medium", basis: "inferred" },
};

test("builds a structured-output request without screenshots", () => {
  const request = buildAiRequest({ url: "https://jobs.example.com/1", mainText: "负责企业智能体产品" }, { company: "待确认公司" });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.doesNotMatch(request.input, /data:image|screenshot/i);
});

test("builds a DeepSeek JSON Output request with the current default model", () => {
  const request = buildDeepSeekRequest({ mainText: "负责企业智能体产品" }, {});
  assert.equal(request.model, "deepseek-v4-flash");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.max_tokens, 2000);
  assert.match(request.messages[0].content, /只输出 JSON/);
  assert.doesNotMatch(request.messages[1].content, /data:image|screenshot/i);
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
