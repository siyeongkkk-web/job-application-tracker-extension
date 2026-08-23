import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJobUrl, normalizeSnapshot } from "../lib/normalize.js";

test("prefers structured JobPosting fields and keeps its JD", () => {
  const result = normalizeSnapshot({
    url: "https://jobs.example.com/123",
    hostname: "jobs.example.com",
    title: "不应覆盖结构化岗位",
    headings: ["加入我们"],
    mainText: "页面正文",
    structured: { title: "AI 产品经理", company: "示例科技", location: "北京", description: "负责 AI 产品规划" },
  });
  assert.equal(result.role, "AI 产品经理");
  assert.equal(result.company, "示例科技");
  assert.equal(result.jdText, "负责 AI 产品规划");
  assert.equal(result.captureQuality, "structured");
});

test("falls back to headings, visible text and a known recruiting domain", () => {
  const result = normalizeSnapshot({
    url: "https://jobs.bytedance.com/campus/position/1",
    hostname: "jobs.bytedance.com",
    title: "校园招聘｜字节跳动",
    h1s: ["职位详情"],
    headings: ["职位详情", "大模型产品经理"],
    mainText: "工作地点：上海\n岗位职责\n负责产品规划",
    bodyText: "",
    structured: {},
  });
  assert.equal(result.role, "大模型产品经理");
  assert.equal(result.company, "字节跳动");
  assert.equal(result.location, "上海");
  assert.match(result.jdText, /负责产品规划/);
  assert.equal(result.captureQuality, "visible-text");
});

test("uses the JD h1 and never treats a section heading as the role", () => {
  const result = normalizeSnapshot({
    url: "https://jobs.example.com/456",
    hostname: "jobs.example.com",
    title: "AI 产品经理 - 示例科技",
    h1s: ["AI 产品经理"],
    headings: ["AI 产品经理", "岗位职责", "任职要求"],
    mainText: "岗位职责\n负责 AI 产品规划\n任职要求\n理解大模型产品",
    structured: {},
  });
  assert.equal(result.role, "AI 产品经理");
});

test("falls back to the browser title instead of a JD section heading", () => {
  const result = normalizeSnapshot({
    url: "https://jobs.example.com/789",
    hostname: "jobs.example.com",
    title: "大模型产品经理｜示例科技",
    h1s: ["校园招聘"],
    headings: ["校园招聘", "岗位职责", "任职要求"],
    mainText: "岗位职责\n负责产品规划",
    structured: {},
  });
  assert.equal(result.role, "大模型产品经理");
});

test("ignores ByteDance campus navigation and uses the actual JD page title", () => {
  const result = normalizeSnapshot({
    url: "https://jobs.bytedance.com/campus/position/7668306502553995573/detail",
    hostname: "jobs.bytedance.com",
    title: "字节跳动招聘",
    visualTitleCandidates: [
      { text: "校招", tag: "h1", fontSize: 22, fontWeight: 700, top: 100, pageHeight: 2000, inMain: false, inNavigation: true, classHint: false },
      { text: "AI产品经理（自助产品方向） - 抖音电商", tag: "div", fontSize: 30, fontWeight: 700, top: 340, pageHeight: 2000, inMain: true, inNavigation: false, classHint: false },
    ],
    h1s: ["校招"],
    headings: ["校招", "职位描述"],
    mainText: "AI产品经理（自助产品方向） - 抖音电商\n北京、上海\n职位描述",
    structured: {},
  });
  assert.equal(result.role, "AI产品经理（自助产品方向） - 抖音电商");
  assert.equal(result.company, "字节跳动");
  assert.equal(result.location, "北京、上海");
});

test("ignores Baidu campus branding and reads the coded title from JD content", () => {
  const result = normalizeSnapshot({
    url: "https://talent.baidu.com/jobs/detail/GRADUATE/79e85217-8204-4abc",
    hostname: "talent.baidu.com",
    title: "百度校园招聘",
    visualTitleCandidates: [
      { text: "百度校园招聘", tag: "h1", fontSize: 28, fontWeight: 700, top: 20, pageHeight: 2200, inMain: false, inNavigation: true, classHint: false },
      { text: "北京-百度移动生态事业群P-STAR产培生计划(J100669)", tag: "div", fontSize: 30, fontWeight: 700, top: 260, pageHeight: 2200, inMain: true, inNavigation: false, classHint: false },
    ],
    h1s: ["百度校园招聘"],
    headings: ["百度校园招聘", "工作职责", "职责要求"],
    mainText: "首页\n职位\n招聘动态\n北京-百度移动生态事业群P-STAR产培生计划(J100669)\n北京市｜校招｜产品｜30人｜2026-07-21\n工作职责：\n负责产品规划",
    structured: {},
  });
  assert.equal(result.role, "北京-百度移动生态事业群P-STAR产培生计划(J100669)");
  assert.equal(result.company, "百度");
  assert.equal(result.location, "北京");
});

