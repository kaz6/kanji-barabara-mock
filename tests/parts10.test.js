// KJ-139：まだ割れない部品のうち10個を割れるようにする（作者 2026-11-27「強を分解したら少しへんかも。ム 虫 にできそう」→「10こいれます！」）
// 虽・吅・矢・另・兑・云・可・翟・圣・未。どれも中継ぎ（relay）。N4 では10個全部、N5・小1 では 云（会）と 可（何）だけ行が出る
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const ROWS = {
  虽: ["厶", "虫"], 吅: ["口", "口"], 矢: ["𠂉", "大"], 另: ["口", "力"], 兑: ["丷", "兄"],
  云: ["二", "厶"], 可: ["丁", "口"], 翟: ["羽", "隹"], 圣: ["又", "土"], 未: ["一", "木"],
};

test("データ：10個の割り方・中継ぎ・形が入っている。ほかの割り方は変わらない（強＝弓＋虽 など）", () => {
  for (const [c, ab] of Object.entries(ROWS)) {
    assert.deepEqual(D.parts.parts[c], ab, c);
    assert.ok(D.parts.relay.includes(c), c + " は中継ぎ");
    assert.ok(D.split_shapes.shapes[c], c + " の形");
  }
  assert.deepEqual(D.parts.parts["強"], ["弓", "虽"]);
  assert.deepEqual(D.parts.parts["品"], ["口", "吅"]);
  assert.deepEqual(D.parts.parts["別"], ["另", "刂"]);
  assert.deepEqual(D.parts.parts["曜"], ["日", "翟"]);
  assert.deepEqual(D.parts.parts["軽"], ["車", "圣"]);
  assert.deepEqual(D.parts.parts["味"], ["口", "未"]);
});

test("N4：10個ぜんぶ割れる。割った2枚は部品表の通り", () => {
  for (const [c, ab] of Object.entries(ROWS)) {
    assert.deepEqual(T4.parts[c], ab, c);
    assert.ok(T4.RELAY.has(c), c);
    const g = newGame(1, "normal", "N4");
    const [t] = setHand(g, g.me, c);
    const r = g.split(g.me, [t]);
    assert.ok(r.ok, c + " が割れる：" + JSON.stringify(r));
    assert.equal(chars(r.cards), ab.join(""), c);
  }
});

test("N4：強 を割って 虽、虽 を さらに割ると 厶 と 虫（作者の手順）", () => {
  const g = newGame(1, "normal", "N4");
  const [t] = setHand(g, g.me, "強");
  assert.equal(chars(g.split(g.me, [t]).cards), "弓虽");
  g.clock.t += D.rules.cooldown_sec.split;
  const [u] = setHand(g, g.me, "虽");
  assert.equal(chars(g.split(g.me, [u]).cards), "厶虫");
});

test("N4：くっつけて戻る（左→右の順だけ）。逆順は通らない（口＋口 は同じなので両方）", () => {
  for (const [c, [a, b]] of Object.entries(ROWS)) {
    assert.ok(K.joinResults(T4, a, b).includes(c), a + "＋" + b + " → " + c);
    const g = newGame(1, "normal", "N4");
    const ids = setHand(g, g.me, a + b);
    const r = g.join(g.me, ids, c);
    assert.ok(r.ok, c);
    assert.equal(chars(r.cards), c);
    if (a !== b) assert.ok(!K.joinResults(T4, b, a).includes(c), "逆順は通らない：" + b + a);
  }
});

test("同じ2枚で別の字ができる組：10個の組は、どれも1つの字だけ（今のところ 旦 のような選びは出ない）", () => {
  for (const L of [T4, T, TG1]) {
    for (const [c, [a, b]] of Object.entries(ROWS)) {
      if (!L.parts[c]) continue;
      assert.deepEqual(K.joinResults(L, a, b), [c], a + "＋" + b);
    }
  }
  // 一＋木 は 未、逆順（木＋一）は 本。口＋力 は 另、逆順（力＋口）は 別の字にならない
  assert.deepEqual(K.joinResults(T4, "一", "木"), ["未"]);
  assert.deepEqual(K.joinResults(T4, "木", "一"), ["本"]);
});

test("面で落とす：上下の字は上・下の面でできる（可 は形が『それ以外』なので面では落とせない）", () => {
  assert.deepEqual(K.faceJoins(T4, "厶", "虫"), { top: ["虽"] });
  assert.deepEqual(K.faceJoins(T4, "虫", "厶"), { bottom: ["虽"] });
  assert.deepEqual(K.faceJoins(T4, "口", "力").top, ["另"]);
  assert.deepEqual(K.faceJoins(T4, "一", "木").top, ["未"]);
  assert.deepEqual(K.faceJoins(T4, "羽", "隹"), { top: ["翟"] });
  assert.deepEqual(K.faceJoins(T4, "又", "土"), { top: ["圣"] });
  assert.deepEqual(K.faceJoins(T4, "口", "口").left, ["吅"]);
  assert.deepEqual(K.faceJoins(T4, "丁", "口"), {});
});

test("レベル：N5・小1 では 云（会）・可（何）だけ行が出る。N4 だけの8個は出ない", () => {
  for (const L of [T, TG1]) {
    for (const c of Object.keys(ROWS)) {
      assert.equal(!!L.parts[c], c === "云" || c === "可", c);
    }
  }
});

test("輪がない：割り続けると止まる（10個の割り方の先も、割り方の表に自分へ戻る行が無い）", () => {
  const P = D.parts.parts;
  const seen = (c, path) => {
    assert.ok(!path.includes(c), "輪：" + path.concat(c).join("→"));
    for (const x of P[c] || []) seen(x, path.concat(c));
  };
  for (const c of Object.keys(ROWS)) seen(c, []);
});

test("語：10個を使う字の語（強力・品物・曜日・軽重・説明）が表にある", () => {
  for (const w of ["強力", "品物", "曜日", "軽重", "説明"]) assert.ok(T4.WORDS.has(w), w);
});
