// 合言葉の部屋のエモート（KJ-142）：決まった4つの言葉の番号を 'event' で送る。つなぎは偽物（KJ.memoryClaims）。本物の Supabase には出さない
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { K, D, T } = require("./helpers");
const STR = require("../js/strings.js");

const R = D.rules;
const WORDS = ["上手！", "矢場！", "雑魚！", "降参！"];

function pair(id = "m-emote-1") {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const seen = { A: [], B: [] };
  const mk = (role, key) => {
    const g = K.createGame(D, T, { now, date: () => new Date(2026, 10, 28, 21, 0, 0), match: { id, role, startAt: clock.t }, startStock: true });
    const c = K.createMatchClient(g, claims, { nonce: role + "x", emoteWords: WORDS, onEmote: (who, i, w) => seen[key].push([who, i, w]) });
    return { g, c };
  };
  return { clock, claims, seen, A: mk("host", "A"), B: mk("guest", "B") };
}

test("決まり：エモートの数値は rules の1か所（言葉の数・待ち時間・出す秒数）。言葉は js/strings.js の EMOTES に4つ（作者の言葉のまま）", () => {
  assert.deepEqual(R.emote, { words: 4, cooldown_sec: 3, show_sec: 1.5 });
  assert.deepEqual([...STR.EMOTES], WORDS);
  assert.equal(STR.EMOTES.length, R.emote.words);
});

test("送ると、自分にも相手にも届く。ログに1行ずつ（手 エモート・メモに言葉）。点も札も変わらない", async () => {
  const { A, B, seen } = pair();
  const before = [A.g.me.score, B.g.me.score, A.g.me.cards.length, B.g.me.cards.length, A.g.field.map((x) => x.c).join("")];
  const r = await A.c.sendEmote(1);
  assert.equal(r.ok, true);
  assert.deepEqual(seen.A, [["me", 1, "矢場！"]]);
  assert.deepEqual(seen.B, [["opp", 1, "矢場！"]]);
  const la = A.g.log.filter((e) => e.op === "エモート"), lb = B.g.log.filter((e) => e.op === "エモート");
  assert.equal(la.length, 1); assert.equal(lb.length, 1);
  assert.equal(la[0].who, A.g.me.name); assert.equal(la[0].note, "矢場！");
  assert.equal(lb[0].who, B.g.cpu.name); assert.equal(lb[0].note, "矢場！", "届いたほうも相手の行として残る");
  assert.deepEqual([A.g.me.score, B.g.me.score, A.g.me.cards.length, B.g.me.cards.length, A.g.field.map((x) => x.c).join("")], before);
  assert.equal(A.g.cpu.score, 0); assert.equal(B.g.cpu.score, 0);
});

test("続けて送れない：送ったあと cooldown_sec は 待ち時間。満ちたら送れる。送れなかったときは何も出ない・ログに残らない", async () => {
  const { A, B, clock, seen } = pair();
  assert.equal((await A.c.sendEmote(0)).ok, true);
  assert.equal(A.c.emoteWait(), R.emote.cooldown_sec);
  clock.t += R.emote.cooldown_sec - 0.5;
  const no = await A.c.sendEmote(2);
  assert.equal(no.ok, false); assert.equal(no.why, "待ち時間"); assert.ok(no.wait > 0 && no.wait <= 0.5 + 1e-9);
  assert.equal(seen.A.length, 1); assert.equal(seen.B.length, 1);
  assert.equal(A.g.log.filter((e) => e.op === "エモート").length, 1);
  clock.t += 0.5;
  assert.equal(A.c.emoteWait(), 0);
  assert.equal((await A.c.sendEmote(2)).ok, true);
  assert.deepEqual(seen.B.map((x) => x[2]), ["上手！", "雑魚！"]);
  // 待ち時間は人ごと：A が送ったあとでも B はすぐ送れる
  assert.equal((await B.c.sendEmote(3)).ok, true);
  assert.deepEqual(seen.A.map((x) => x[0]), ["me", "me", "opp"]);
});

test("言葉の番号が範囲の外・試合が終わっている・止めたあとは送らない", async () => {
  const { A, B, claims } = pair();
  for (const bad of [-1, 4, 1.5, "1", null, undefined]) assert.equal((await A.c.sendEmote(bad)).ok, false);
  assert.equal([...claims.rows ? claims.rows() : []].filter((r) => r.payload && r.payload.type === "emote").length, 0);
  A.g.finishMatch("me", "テスト");
  const r = await A.c.sendEmote(0);
  assert.equal(r.ok, false);
  assert.equal(A.g.log.filter((e) => e.op === "エモート").length, 0);
  B.c.stop();
  assert.equal((await B.c.sendEmote(0)).ok, false);
});

test("壊れた行・範囲外の番号は捨てる。同じ行が二度届いても一度だけ。自分の行は相手の分として数えない", async () => {
  const { A, B, seen, claims } = pair();
  const row = (key, payload, player = "host") => ({ match_id: "m-emote-1", kind: "event", key, player, payload });
  assert.equal(B.c.onRow(row("host-zz-e0", { type: "emote", i: 9 })), false);
  assert.equal(B.c.onRow(row("host-zz-e1", { type: "emote", i: -1 })), false);
  assert.equal(B.c.onRow(row("host-zz-e2", { type: "emote" })), false);
  assert.equal(B.c.onRow(row("host-zz-e3", { type: "emote", i: "1" })), false);
  assert.equal(seen.B.length, 0);
  B.c.onRow(row("host-zz-e4", { type: "emote", i: 3 }));
  B.c.onRow(row("host-zz-e4", { type: "emote", i: 3 }));
  assert.deepEqual(seen.B, [["opp", 3, "降参！"]]);
  assert.equal(B.g.log.filter((e) => e.op === "エモート").length, 1);
  // 自分の役の行（B から見て guest）は onEmote を呼ばない
  B.c.onRow(row("guest-zz-e0", { type: "emote", i: 0 }, "guest"));
  assert.equal(seen.B.length, 1);
  // 試合が終わったあとに届いた行は出さない
  B.g.finishMatch("me", "テスト");
  B.c.onRow(row("host-zz-e5", { type: "emote", i: 0 }));
  assert.equal(seen.B.length, 1);
});

test("エモートは「動いた」に数えない：ログに1行だけ入り、戦況の欄には出ない", async () => {
  const { A, clock } = pair();
  const hint0 = A.g.log.length;
  clock.t += 1;
  await A.c.sendEmote(0);
  assert.equal(A.g.log.length, hint0 + 1);
  assert.equal(A.g.log[hint0].op, "エモート");
  // 手でないログ：振動の手・戦況の欄に出る手に入らない（戦況の行は 放つ・取る などだけ）
  const lines = K.senkyoLines ? K.senkyoLines(A.g.log, { me: A.g.me.name }) : [];
  assert.ok(!JSON.stringify(lines).includes("矢場"), "戦況の欄に言葉は出ない");
});

test("エモートの数値・言葉の置き場：index.html に言葉を直書きしない・word は strings.js だけ", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const w of WORDS) assert.equal(html.includes(w), false, `index.html に ${w} を直書きしない`);
  const core = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
  for (const w of WORDS) assert.equal(core.includes(w), false, `core.js に ${w} を直書きしない`);
});
