// 合言葉の部屋（KJ-033・D-049）：先着の決まり。本物の Supabase には出さず、主キーの先着をまねる偽物（KJ.memoryClaims）で回す
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const R = D.rules;
// 放ったら、場から取りきるまで次の手ができない（KJ-039）。この端末の取れる枚数を、先着を通して取りきる
async function takeAll(X) {
  while (X.g.me.takes > 0) {
    const r = await X.c.take(X.g.field[0].id);
    if (!r.ok) throw new Error("取りきれない：" + r.why);
  }
}

// 二人の端末（host と guest）。時計は同じ。つなぎは同じ偽物
function pair(id = "m-test-1", opts = {}) {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const mk = (role) => {
    const g = K.createGame(D, T, { now, date: () => new Date(2026, 10, 22, 21, 0, 0), match: { id, role, startAt: clock.t }, startStock: opts.startStock !== false });
    const c = K.createMatchClient(g, claims, { nonce: role + "x", graceSec: opts.graceSec });
    return { g, c };
  };
  const A = mk("host"), B = mk("guest");
  return { clock, claims, A, B };
}

test("合言葉の部屋：場は二人で同じ3枚に見える。手札は一人ずつの種から配る", () => {
  const { A, B } = pair();
  assert.equal(A.g.field.length, R.field_size);
  assert.deepEqual(A.g.field.map((x) => x.c), B.g.field.map((x) => x.c), "場の字が同じ");
  assert.deepEqual(A.g.field.map((x) => x.n), [0, 1, 2], "場の列の番号の小さい3枚");
  assert.notEqual(chars(A.g.me.cards), chars(B.g.me.cards), "手札は取り合わない（別の種）");
  assert.equal(A.g.cpu.name, "相手");
  assert.equal(A.g.cpu.cards.length, 0, "相手の札はこの端末に無い");
  assert.equal(A.g.opponent, "room");
  // 同じ match_id なら何度作っても同じ場の列
  const again = pair();
  assert.deepEqual(again.A.g.field.map((x) => x.c), A.g.field.map((x) => x.c));
  const other = pair("m-test-2");
  const seqOf = (g) => Array.from({ length: 12 }, (_, n) => g.fieldAt(n)).join("");
  assert.notEqual(seqOf(other.A.g), seqOf(A.g), "別の試合は別の場の列");
});

test("合言葉の部屋：同じ場の札を二人が同じ瞬間に取ると、先に入れた方だけ取れる", async () => {
  const { A, B, claims } = pair();
  A.g.me.takes = 1; B.g.me.takes = 1;
  setHand(A.g, A.g.me, "一二"); setHand(B.g, B.g.me, "三四");
  const fa = A.g.field[0], fb = B.g.field[0];
  assert.equal(fa.n, fb.n);
  const c0 = fa.c, next = A.g.fieldAt(R.field_size);
  const [ra, rb] = await Promise.all([A.c.take(fa.id), B.c.take(fb.id)]); // A が先に insert を呼ぶ
  assert.equal(ra.ok, true, "先に入れた A は取れた");
  assert.equal(rb.ok, false);
  assert.equal(rb.why, "相手が先に取った");
  assert.equal(chars(A.g.me.cards), "一二" + c0);
  assert.equal(chars(B.g.me.cards), "三四", "B の手札は増えない");
  assert.equal(B.g.me.takes, 1, "取れなかった B の取れる枚数は減らない");
  assert.deepEqual(A.g.field.map((x) => x.c), B.g.field.map((x) => x.c), "取ったあとも二人の場は同じ");
  assert.equal(A.g.field.some((x) => x.n === 0), false);
  assert.equal(A.g.field[R.field_size - 1].c, next, "場の列の次の札が出る");
  const cardRows = claims.rows().filter((r) => r.kind === "card");
  assert.equal(cardRows.length, 1);
  assert.deepEqual({ k: cardRows[0].key, p: cardRows[0].player }, { k: "0", p: "host" });
  // B は残りの場から取れる
  const rb2 = await B.c.take(B.g.field[0].id);
  assert.equal(rb2.ok, true);
  assert.deepEqual(A.g.field.map((x) => x.n), B.g.field.map((x) => x.n));
  assert.ok(B.g.log.some((e) => e.who === "相手" && e.op === "取る"), "相手が取ったのがログに残る");
});

