// KJ-128：言語の切り替え（段2）。チュートリアルの English（ui_en・title_en・line_en・はじく理由）・部品の札の意味の English・くっつく相手の行・台の行の注の文の表。
// 画面は tests/lang2.browser.test.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../js/strings.js");
const K = require("../js/core.js");
const H = require("./helpers.js");
const loadD = () => H.D;

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8"));
const kana = /[぀-ヿ]/;
const cjk = /[㐀-鿿]/;
test.afterEach(() => S.setLang("ja"));

const TD = read("tutorial.json");
const RM = read("radical_meanings.json");

test("KJ-128 data/tutorial.json：English の文が全部ある（ui_en・title_en・line_en）。かなが混ざらない", () => {
  for (const k of Object.keys(TD.ui).filter((k) => k !== "autoNote")) assert.ok(TD.ui_en[k], `ui_en.${k}`);
  assert.equal(TD.ui_en.stepOf, TD.ui.stepOf);
  for (const [k, v] of Object.entries(TD.ui_en)) assert.ok(!kana.test(v), `ui_en.${k}: ${v}`);
  assert.equal(TD.steps.length, 8);
  for (const st of TD.steps) {
    assert.ok(st.title_en && !kana.test(st.title_en), st.id);
    for (const a of st.actions) {
      assert.ok(a.line_en && !kana.test(a.line_en), `${st.id}/${a.op}: ${a.line_en}`);
      // 使う字（札の漢字）と Play・Split などのボタンの名前は、日本語の案内と同じものが English にも出る
      for (const c of [...(a.use || []), a.from, a.to, a.pick].filter(Boolean)) assert.ok(a.line_en.includes(c) || a.op === "release", `${st.id}: ${c} が English の案内に無い`);
      for (const b of ["Play", "Split", "Flip", "Cycle", "Same reading"].filter((b) => a.line.includes(b))) assert.ok(a.line_en.includes(b), `${st.id}: ${b}`);
    }
  }
});

function makeTut(lang) {
  const D = H.D, T4 = H.T4;
  const clock = { t: 0 };
  return K.createTutorial(D, T4, { now: () => clock.t, date: () => new Date(2026, 10, 23, 10, 0, 0), lang: lang ? () => lang() : undefined });
}

test("KJ-128 createTutorial：lang が en のときだけ English（見出し・案内・ボタンの文字）。lang を渡さなければ日本語のまま", () => {
  let lang = "ja";
  const tut = makeTut(() => lang);
  assert.equal(tut.title(), "放つ");
  assert.equal(tut.line(), TD.steps[0].actions[0].line);
  assert.equal(tut.uiText("skip"), "とばす");
  lang = "en";
  assert.equal(tut.title(), "Play");
  assert.equal(tut.line(), TD.steps[0].actions[0].line_en);
  assert.equal(tut.uiText("skip"), "Skip");
  assert.equal(tut.uiText("go"), "Start playing");
  lang = "ja";
  assert.equal(tut.title(), "放つ");
  const plain = makeTut();
  assert.equal(plain.title(), "放つ");
  assert.equal(plain.uiText("go"), TD.ui.go);
});

test("KJ-128 はじく理由：blocked が返すのは日本語（ログに残る）・say が English にする。1字ちがいの札・今でない手の両方", () => {
  let lang = "en";
  const tut = makeTut(() => lang);
  const notNow = tut.blocked("split", { chars: ["好"] });
  assert.equal(notNow, "いまは使わない（チュートリアル 1：放つ）");
  assert.equal(tut.say(notNow), "Not now (Tutorial 1: Play)");
  const wrong = tut.blocked("release", { text: "大木" });
  assert.equal(wrong, "チュートリアル：いまは 大 → 雨 を使う");
  assert.equal(tut.say(wrong), "Tutorial: use 大 → 雨 now");
  lang = "ja";
  assert.equal(tut.say(wrong), wrong);
  assert.equal(tut.say(null), null);
});

test("KJ-128 くっつける段のはじく理由：English は「on the top side of」", () => {
  const tut = makeTut(() => "en");
  // 段4 まで進める（割る・放つなどは tests/tutorial.test.js が見る。ここは文だけ）
  while (tut.act().op !== "join") { const a = tut.act(); tut.advance(a.op === "take" ? "take" : a.op); if (tut.act() === a) break; }
  if (tut.act().op === "join") {
    const why = tut.blocked("join", { from: "木", to: "口", face: "top" });
    assert.match(tut.say(why), /^Tutorial: use 十 on the top side of 口 now$/);
  }
});

