const LOCATION_RE = /(?:工作地点|工作城市|地点|城市|Location)\s*[：:]?\s*([^\n|｜]{2,24})/i;
function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanMultiline(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const GENERIC_HEADING = /^(?:招聘|招聘官网|校招|社招|职位|职位详情|职位信息|加入我们|校园招聘|社会招聘|招聘动态|技术人才项目|岗位职责|职位描述|任职要求|岗位要求|职位要求|工作职责|工作内容|关于我们)$/i;

function firstJobTitle(headings = [], companyHint = "") {
  return headings
    .map(clean)
    .find((heading) => {
      if (heading.length < 2 || heading.length > 100 || GENERIC_HEADING.test(heading)) return false;
      if (!companyHint) return true;
      if (heading.toLowerCase() === companyHint.toLowerCase()) return false;
      return !(heading.includes(companyHint) && /招聘|人才|校招|社招|career/i.test(heading));
    });
}

function visualJobTitle(candidates = [], pageTitle = "", companyHint = "") {
  const normalizedPageTitle = clean(pageTitle).toLowerCase();
  const scored = candidates
    .map((candidate) => {
      const text = clean(candidate.text);
      if (!firstJobTitle([text], companyHint)) return null;
      let score = 0;
      if (candidate.inMain) score += 24;
      if (candidate.inNavigation) score -= 45;
      else score += 10;
      if (candidate.classHint) score += 20;
      if (candidate.fontSize >= 28) score += 28;
      else if (candidate.fontSize >= 22) score += 20;
      else if (candidate.fontSize >= 18) score += 12;
      if (candidate.fontWeight >= 600) score += 10;
      if (candidate.tag === "h1") score += 9;
      else if (candidate.tag === "h2" || candidate.tag === "h3") score += 4;
      if (normalizedPageTitle.includes(text.toLowerCase())) score += 20;
      if (/\([A-Z]{0,4}\d{4,}\)\s*$/i.test(text)) score += 20;
      if (candidate.top / Math.max(candidate.pageHeight || 1, 1) <= 0.55) score += 5;
      if (/^你好[，, ]|登录|注册|个人中心/.test(text)) score -= 35;
      return { text, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 38 ? scored[0].text : "";
}

function codedJobTitle(text = "") {
  return String(text)
    .split("\n")
    .map(clean)
    .find((line) => line.length >= 6 && line.length <= 120 && /\([A-Z]{0,4}\d{4,}\)\s*$/i.test(line)) || "";
}

function locationFromRole(role = "") {
  const city = "北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|天津|重庆|长沙|厦门|合肥|郑州|青岛|珠海|东莞|佛山|无锡|宁波|福州|济南|大连";
  return clean(role).match(new RegExp(`^(${city})(?:市)?\\s*[-–—]`))?.[1] || "";
}

function titleParts(title = "") {
  return title
    .split(/\s[-–—_|｜]\s|[-–—_|｜]/)
    .map(clean)
    .filter(Boolean);
}

function knownJobPageLocation(snapshot, text) {
  if (!/jobs\.bytedance\.com$/i.test(snapshot.hostname || "") || !/\/position\/[^/]+\/detail(?:[/?#]|$)/.test(snapshot.url || "")) return "";
  const city = "北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|天津|重庆|长沙|厦门|合肥|郑州|青岛|珠海|东莞|佛山|无锡|宁波|福州|济南|大连|海外";
  const cityLine = new RegExp(`^(?:${city})(?:\\s*[、,，/]\\s*(?:${city}))*$`);
  return String(text).split("\n").map(clean).find((line) => cityLine.test(line)) || "";
}

export function canonicalJobUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    const trackingNames = ["from", "ref", "referrer", "source", "share_token", "trackingid"];
    for (const name of [...url.searchParams.keys()]) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith("utm_") || trackingNames.includes(lowerName)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return clean(value).replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function explicitDepartment(text = "") {
  const label = /^(?:所属部门|招聘部门|用人部门|Department)\s*[：:]\s*(.{2,40})$/i;
  for (const rawLine of String(text).split("\n")) {
    const match = rawLine.trim().match(label);
    if (!match) continue;
    const value = clean(match[1]);
    if (!/岗位职责|职位描述|任职要求|团队协作|部门合作/.test(value)) return value;
  }
  return "";
}

function explicitBusinessDirection(text = "") {
  const label = /^(?:业务方向|所属业务|产品方向|所属团队|招聘团队|团队|事业群|事业部|Business Unit|Team)\s*[：:]\s*(.{2,50})$/i;
  for (const rawLine of String(text).split("\n")) {
    const match = rawLine.trim().match(label);
    if (match) return clean(match[1]);
  }
  return "";
}

function explicitCompany(text = "") {
  const label = /^(?:公司|招聘公司|公司名称|雇主|Company|Employer)\s*[：:]\s*(.{2,50})$/i;
  for (const rawLine of String(text).split("\n")) {
    const match = rawLine.trim().match(label);
    if (match) return clean(match[1]);
  }
  return "";
}

function cleanCompanyName(value = "") {
  return clean(value)
    .replace(/^(?:欢迎来到|加入)\s*/i, "")
    .replace(/\s*(?:官方)?(?:校园招聘|社会招聘|招聘官网|人才招聘|招聘|Careers?|Jobs?)\s*$/i, "")
    .replace(/^[\s|｜·•_-]+|[\s|｜·•_-]+$/g, "")
    .trim();
}

function validCompanyCandidate(value = "") {
  const candidate = cleanCompanyName(value);
  if (candidate.length < 2 || candidate.length > 40) return "";
  if (/^(?:校园|社会|全球|官方|首页|职位|招聘|人才|公司|Careers?|Jobs?)$/i.test(candidate)) return "";
  return candidate;
}

function companyWithEvidence(snapshot, structured, text, parts) {
  const structuredCompany = validCompanyCandidate(structured.company);
  if (structuredCompany) return { value: structuredCompany, source: "structured", evidence: clean(structured.company), confidence: "high" };

  const labeledCompany = validCompanyCandidate(explicitCompany(text));
  if (labeledCompany) return { value: labeledCompany, source: "explicit", evidence: explicitCompany(text), confidence: "high" };

  const domainCompany = companyFromDomain(snapshot.hostname);
  if (domainCompany) return { value: domainCompany, source: "official-domain", evidence: snapshot.hostname || "", confidence: "high" };

  const metadataValues = [snapshot.metadata?.siteName, snapshot.metadata?.applicationName];
  for (const value of metadataValues) {
    const candidate = validCompanyCandidate(value);
    if (candidate) return { value: candidate, source: "site-metadata", evidence: clean(value), confidence: "medium" };
  }

  for (const value of snapshot.companyCandidates || []) {
    const candidate = validCompanyCandidate(value);
    if (candidate && !/logo|图标/i.test(candidate)) return { value: candidate, source: "page-brand", evidence: clean(value), confidence: "medium" };
  }

  for (const value of parts.slice(1)) {
    const candidate = validCompanyCandidate(value);
    if (candidate) return { value: candidate, source: "page-title", evidence: clean(value), confidence: "low" };
  }
  return { value: "待确认公司", source: "missing", evidence: "", confidence: "low" };
}

function companyFromDomain(hostname = "") {
  const known = [
    [/bytedance|zijie|toutiao|feishu/, "字节跳动"],
    [/tencent|qq\.com/, "腾讯"],
    [/alibaba|alibabacloud|aliyun/, "阿里巴巴"],
    [/baidu/, "百度"],
    [/xiaomi/, "小米"],
    [/kuaishou/, "快手"],
    [/xiaohongshu|red\.com/, "小红书"],
    [/deepseek/, "DeepSeek"],
  ];
  return known.find(([pattern]) => pattern.test(hostname))?.[1] || "";
}

export function normalizeSnapshot(snapshot) {
  const structured = snapshot.structured || {};
  const text = cleanMultiline(snapshot.mainText || snapshot.bodyText || "");
  const parts = titleParts(snapshot.title);
  const companyEvidence = companyWithEvidence(snapshot, structured, text, parts);
  const companyHint = companyEvidence.value === "待确认公司" ? "" : companyEvidence.value;
  const visualRole = visualJobTitle(snapshot.visualTitleCandidates, snapshot.title, companyHint);
  const role =
    clean(structured.title) ||
    visualRole ||
    codedJobTitle(text) ||
    firstJobTitle(snapshot.h1s, companyHint) ||
    firstJobTitle(parts, companyHint) ||
    firstJobTitle(snapshot.headings, companyHint) ||
    "待确认岗位";
  const locationMatch = text.match(LOCATION_RE);
  const department = clean(structured.department) || explicitDepartment(text);
  const businessDirection = explicitBusinessDirection(text);
  const roleSource = clean(structured.title) ? "structured" : visualRole ? "visual" : "fallback";

  return {
    role,
    company: companyEvidence.value,
    location: clean(structured.location) || knownJobPageLocation(snapshot, text) || locationFromRole(role) || clean(locationMatch?.[1]),
    department,
    businessDirection,
    jdText: cleanMultiline(structured.description) || text,
    url: snapshot.url || "",
    sourceTitle: clean(snapshot.title),
    sourceHost: snapshot.hostname || "",
    roleSource,
    fieldEvidence: {
      role: { value: role, source: roleSource, evidence: role, confidence: role === "待确认岗位" ? "low" : roleSource === "fallback" ? "medium" : "high" },
      company: companyEvidence,
      department: department
        ? { value: department, source: clean(structured.department) ? "structured" : "explicit", evidence: department, confidence: "high" }
        : { value: "", source: "missing", evidence: "", confidence: "low" },
      businessDirection: businessDirection
        ? { value: businessDirection, source: "explicit", evidence: businessDirection, confidence: "high" }
        : { value: "", source: "missing", evidence: "", confidence: "low" },
    },
    captureQuality: structured.title && structured.description ? "structured" : text ? "visible-text" : "metadata-only",
  };
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const STATUSES = ["已投递", "笔试", "一面", "二面", "HR面", "Offer", "感谢信", "主动终止"];