test("合言葉の部屋：同じ言葉は先に放った方だけ点が入る。負けた方の札は手元に残る", async () => {
  const { A, B } = pair();
  const ia = setHand(A.g, A.g.me, "学生"), ib = setHand(B.g, B.g.me, "学生");
  const [ra, rb] = await Promise.all([A.c.release(ia), B.c.release(ib)]);
  assert.equal(ra.ok, true);
  assert.equal(A.g.me.score, 3);
  assert.equal(rb.ok, false);
  assert.equal(rb.why, "相手が先に放った");
  assert.equal(B.g.me.score, 0, "点は入らない");
  assert.equal(chars(B.g.me.cards), "学生", "札は手元に残る");
  assert.equal(B.g.me.takes, 0, "場から取れる枚数も増えない");
  assert.equal(B.g.cpu.score, 3, "B の画面に相手の点が出る");
  assert.ok(B.g.used.has("学生") && A.g.used.has("学生"), "二人とももう使えない");
  assert.ok(B.g.events.some((e) => e.type === "release" && e.who === "相手" && e.text === "学生"), "相手が放った言葉は CPU と同じ見せ方");
  assert.ok(B.g.log.some((e) => e.op === "ためした" && e.note === "相手が先に放った"));
  // もう一度放とうとしても放った言葉
  assert.equal(B.g.canRelease(B.g.me, B.g.me.cards.map((x) => x.id)).why, "放った言葉");
});

test("合言葉の部屋：点と手札の枚数は相手の画面に届く", async () => {
  const { A, B } = pair();
  const ia = setHand(A.g, A.g.me, "先生一");
  await A.c.release(ia.slice(0, 2));
  assert.equal(B.g.cpu.score, 3);
  assert.equal(B.g.cpu.count, 1, "相手の手札の枚数");
  const ib = setHand(B.g, B.g.me, "大学");
  await B.c.release(ib);
  assert.equal(A.g.cpu.score, 3);
  assert.equal(A.g.cpu.count, 0);
  // 同じ行が二度届いても二度は数えない
  const row = { match_id: "m-test-1", kind: "word", key: "大学", player: "guest", payload: { pts: 3, score: 3 } };
  assert.equal(A.c.onRow(row), false);
  assert.equal(A.g.cpu.score, 3);
  assert.equal(A.c.onRow({ ...row, match_id: "ほかの試合" }), false, "ほかの試合の行は見ない");
});

test("合言葉の部屋：引き直しは場を動かさない（手札は自分の種から）", async () => {
  const { A, B } = pair();
  const before = A.g.field.map((x) => x.c + x.n).join();
  A.g.me.score = 7;
  assert.equal((await A.c.redraw()).ok, true, "1回目は0点");
  assert.equal(A.g.me.score, 7);
  const r = await A.c.redraw();
  assert.equal(r.ok, true);
  assert.equal(A.g.me.score, 2, "2回目は5点（KJ-049）");
  assert.equal(A.g.field.map((x) => x.c + x.n).join(), before);
  assert.equal(B.g.field.map((x) => x.c + x.n).join(), before, "相手の場も動かない");
  assert.equal(B.g.cpu.score, 2, "払った点が相手に届く");
  assert.equal(A.g.me.cards.length, R.start_hand);
});