test("KJ-128 data/radical_meanings.json：部品の札すべてに English（name_en か same か mean_en）がある・forms にも。かなが混ざらない（字を除く）", () => {
  for (const [c, e] of Object.entries(RM.parts)) {
    assert.ok(e.same || e.mean_en, `${c}: same も mean_en も無い`);
    for (const k of ["name_en", "mean_en"]) if (e[k]) assert.ok(!kana.test(e[k]), `${c}.${k}: ${e[k]}`);
    if (e.name) assert.ok(e.name_en || e.same, `${c}: 呼び名があるのに name_en が無い`);
  }
  for (const [c, e] of Object.entries(RM.forms)) assert.ok(e.name_en, `forms ${c}`);
});

test("KJ-128 K.radicalNote・K.radicalFormNote：ja は今のまま・en は English（same の字はそのまま）", () => {
  const D = H.D;
  const T = H.T4;
  assert.equal(K.radicalNote(D, T, "艹"), "艹（くさかんむり）草のこと");
  assert.equal(K.radicalNote(D, T, "艹", "ja"), "艹（くさかんむり）草のこと");
  assert.equal(K.radicalNote(D, T, "艹", "en"), "艹 (grass): grass; plants");
  assert.equal(K.radicalNote(D, T, "儿", "en"), "儿 (legs) = 人");
  assert.equal(K.radicalNote(D, T, "亍", "en"), "亍: the right side of 行 (walking)");
  assert.equal(K.radicalNote(D, T, "ナ", "en"), "ナ = 手");
  assert.equal(K.radicalNote(D, T, "木", "en"), null, "字の札は出さない");
  assert.equal(K.radicalFormNote(D, "人"), "亻（にんべん）＝人");
  assert.equal(K.radicalFormNote(D, "人", "en"), "亻 (person radical) = 人");
  assert.equal(K.radicalFormNote(D, "木", "en"), null);
  // 部品の札すべてで、English の一行が作れ、かなが混ざらない
  for (const c of Object.keys(RM.parts)) {
    const en = K.radicalNote(D, T, c, "en");
    if (en === null) continue; // そのレベルでは字として見せる札
    assert.ok(en.startsWith(c), c);
    assert.ok(!kana.test(en.replace(/[ノメナ]/g, "")), `${c}: ${en}`); // 札の字の ノ・メ・ナ はカタカナの形の部品なので除く
  }
});

test("KJ-128 K.joinNote：English は Joins: 禾+火→秋・3組まで・ほか +N more。ja は今のまま", () => {
  const D = H.D;
  const T = H.T4;
  const sel = { id: 1, c: "禾" }, cards = [sel, { id: 2, c: "火" }, { id: 3, c: "日" }];
  const ja = K.joinNote(D, T, cards, sel);
  assert.match(ja, /^くっつく：/);
  assert.equal(K.joinNote(D, T, cards, sel, "ja"), ja);
  const en = K.joinNote(D, T, cards, sel, "en");
  assert.match(en, /^Joins: 禾\+火→秋/);
  assert.ok(!/[＋？・]/.test(en), en);
  assert.equal(K.joinNote(D, T, [sel], sel, "en"), null);
});

test("KJ-128 台の行の注の文：ja は今のまま・en は English（点・四字熟語・地名・名字・数＋助数詞・くっつけると・並べる順が逆）", () => {
  const keys = [["notePts"], ["noteYoji"], ["pn_地名"], ["pn_名字"], ["pnSep"], ["noteCounter"], ["noteRev"]];
  assert.deepEqual(keys.map(([k]) => S.t(k)), ["点", "（四字熟語）", "地名", "名字", "・", "（数＋助数詞）", "並べる順が逆"]);
  assert.equal(S.t("noteJoins", ["古", "田"]), "くっつけると 古 か 田");
  assert.equal(S.t("noteParen", "x"), "（x）");
  S.setLang("en");
  for (const [k] of keys) assert.ok(!kana.test(S.t(k)) && !cjk.test(S.t(k)), `${k}: ${S.t(k)}`);
  assert.equal(S.t("noteJoins", ["古", "田"]), "Joins to make 古 or 田");
  assert.equal(S.t("noteParen", "x"), "(x)");
  assert.equal(S.t("pn_地名"), "place");
});
