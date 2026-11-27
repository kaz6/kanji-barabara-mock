// KJ-131：「明朝体」を放つと、その試合の終わりまで、二人とも札の字が明朝（g.face＝"mincho"）になる。決まりは js/core.js（DOM に触らない）・語の表は data/special.json の effects（op face・target both・value mincho）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T4, TG1, newGame, setHand } = require("./helpers");
const STR = require("../js/strings.js");

function ids(p, chs) { const pool = p.cards.slice(), out = []; for (const ch of chs) { const i = pool.findIndex((x) => x.c === ch); out.push(pool[i].id); pool.splice(i, 1); } return out; }
const faceEvents = (g) => g.events.filter((e) => e.type === "face");
function human(word, { seed = 1 } = {}) {
  const g = newGame(seed, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, word + "年年年");
  setHand(g, g.cpu, "年年年年年年年年");
  return { g, r: g.release(g.me, ids(g.me, word)) };
}

test("データ：effects の 明朝体＝{op face, target both, value mincho}（N4 の語）。special・fx_words に入れない・点は普通・振動は普通", () => {
  assert.deepEqual(D.special.effects["明朝体"], { op: "face", target: "both", value: "mincho" });
  assert.deepEqual(T4.EFFECTS.get("明朝体"), { op: "face", target: "both", n: 1, value: "mincho" });
  assert.equal(TG1.EFFECTS.has("明朝体"), false, "小1 の語ではない");
  assert.ok(!D.special.special.some((x) => x.w === "明朝体") && !D.special.fx_words.some((x) => x.w === "明朝体"), "演出（特別な語）は付けない");
  assert.ok(!(D.rules.vibrate.special_words || []).includes("明朝体"), "振動は普通のまま");
  assert.equal(K.scoreOf(D, T4, "明朝体").pts, 9, "3字9点（普通の語と同じ）");
  assert.ok(!D.special.effects["大正"], "大正 は普通の語（何も起きない）");
});

test("人が 明朝体 を放つ：g.face が mincho・face の出来事が1つ・ログに1行・点は普通・場から取る枚数も普通", () => {
  const { g, r } = human("明朝体");
  assert.ok(r.ok, r.why);
  assert.equal(g.face, "mincho");
  const ev = faceEvents(g);
  assert.deepEqual(ev.map((e) => ({ who: e.who, text: e.text, face: e.face })), [{ who: "あなた", text: "明朝体", face: "mincho" }]);
  assert.equal(r.pts, 9);
  assert.equal(g.me.score, 9, "点は普通");
  assert.equal(g.me.takes, 3, "場から取れる枚数も普通（3字で3枚）");
  assert.equal(g.events.filter((e) => e.type === "fx").length, 0, "特別な語の演出は出ない");
  const row = g.log.filter((e) => e.op === "札の字");
  assert.equal(row.length, 1);
  assert.equal(row[0].who, "あなた");
  assert.match(row[0].note, /明朝体/);
  assert.equal(g.log.filter((e) => e.op === "放つ").length, 1);
});

test("2回目は何もしない：もう一度 face を適用しても出来事もログも増えない。大正 は何も起きない", () => {
  const { g } = human("明朝体");
  assert.equal(g.applyFace(g.me, "明朝体", { op: "face", target: "both", value: "mincho" }), false);
  assert.equal(faceEvents(g).length, 1);
  assert.equal(g.log.filter((e) => e.op === "札の字").length, 1);
  const t = human("大正");
  assert.ok(t.r.ok, t.r.why);
  assert.equal(t.g.face, null, "大正 は普通の語");
  assert.equal(faceEvents(t.g).length, 0);
  assert.equal(t.g.log.filter((e) => e.op === "札の字").length, 0);
});

test("CPU が 明朝体 を放っても、この画面の札の字が替わる（who は CPU）", () => {
  const g = newGame(1, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.cpu, "明朝体年年年");
  const r = g.release(g.cpu, ids(g.cpu, "明朝体"));
  assert.ok(r.ok, r.why);
  assert.equal(g.face, "mincho");
  assert.deepEqual(faceEvents(g).map((e) => e.who), ["CPU"]);
});

test("ひとり・小1 の試合には無い（小1 の語ではない）。試合が新しくなれば face は null から", () => {
  assert.equal(newGame(1, "normal", "N4").face, null);
  assert.equal(newGame(1, "solo", "N4").face, null);
});

test("戦況の欄：札の字の行が1行できる（文は STR.SENKYO.face。放った言葉の行より新しい順で上）", () => {
  const { g } = human("明朝体");
  const lines = K.senkyoLines(g.log, { me: g.me.name, tpl: STR.SENKYO, kana: () => "" });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, STR.SENKYO.face, "新しい順：札の字の行が上");
  assert.equal(lines[0].text, "明朝体！札ノ字ガ明朝ニ");
  assert.ok(lines[1].text.includes("明朝体"), "放った言葉の行");
});

// ---- 合言葉の部屋：相手が放っても、こちらの札の字が替わる ----
function pair(id = "m-mincho-1") {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const mk = (role) => {
    const g = K.createGame(D, T4, { now, date: () => new Date(2026, 10, 27, 21, 0, 0), match: { id, role, startAt: clock.t }, startStock: true });
    const c = K.createMatchClient(g, claims, { nonce: role + "x" });
    return { g, c };
  };
  return { A: mk("host"), B: mk("guest") };
}

test("合言葉の部屋：A が 明朝体 を放つと、A も B も g.face が mincho（B には face の出来事が1つ）。B は設定を触らない（g.face だけ）", async () => {
  const { A, B } = pair();
  const ia = setHand(A.g, A.g.me, "明朝体");
  const r = await A.c.release(ia);
  assert.equal(r.ok, true);
  assert.equal(A.g.face, "mincho");
  assert.equal(B.g.face, "mincho", "相手の画面も替わる");
  assert.deepEqual(faceEvents(B.g).map((e) => e.who), ["相手"]);
  assert.deepEqual(faceEvents(A.g).map((e) => e.who), ["あなた"]);
  assert.equal(B.g.cpu.score, 9, "相手の点は普通");
  // 同じ行がもう一度届いても二度は替わらない
  const row = { match_id: "m-mincho-1", kind: "word", key: "明朝体", player: "host", payload: { pts: 9, score: 9 } };
  assert.equal(B.c.onRow(row), false);
  assert.equal(faceEvents(B.g).length, 1);
});

test("合言葉の部屋：B が放っても A の札の字が替わる", async () => {
  const { A, B } = pair("m-mincho-2");
  const ib = setHand(B.g, B.g.me, "明朝体");
  await B.c.release(ib);
  assert.equal(A.g.face, "mincho");
  assert.equal(B.g.face, "mincho");
  assert.deepEqual(faceEvents(A.g).map((e) => e.who), ["相手"]);
});