test("合言葉の部屋：先に勝ちの点に届いた方の勝ちが、二人の画面でそろう", async () => {
  const { A, B, claims } = pair();
  A.g.me.score = R.win.score - 3; B.g.me.score = R.win.score - 3;
  const ia = setHand(A.g, A.g.me, "学生"), ib = setHand(B.g, B.g.me, "先生");
  await Promise.all([A.c.release(ia), B.c.release(ib)]);
  assert.equal(A.g.over, true); assert.equal(B.g.over, true);
  assert.equal(A.g.winner, A.g.me, "A の画面：あなたの勝ち");
  assert.equal(B.g.winner, B.g.cpu, "B の画面：相手の勝ち");
  assert.equal(B.g.me.score, R.win.score, "B の点は入っている（言葉は別なので）");
  const ends = claims.rows().filter((r) => r.kind === "end");
  assert.equal(ends.length, 1);
  assert.equal(ends[0].payload.winner, "host");
  assert.ok(A.g.log.some((e) => e.op === "終わり" && e.note.startsWith("あなたの勝ち")));
  assert.ok(B.g.log.some((e) => e.op === "終わり" && e.note.startsWith("相手の勝ち")));
});

test("合言葉の部屋：時間切れで点を比べる（二人の点をそろえてから）", async () => {
  const { A, B, clock } = pair();
  await A.c.release(setHand(A.g, A.g.me, "学生"));
  await B.c.release(setHand(B.g, B.g.me, "大学"));
  await takeAll(B);
  await B.c.release(setHand(B.g, B.g.me, "先生"));
  clock.t += A.g.timeLimit - 1;
  assert.equal(await A.c.tick(), false);
  assert.equal(A.g.over, false);
  clock.t += 1;
  await A.c.tick();
  assert.equal(A.g.over, false, "相手の点がまだ届いていない");
  assert.equal(A.g.canTake(A.g.me, A.g.field[0].id).ok, false, "時間切れのあとは手を打てない");
  await B.c.tick();
  assert.equal(B.g.over, true, "A の点は届いているので B は終わる");
  await A.c.tick();
  assert.equal(A.g.over, true);
  assert.equal(A.g.winner, A.g.cpu);
  assert.equal(B.g.winner, B.g.me);
  assert.ok(A.g.log.at(-1).note.includes("3対6"));
});

test("合言葉の部屋：時間切れで同点は引き分け", async () => {
  const { A, B, clock } = pair();
  clock.t += A.g.timeLimit;
  await A.c.tick(); await B.c.tick(); await A.c.tick();
  assert.equal(A.g.over && B.g.over, true);
  assert.equal(A.g.winner, null); assert.equal(B.g.winner, null);
});

test("合言葉の部屋：相手が抜けても、時間はそのまま進み、時間切れで最後に見えた点を比べて終わる", async () => {
  const { A, B, clock } = pair();
  await B.c.release(setHand(B.g, B.g.me, "先生"));
  B.c.stop(); // B が抜けた（もう行を送らない・受けない）
  await A.c.release(setHand(A.g, A.g.me, "学生"));
  await takeAll(A);
  await A.c.release(setHand(A.g, A.g.me, "大学"));
  clock.t += A.g.timeLimit;
  await A.c.tick();
  assert.equal(A.g.over, false, "相手の点を少し待つ");
  clock.t += K.MATCH_END_GRACE_SEC;
  await A.c.tick();
  assert.equal(A.g.over, true);
  assert.equal(A.g.winner, A.g.me);
  assert.match(A.g.log.at(-1).note, /6対3（相手の点は最後に見えたもの）/);
});

test("合言葉の部屋：通信中（先着の返事待ち）は次の手を打てない。つながらないときは取れない", async () => {
  const { A, claims } = pair();
  A.g.me.takes = 2;
  setHand(A.g, A.g.me, "一");
  const p = A.c.take(A.g.field[0].id);
  assert.equal(A.g.canTake(A.g.me, A.g.field[1].id).why, "通信中");
  assert.equal((await p).ok, true);
  claims.setDown(true);
  const r = await A.c.take(A.g.field[0].id);
  assert.equal(r.ok, false);
  assert.equal(r.why, "つながらない");
  assert.equal(A.g.me.takes, 1, "つながらなければ取れる枚数は減らない");
  assert.equal(A.g.hold, false, "止めたままにしない");
});

