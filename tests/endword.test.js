// KJ-087：終わりの画面の言葉をタップすると開く欄の中身（読み・英語の意味2つまで・コトバンクで引く URL）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, T, newGame, setHand, hintNow } = require("./helpers");

const endIt = (g) => { g.clock.t += g.timeLimit; g.tick(); assert.equal(g.over, true); return K.endShow(g, T, g.winner); };

test("KJ-087 放った言葉に、読み・英語の意味（2つまで）・コトバンクの URL がつく", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  const it = endIt(g).items[0];
  const w = T.WORDS.get("休日");
  assert.equal(it.reading, w.kana);
  assert.deepEqual(it.ens, w.en.slice(0, 2));
  assert.ok(it.ens.length <= 2);
  assert.equal(it.url, "https://kotobank.jp/search?q=" + encodeURIComponent("休日"));
  assert.equal(it.kana, w.kana, "今までの kana は変えない");
});

test("KJ-087 見逃した言葉にも同じものがつく", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日山川");
  hintNow(g);
  const word = g.hinted[0], w = T.WORDS.get(word);
  const m = endIt(g).missed;
  assert.equal(m.reading, w.kana);
  assert.deepEqual(m.ens, w.en.slice(0, 2));
  assert.equal(m.url, K.kotobankUrl(word));
});

test("KJ-087 URL は encodeURIComponent。en が無い語は ens が空（読みとリンクだけ）", () => {
  assert.equal(K.kotobankUrl("天上天下"), "https://kotobank.jp/search?q=%E5%A4%A9%E4%B8%8A%E5%A4%A9%E4%B8%8B");
  const g = newGame(1, "solo", "N5");
  const T2 = { WORDS: new Map([["休日", { kana: "きゅうじつ" }]]) }; // en の無い語
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.clock.t += g.timeLimit; g.tick();
  const it = K.endShow(g, T2, g.winner).items[0];
  assert.deepEqual(it.ens, []);
  assert.equal(it.reading, "きゅうじつ");
  assert.ok(it.url.startsWith("https://kotobank.jp/search?q="));
});

test("KJ-087 辞書に無い語（T に語が無い）でも落ちない：読みは空・ens は空・リンクは出る", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.clock.t += g.timeLimit; g.tick();
  const it = K.endShow(g, { WORDS: new Map() }, g.winner).items[0];
  assert.equal(it.reading, "");
  assert.deepEqual(it.ens, []);
  assert.ok(it.url);
});
