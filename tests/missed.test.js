// KJ-082（D-100）：試合の終わりに、ヒントで光ったのに放たれなかった言葉を1つ、文字で見せる
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand, hintNow } = require("./helpers");

const tryN = (g, n, p = g.me) => { for (let i = 0; i < n; i++) g.tried(p, [p.cards[0].c, p.cards[1].c], "辞書にない"); };
const endIt = (g) => { g.clock.t += g.timeLimit; g.tick(); assert.equal(g.over, true); return K.endShow(g, T, g.winner); };
const endNote = (g) => g.log.find((e) => e.op === "終わり").note;

test("KJ-082 ヒントで光って放たなかった言葉が、終わりに字・読み・意味で出る。台の行と同じ読みと意味", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日山川");
  hintNow(g);
  const word = g.hinted[0];
  assert.ok(word, "ヒントの狙った言葉が控えられる");
  const w = T.WORDS.get(word);
  const d = endIt(g);
  assert.equal(d.missed.text, word);
  assert.equal(d.missed.kana, w.kana);
  assert.equal(d.missed.en, w.en.join(" / "));
  assert.equal(d.missed.line, `見逃した言葉：${word}（${w.kana}） ${w.en.join(" / ")}`);
  assert.ok(endNote(g).endsWith(`。見逃した言葉：${word}`), "ログの終わりの行のメモに足す");
});

test("KJ-082 放った言葉は出さない", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日山川");
  hintNow(g);
  const word = g.hinted[0];
  setHand(g, g.me, word);
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  const d = endIt(g);
  assert.equal(d.missed, null);
  assert.ok(!endNote(g).includes("見逃した言葉"));
});

test("KJ-082 ヒントが出ていなければ出さない（ログにも足さない）", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日山川");
  g.clock.t += D.rules.hint.timed_sec - 1; g.tick(); // 時限の1秒前では出ない
  assert.deepEqual(g.hinted, []);
  const d = endIt(g);
  assert.equal(d.missed, null);
  assert.ok(!endNote(g).includes("見逃した言葉"));
});

test("KJ-082 選び方：字数の多いもの。同じ字数なら試合の後のほう", () => {
  const g = newGame(1, "solo", "N5");
  g.hinted = ["休日", "天上天下", "山川"];
  assert.equal(g.missedWord(), "天上天下");
  g.hinted = ["休日", "山川"];
  assert.equal(g.missedWord(), "山川");
  g.hinted = ["山川", "休日", "山川"];
  assert.equal(g.missedWord(), "山川");
  g.hinted = [];
  assert.equal(g.missedWord(), null);
});

test("KJ-082 放った言葉は候補から外れて、残りから選ぶ", () => {
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.hinted = ["休日", "山川"];
  assert.equal(g.missedWord(), "山川");
});

test("KJ-082 CPU の手は数えない（CPU ははじかれても自分でヒントを出さない）", () => {
  const g = newGame(1, "normal", "N5");
  tryN(g, 5, g.cpu);
  assert.deepEqual(g.hinted, []);
  g.clock.t += g.timeLimit; g.tick();
  assert.equal(K.endShow(g, T, g.winner).missed, null);
});

test("KJ-082 小1 の見逃しの光りで出た言葉も数える", () => {
  const { TG1 } = require("./helpers");
  const g = newGame(1, "solo", "G1");
  const word = [...TG1.WORDS.values()].find((x) => [...x.w].length === 2 && new Set(x.w).size === 2).w;
  setHand(g, g.me, word);
  g.clock.t += D.rules.g1.idle_hint_sec;
  assert.equal(g.idleHint(), true);
  assert.equal(g.hinted[0], word);
  const d = (g.clock.t += g.timeLimit, g.tick(), K.endShow(g, TG1, g.winner));
  assert.equal(d.missed.text, word);
});
