// 数＋助数詞（KJ-022・D-040）：辞書に無くても言葉として放てる・一度使った助数詞は使えない・読みの表・はじかれたときの言い方
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { K, D, T, T4, TG1, newGame, setHand, takeAll, hintNow, ROOT } = require("./helpers.js");

const C = D.counters;
const rel = (g, p, text) => g.release(p, setHand(g, p, text));
const out = (g, p, text) => g.canRelease(p, setHand(g, p, text));

test("データ（counters.json）：助数詞は字が N5・N4 にあるものだけ。数×助数詞の読みが全部ある", () => {
  const lv = new Map(D.kanji.kanji.map((k) => [k.c, k.lv]));
  assert.deepEqual(C.counters, [..."円人本日月年時分回台週度"]);
  for (const c of C.counters) assert.ok(["N5", "N4"].includes(lv.get(c)), `${c} は N5・N4 の字`);
  assert.equal(C.numbers.length, 13);
  assert.deepEqual(C.numbers2, ["二十", "三十", "四十", "五十", "六十", "七十", "八十", "九十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九"]);
  const nums = [...C.numbers, ...C.numbers2];
  assert.equal(Object.keys(C.readings).length, nums.length * C.counters.length, "組み合わせの数");
  for (const n of nums) for (const c of C.counters) {
    const r = C.readings[n + c];
    assert.ok(Array.isArray(r) && r.length >= 1 && r.every((x) => /^[ぁ-ん]+$/.test(x)), `${n}${c} の読み（ひらがな）`);
  }
  for (const w of C.q) assert.ok(C.readings[w], `？ の ${w} は表にある`);
  assert.ok(fs.readFileSync(path.join(ROOT, "docs", "COUNTERS.md"), "utf8").includes("| 二十日 | はつか |"), "docs/COUNTERS.md に表どおり載っている");
});

test("読み：一本 いっぽん・三本 さんぼん・二十日 はつか・一日 ついたち／いちにち", () => {
  const r = (w) => K.counterReading(T, w);
  assert.deepEqual(r("一本"), ["いっぽん"]);
  assert.deepEqual(r("三本"), ["さんぼん"]);
  assert.deepEqual(r("二十日"), ["はつか"]);
  assert.deepEqual(r("一日"), ["ついたち", "いちにち"]);
  assert.deepEqual(r("二日"), ["ふつか"]);
  assert.deepEqual(r("十円"), ["じゅうえん"]);
  assert.deepEqual(r("十四日"), ["じゅうよっか"]);
  assert.deepEqual(r("三十分"), ["さんじゅっぷん", "さんじっぷん"]);
  assert.equal(r("休日"), null, "数＋助数詞でなければ null");
});

test("辞書に無い 十円 が放てる。点は字数どおり（2字3点・3字9点）。二十円 も", () => {
  assert.ok(!T.WORDS.has("十円") && !T.WORDS.has("二十円"), "前提：辞書に無い");
  for (const [text, pts] of [["十円", 3], ["二十円", 9], ["五円", 3], ["万円", 3]]) {
    assert.deepEqual(K.releasable(T, new Set(), text).ok, true, text);
    const g = newGame(1, "solo");
    const r = rel(g, g.me, text);
    assert.equal(r.ok, true, text);
    assert.equal(r.pts, pts, `${text} の点`);
    assert.equal(g.me.score, pts);
  }
  // 数でも助数詞でもない並びは今まで通り「辞書にない」
  for (const text of ["零円", "天円", "円十", "二十二円", "十円円"]) {
    assert.deepEqual(K.releasable(T, new Set(), text), { ok: false, why: "辞書にない" }, text);
  }
});

test("一度放った言葉に使った助数詞は、数＋助数詞 にもう使えない（十円 のあと 五円・百円・二十円 は放てない。本 などは放てる）", () => {
  const g = newGame(1, "solo");
  assert.equal(rel(g, g.me, "十円").ok, true);
  takeAll(g, g.me);
  const c = out(g, g.me, "五円");
  assert.deepEqual([c.ok, c.why], [false, "〇円は一度きり"]);
  for (const text of ["百円", "二十円", "万円"]) assert.equal(out(g, g.me, text).why, "〇円は一度きり", text);
  assert.equal(K.releasable(T, g.used, "五円").counter, "円", "どの助数詞かを返す（画面が押せる形にする）");
  assert.equal(out(g, g.me, "五本").ok, true, "ほかの助数詞は放てる");
  // 一度きり：放ったあとの release も、はじいて何も変えない
  setHand(g, g.me, "五円");
  const score = g.me.score, n = g.me.cards.length;
  const r = g.release(g.me, g.me.cards.map((x) => x.id));
  assert.equal(r.ok, false);
  assert.equal(r.why, "〇円は一度きり");
  assert.deepEqual([g.me.score, g.me.cards.length], [score, n]);
});