test("合言葉の部屋：CPU は出さない。ログの頭は「相手 人と（合言葉）」で、合言葉は書かない", () => {
  const { A } = pair("1234-secret");
  assert.equal(A.g.cpuTurn(), null);
  const txt = A.g.logText();
  assert.match(txt, /# 相手 人と（合言葉）/);
  assert.doesNotMatch(txt, /1234/);
  assert.doesNotMatch(txt, /CPU \d/, "CPU の動く間隔は書かない");
  assert.equal(A.g.take(A.g.me, A.g.field[0].id).ok, false, "先着を確かめずには取れない");
});

test("CPU 戦はいまのまま（合言葉の部屋の決まりは効かない）", () => {
  const g = newGame(1, "normal");
  assert.equal(g.match, null);
  assert.equal(g.cpu.cards.length, R.start_hand);
  assert.equal(g.applyTake, undefined);
  g.me.takes = 1;
  setHand(g, g.me, "一");
  const c0 = g.field[0].c;
  assert.equal(g.take(g.me, g.field[0].id).ok, true);
  assert.equal(chars(g.me.cards), "一" + c0);
  // 勝ちの点で終わる
  g.me.score = R.win.score - 3;
  g.release(g.me, setHand(g, g.me, "学生"));
  assert.equal(g.over, true);
  assert.equal(g.winner, g.me);
  assert.throws(() => K.createMatchClient(g, K.memoryClaims()), /合言葉の部屋の試合ではない/);
});

test("合言葉の部屋：返事待ちの最中に時間切れが来ても、返事を反映してから最後の点を送り、そのあとは手を打てない", async () => {
  const { A, B, claims, clock } = pair();
  const ia = setHand(A.g, A.g.me, "学生大学");
  const p = A.c.release(ia.slice(0, 2)); // 返事待ち
  clock.t += A.g.timeLimit;
  assert.equal(await A.c.tick(), false, "返事待ちの間は時間切れの行を送らない");
  assert.equal((await p).ok, true);
  await A.c.tick();
  const tr = claims.rows().find((r) => r.kind === "end" && r.key === "time:host");
  assert.equal(tr.payload.score, 3, "時間切れの行の点は最後の点");
  assert.equal(A.g.closed, true);
  assert.equal(A.g.canTake(A.g.me, A.g.field[0].id).ok, false);
  const r = await A.c.release(A.g.me.cards.map((x) => x.id));
  assert.equal(r.ok, false, "時間切れのあとは放てない");
  assert.equal(A.g.me.score, 3);
  await B.c.tick(); await A.c.tick();
  assert.equal(A.g.winner, A.g.me); assert.equal(B.g.winner, B.g.cpu);
});

test("合言葉の部屋：勝ちの行が1回つながらなくても、次の tick で送り直して勝ちが決まる", async () => {
  const { A, B, claims } = pair();
  A.g.me.score = R.win.score - 3;
  claims.failNext("end");
  await A.c.release(setHand(A.g, A.g.me, "学生"));
  assert.equal(A.g.me.score, R.win.score);
  assert.equal(A.g.over, false, "まだ end が入っていない");
  await A.c.tick();
  assert.equal(A.g.over, true);
  assert.equal(A.g.winner, A.g.me);
  assert.equal(B.g.winner, B.g.cpu);
});

test("合言葉の部屋：入ったのに返事だけ落ちて押し直したら、自分の行とぶつかったので取れた・放てたとして扱う", async () => {
  const { A, B, claims } = pair();
  A.g.me.takes = 1;
  setHand(A.g, A.g.me, "一");
  const f = A.g.field[0];
  claims.dropReplyNext("card");
  assert.equal((await A.c.take(f.id)).why, "つながらない");
  assert.equal(A.g.me.takes, 1, "返事が無いので、まだ取れていない扱い");
  assert.equal(A.g.field[0].n, f.n, "札は場に見えたまま");
  const r = await A.c.take(A.g.field[0].id); // 押し直す → 自分の行にぶつかる
  assert.equal(r.ok, true, "自分の行なので取れた");
  assert.equal(chars(A.g.me.cards), "一" + f.c);
  assert.equal(B.g.field.some((x) => x.n === f.n), false, "相手の場からも消えている");
  // 言葉：返事だけ落ちる → もう一度放つと、自分の行にぶつかるので点が入る
  const ids = setHand(A.g, A.g.me, "学生");
  claims.dropReplyNext("word");
  assert.equal((await A.c.release(ids)).why, "つながらない");
  assert.equal(A.g.me.score, 0);
  const r2 = await A.c.release(ids);
  assert.equal(r2.ok, true);
  assert.equal(A.g.me.score, 3);
  assert.equal(B.g.cpu.score, 3, "相手の画面の点と合う");
});

test("合言葉の部屋：画面が client を通さずに放っても点は入らない", () => {
  const { A } = pair();
  const r = A.g.release(A.g.me, setHand(A.g, A.g.me, "学生"));
  assert.equal(r.ok, false);
  assert.equal(A.g.me.score, 0);
});

test("合言葉の部屋：時間切れの tick が点を送っている間に放っても、反映してから最後の点を送る", async () => {
  const { A, claims, clock } = pair();
  const ids = setHand(A.g, A.g.me, "学生");
  clock.t += A.g.timeLimit - 0.5;
  await A.c.tick(); // 点の行を送り済みにしておく
  clock.t += 0.5;
  A.g.me.cards.push({ id: 999999, c: "一", t: clock.t, fresh: false }); // 枚数が変わって、tick が点の行を送る
  const tk = A.c.tick();
  const rl = A.c.release(ids); // tick の送信待ちの間に放つ
  await tk;
  const rr = await rl; assert.equal(rr.ok, true, JSON.stringify(rr));
  await A.c.tick();
  const tr = claims.rows().find((r) => r.kind === "end" && r.key === "time:host");
  assert.equal(tr.payload.score, 3, "時間切れの行の点は放ったあとの点");
  assert.equal(A.g.me.score, 3);
});

// ---------- KJ-033 後半（受け箱 P-038）：つなぎの約束・届いた行の確かめ・部屋を作る／入る ----------

test("合言葉の部屋：insert の返事が来なくても、時間切れで「つながらない」になり、試合は止まらない", async () => {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const g = K.createGame(D, T, { now, match: { id: "m-hang", role: "host", startAt: clock.t } });
  const c = K.createMatchClient(g, claims, { nonce: "h", timeoutSec: 0.05 });
  setHand(g, g.me, "一二");
  g.me.takes = 1;
  claims.hangNext("card");
  const r = await c.take(g.field[0].id);
  assert.equal(r.ok, false);
  assert.equal(r.why, "つながらない");
  assert.equal(g.hold, false, "返事待ちの止めは下りる");
  assert.equal(g.me.takes, 1, "取れる枚数は減らない");
  const r2 = await c.take(g.field[0].id);
  assert.equal(r2.ok, true, "もう一度押せば取れる");
});

test("合言葉の部屋：ぶつかった行の player を返すつなぎなら、自分の行が届いていなくても自分の行と分かる", async () => {
  const clock = { t: 5000 };
  const now = () => clock.t;
  const mem = K.memoryClaims({ now });
  // 自分の行が届かないつなぎ（subscribe は何も届けない）。返事だけ落ちる
  const claims = { insert: mem.insert, subscribe: () => () => {} };
  const g = K.createGame(D, T, { now, match: { id: "m-own", role: "guest", startAt: clock.t } });
  const c = K.createMatchClient(g, claims, { nonce: "g" });
  setHand(g, g.me, "一二");
  g.me.takes = 1;
  const f = g.field[0];
  mem.dropReplyNext("card");
  assert.equal((await c.take(f.id)).ok, false, "返事が落ちた");
  const again = await c.take(f.id);
  assert.equal(again.ok, true, "ぶつかった行の player が自分なので、取れたとして扱う");
  assert.equal(mem.rows().filter((x) => x.kind === "card").length, 1);
});

test("合言葉の部屋：形の合わない行は捨てる（番号は0以上の整数だけ・点は0以上の整数・枚数は上限まで）", async () => {
  const { A } = pair("m-bad");
  const mid = "m-bad";
  const before = A.g.field.map((x) => x.n).join(",");
  const bad = [
    { match_id: mid, kind: "card", key: "-1", player: "guest", payload: {} },
    { match_id: mid, kind: "card", key: "1.5", player: "guest", payload: {} },
    { match_id: mid, kind: "card", key: "abc", player: "guest", payload: {} },
    { match_id: mid, kind: "card", key: "0", player: "someone", payload: {} },
    { match_id: mid, kind: "card", key: "0", player: "guest", payload: [1] },
    { match_id: "m-other", kind: "card", key: "0", player: "guest", payload: {} },
    { match_id: mid, kind: "word", key: "学生", player: "guest", payload: { score: -3 } },
    { match_id: mid, kind: "word", key: "学", player: "guest", payload: { score: 3 } },
    { match_id: mid, kind: "event", key: "x1", player: "guest", payload: { type: "state", seq: 0, score: 3, count: 999 } },
    { match_id: mid, kind: "event", key: "x2", player: "guest", payload: { type: "state", seq: 1.5, score: 3, count: 8 } },
    { match_id: mid, kind: "end", key: "score", player: "guest", payload: { winner: "nobody" } },
    null, "row", { match_id: mid },
  ];
  for (const r of bad) assert.equal(A.c.onRow(r), false, JSON.stringify(r));
  assert.equal(A.g.field.map((x) => x.n).join(","), before, "場は変わらない");
  assert.equal(A.g.cpu.score, 0);
  assert.equal(A.g.used.has("学生"), false);
  assert.equal(A.g.over, false);
  // 形の合う行は通る。相手の言葉の点の重みは、こちらの表で数える（payload の pts は使わない）
  assert.equal(A.c.onRow({ match_id: mid, kind: "word", key: "学生", player: "guest", payload: { pts: 999, score: 3 } }), true);
  const e = A.g.log.filter((x) => x.who === "相手" && x.op === "放つ").pop();
  assert.equal(e.pts, K.scoreOf(D, T, "学生").pts);
  assert.equal(A.g.cpu.score, 3);
  assert.equal(A.c.onRow({ match_id: mid, kind: "event", key: "x3", player: "guest", payload: { type: "state", seq: 2, score: 3, count: 10, hand: 7 } }), true);
  assert.equal(A.g.cpu.count, 10);
  assert.equal(A.g.cpu.hand, 7, "手札（上の段）の枚数も届く");
});

test("合言葉の部屋：送る点の行に、手札（上の段）の枚数も載る", async () => {
  const { A, claims } = pair("m-hand");
  await A.c.sendState();
  const ev = claims.rows().filter((r) => r.kind === "event" && r.payload.type === "state").pop();
  assert.equal(ev.payload.hand, A.g.handCount(A.g.me));
  assert.equal(ev.payload.count, A.g.me.cards.length);
});

test("合言葉の部屋：相手の行が届かないと「通信が切れた」。まだいる（ping）で戻り、抜けた（leave）でまた切れる", async () => {
  const { A, B, clock } = pair("m-gone");
  assert.equal(A.c.oppGone(), false);
  clock.t += K.MATCH_GONE_SEC + 1;
  assert.equal(A.c.oppGone(), true, "相手の行が来ないまま時間がたった");
  await B.c.ping();
  assert.equal(A.c.oppGone(), false, "相手の ping が届いた");
  // tick が ping を送る
  const n0 = A.g.log.length;
  clock.t += K.MATCH_GONE_SEC + 1;
  assert.equal(A.c.oppGone(), true);
  await B.c.tick(); // tick が ping を送る（待たない）
  for (let i = 0; i < 3; i++) await Promise.resolve();
  assert.equal(A.c.oppGone(), false, "tick が送った ping が届いた");
  assert.equal(A.g.log.length, n0, "ping はログに書かない");
  await B.c.leave();
  assert.equal(A.c.oppGone(), true, "相手が抜けた");
  assert.equal(A.g.over, false, "試合は時間どおり進む");
});

test("合言葉の部屋：match_id は試合ごとに一意（合言葉とは別）。別の match_id は別の場の列", () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(K.newMatchId());
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^m-[0-9a-z]{16}$/);
  const [a, b] = [...ids];
  const ga = K.createGame(D, T, { match: { id: a, role: "host" } }), gb = K.createGame(D, T, { match: { id: b, role: "host" } });
  const seq = (g) => Array.from({ length: 12 }, (_, n) => g.fieldAt(n)).join("");
  assert.notEqual(seq(ga), seq(gb));
  for (let i = 0; i < 100; i++) assert.match(K.newRoomCode(), /^[1-9][0-9]{3}$/);
});

