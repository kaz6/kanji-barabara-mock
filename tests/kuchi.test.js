// KJ-096：部品の札 囗（くにがまえ）を、言葉を作るときだけ 口 として読む（data/parts.json の reads_as）。ろ とは読まない
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand, hintNow } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");

test("読み替えの表：reads_as は 囗→口 だけ。kana_parts は変えない（ろ とは読まない）", () => {
  assert.deepEqual(D.parts.reads_as, { "囗": "口" });
  assert.deepEqual(D.parts.kana_parts, { "ノ": "の", "儿": "る", "ナ": "な" });
  for (const L of [T, T4, TG1]) {
    assert.equal(L.READS.get("囗"), "口", L.level);
    assert.equal(K.kanaText(L, "人囗"), "人口", L.level);
    assert.equal(K.kanaText(L, ["囗", "口"]), "口口", L.level);
    assert.equal(K.kanaText(L, "口"), "口", `${L.level}：口 はそのまま`);
    for (const c of ["囗", "口"]) assert.ok(!(L.KANA_OK.has("ろ") && K.kanaText(L, c) === "ろ"), `${L.level}：${c} は ろ にならない`);
    assert.ok(!L.KANA_OK.has("ろ"), `${L.level}：ろ は かな の部品に無い`);
    assert.ok(!L.HOLD.has("囗"), `${L.level}：囗 は部品の札のまま（字ではない）`);
  }
});

test("囗＋人 で 人口 が放てる。点は普通と同じ（2字3点）。放った言葉は 口 の書き方", () => {
  for (const lv of ["N5", "N4", "G1"]) {
    const g = newGame(1, "weak", lv);
    setHand(g, g.me, "人囗");
    const ids = g.me.cards.map((x) => x.id);
    const pre = g.canRelease(g.me, ids);
    assert.ok(pre.ok, `${lv}：${pre.why}`);
    assert.equal(pre.text, "人口", lv);
    assert.deepEqual(K.scoreOf(D, g.T || { WORDS: new Map(), SPECIAL: new Map(), KANA: new Map(), READS: new Map([["囗", "口"]]) }, "人囗").how, "2字3", lv);
    const r = g.release(g.me, ids);
    assert.ok(r.ok);
    assert.deepEqual([r.text, r.pts], ["人口", 3], lv);
    assert.ok(g.used.has("人口"), `${lv}：使用済みは 口 の書き方`);
    assert.ok(!g.canRelease(g.me, setHand(g, g.me, "人口")).ok, `${lv}：同じ語はもう放てない`);
  }
});

test("囗 を混ぜて 口 の語が作れる（一口＝一＋囗）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "一囗");
  assert.equal(g.canRelease(g.me, g.me.cards.map((x) => x.id)).text, "一口");
  assert.ok(g.canRelease(g.me, g.me.cards.map((x) => x.id)).ok);
});

test("囗 も 口 も ろ にはならない（かなに読まない）。後ろ は作れない", () => {
  for (const t of ["囗囗", "口口", "後囗", "後口"]) assert.ok(!/[\u3040-\u30ff]/.test(K.kanaText(T, t)), `${t}：かなを含まない`);
  assert.equal(K.kanaText(T, "後囗"), "後口");
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "後囗");
  assert.equal(g.canRelease(g.me, g.me.cards.map((x) => x.id)).text, "後口", "囗 は ろ にならず 口 になる");
});

test("囗 の割る・くっつけるは今のまま（回＝囗＋口。国＝囗＋玉）。囗 を 口 としてくっつけには使わない", () => {
  assert.deepEqual(T4.parts["回"], ["囗", "口"]);
  assert.deepEqual(T.parts["国"], ["囗", "玉"]);
  const g = newGame(1, "weak", "N4");
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "囗口")).cards), "回");
  const g2 = newGame(1, "weak", "N4");
  const sp = g2.split(g2.me, [setHand(g2, g2.me, "国")[0]]);
  assert.ok(sp.ok, sp.why);
  assert.equal([...g2.me.cards.map((x) => x.c)].sort().join(""), ["囗", "玉"].sort().join(""));
  // 口 の札 2枚 では 回 にならない（口＋口 は 回 ではない）。囗 を 口 と読むのは言葉のときだけ
  assert.equal(K.joinResults(T4, "口", "口").includes("回"), false);
  assert.equal(K.joinResults(T4, "囗", "口").includes("回"), true);
  assert.equal(K.kanaOf(T4, "囗"), "口");
});

test("CPU もヒントも 囗 を 口 として使う", () => {
  const g = newGame(1, "normal", "N5");
  setHand(g, g.cpu, "人囗");
  const r = g.cpuTurn();
  assert.ok(r && r.ok, r && r.why);
  assert.equal(r.text, "人口");
  const g2 = newGame(1, "weak", "N5");
  const ids = setHand(g2, g2.me, "人囗");
  hintNow(g2);
  const h = g2.hintActive();
  assert.equal(h.tier, 1);
  assert.equal(h.word, "人口");
  assert.deepEqual([...h.ids].sort(), [...ids].sort());
});

test("台の行の説明：囗 は くにがまえ。口 とも読むと出る", () => {
  const e = D.radical_meanings.parts["囗"];
  assert.equal(e.name, "くにがまえ");
  assert.match(e.mean, /口/);
});
