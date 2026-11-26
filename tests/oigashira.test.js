// KJ-114：耂（おいがしら）を 土＋ノ に割れるようにする（作者「これも、土　と　ノ　に分けられないかな…変かな」）。逆に 土＋ノ で 耂
// 耂 は 者・考・孝 の中継ぎ（relay）。N4 でだけ行が出る（者・考・孝 が N4 の字）。字としては見せない（部品の札のまま）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand, hintNow } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");

test("データ：耂＝土＋ノ。relay に入り、字として見せない（jouyou に無い）。形は それ以外（仮）。者・考・孝 の割り方は今のまま", () => {
  assert.deepEqual(D.parts.parts["耂"], ["土", "ノ"]);
  assert.ok(D.parts.relay.includes("耂"));
  assert.ok(!D.parts.jouyou.includes("耂"));
  assert.equal(D.split_shapes.shapes["耂"].s, "other");
  assert.equal(D.split_shapes.shapes["耂"].kind, "それ以外");
  assert.deepEqual(D.parts.parts["者"], ["耂", "日"]);
  assert.deepEqual(D.parts.parts["考"], ["耂", "丂"]);
  assert.deepEqual(D.parts.parts["孝"], ["耂", "子"]);
  assert.deepEqual(D.parts.parts["土"], ["十", "一"]);
});

test("輪がない：耂→土・ノ、土→十・一 をたどって 耂 に戻らない", () => {
  const all = D.parts.parts;
  const seen = new Set();
  const walk = (c) => { assert.ok(!seen.has(c), `輪：${c}`); seen.add(c); for (const x of all[c] || []) walk(x); seen.delete(c); };
  walk("耂");
});

test("レベル：N4 でだけ 耂 の行が出る（者・考・孝 が N4 の字）。N5・小1 には出ない", () => {
  assert.deepEqual(T4.parts["耂"], ["土", "ノ"]);
  assert.ok(T4.RELAY.has("耂"));
  for (const L of [T, TG1]) assert.ok(!L.parts["耂"], "N5・小1 に 耂 の行は無い");
  assert.deepEqual(K.joinResults(T, "土", "ノ"), []);
  assert.deepEqual(K.joinResults(TG1, "土", "ノ"), []);
});

test("割る：耂 → 土 ノ。者 → 耂 日 は今のまま。耂 は字として見せない（部品の札）", () => {
  const g = newGame(1, "normal", "N4");
  const [a] = setHand(g, g.me, "耂");
  const r = g.split(g.me, [a]);
  assert.ok(r.ok, r.why);
  assert.equal(chars(r.cards), "土ノ");
  const [t] = setHand(g, g.me, "者");
  assert.equal(chars(g.split(g.me, [t]).cards), "耂日");
  assert.equal(K.isChar(T4, "耂"), false);
});

test("くっつける：土＋ノ → 耂。逆順（ノ＋土）は通らない。耂＋日 → 者・耂＋丂 → 考・耂＋子 → 孝 は今のまま", () => {
  assert.deepEqual(K.joinResults(T4, "土", "ノ"), ["耂"]);
  assert.deepEqual(K.joinResults(T4, "ノ", "土"), []);
  assert.deepEqual(K.joinResults(T4, "耂", "日"), ["者"]);
  assert.deepEqual(K.joinResults(T4, "耂", "丂"), ["考"]);
  assert.deepEqual(K.joinResults(T4, "耂", "子"), ["孝"]);
  const g = newGame(1, "normal", "N4");
  const ids = setHand(g, g.me, "土ノ");
  const r = g.join(g.me, ids);
  assert.ok(r.ok, r.why);
  assert.equal(chars(r.cards), "耂");
  const ids2 = setHand(g, g.me, "ノ土");
  assert.equal(g.join(g.me, ids2).ok, false);
});

test("ほかの組とぶつからない：土＋ノ でできるのは 耂 だけ。面では落とせない（形は それ以外）", () => {
  const hit = [...T4.JOIN].filter(([k]) => k === "土ノ");
  assert.deepEqual(hit, [["土ノ", ["耂"]]]);
  assert.deepEqual(K.faceJoins(T4, "土", "ノ"), {});
  assert.deepEqual(K.faceJoins(T4, "ノ", "土"), {});
});

test("台の行：耂 を選ぶと 部品の意味（おいがしら＝老）。土 を選んで ノ が手にあると くっつく：土＋ノ→耂", () => {
  assert.equal(K.radicalNote(D, T4, "耂"), "耂（おいがしら）＝老");
  const note = K.joinNote(D, T4, [{ id: 1, c: "土" }, { id: 2, c: "ノ" }], { id: 1, c: "土" });
  // 土 は字の札なので出ない。ノ（部品の札）を選ぶと出る
  assert.equal(note, null);
  const note2 = K.joinNote(D, T4, [{ id: 1, c: "土" }, { id: 2, c: "ノ" }], { id: 2, c: "ノ" });
  assert.match(note2, /土＋ノ→耂/);
});

test("CPU は 土＋ノ を 耂 にくっつける（手札 土ノ子 → 耂子。孝 への道）。ヒントは 耂 を割って 土日 を狙う（耂日学）", () => {
  const g = newGame(1, "normal", "N4");
  setHand(g, g.cpu, "土ノ子");
  const r = g.cpuTurn();
  assert.ok(r && r.ok, r && r.why);
  assert.equal(chars(g.cpu.cards), "耂子");
  const g2 = newGame(1, "weak", "N4");
  setHand(g2, g2.me, "耂日学");
  hintNow(g2);
  const h = g2.hintActive();
  assert.ok(h);
  assert.equal(h.word, "土日");
});

test("語：手に持てる字は変わらない（土・ノ・日 は今までどおり）。耂 は語に入らない", () => {
  assert.ok(!T4.HOLD.has("耂"));
  assert.ok(T4.HOLD.has("土"));
  const ws = D.words.words.filter((w) => w.w.includes("耂"));
  assert.equal(ws.length, 0);
});
