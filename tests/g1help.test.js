// 小1 の手当て2つ（KJ-067・D-085）：放てる語の見逃しを光らせる・基本の字を山に多めに。N5・N4 は動かさない
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, TG1, newGame, setHand, withHint } = require("./helpers");

const G = D.rules.g1;
const countPairs = (T) => { // 小1 の山の字ごとの「くっつけて字になる組の数」（左右の組。T.JOIN の1行＝1組）
  const m = new Map();
  for (const key of T.JOIN.keys()) for (const c of new Set([...key])) if (T.CHARS.has(c)) m.set(c, (m.get(c) || 0) + 1);
  return m;
};
const cardsOf = (g) => [...g.deck, ...g.me.cards.map((x) => x.c), ...g.cpu.cards.map((x) => x.c), ...g.field.map((x) => x.c)];
const tally = (a) => { const m = new Map(); for (const c of a) m.set(c, (m.get(c) || 0) + 1); return m; };
// 小1 で2字・手札だけで放てる語を1つ
const WORD = [...TG1.WORDS.values()].find((w) => [...w.w].length === 2 && new Set(w.w).size === 2).w;

test("KJ-067 rules.json の g1：30秒・3枚・10字。10字は小1 の山の字で、くっつける組の数の上位（同数は字の順）", () => {
  assert.equal(G.idle_hint_sec, 30);
  assert.equal(G.extra_count, 3);
  assert.equal(G.extra_chars.length, 10);
  assert.equal(new Set(G.extra_chars).size, 10);
  for (const c of G.extra_chars) assert.ok(TG1.CHARS.has(c), `${c} は小1 の字`);
  const m = countPairs(TG1);
  const top = [...m].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0)).slice(0, 10).map((x) => x[0]);
  assert.deepEqual([...G.extra_chars].sort(), [...top].sort(), "10字の顔ぶれ（順は問わない）");
  assert.deepEqual(top.map((c) => m.get(c)), [11, 9, 9, 8, 4, 4, 3, 3, 3, 2], "組の数（KJ-113：旧＝｜＋日 で 日 が 8→9。KJ-139：丁＋口＝可 で 口 が 8→9、二＋厶＝云 で 二 が 2→3。顔ぶれは同じ）");
});

test("KJ-067 小1 の山：基本の10字は3枚、ほかの70字は2枚（場・手札・山を合わせて。数は seed によらない）", () => {
  for (const seed of [1, 7, 42]) {
    const g = newGame(seed, "normal", "G1");
    const m = tally(cardsOf(g));
    assert.equal(m.size, 80);
    for (const c of TG1.CHARS) assert.equal(m.get(c), G.extra_chars.includes(c) ? 3 : 2, `${c}（seed ${seed}）`);
  }
});

test("KJ-067 N5・N4 の山は今のまま（どの字も2枚。並びも変えない）", () => {
  for (const lv of ["N5", "N4"]) {
    const g = newGame(1, "normal", lv);
    const m = tally(cardsOf(g));
    for (const [c, n] of m) assert.equal(n, D.rules.same_char_in_deck, `${lv} ${c}`);
  }
  // 並び：N5 の seed 1 の最初の手札は、この変更の前と同じ（fullSet の並びが同じなので）
  const a = newGame(1, "normal", "N5"), b = newGame(1, "normal", "N5");
  assert.deepEqual(a.me.cards.map((x) => x.c), b.me.cards.map((x) => x.c));
});

test("KJ-067 見逃し：小1 で手札に放てる語があり、30秒なにも手をしないと、その語の札が光る（29秒では光らない）", () => {
  const g = newGame(1, "normal", "G1");
  setHand(g, g.me, [...WORD]);
  g.clock.t += 29; g.tick();
  assert.equal(g.hintActive(), null, "29秒では光らない");
  g.clock.t += 1; assert.equal(g.tick(), true, "30秒で光る（画面を描き直す）");
  const h = g.hintActive();
  assert.ok(h);
  assert.equal(h.tier, 1);
  assert.equal(h.word, WORD);
  assert.deepEqual(h.ids.slice().sort(), g.me.cards.map((x) => x.id).sort());
  const e = g.log[g.log.length - 1];
  assert.equal(e.op, "ヒント");
  assert.match(e.note, /^見逃し30秒。段1：放つ。狙った言葉：/);
  assert.equal(g.hintCount, 1);
  // 消え方はヒントと同じ：10秒で消える
  g.clock.t += 10; assert.equal(g.hintActive(), null);
});

