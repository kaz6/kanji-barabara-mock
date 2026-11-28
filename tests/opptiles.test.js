// 相手の放った字（KJ-150）：相手が放った語の札が「放った字」の段に並び、自分の取る番に1枚もらえる。つなぎは偽物（KJ.memoryClaims）。本物の Supabase には出さない
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, newGame, setHand, takeAll } = require("./helpers");

const R = D.rules;
const chars = (xs) => xs.map((x) => x.c).join("");
// 人が放つ（takes を満たす）
function humanRelease(g, hand) { const ids = setHand(g, g.me, hand); const r = g.release(g.me, ids); assert.equal(r.ok, true, r.why); return r; }

test("決まり：数値は rules の opp_tiles の1か所（取る番に取れる枚数 1・最後の語だけ true）", () => {
  assert.deepEqual(R.opp_tiles, { take_max: 1, last_word_only: true });
  assert.match(R.note, /KJ-150/);
});

test("人が語を放つと、使った札が自分の「放った字」の段（me.shed）に並ぶ。CPU 側にも見える。次に放つと入れ替わる", () => {
  const g = newGame(7);
  assert.deepEqual(g.me.shed, []);
  humanRelease(g, "学生");
  assert.equal(chars(g.me.shed), "学生");
  assert.equal(g.me.shedWord, "学生");
  takeAll(g, g.me);
  humanRelease(g, "先生");
  assert.equal(chars(g.me.shed), "先生", "最後に放った語のぶんだけ");
});

test("部品・かなに読んだ部品も、放った形のまま段に並ぶ（天ノ川 → 天ノ川）", () => {
  const g = newGame(3, "weak", "N4");
  const ids = setHand(g, g.me, "天ノ川");
  const r = g.release(g.me, ids);
  if (!r.ok) return; // この表に無ければ試さない（かなの語の確かめは tests/kana.test.js）
  assert.equal(chars(g.me.shed), "天ノ川");
  assert.equal(g.me.shedWord, "天の川", "言葉の書き方はかな（ログ・先着の鍵）");
});

test("取る番：CPU の段から1枚まで取れる（山札の代わり）。2枚目は取れない。取った札は段から消える・場は変わらない", () => {
  const g = newGame(11);
  g.cpu.takes = 0;
  // CPU が放った形（段は CPU の語の札）
  g.cpu.shed = [{ id: 9001, c: "学" }, { id: 9002, c: "生" }]; g.cpu.shedWord = "学生";
  humanRelease(g, "先生");
  assert.equal(g.me.takes, 2);
  const field0 = chars(g.field), hand0 = g.me.cards.length;
  assert.equal(g.canTakeOpp(g.me, 9001).ok, true);
  const r = g.takeOpp(g.me, 9001);
  assert.equal(r.ok, true); assert.equal(r.c, "学");
  assert.equal(g.me.takes, 1);
  assert.equal(g.me.cards.length, hand0 + 1, "もらった1枚が入る");
  assert.equal(chars(g.me.cards.slice(-1)), "学");
  assert.deepEqual(g.cpu.shed.map((x) => x.c), ["生"], "段から消える");
  assert.equal(chars(g.field), field0, "場の札は変わらない");
  const no = g.takeOpp(g.me, 9002);
  assert.equal(no.ok, false); assert.match(no.why, /1枚まで/);
  assert.equal(g.me.takes, 1);
  // 残りの1枚は山札から
  assert.equal(g.take(g.me, g.field[0].id).ok, true);
  assert.equal(g.me.takes, 0);
});

test("取る番でないときは取れない。段に無い札・自分の段は取れない（放った本人は自分の字を取れない）", () => {
  const g = newGame(12);
  g.cpu.shed = [{ id: 9101, c: "学" }];
  assert.equal(g.canTakeOpp(g.me, 9101).ok, false);
  assert.equal(g.canTakeOpp(g.me, 9101).why, "取れる枚数がない");
  humanRelease(g, "先生");
  assert.equal(g.canTakeOpp(g.me, 424242).why, "相手の放った字にない");
  // 自分の段（me.shed）の札は、自分では取れない
  const mine = g.me.shed[0];
  assert.equal(g.takeOpp(g.me, mine.id).ok, false);
  assert.equal(g.me.shed.length, 2);
});

