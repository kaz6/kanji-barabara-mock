// 合言葉の部屋の再戦と何勝何敗（KJ-141）：K.createRematch・K.tallyNew／tallyAdd／tallyLine・ログの頭の「この相手と ○戦目」。
// つなぎは偽物（K.memoryClaims）。本物の Supabase には出さない。表・列は増やさない（'event' 行だけ）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T } = require("./helpers");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
// 終わった部屋の二人。go が届いたら starts に { next, createdAt } を残す
function duo(opts = {}) {
  const claims = opts.claims || K.memoryClaims({ now: () => 7000 });
  const starts = { host: [], guest: [] }, changes = { host: 0, guest: 0 };
  const mk = (role) => K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role, rand: K.seededRand(role === "host" ? 7 : 8), timeoutSec: 0.2,
    onGo: (x) => starts[role].push(x), onChange: () => { changes[role]++; } });
  return { claims, starts, changes, A: mk("host"), B: mk("guest") };
}
const events = (claims, type) => claims.rows().filter((r) => r.kind === "event" && r.payload.type === type);

test("KJ-141 二人とも「もう一度」を押したら、作った側が go を1つ入れ、二人で同じ次の match_id から始まる", async () => {
  const { claims, starts, A, B } = duo();
  await A.again(); await settle();
  assert.equal(A.pressed, true);
  assert.deepEqual(starts, { host: [], guest: [] }, "片方だけでは始まらない");
  assert.equal(events(claims, "go").length, 0);
  await B.again(); await settle();
  const go = events(claims, "go");
  assert.equal(go.length, 1, "go は1つ");
  assert.deepEqual([go[0].key, go[0].player], ["host-go", "host"]);
  assert.match(go[0].payload.next, /^m-[0-9a-z]{16}$/);
  assert.notEqual(go[0].payload.next, "m-aaaaaaaaaaaaaaaa", "次の試合は別の match_id（場の列も手札も新しくなる）");
  assert.equal(starts.host.length, 1); assert.equal(starts.guest.length, 1);
  assert.equal(starts.host[0].next, go[0].payload.next);
  assert.equal(starts.guest[0].next, go[0].payload.next);
  assert.equal(starts.host[0].createdAt, 7000, "始まりの時刻は go 行の created_at（二人で同じ）");
  assert.equal(starts.guest[0].createdAt, 7000);
  assert.deepEqual(claims.rows().map((r) => r.kind).sort(), ["event", "event", "event"], "again×2＋go。表に新しい kind は無い");
});

test("KJ-141 入る側が先に押しても、作った側が押した時点で始まる（押す順は問わない）", async () => {
  const { claims, starts, A, B } = duo();
  await B.again(); await settle();
  assert.equal(A.oppAgain, true, "相手が押したことが届く");
  assert.equal(starts.host.length + starts.guest.length, 0);
  await A.again(); await settle();
  assert.equal(events(claims, "go").length, 1);
  assert.equal(starts.host.length, 1); assert.equal(starts.guest.length, 1);
});

test("KJ-141 片方だけ押したあいだは待つ。同じ側が何度押しても again は1つ・二重に始まらない", async () => {
  const { claims, starts, A, B } = duo();
  await A.again(); await A.again(); await A.again(); await settle();
  assert.equal(events(claims, "again").length, 1);
  await B.again(); await B.again(); await settle();
  assert.equal(events(claims, "again").length, 2);
  assert.equal(events(claims, "go").length, 1);
  assert.equal(starts.host.length, 1); assert.equal(starts.guest.length, 1, "始まるのは1回");
});

test("KJ-141 相手が抜けたら知らせる。抜けたあとに押しても始まらず、押した again も入れない", async () => {
  const { claims, starts, changes, A, B } = duo();
  await B.leave(); await settle();
  assert.equal(A.oppLeft, true);
  assert.ok(changes.host >= 1, "画面へ知らせる");
  await A.again(); await settle();
  assert.equal(A.pressed, true);
  assert.equal(events(claims, "again").length, 0, "抜けた相手には again を入れない");
  assert.equal(events(claims, "go").length, 0);
  assert.deepEqual(starts, { host: [], guest: [] });
});

test("KJ-141 試合の途中で抜けた行（type leave）も、あとから作った再戦の受け付けが読む（入り直した側の取りこぼし）", async () => {
  const claims = K.memoryClaims({ now: () => 7000 });
  await claims.insert({ match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "guest-x-leave", player: "guest", payload: { type: "leave" } });
  const A = K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role: "host" });
  // memoryClaims は後から subscribe した側へ昔の行を配らないので、画面の LINK がするのと同じに、読み直した行を渡す
  const r = await claims.select("m-aaaaaaaaaaaaaaaa", "event");
  for (const row of r.rows) A.onRow(row);
  assert.equal(A.oppLeft, true);
});

test("KJ-141 先に届いた again は取りこぼさない（相手が先に押していて、あとから受け付けを作る）", async () => {
  const claims = K.memoryClaims({ now: () => 7000 });
  const starts = [];
  const B = K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role: "guest", onGo: (x) => starts.push(x) });
  await B.again(); await settle();
  const r = await claims.select("m-aaaaaaaaaaaaaaaa", "event");
  const A = K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role: "host", onGo: (x) => starts.push(x) });
  for (const row of r.rows) A.onRow(row); // 届いていた again を渡す
  assert.equal(A.oppAgain, true);
  await A.again(); await settle();
  assert.equal(events(claims, "go").length, 1);
  assert.equal(starts.length, 2);
});