test("辞書にもともとある 百円・一人 にも、同じ縛りがかかる（使った助数詞は、辞書の語にも効く）", () => {
  assert.ok(T.WORDS.has("百円") && T.WORDS.has("一人"), "前提：辞書にある");
  const g = newGame(1, "solo");
  assert.equal(rel(g, g.me, "一人").ok, true, "辞書の 一人 が放てる");
  takeAll(g, g.me);
  assert.equal(out(g, g.me, "二人").why, "〇人は一度きり");
  assert.equal(out(g, g.me, "十人").why, "〇人は一度きり");
  assert.equal(out(g, g.me, "一円").ok, true);
  // 辞書の 百円 を先に放つと、十円 も放てなくなる
  const h = newGame(1, "solo");
  assert.equal(rel(h, h.me, "百円").ok, true);
  takeAll(h, h.me);
  assert.equal(out(h, h.me, "十円").why, "〇円は一度きり");
  // 数＋助数詞 でない語（休日・毎日）は、日 を使ったことにならない
  const k = newGame(1, "solo");
  assert.equal(rel(k, k.me, "休日").ok, true);
  takeAll(k, k.me);
  assert.equal(out(k, k.me, "五日").ok, true, "休日 は 数＋助数詞 ではない");
});

test("使った助数詞は二人とも使えない（CPU が放った 十円 のあと、人も 五円 を放てない）。CPU も同じ決まり", () => {
  const g = newGame(1, "normal");
  setHand(g, g.cpu, "十円");
  assert.equal(g.release(g.cpu, g.cpu.cards.map((x) => x.id)).ok, true);
  assert.equal(out(g, g.me, "五円").why, "〇円は一度きり");
  // CPU の語えらび：使った助数詞の語は選ばない（一円・百円 などの辞書の語）
  const h = newGame(1, "normal");
  h.used.add("十円");
  assert.equal(h.isUsed("一円"), true);
  assert.equal(h.isUsed("一本"), false);
  setHand(h, h.cpu, "一円");
  h.cpu.takes = 0;
  h.cpuTurn();
  assert.ok(!h.used.has("一円"), "CPU は 円 をもう使えない");
});

test("動けない：手札に 数＋助数詞 だけが組めるとき（十・円）は動ける。円 が使われたら動けない", () => {
  const g = newGame(1, "solo");
  setHand(g, g.me, "十円天口");
  assert.equal(g.releasableInHand(g.me), "十円", "辞書に無い 十円 でも放てる語として数える");
  g.used.add("百円");
  assert.equal(g.releasableInHand(g.me), null, "円 を使ったので放てる語は無い");
});

test("はじかれたときの言い方（rejectText）：〇円は一度きり！・2字から！・短い理由には ！ を足す・長い文はそのまま", () => {
  assert.equal(K.rejectText("〇円は一度きり"), "〇円は一度きり！");
  assert.equal(K.rejectText("〇人は一度きり"), "〇人は一度きり！");
  assert.equal(K.rejectText("1字では放てない（2字以上の言葉）"), "2字から！");
  assert.equal(K.rejectText(K.KANA_ONLY_WHY), "漢字の札が要る！");
  assert.equal(K.rejectText("並べる順が逆"), "順番が逆！");
  assert.equal(K.rejectText("放った言葉"), "もう放った言葉！");
  assert.equal(K.rejectText("辞書にない"), "辞書にない！");
  assert.equal(K.rejectText("割れない"), "割れない！");
  assert.equal(K.rejectText("場にない"), "山札にない！", "KJ-118：画面は 山札（ログの理由は 場 のまま）");
  assert.equal(K.rejectText("場から取りきるまで動けない"), "山札から取りきるまで動けない！");
  assert.equal(K.rejectText("手札もストックもいっぱい"), "手札もストックもいっぱい！");
  assert.equal(K.rejectText("もう！"), "もう！", "すでに ！ で終わっていれば足さない");
  const long = D.tutorial.ui.wrongCards.replace("{use}", "天");
  assert.equal(K.rejectText(long), long, "チュートリアルの案内（長い文）はそのまま");
  assert.equal(K.rejectText(""), "");
  // docs/REJECT_MESSAGES.md の表に、言い換えが全部載っている
  const doc = fs.readFileSync(path.join(ROOT, "docs", "REJECT_MESSAGES.md"), "utf8");
  for (const s of ["2字から！", "漢字の札が要る！", "もう放った言葉！", "順番が逆！", "〇円は一度きり！"]) assert.ok(doc.includes(s), s);
});

test("ログ：はじかれた 数＋助数詞 は「ためした」に、理由つきで残る", () => {
  const g = newGame(1, "solo");
  assert.equal(rel(g, g.me, "十円").ok, true);
  takeAll(g, g.me);
  g.tried(g.me, [..."五円"], K.releasable(T, g.used, "五円").why);
  const row = g.log[g.log.length - 1];
  assert.equal(row.op, "ためした");
  assert.equal(row.note, "〇円は一度きり");
  assert.match(g.logText(), /ためした\t五 円\t.*〇円は一度きり/);
});

test("レベル（N4・小1）でも同じ決まり", () => {
  for (const TT of [T4, TG1]) {
    assert.equal(K.releasable(TT, new Set(), "十円").ok, true);
    assert.equal(K.releasable(TT, new Set(["十円"]), "五円").why, "〇円は一度きり");
  }
});

test("ヒント：手札が 十・円 だけなら、辞書に無い 十円 を狙う", () => {
  const g = newGame(1, "solo");
  setHand(g, g.me, "十円");
  hintNow(g);
  assert.ok(g.hint, "ヒントが出る");
  assert.equal(g.hint.word, "十円");
});