test("手札もストックもいっぱいなら取れない", () => {
  const g = newGame(13);
  g.cpu.shed = [{ id: 9201, c: "学" }];
  humanRelease(g, "先生");
  // 16マスを埋める
  const fill = "一二三四五六七八九十日月火水木金";
  g.me.cards = [...fill].map((c, i) => ({ id: 800 + i, c, t: 0, fresh: false, tray: i >= R.hand_max }));
  assert.equal(g.canTakeOpp(g.me, 9201).why, "手札もストックもいっぱい");
});

test("ひとり・チュートリアルでは段を作らない・取れない", () => {
  const g = newGame(5, "solo");
  humanRelease(g, "学生");
  assert.deepEqual(g.me.shed, []);
  assert.equal(g.canTakeOpp(g.me, 1).ok, false);
});

test("CPU が語を放つと、CPU の段に並ぶ。人は次の取る番に1枚もらえる（CPU の語の札のまま）", () => {
  const g = newGame(21, "normal");
  setHand(g, g.cpu, "学生");
  const ids = g.cpu.cards.map((x) => x.id);
  assert.equal(g.release(g.cpu, ids).ok, true);
  assert.equal(chars(g.cpu.shed), "学生");
  g.me.takes = 2;
  const t = g.cpu.shed[1];
  assert.equal(g.takeOpp(g.me, t.id).c, "生");
  assert.equal(g.me.takes, 1);
});

test("CPU は、人の段の字で語が作れる見込みがあるときだけ1枚もらう。無ければ山札から取る（2枚目はもらわない）", () => {
  // 手札が 学 だけ（あと1字で 学生 になる）。段に 生 があればもらう
  const g = newGame(31, "normal");
  setHand(g, g.cpu, "学");
  g.cpu.takes = 2;
  g.me.shed = [{ id: 7001, c: "生" }, { id: 7002, c: "生" }]; g.me.shedWord = "先生";
  g.cpuTurn();
  assert.equal(g.cpu.takes, 0);
  assert.equal(g.me.shed.length, 1, "1枚だけもらった");
  assert.equal(g.cpu.oppGot, 1);
  assert.ok(g.log.some((e) => e.who === "CPU" && e.op === "取る" && /相手の放った字から/.test(e.note) && e.src === "opp"));
  // 手札が語に結びつかない字なら、段からはもらわない
  const h = newGame(32, "normal");
  setHand(h, h.cpu, "鳥");
  h.cpu.takes = 1;
  h.me.shed = [{ id: 7101, c: "龍" }]; h.me.shedWord = "龍";
  h.cpuTurn();
  assert.equal(h.me.shed.length, 1, "語の見込みが無い字はもらわない");
});

test("ログ：手は「取る」のまま、メモに「相手の放った字から」。戦況の文は「相手ノ放チヨリ○ヲ取ル」", () => {
  const g = newGame(41);
  g.cpu.shed = [{ id: 9301, c: "生" }]; g.cpu.shedWord = "先生";
  humanRelease(g, "学生");
  g.takeOpp(g.me, 9301);
  g.take(g.me, g.field[0].id);
  const e = g.log.filter((x) => x.op === "取る");
  assert.equal(e.length, 2);
  assert.match(e[0].note, /相手の放った字から/); assert.equal(e[0].src, "opp");
  assert.equal(e[1].src, undefined);
  const STR = require("../js/strings.js");
  const lines = K.senkyoLines(g.log, { me: g.me.name, tpl: STR.SENKYO, kana: () => "" });
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].oppTakes, ["生"]);
  assert.equal(lines[0].takes.length, 1);
  assert.match(lines[0].text, /相手ノ放チヨリ生ヲ取ル。/);
  assert.match(lines[0].text, /山札ヨリ.ヲ取ル。/);
});

test("もらった字で、相手と同じ語は放てない（今の決まりのまま）", () => {
  const g = newGame(51);
  g.cpu.shed = [{ id: 9401, c: "生" }]; g.cpu.shedWord = "先生";
  g.used.add("学生");
  humanRelease(g, "先生");
  g.takeOpp(g.me, 9401);
  const ids = setHand(g, g.me, "学生");
  g.me.takes = 0;
  assert.equal(g.canRelease(g.me, ids).ok, false);
});

// ---------- 合言葉の部屋 ----------
function pair(id = "m-opp-1") {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const mk = (role) => {
    const g = K.createGame(D, T, { now, date: () => new Date(2026, 10, 28, 22, 0, 0), match: { id, role, startAt: clock.t }, startStock: true });
    return { g, c: K.createMatchClient(g, claims, { nonce: role + "x" }) };
  };
  return { clock, claims, A: mk("host"), B: mk("guest") };
}

