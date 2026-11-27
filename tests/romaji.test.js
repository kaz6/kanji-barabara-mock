// KJ-130：English のとき、読みをローマ字で出す。かな→ヘボン式（K.romaji）・字の読み（data/kanji.json の on・kun）・台の行の一行（字・語）・終わりの画面の語の読み・
// English のチュートリアルの読みの段（data/tutorial.json の en_steps）。画面は tests/romaji.browser.test.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../js/strings.js");
const { K, D, T, T4, newGame, setHand } = require("./helpers");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8"));
test.afterEach(() => S.setLang("ja"));

test("KJ-130 K.romaji：ヘボン式（にほん→nihon・しゃ→sha・ちゃ→cha・っ・ん・長音は音のとおり重ねる）", () => {
  const eq = (kana, r) => assert.equal(K.romaji(kana), r, kana);
  eq("にほん", "nihon");
  eq("しゃ", "sha"); eq("ちゃ", "cha"); eq("じゃ", "ja"); eq("きょう", "kyou"); eq("りょこう", "ryokou"); eq("じゅう", "juu");
  eq("し", "shi"); eq("ち", "chi"); eq("つ", "tsu"); eq("ふ", "fu"); eq("じ", "ji"); eq("を", "o");
  eq("とうきょう", "toukyou"); // 長音符の字が画面の字体（Zen Old Mincho）に無いので、tōkyō ではなく音のとおり
  eq("おおさか", "oosaka"); eq("おおあめ", "ooame"); eq("ゆうめい", "yuumei");
  eq("きっぷ", "kippu"); eq("いっぽん", "ippon"); eq("ざっし", "zasshi"); eq("まっちゃ", "matcha"); eq("はっぴょう", "happyou");
  eq("しんぶん", "shinbun"); eq("ほんや", "hon'ya"); eq("けんいち", "ken'ichi"); eq("さんにん", "sannin");
  eq("ニチ", "nichi"); eq("ジツ", "jitsu"); eq("ラーメン", "raamen"); eq("ファン", "fan");
  eq("", ""); eq(undefined, ""); eq("A1", "A1"); // かなでない字はそのまま
});

test("KJ-130 data/kanji.json：字（レベルの字・レベルの外の字）すべてに on か kun がある。on はカタカナ・kun は送りがななしのひらがなで、それぞれ多くて2つ", () => {
  const k = read("kanji.json");
  assert.ok(k.kanji.length > 250 && k.outside.length > 0);
  for (const r of [...k.kanji, ...k.outside]) {
    assert.ok(Array.isArray(r.on) && Array.isArray(r.kun), r.c);
    assert.ok(r.on.length + r.kun.length > 0, `読みが無い字：${r.c}`);
    assert.ok(r.on.length <= 2 && r.kun.length <= 2, `${r.c}：2つまで`);
    for (const v of r.on) assert.match(v, /^[ァ-ヶー]+$/, `${r.c} の音：${v}`);
    for (const v of r.kun) assert.match(v, /^[ぁ-ゖー]+$/, `${r.c} の訓：${v}（送りがな・ハイフンなし）`);
    assert.equal(new Set(r.on).size, r.on.length); assert.equal(new Set(r.kun).size, r.kun.length);
  }
});

test("KJ-130 K.charReadingLine：「日 · nichi, jitsu / hi, bi · day, sun」。訓だけ・音だけの字もある。字でない札（部品）・表に無い字は null", () => {
  assert.equal(K.charReadingLine(D, "日"), "日 · nichi, jitsu / hi, bi · day, sun");
  assert.equal(K.charReadingLine(D, "本"), "本 · hon / moto · book, present");
  assert.equal(K.charReadingLine(D, "亻"), null, "部品の札");
  assert.equal(K.charReadingLine(D, "艹"), null);
  assert.equal(K.charReadingLine(D, "交"), null, "手に持てるが kanji.json に無い字（常用漢字の中継ぎ）は出さない");
  assert.equal(K.charReadingLine({}, "日"), null);
  const r = K.charReading(D, "丑"); // レベルの外の字（十二支）
  assert.deepEqual([r.on, r.kun], [["chuu"], ["ushi"]]);
  // 全部の字で、一行が作れて、字で始まり、かなが混ざらない
  for (const c of [...D.kanji.kanji, ...D.kanji.outside].map((x) => x.c)) {
    const line = K.charReadingLine(D, c);
    assert.ok(line && line.startsWith(c + " · "), c);
    assert.ok(!/[぀-ヿ]/.test(line), `かなが残っている：${line}`);
  }
});

test("KJ-130 K.wordReadingLine：「日本 · nihon · Japan」。意味は2つまで。数＋助数詞は読みだけ。語でなければ null", () => {
  const w = T.WORDS.get("日本");
  assert.equal(K.wordReadingLine(T, "日本"), "日本 · nihon · " + w.en.slice(0, 2).join(", "));
  assert.match(K.wordReadingLine(T, "日本"), /^日本 · nihon · Japan/);
  assert.equal(K.wordReadingLine(T, "休日").split(" · ")[1], K.romaji(T.WORDS.get("休日").kana));
  assert.ok(K.wordReadingLine(T, "十円").startsWith("十円 · "), "数＋助数詞");
  assert.ok(!K.wordReadingLine(T, "十円").includes("undefined"));
  assert.equal(K.wordReadingLine(T, "木火水"), null);
  assert.equal(K.wordReadingLine(T, ""), null);
});

