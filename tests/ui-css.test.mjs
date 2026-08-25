import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const popupCss = fs.readFileSync(new URL("../popup.css", import.meta.url), "utf8");

test("keeps a stable Chrome extension popup width", () => {
  const bodyRule = popupCss.match(/body\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(bodyRule, /width:\s*520px;/);
  assert.match(bodyRule, /min-width:\s*520px;/);
  assert.doesNotMatch(bodyRule, /100vw/);
});
