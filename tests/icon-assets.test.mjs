import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function pngDimensions(path) {
  const bytes = fs.readFileSync(new URL(path, import.meta.url));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("ships crisp pixel icons at every manifest size", () => {
  for (const size of [16, 32, 48, 128]) {
    assert.deepEqual(pngDimensions(`../icons/icon-${size}.png`), { width: size, height: size });
  }

  const svg = fs.readFileSync(new URL("../icons/application-tracker.svg", import.meta.url), "utf8");
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /<circle|rx=/);
});
