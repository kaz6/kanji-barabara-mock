// css/ の各ファイルで { と } の数がそろう（KJ-157。閉じ忘れがあると、あとから末尾に足した規則が @media の中に入ってしまう）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "css");

// コメントと文字列を除いて、括弧の深さを数える
function depthAfter(src) {
  let d = 0, min = 0;
  for (let i = 0; i < src.length; i++) {
    if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 1; continue; }
    const c = src[i];
    if (c === '"' || c === "'") { i++; while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; } continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d < min) min = d; }
  }
  return { d, min };
}

test("css/ に css がある", () => {
  assert.ok(fs.readdirSync(DIR).some((f) => f.endsWith(".css")));
});

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".css"))) {
  test(`css/${f}：{ と } の数がそろう（閉じ忘れ・余りが無い）`, () => {
    const { d, min } = depthAfter(fs.readFileSync(path.join(DIR, f), "utf8"));
    assert.equal(min, 0, `${f}：} が多い所がある`);
    assert.equal(d, 0, `${f}：閉じていない { が ${d} つある`);
  });
}