test("KJ-130 K.endShow：放った言葉・見逃した言葉に romaji（先頭の読み）がつく。今までの kana・reading は変えない", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.clock.t += g.timeLimit; g.tick();
  const d = K.endShow(g, T, g.winner);
  const w = T.WORDS.get("休日");
  assert.equal(d.items[0].kana, w.kana);
  assert.equal(d.items[0].reading, w.kana);
  assert.equal(d.items[0].romaji, K.romaji(w.kana));
  assert.match(d.items[0].romaji, /^[a-z']+$/);
});

test("KJ-130 English のチュートリアル：読みの段が 取る のすぐあとに1つ入る（9段）。日本語は8段のまま・段の名前も今のまま", () => {
  const TD = read("tutorial.json");
  assert.equal(TD.steps.length, 8, "data の steps（日本語の段）は変えない");
  assert.equal(TD.en_steps.length, 1);
  assert.equal(TD.en_steps[0].after, "take");
  const mk = (lang) => K.createTutorial(D, T4, { now: () => 0, date: () => new Date(2026, 10, 23, 10, 0, 0), lang: lang ? () => lang : undefined });
  const ja = mk("ja"), en = mk("en"), plain = mk();
  assert.equal(ja.total, 8); assert.equal(plain.total, 8);
  assert.equal(en.total, 9);
  assert.deepEqual(ja.steps.map((s) => s.title), ["放つ", "取る", "割る", "くっつける", "反転", "巡り", "同音", "おわり"]);
  assert.deepEqual(en.steps.map((s) => s.title_en), ["Play", "Take", "Readings", "Split", "Join", "Flip", "Cycle", "Same reading", "Done"]);
  assert.ok(!ja.acts.some((a) => a.op === "next"));
  // 放つ → 取る → 読み（次へ）→ 割る
  const run = (t) => {
    const ids = ["大", "雨"].map((c) => t.g.me.cards.find((x) => x.c === c).id);
    assert.equal(t.blocked("release", { text: "大雨" }), null);
    assert.ok(t.g.release(t.g.me, ids).ok); t.advance("release");
    while (t.g.me.takes > 0) { assert.ok(t.g.take(t.g.me, t.g.field[0].id).ok); t.advance("take"); }
  };
  run(ja);
  assert.equal(ja.act().op, "split", "日本語は 取る のあとが 割る");
  assert.equal(ja.atNext(), false);
  run(en);
  assert.equal(en.act().op, "next");
  assert.equal(en.atNext(), true);
  assert.equal(en.stepNo(), 3);
  assert.equal(en.title(), "Readings");
  assert.equal(en.line(), TD.en_steps[0].step.actions[0].line_en);
  assert.equal(en.uiText("next"), "Next");
  assert.equal(ja.uiText("next"), "次へ");
  // 押せる手は「次へ」だけ：ほかの操作・札の選びははじく
  assert.ok(en.blocked("split", { chars: ["好"] }));
  assert.equal(en.say(en.blocked("split", { chars: ["好"] })), "Not now (Tutorial 3: Readings)");
  assert.ok(en.blocked("release", { text: "女子" }));
  assert.equal(en.canSelect("好"), false);
  assert.equal(en.buttonOn("bSplit"), false);
  assert.deepEqual(en.glow().chars, []);
  assert.equal(en.advance("split"), false, "次へ以外では進まない");
  assert.equal(en.act().op, "next");
  assert.equal(en.advance("next"), true);
  assert.equal(en.act().op, "split");
  assert.equal(en.stepNo(), 4);
  assert.equal(en.atNext(), false);
  assert.equal(en.info.done, 3, "読みの段も済んだ段に数える");
});

test("KJ-130 読みの段の文：大 (dai / oo) + 雨 (u / ame) → 大雨 (ooame) は、字の読みと語の読みのデータどおり", () => {
  const line = read("tutorial.json").en_steps[0].step.actions[0].line_en;
  const m = line.match(/大 \((\w+) \/ (\w+)\) \+ 雨 \((\w+) \/ (\w+)\) → 大雨 \((\w+)\)/);
  assert.ok(m, line);
  const dai = K.charReading(D, "大"), ame = K.charReading(D, "雨");
  assert.equal(m[1], dai.on[0]); assert.equal(m[2], dai.kun[0]);
  assert.equal(m[3], ame.on[0]); assert.equal(m[4], ame.kun[0]);
  assert.equal(m[5], K.romaji(T4.WORDS.get("大雨").kana));
  assert.ok(!/[぀-ヿ]/.test(line.replace(/[㐀-鿿]/g, "")), "かなが混ざらない");
});
