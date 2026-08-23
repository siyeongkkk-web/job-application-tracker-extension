export function captureCurrentPage() {
  function textOf(node) {
    return node?.innerText?.trim() || "";
  }

  function findJobPosting(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const match = findJobPosting(item);
        if (match) return match;
      }
      return null;
    }
    if (typeof value !== "object") return null;
    const type = value["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return value;
    return findJobPosting(value["@graph"]);
  }

  function parseStructuredJob() {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of scripts) {
      try {
        const job = findJobPosting(JSON.parse(script.textContent));
        if (!job) continue;
        const location = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
        const address = location?.address || {};
        return {
          title: job.title || "",
          company: job.hiringOrganization?.name || "",
          location: [address.addressLocality, address.addressRegion].filter(Boolean).join(" · "),
          department: job.department || "",
          description: job.description ? new DOMParser().parseFromString(job.description, "text/html").body.innerText : "",
        };
      } catch {
        // Ignore malformed third-party metadata and continue with visible page content.
      }
    }
    return {};
  }

  function metaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content")?.trim() || "";
  }

  function companyCandidateText(element) {
    return [element.getAttribute("alt"), element.getAttribute("aria-label"), element.getAttribute("title"), textOf(element)]
      .map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .find((value) => value.length >= 2 && value.length <= 60) || "";
  }

  const candidates = [
    document.querySelector("main"),
    document.querySelector("article"),
    document.querySelector('[role="main"]'),
    document.querySelector("#job-detail"),
    document.querySelector(".job-detail"),
    document.querySelector(".job-description"),
  ].filter(Boolean);
  const main = candidates.sort((a, b) => textOf(b).length - textOf(a).length)[0];
  // Some recruiting sites place the job title beside, rather than inside, the
  // semantic <main> element. Scan the whole visible page and use `inMain` as a
  // ranking signal so that valid titles are not discarded by DOM structure.
  const scanRoot = document.body;
  const visualTitleCandidates = [];
  const seenTitleText = new Set();
  for (const element of [...scanRoot.querySelectorAll("*")].slice(0, 5000)) {
    const text = textOf(element).replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 120 || seenTitleText.has(text)) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const className = typeof element.className === "string" ? element.className : "";
    const classHint = /(?:job|position|post|role)[-_ ]?(?:title|name)|(?:title|name)[-_ ]?(?:job|position|post|role)/i.test(className);
    const tag = element.tagName.toLowerCase();
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width < 40 || rect.height < 12) continue;
    if (fontSize < 16 && !/^h[1-3]$/.test(tag) && !classHint && element.getAttribute("role") !== "heading") continue;
    seenTitleText.add(text);
    visualTitleCandidates.push({
      text,
      tag,
      fontSize,
      fontWeight: Number.parseInt(style.fontWeight, 10) || (/bold/i.test(style.fontWeight) ? 700 : 400),
      top: rect.top + window.scrollY,
      pageHeight: Math.max(document.documentElement.scrollHeight, 1),
      inMain: Boolean(element.closest('main, article, [role="main"], #job-detail, .job-detail, .job-description')),
      inNavigation: Boolean(element.closest('header, nav, footer, [role="navigation"], [role="banner"]')),
      classHint,
    });
  }
  const h1s = [...document.querySelectorAll("h1")].map(textOf).filter(Boolean).slice(0, 8);
  const headings = [...document.querySelectorAll("h1, h2")].map(textOf).filter(Boolean).slice(0, 16);
  const companyCandidateElements = [...document.querySelectorAll(
    'header img[alt], nav img[alt], header [aria-label], [class*="logo" i], [class*="brand" i]',
  )].slice(0, 80);
  const companyCandidates = [...new Set(companyCandidateElements.map(companyCandidateText).filter(Boolean))].slice(0, 20);
  const metadata = {
    siteName: metaContent('meta[property="og:site_name"]'),
    applicationName: metaContent('meta[name="application-name"]') || metaContent('meta[name="apple-mobile-web-app-title"]'),
    ogTitle: metaContent('meta[property="og:title"]'),
  };

  return {
    url: location.href,
    hostname: location.hostname,
    title: document.title,
    metadata,
    companyCandidates,
    visualTitleCandidates,
    h1s,
    headings,
    mainText: textOf(main),
    bodyText: textOf(document.body).slice(0, 120000),
    structured: parseStructuredJob(),
    capturedAt: new Date().toISOString(),
  };
}
