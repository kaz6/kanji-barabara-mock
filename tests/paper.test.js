// KJ-093：新聞紙風の見た目（字体・表紙の号数と日付）。画面の確かめは tests/paper.browser.test.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const K = require("../js/core.js");

const ROOT = path.join(__dirname, "..");

test("漢数字：1〜9999。十・百・千の前の一は付けない。範囲の外・数でないときは 一", () => {
  const cases = { 1: "一", 9: "九", 10: "十", 11: "十一", 12: "十二", 20: "二十", 25: "二十五", 100: "百", 105: "百五", 110: "百十", 999: "九百九十九", 1000: "千", 2026: "二千二十六", 9999: "九千九百九十九" };
  for (const [n, want] of Object.entries(cases)) assert.equal(K.kansuji(+n), want, `${n}`);
  for (const bad of [0, -3, 10000, NaN, "x", null, undefined]) assert.equal(K.kansuji(bad), "一", `${bad}`);
  assert.equal(K.kansuji("12"), "十二", "文字の数も読む");
});

test("号数：第○號（○＝その端末で始めた試合の数＋1）。読めない・負・大きすぎるときは 第一號", () => {
  assert.equal(K.issueLabel(0), "第一號");
  assert.equal(K.issueLabel(1), "第二號");
  assert.equal(K.issueLabel(9), "第十號");
  assert.equal(K.issueLabel(11), "第十二號");
  assert.equal(K.issueLabel(99), "第百號");
  for (const bad of [-1, NaN, "x", null, undefined, 99999]) assert.equal(K.issueLabel(bad), "第一號", `${bad}`);
});

test("日付：年は1字ずつ（〇が入る）・月日は十の位つきの漢数字", () => {
  assert.equal(K.kansujiDate(new Date(2026, 10, 25)), "二〇二六年十一月二十五日");
  assert.equal(K.kansujiDate(new Date(2026, 0, 1)), "二〇二六年一月一日");
  assert.equal(K.kansujiDate(new Date(2030, 11, 10)), "二〇三〇年十二月十日");
  assert.equal(K.kansujiDate(new Date(2026, 8, 30)), "二〇二六年九月三十日");
  assert.match(K.kansujiDate(undefined), /^[〇一二三四五六七八九]{4}年[一二三四五六七八九十]+月[一二三四五六七八九十]+日$/, "日付が渡らなくても今日で出す");
  assert.match(K.kansujiDate(new Date("x")), /年.*月.*日$/, "読めない日付でも落ちない");
});

// ---- 字体（同梱。tools/build_paper_fonts.py）----
const css = fs.readFileSync(path.join(ROOT, "fonts", "kj-paper.css"), "utf8");
function faces() {
  const out = [];
  for (const m of css.matchAll(/@font-face\{([^}]*)\}/g)) {
    const b = m[1];
    const fam = /font-family:"([^"]+)"/.exec(b)[1];
    const weight = +/font-weight:(\d+)/.exec(b)[1];
    const src = /url\("([^"]+)"\)/.exec(b)[1];
    const set = new Set();
    for (const r of /unicode-range:([^;}]+)/.exec(b)[1].split(",")) {
      const [a, z] = r.trim().replace(/^U\+/i, "").split("-");
      for (let c = parseInt(a, 16); c <= parseInt(z || a, 16); c++) set.add(c);
    }
    out.push({ fam, weight, src, set });
  }
  return out;
}

test("字体：画面の字（Zen Old Mincho 400・700）・札の字（Shippori Mincho・Kaisei Tokumin）が同梱され、ライセンスの文がある", () => {
  const f = faces();
  assert.deepEqual(f.map((x) => `${x.fam} ${x.weight}`).sort(), ["KJ Kaisei 400", "KJ Shippori 400", "KJ Zen 400", "KJ Zen 700"]);
  for (const x of f) {
    const p = path.join(ROOT, "fonts", x.src);
    assert.ok(fs.existsSync(p), `${x.src} が無い`);
    assert.equal(fs.readFileSync(p).toString("latin1", 0, 4), "wOF2", `${x.src} は woff2`);
    assert.ok(fs.statSync(p).size < 300 * 1024, `${x.src} が大きすぎる（要る字だけに絞る）`);
  }
  const lic = fs.readFileSync(path.join(ROOT, "fonts", "OFL-Paper.txt"), "utf8");
  for (const name of ["Zen Old Mincho", "Shippori Mincho", "Kaisei"]) assert.ok(lic.includes(name), `OFL-Paper.txt に ${name} の文が無い`);
  assert.ok(/SIL OPEN FONT LICENSE Version 1\.1/i.test(lic));
});