test("KJ-067 見逃し：光らせたあとは数え直す（次は30秒あと）。人が手をしたら数え直す。CPU の手は数えない", () => {
  const g = newGame(1, "normal", "G1");
  setHand(g, g.me, [...WORD]);
  g.clock.t += 30; g.tick();
  assert.equal(g.hintCount, 1);
  g.clock.t += 29; g.tick(); assert.equal(g.hintCount, 1, "光らせた29秒あとはまだ");
  g.clock.t += 1; g.tick(); assert.equal(g.hintCount, 2, "30秒あとにもう一度");
  // 人の手（ためした）で数え直し
  g.clock.t += 20; g.tried(g.me, ["日"], "テスト");
  g.clock.t += 29; g.tick(); assert.equal(g.hintCount, 2, "手をしてから29秒");
  g.clock.t += 1; g.tick(); assert.equal(g.hintCount, 3, "手をしてから30秒");
  // CPU の手は数えない
  g.clock.t += 20; g.addLog(g.cpu.name, "取る", ["日"], ["日"], 0, "");
  g.clock.t += 10; g.tick(); assert.equal(g.hintCount, 4, "CPU が手をしても、人の30秒は変わらない");
});

test("KJ-067 見逃し：N5・N4 では光らない。小1 でも放てる語が手札に無ければ光らない（引き直しなどは光らせない）", () => {
  for (const lv of ["N5", "N4"]) {
    const g = newGame(1, "normal", lv);
    const w = [...(lv === "N5" ? K.makeTables(D, "N5") : K.makeTables(D, "N4")).WORDS.values()].find((x) => [...x.w].length === 2 && new Set(x.w).size === 2).w;
    setHand(g, g.me, [...w]);
    g.clock.t += 60; g.tick(); // 時限ヒント（KJ-086。90秒）より前。30秒の見逃しの光りは小1 だけ
    assert.equal(g.hintCount, 0, lv);
    assert.equal(g.hintActive(), null, lv);
  }
  const g = newGame(1, "normal", "G1");
  setHand(g, g.me, ["日", "見"]); assert.ok(!g.releasableInHand(g.me)); // 放てる語なし
  g.clock.t += 60; g.tick();
  assert.equal(g.hintCount, 0);
  assert.equal(g.hintActive(), null);
});

test("KJ-067 見逃し：チュートリアル・終わったあと・放ったあとの取る前（動けない）では光らない。はじかれ続けたヒントは今のまま", () => {
  const g = newGame(1, "normal", "G1");
  setHand(g, g.me, [...WORD]);
  g.me.takes = 2; // 放ったあと、場から取りきるまで（ほかの手はできない）
  g.clock.t += 60; g.tick();
  assert.equal(g.hintCount, 0, "取る前は光らせない");
  g.me.takes = 0;
  g.clock.t += 30; g.tick();
  assert.equal(g.hintCount, 1);
  // 続けてはじかれたヒント（KJ-037。KJ-086 で止めた形）は、fail_streak を 0 以外にすれば今のまま
  withHint({ fail_streak: 3, timed_sec: 0 }, () => {
    const h = newGame(1, "normal", "G1");
    setHand(h, h.me, [...WORD]);
    for (let i = 0; i < 3; i++) h.tried(h.me, ["山"], "テスト");
    assert.ok(h.hintActive());
    assert.doesNotMatch(h.log[h.log.length - 1].note, /見逃し/);
  });
});

test("KJ-086 小1：見逃しの光り（30秒）はそのまま。時限ヒント（90秒）と両方出そうなときは先に出たほうだけ", () => {
  const sec = D.rules.hint.timed_sec;
  // 放てる語が手札に無い小1：見逃しは出ず、時限ヒントだけが timed_sec 秒で出る
  const a = newGame(1, "normal", "G1");
  setHand(a, a.me, ["日", "見"]); assert.ok(!a.releasableInHand(a.me));
  a.clock.t += sec - 1; a.tick();
  assert.equal(a.hintCount, 0);
  a.clock.t += 1; a.tick();
  assert.equal(a.hintCount, 1, "時限ヒントは小1 でも出る");
  assert.doesNotMatch(a.log[a.log.length - 1].note, /見逃し/);
  assert.match(a.log[a.log.length - 1].note, /^放たない/);
  // 放てる語が手札にある小1：30秒で見逃しの光り。90秒まで一気に進んでも、出るのは1回だけ（先に出たほうだけ）
  const b = newGame(1, "normal", "G1");
  setHand(b, b.me, [...WORD]);
  b.clock.t += D.rules.g1.idle_hint_sec; b.tick();
  assert.equal(b.hintCount, 1, "30秒で見逃しの光り");
  assert.match(b.log[b.log.length - 1].note, /見逃し/);
  const c = newGame(1, "normal", "G1");
  setHand(c, c.me, [...WORD]);
  c.clock.t += sec; c.tick();
  assert.equal(c.hintCount, 1, "両方が出そうなときは1回だけ");
  assert.match(c.log[c.log.length - 1].note, /見逃し/, "見逃しが先");
  c.clock.t += sec - 1; c.tick();
  assert.equal(c.hintCount, 2, "見逃しの光りは30秒ごと。時限は数え直されているので、同じ時刻に重ならない");
});