test("合言葉の部屋：部屋を作る→合言葉で入る→二人とも同じ時に始まる。二人目は入れない", async () => {
  const clock = { t: 1.8e9 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  const matchId = K.newMatchId();
  const h = await K.hostRoom(claims, { matchId, level: "N4", timeLimit: 600, version: D.rules.version, nowSec: now() });
  assert.equal(h.ok, true);
  assert.match(h.code, /^[0-9]{4}$/);
  const lobby = claims.rows().find((r) => r.match_id === K.roomLobbyId(h.code));
  assert.deepEqual({ kind: lobby.kind, key: lobby.key, player: lobby.player }, { kind: "join", key: matchId, player: "host" });
  assert.deepEqual(lobby.payload, { level: "N4", time: 600, v: D.rules.version });
  // 作った側の待ち
  const started = [];
  const hw = K.roomWaiter(claims, "host", matchId, (row) => started.push(["host", row.created_at]), { level: "N4", time: 600 });
  claims.subscribe(matchId, hw);
  // 入る側
  clock.t += 20;
  const f = await K.findRoom(claims, h.code, now());
  assert.equal(f.ok, true);
  assert.deepEqual({ m: f.matchId, l: f.level, t: f.timeLimit, v: f.version }, { m: matchId, l: "N4", t: 600, v: D.rules.version });
  const gw = K.roomWaiter(claims, "guest", matchId, (row) => started.push(["guest", row.created_at]));
  claims.subscribe(matchId, gw);
  assert.equal((await K.joinRoom(claims, matchId)).ok, true);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(started.length, 2, "二人とも始まった");
  assert.equal(started[0][1], started[1][1], "同じ 'start' 行で始まる");
  assert.equal(claims.rows().filter((r) => r.kind === "start").length, 1);
  // 三人目
  const j3 = await K.joinRoom(claims, matchId);
  assert.deepEqual(j3, { ok: false, why: "その部屋はもう始まっている" });
  // 始まりの時刻（端末の時計で）
  assert.equal(K.roomStartAt(1000, 1002, 50), 48, "届くまでにかかった秒だけ前");
  assert.equal(K.roomStartAt(1000, 990, 50), 50, "端末の時計が遅れていれば届いた時刻");
  assert.equal(K.roomStartAt(1000, 1100, 50), 50, "ずれが大きければ届いた時刻");
  assert.equal(K.roomStartAt(1000, 1005, 50), 50, "時間切れの待ち（5秒）より大きなずれも届いた時刻");
});

test("合言葉の部屋：古い合言葉・形の違う合言葉では入れない。同じ合言葉はいちばん新しい部屋に入る", async () => {
  const clock = { t: 1.8e9 };
  const now = () => clock.t;
  const claims = K.memoryClaims({ now });
  assert.deepEqual(await K.findRoom(claims, "12a4", now()), { ok: false, why: "合言葉は数字4けた" });
  assert.deepEqual(await K.findRoom(claims, "1234", now()), { ok: false, why: "その合言葉の部屋がない" });
  const old = K.newMatchId();
  assert.equal((await K.hostRoom(claims, { code: "1234", matchId: old, level: "N5", timeLimit: 300, version: "x", nowSec: now() })).code, "1234");
  clock.t += K.ROOM_LOBBY_TTL_SEC + 1;
  assert.equal((await K.findRoom(claims, "1234", now())).ok, false, "時間がたった合言葉は効かない");
  const neu = K.newMatchId();
  const h = await K.hostRoom(claims, { code: "1234", matchId: neu, level: "N5", timeLimit: 300, version: "x", nowSec: now() });
  assert.equal(h.code, "1234", "古い部屋の合言葉は使い回せる");
  assert.equal((await K.findRoom(claims, "1234", now())).matchId, neu);
  // いま使われている合言葉は避ける
  let k = 0; const seqRand = () => [0.0, 0.0, 0.5][k++ % 3]; // 1000, 1000, 5500
  await K.hostRoom(claims, { code: "1000", matchId: K.newMatchId(), level: "N5", timeLimit: 300, version: "x", nowSec: now() });
  const h2 = await K.hostRoom(claims, { matchId: K.newMatchId(), level: "N5", timeLimit: 300, version: "x", nowSec: now(), rand: seqRand });
  assert.equal(h2.code, "5500", "使われている 1000 を避けた");
  claims.setDown(true);
  assert.equal((await K.findRoom(claims, "1234", now())).why, "つながらない");
});

test("合言葉の部屋：止めたら（stop）、そのあと届いた行は反映しない", async () => {
  const { A, B } = pair("m-stop");
  A.c.stop();
  setHand(B.g, B.g.me, "一二");
  B.g.me.takes = 1;
  assert.equal((await B.c.take(B.g.field[0].id)).ok, true);
  assert.equal(B.g.field[0].n, 1);
  assert.equal(A.g.field[0].n, 0, "A の場は変わらない");
});

test("KJ-037 合言葉の部屋でも、続けて3回はじかれるとヒントが出る（相手が先に放った言葉は狙わない）", () => {
  const { A } = pair();
  setHand(A.g, A.g.me, "休日山川");
  for (let i = 0; i < 3; i++) A.g.tried(A.g.me, ["休", "山"], "辞書にない");
  assert.equal(A.g.hintActive().tier, 1);
  assert.equal(A.g.hintActive().word, "休日");
  assert.ok(A.g.log.some((e) => e.op === "ヒント"));
  assert.equal(A.g.remoteRelease("休日", 3, 3), true); // 相手が先に放った
  assert.equal(A.g.hintActive(), null, "相手が放った言葉の光りは消える");
  for (let i = 0; i < 3; i++) A.g.tried(A.g.me, ["休", "山"], "辞書にない");
  assert.notEqual(A.g.hintActive().word, "休日", "相手が放った言葉は狙わない");
});

test("KJ-039 合言葉の部屋でも：取りきるまで次の手ができない・上の段が8でもストックへ取れる", async () => {
  const { A, B } = pair();
  setHand(A.g, A.g.me, "学生山川口人木日"); // 上の段8
  const ids = A.g.me.cards.slice(0, 2).map((x) => x.id);
  const r = await A.c.release(ids);
  assert.equal(r.ok, true);
  assert.equal(A.g.me.takes, 2);
  assert.equal(A.g.locked(A.g.me), true);
  assert.equal(A.g.split(A.g.me, [A.g.me.cards[0].id]).why, "場から取りきるまで動けない");
  assert.equal(A.g.canRelease(A.g.me, A.g.me.cards.slice(0, 2).map((x) => x.id)).why, "場から取りきるまで動けない");
  assert.equal(A.g.redraw(A.g.me).why, "場から取りきるまで動けない");
  // 上の段が埋まったら、あとはストックへ
  const t1 = await A.c.take(A.g.field[0].id);
  assert.equal(t1.ok, true);
  assert.equal(A.g.handCount(A.g.me), 6 + 1);
  setHand(A.g, A.g.me, "山川口人木日火水"); // 上の段8
  A.g.me.takes = 1;
  const t2 = await A.c.take(A.g.field[0].id);
  assert.equal(t2.ok, true);
  assert.equal(t2.card.tray, true, "上の段が8なら、取った札はストックへ");
  assert.equal(A.g.handCount(A.g.me), 8);
  assert.equal(A.g.trayCount(A.g.me), 1);
  assert.equal(A.g.locked(A.g.me), false, "取りきったら動ける");
  void B;
});