test("KJ-141 送れなかった again は、間をあけて送り直せる（つながらないあいだは進まず、つながれば進む）", async () => {
  let t = 100;
  const claims = K.memoryClaims({ now: () => t });
  const starts = [];
  const mk = (role) => K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role, now: () => t, timeoutSec: 0.2, onGo: (x) => starts.push(role) });
  const A = mk("host"), B = mk("guest");
  claims.setDown(true);
  await A.again(); await settle();
  assert.equal(events(claims, "again").length, 0);
  claims.setDown(false);
  await A.pump(false); await settle();
  assert.equal(events(claims, "again").length, 0, "送り直しは REMATCH_RETRY_SEC あけてから");
  t += 3;
  await A.pump(false); await settle();
  assert.equal(events(claims, "again").length, 1);
  await B.again(); await settle();
  assert.equal(events(claims, "go").length, 1);
  assert.deepEqual(starts.sort(), ["guest", "host"]);
});

test("KJ-141 壊れた行・別の部屋の行・自分の役の again・知らない type は無視して落ちない", async () => {
  const { claims, starts, A } = duo();
  for (const bad of [null, 3, {}, { match_id: "m-bbbbbbbbbbbbbbbb", kind: "event", key: "guest-again", player: "guest", payload: { type: "again" } },
    { match_id: "m-aaaaaaaaaaaaaaaa", kind: "word", key: "学生", player: "guest", payload: {} },
    { match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "x", player: "guest", payload: [] },
    { match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "x", player: "nobody", payload: { type: "again" } },
    { match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "x", player: "guest", payload: { type: "ふしぎ" } }]) {
    assert.equal(A.onRow(bad), false);
  }
  assert.equal(A.oppAgain, false);
  // 入る側が、作っていない側の go（next が壊れている）では始まらない
  const B = K.createRematch(claims, { matchId: "m-aaaaaaaaaaaaaaaa", role: "guest", onGo: (x) => starts.guest.push(x) });
  await B.again(); await settle();
  assert.equal(B.onRow({ match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "host-go", player: "host", payload: { type: "go", next: "あ" }, created_at: 1 }), false);
  assert.equal(B.onRow({ match_id: "m-aaaaaaaaaaaaaaaa", kind: "event", key: "x", player: "guest", payload: { type: "go", next: "m-cccccccccccccccc" }, created_at: 1 }), false, "go は作った側の行だけ");
  assert.equal(starts.guest.length, 0);
});

test("KJ-141 stop したあとは何も起きない（部屋を出た）", async () => {
  const { claims, starts, A, B } = duo();
  A.stop();
  await A.again(); await B.again(); await settle();
  assert.equal(events(claims, "go").length, 0, "止めた側は again を入れない・go を作らない");
  assert.equal(starts.host.length, 0);
});

test("KJ-141 何勝何敗：数える・文の形（引き分けが無ければ分は出さない）・English", () => {
  let t = K.tallyNew();
  assert.deepEqual(t, { w: 0, l: 0, d: 0 });
  const ja = { pre: "この相手と ", w: "勝", l: "敗", d: "分", sep: "" }, en = { pre: "vs this player: ", w: "W", l: "L", d: "D", sep: " " };
  assert.equal(K.tallyLine(t, ja), "この相手と 0勝0敗");
  t = K.tallyAdd(t, "win"); t = K.tallyAdd(t, "win"); t = K.tallyAdd(t, "lose");
  assert.equal(K.tallyLine(t, ja), "この相手と 2勝1敗");
  assert.equal(K.tallyLine(K.tallyAdd(t, "draw"), ja), "この相手と 2勝1敗1分");
  assert.equal(K.tallyLine(K.tallyAdd(t, "draw"), en), "vs this player: 2W 1L 1D");
  assert.deepEqual(t, { w: 2, l: 1, d: 0 }, "もとの値は変えない");
  assert.equal(K.tallyLine(null, ja), "");
});

test("KJ-141 ログの頭に「この相手と ○戦目」（合言葉の部屋だけ。round が無ければ出さない）", () => {
  const mk = (match) => K.createGame(D, T, { now: () => 100, date: () => new Date(2026, 10, 28, 12, 0, 0), match });
  const head = (g) => g.logText().split("\n").slice(0, 3).join("\n");
  assert.match(head(mk({ id: "m-test-1", role: "host", startAt: 100, round: 2 })), /# この相手と 2戦目/);
  assert.match(head(mk({ id: "m-test-1", role: "host", startAt: 100, round: 1 })), /# この相手と 1戦目/);
  assert.doesNotMatch(mk({ id: "m-test-1", role: "host", startAt: 100 }).logText(), /この相手と/);
  assert.doesNotMatch(K.createGame(D, T, { now: () => 100, opponent: "weak" }).logText(), /この相手と/, "CPU 戦には出ない");
  assert.doesNotMatch(mk({ id: "m-test-1", role: "host", startAt: 100, round: 0 }).logText(), /この相手と/);
  assert.doesNotMatch(mk({ id: "m-test-1", role: "host", startAt: 100, round: 1.5 }).logText(), /この相手と/);
});