test("字体：札に出る字は、Kaisei Tokumin か Shippori Mincho か kj-glyphs のどれかに入っている（落とし先が必ずある）", () => {
  const GL = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "glyphs.json"), "utf8"));
  const f = faces();
  const kai = f.find((x) => x.fam === "KJ Kaisei").set, ship = f.find((x) => x.fam === "KJ Shippori").set;
  const embed = new Set(GL.embed.map((c) => c.codePointAt(0)));
  const lost = [];
  for (const c of GL.all) {
    const cp = c.codePointAt(0);
    if (!kai.has(cp) && !ship.has(cp) && !embed.has(cp)) lost.push(c);
  }
  // 端末の字体で出る字（JIS X 0208）のうち、どちらの字体にも無い字は 0 のはず（無ければ、ここに並べて報告する）
  assert.deepEqual(lost, [], `どの字体にも無い字：${lost.join("")}`);
});

test("字体（KJ-101）：表紙の説明文（TEXT.lead）の字と 0〜9 は、Kaisei Tokumin の字体にある（札の字の切り替えに関わらず大正風で出す）", () => {
  const kai = faces().find((x) => x.fam === "KJ Kaisei").set;
  const S = require("../js/strings.js");
  const text = (S.TEXT || S.default.TEXT).lead(30, 5) + "0123456789";
  const miss = [...text].filter((c) => c !== " " && !kai.has(c.codePointAt(0))); // 空白は字体に入れない（落ち先の字体で同じ幅）
  assert.deepEqual(miss, [], `説明文の字が Kaisei に無い：${miss.join("")}。python3 tools/build_paper_fonts.py を回す`);
});

test("字体（KJ-104）：はじかれたときの判子の字「否」は、Kaisei Tokumin の字体にある", () => {
  const kai = faces().find((x) => x.fam === "KJ Kaisei").set;
  assert.ok(kai.has("否".codePointAt(0)), "否 が Kaisei に無い。python3 tools/build_paper_fonts.py を回す");
});

test("字体：画面の字（Zen）は、ボタンの英字・数字と、画面の日本語の文に出る字を持つ", () => {
  const zen = faces().find((x) => x.fam === "KJ Zen" && x.weight === 400).set;
  for (const c of "PlaySplitJoinFlipCycleSamereadingBackRedraw0123456789") assert.ok(zen.has(c.codePointAt(0)), c);
  for (const c of "はじめる前に選ぶ遊び方強さレベル時間振動札の字しくみもう一度設定を変えるログ放った言葉") assert.ok(zen.has(c.codePointAt(0)), c);
  // 表紙の題字・号数・日付（漢数字・〇）・卓の見出し（レビュー P-093：第・號が漏れていた）
  for (const c of "漢対普請瓦版かんたいふしんかわらばん第號〇一二三四五六七八九十百千年月日卓　場と台") assert.ok(zen.has(c.codePointAt(0)), `${c} が Zen に無い。python3 tools/build_paper_fonts.py を回す`);
  // KJ-109：英字の副題「Split & Join — a Kanji Duel」（— も）は、題字の字体（Zen 400・700）に入っている
  for (const w of [400, 700]) { const z = faces().find((x) => x.fam === "KJ Zen" && x.weight === w).set; for (const c of "Split & Join — a Kanji Duel") assert.ok(z.has(c.codePointAt(0)), `${c}（太さ ${w}）が Zen に無い`); }
  for (const w of [700]) assert.ok(faces().find((x) => x.fam === "KJ Zen" && x.weight === w).set.has("第".codePointAt(0)), "太字にも第がある");
});

test("字体：index.html は字体の CSS を読み、札の字は <html data-face> で替わる（初期は大正風＝Kaisei が先）", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(html.includes('href="fonts/kj-paper.css"'));
  assert.match(html, /--kanji:"KJ Kaisei","KJ Shippori","KJ Glyphs"/, "初期の札の字は Kaisei → Shippori → kj-glyphs");
  assert.match(html, /:root\[data-face="mincho"\]\{--kanji:"KJ Shippori","KJ Kaisei","KJ Glyphs"/, "明朝は Shippori → Kaisei → kj-glyphs");
  assert.match(html, /--ui:"KJ Zen","KJ Glyphs"/, "画面の字は Zen");
});
