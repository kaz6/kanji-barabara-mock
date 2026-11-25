// KJ-098：旦 を 日（上）＋一（下）に割れるようにする（作者「旦=一日に割れて欲しい気持ち」）。昼 を割って出た 旦 が「割れない！」だった
// 日＋一 は 目 と 旦 の2つになる（十口＝古・田、大丶＝太・犬 と同じ。選びの一覧に乗る）。N4 でだけ（旦 は 昼 の中継ぎ）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");

test("データ：旦＝日＋一（上下。目 と同じ 0.75）。中継ぎ（relay）で、字として見せる（jouyou）。昼＝尺＋旦 は今のまま", () => {
  assert.deepEqual(D.parts.parts["旦"], ["日", "一"]);
  assert.ok(D.parts.relay.includes("旦"));
  assert.ok(D.parts.jouyou.includes("旦"));
  assert.deepEqual(D.split_shapes.shapes["旦"], { s: "tb", at: 0.75 });
  assert.deepEqual(D.parts.parts["昼"], ["尺", "旦"]);
  assert.deepEqual(D.parts.parts["目"], ["日", "一"]);
});

test("レベル：N4 でだけ 旦 を割れる（昼 が N4 の字）。N5・小1 には 旦 の行も 昼 の行も出ない", () => {
  assert.deepEqual(T4.parts["旦"], ["日", "一"]);
  assert.ok(T4.RELAY.has("旦"));
  for (const L of [T, TG1]) {
    assert.ok(!L.parts["旦"], "N5・小1 に 旦 の行は無い");
    assert.ok(!L.parts["昼"]);
  }
});

test("割る：昼 → 尺 旦、旦 → 日 一（割れない！ではない）", () => {
  const g = newGame(1, "normal", "N4");
  const [h] = setHand(g, g.me, "昼");
  assert.equal(chars(g.split(g.me, [h]).cards), "尺旦");
  const [t] = setHand(g, g.me, "旦");
  const r = g.split(g.me, [t]);
  assert.ok(r.ok);
  assert.equal(chars(r.cards), "日一");
});

test("くっつける：日＋一 は 目 と 旦 の2つ（目 が先）。選べば どちらにもなる。逆順（一＋日）は通らない", () => {
  assert.deepEqual(K.joinResults(T4, "日", "一"), ["目", "旦"]);
  assert.deepEqual(K.joinResults(T4, "一", "日"), []);
  const g = newGame(1, "normal", "N4");
  let ids = setHand(g, g.me, "日一");
  assert.equal(chars(g.join(g.me, ids, "旦").cards), "旦");
  ids = setHand(g, g.me, "日一");
  assert.equal(chars(g.join(g.me, ids, "目").cards), "目");
  ids = setHand(g, g.me, "日一");
  assert.equal(chars(g.join(g.me, ids).cards), "目", "選ばなければ 目（今まで通り）");
  ids = setHand(g, g.me, "日一");
  assert.equal(g.join(g.me, ids, "木").ok, false);
});

test("N5 では 日＋一 は 目 だけ", () => {
  assert.deepEqual(K.joinResults(T, "日", "一"), ["目"]);
  assert.deepEqual(K.joinResults(TG1, "日", "一"), ["目"]);
});

test("面で落とす：日 を 一 の上に落とすと 目・旦 のどちらか（選びの一覧）。一 を 日 の下でも同じ", () => {
  assert.deepEqual(K.faceJoins(T4, "日", "一"), { top: ["目", "旦"] });
  assert.deepEqual(K.faceJoins(T4, "一", "日"), { bottom: ["目", "旦"] });
  const g = newGame(1, "normal", "N4");
  const [a, b] = setHand(g, g.me, "日一");
  const r = g.joinFace(g.me, a, b, "top", "旦");
  assert.ok(r.ok);
  assert.equal(chars(g.me.cards), "旦");
});

test("語：旦 の語（一旦・元旦）は語の表にある", () => {
  const ws = new Set(D.words.words.map((w) => w.w));
  assert.ok(ws.has("一旦") && ws.has("元旦"));
});