test("never uses a company recruiting brand as a job title", () => {
  const result = normalizeSnapshot({
    url: "https://talent.baidu.com/jobs/detail/GRADUATE/example",
    hostname: "talent.baidu.com",
    title: "百度校园招聘",
    visualTitleCandidates: [
      { text: "百度校园招聘", tag: "h1", fontSize: 30, fontWeight: 700, top: 20, pageHeight: 1500, inMain: false, inNavigation: true, classHint: false },
    ],
    h1s: ["百度校园招聘"],
    headings: ["百度校园招聘", "工作职责"],
    mainText: "工作职责\n负责产品规划",
    structured: {},
  });
  assert.equal(result.role, "待确认岗位");
});

test("recognizes a visually prominent JD title on an unknown recruiting site", () => {
  const result = normalizeSnapshot({
    url: "https://careers.unseen-example.test/openings/pm-2027",
    hostname: "careers.unseen-example.test",
    title: "智能体产品经理 - Example Careers",
    visualTitleCandidates: [
      { text: "Example Careers", tag: "div", fontSize: 36, fontWeight: 700, top: 20, pageHeight: 1800, inMain: false, inNavigation: true, classHint: false },
      { text: "智能体产品经理", tag: "div", fontSize: 28, fontWeight: 700, top: 240, pageHeight: 1800, inMain: true, inNavigation: false, classHint: true },
    ],
    h1s: [],
    headings: ["岗位职责", "任职要求"],
    mainText: "智能体产品经理\n岗位职责\n负责智能体产品规划",
    structured: {},
  });
  assert.equal(result.role, "智能体产品经理");
  assert.equal(result.roleSource, "visual");
});

test("canonicalizes the same job URL without destroying job identifiers", () => {
  assert.equal(
    canonicalJobUrl("https://jobs.bytedance.com/campus/position/7668306502553995573/detail?utm_source=share#top"),
    "https://jobs.bytedance.com/campus/position/7668306502553995573/detail",
  );
  assert.equal(
    canonicalJobUrl("https://www.indeed.com/viewjob?jk=abc123&utm_campaign=test"),
    "https://www.indeed.com/viewjob?jk=abc123",
  );
});

test("marks metadata-only captures for manual completion", () => {
  const result = normalizeSnapshot({ title: "产品经理 - 某公司", hostname: "example.com", headings: [], structured: {} });
  assert.equal(result.role, "产品经理");
  assert.equal(result.company, "某公司");
  assert.equal(result.captureQuality, "metadata-only");
});

test("only accepts a department from an explicit labeled line", () => {
  const precise = normalizeSnapshot({
    title: "AI 产品经理 - 示例科技",
    hostname: "example.com",
    headings: ["AI 产品经理"],
    mainText: "所属部门：智能产品部\n岗位职责\n负责产品规划",
    structured: {},
  });
  assert.equal(precise.department, "智能产品部");

  const prose = normalizeSnapshot({
    title: "AI 产品经理 - 示例科技",
    hostname: "example.com",
    headings: ["AI 产品经理"],
    mainText: "岗位职责\n与算法团队协作，并推动多个部门合作完成产品上线。",
    structured: {},
  });
  assert.equal(prose.department, "");
});

test("separates an explicit department from a business direction", () => {
  const result = normalizeSnapshot({
    title: "AI 产品经理 - 示例科技",
    hostname: "careers.example.com",
    headings: ["AI 产品经理"],
    mainText: "招聘部门：智能产品部\n业务方向：企业智能体\n岗位职责\n负责产品规划",
    structured: {},
  });
  assert.equal(result.department, "智能产品部");
  assert.equal(result.businessDirection, "企业智能体");
  assert.equal(result.fieldEvidence.department.source, "explicit");
  assert.equal(result.fieldEvidence.businessDirection.source, "explicit");
});

test("uses generic site metadata as a reviewable company candidate", () => {
  const result = normalizeSnapshot({
    title: "智能体产品经理",
    hostname: "jobs.unknown-ats.test",
    metadata: { siteName: "星河科技校园招聘" },
    companyCandidates: [],
    headings: ["智能体产品经理"],
    mainText: "岗位职责\n负责智能体产品规划",
    structured: {},
  });
  assert.equal(result.company, "星河科技");
  assert.equal(result.fieldEvidence.company.source, "site-metadata");
  assert.equal(result.fieldEvidence.company.confidence, "medium");
});