test("部屋：相手が語を放つと、こちらの相手の段（cpu.shed）に札が並ぶ。取ると相手の画面の自分の段からも消える・ログが残る", async () => {
  const { A, B, claims } = pair();
  const ia = setHand(A.g, A.g.me, "学生");
  const r = await A.c.release(ia);
  assert.equal(r.ok, true);
  assert.equal(chars(A.g.me.shed), "学生");
  assert.equal(chars(B.g.cpu.shed), "学生", "相手の端末に並ぶ");
  assert.equal(B.g.cpu.shedWord, "学生");
  // B が放って、取る番に A の段から1枚
  setHand(B.g, B.g.me, "先生");
  assert.equal((await B.c.release(B.g.me.cards.map((x) => x.id))).ok, true);
  assert.equal(chars(B.g.cpu.shed), "学生");
  const t = B.g.cpu.shed[0];
  const g1 = await B.c.takeOpp(t.id);
  assert.equal(g1.ok, true); assert.equal(g1.c, "学");
  assert.equal(B.g.me.takes, 1);
  assert.equal(chars(B.g.cpu.shed), "生");
  assert.equal(chars(A.g.me.shed), "生", "取ると相手の画面（A の自分の段）からも消える");
  assert.ok(A.g.log.some((e) => e.who === A.g.cpu.name && e.op === "取る" && e.src === "opp" && /あなたの放った字から/.test(e.note)));
  assert.ok(B.g.log.some((e) => e.who === B.g.me.name && e.op === "取る" && e.src === "opp"));
  // 2枚目は取れない
  const no = await B.c.takeOpp(B.g.cpu.shed[0].id);
  assert.equal(no.ok, false);
  // 先着の表（card の行）は使っていない：取ったのは grab の event
  const rows = claims.rows();
  assert.equal(rows.filter((x) => x.kind === "card" && x.player === "guest").length, 0);
  assert.equal(rows.filter((x) => x.kind === "event" && x.payload.type === "grab").length, 1);
});

test("部屋：同じ grab の行が二度届いても一度だけ。相手がもう次の語を放っていれば消さない。壊れた grab は捨てる", async () => {
  const { A, B } = pair("m-opp-2");
  await A.c.release(setHand(A.g, A.g.me, "学生"));
  const row = { match_id: "m-opp-2", kind: "event", key: "guest-bx-g0", player: "guest", payload: { type: "grab", w: "学生", c: "学" } };
  assert.equal(A.c.onRow(row), true);
  assert.equal(A.c.onRow(row), false, "二度目は何も起きない");
  assert.equal(chars(A.g.me.shed), "生");
  // 次の語を放ったあとに、前の語への grab が遅れて届いても段は消えない
  A.g.me.takes = 0;
  await A.c.release(setHand(A.g, A.g.me, "先生"));
  const late = { ...row, key: "guest-bx-g1", payload: { type: "grab", w: "学生", c: "生" } };
  assert.equal(A.c.onRow(late), false);
  assert.equal(chars(A.g.me.shed), "先生");
  for (const bad of [{ type: "grab" }, { type: "grab", w: "", c: "生" }, { type: "grab", w: "先生", c: "生生生" }, { type: "grab", w: 5, c: "生" }]) {
    assert.equal(A.c.onRow({ ...row, key: "guest-bx-g" + Math.random(), payload: bad }), false);
  }
  assert.equal(chars(A.g.me.shed), "先生");
});

test("部屋：放った札の字が相手に届く（used）。古い版（used が無い）・形の合わない used は、言葉の字で代える", async () => {
  const { B } = pair("m-opp-3");
  const mk = (payload) => ({ match_id: "m-opp-3", kind: "word", key: "学生", player: "host", payload });
  assert.equal(B.c.onRow(mk({ pts: 3, score: 3, used: ["学", "生"] })), true);
  assert.equal(chars(B.g.cpu.shed), "学生");
  const { B: C } = pair("m-opp-4");
  assert.equal(C.c.onRow({ ...mk({ pts: 3, score: 3 }), match_id: "m-opp-4" }), true);
  assert.equal(chars(C.g.cpu.shed), "学生", "used が無ければ言葉の字");
  const { B: E } = pair("m-opp-5");
  assert.equal(E.c.onRow({ ...mk({ pts: 3, score: 3, used: ["学"] }), match_id: "m-opp-5" }), true);
  assert.equal(chars(E.g.cpu.shed), "学生", "数が合わない used は読まない");
});
