// KJ-116：辶（U+8FB6）を点1つの形で見せる（データの文字コードはそのまま。同梱の字形を ⻌ U+2ECC の形にした）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const GL = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "glyphs.json"), "utf8"));
const parts = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "parts.json"), "utf8"));

function range(cssFile, family) {
  const css = fs.readFileSync(path.join(ROOT, "fonts", cssFile), "utf8");
  const set = new Set();
  for (const m of css.matchAll(/@font-face\{([^}]*)\}/g)) {
    if (!m[1].includes(`font-family:"${family}"`)) continue;
    for (const r of /unicode-range:([^;}]+)/.exec(m[1])[1].split(",")) {
      const [a, z] = r.trim().replace(/^U\+/i, "").split("-");
      for (let c = parseInt(a, 16); c <= parseInt(z || a, 16); c++) set.add(c);
    }
  }
  return set;
}

test("辶：データの文字コードは U+8FB6 のまま（8か所）", () => {
  const users = Object.entries(parts.parts).filter(([, v]) => v.includes("辶")).map(([k]) => k).sort();
  assert.deepEqual(users, [..."週道通進近運送遠"].sort());
  assert.ok(!JSON.stringify(parts).includes("⻌"), "データに ⻌ U+2ECC は入れない");
});

test("辶：同梱の字体が U+8FB6 を持ち、字形は ⻌ U+2ECC から取ると glyphs.json に記録している", () => {
  assert.ok(GL.embed.includes("辶"));
  assert.equal(GL.substitute["辶"], "⻌");
  assert.ok(!GL.embed.includes("⻌"), "U+2ECC 自体は同梱しない（使わない）");
});

test("辶：札の字体（Shippori・Kaisei）と画面の字（Zen）の範囲に U+8FB6 が無く、kj-glyphs の範囲にある（kj-glyphs の形が先に効く）", () => {
  for (const fam of ["KJ Shippori", "KJ Kaisei", "KJ Zen"]) assert.ok(!range("kj-paper.css", fam).has(0x8fb6), `${fam} に U+8FB6 がある`);
  assert.ok(range("kj-glyphs.css", "KJ Glyphs").has(0x8fb6), "kj-glyphs の範囲に U+8FB6 がある");
});
