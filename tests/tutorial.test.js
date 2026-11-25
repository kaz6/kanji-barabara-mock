// チュートリアル（KJ-043）：決まった手札・場で8段を通せる／その手だけ通す／時間なし・CPU なし／ログ（play_logs の行）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T4, T } = require("./helpers.js");

function newTut(clock = { t: 1000 }) {
  const tut = K.createTutorial(D, T4, { now: () => clock.t, date: () => new Date(2026, 10, 23, 10, 0, 0) });
  tut.clock = clock;
  return tut;
}
const ids = (g, chars) => [...chars].map((c) => { const x = g.me.cards.find((y) => y.c === c); assert.ok(x, `${c} が手札・ストックにある`); return x.id; });
// 放ったあと場から取りきる（取る手は遊びの決まりのとおり。画面と同じに、取るたびに advance）
function takeAll(tut) {
  const g = tut.g;
  let n = 0;
  while (g.me.takes > 0) {
    const r = g.take(g.me, g.field[0].id);
    assert.ok(r.ok, "取れる：" + r.why);
    tut.advance("take");
    n++;
  }
  return n;
}
// 段を1つ進める（画面と同じ順：blocked → 決まりの操作 → advance）。step ごとの手
const PLAY = {
  release(tut, a) {
    const g = tut.g, text = a.word;
    assert.equal(tut.blocked("release", { text }), null);
    const r = g.release(g.me, ids(g, text));
    assert.ok(r.ok, r.why); tut.advance("release");
  },
  split(tut, a) { const g = tut.g; assert.equal(tut.blocked("split", { chars: a.use }), null); const r = g.split(g.me, ids(g, a.use.join(""))); assert.ok(r.ok, r.why); tut.advance("split"); },
  invert(tut, a) { const g = tut.g; assert.equal(tut.blocked("invert", { chars: a.use }), null); const r = g.invert(g.me, ids(g, a.use.join(""))); assert.ok(r.ok, r.why); tut.advance("invert"); },
  cycle(tut, a) { const g = tut.g; assert.equal(tut.blocked("cycle", { chars: a.use }), null); const r = g.cycle(g.me, ids(g, a.use.join(""))); assert.ok(r.ok, r.why); tut.advance("cycle"); },
  homophone(tut, a) {
    const g = tut.g;
    assert.equal(tut.blocked("homophone", { chars: a.use }), null);
    assert.equal(tut.blocked("homophone", { chars: a.use, pick: a.pick }), null);
    const r = g.homophone(g.me, ids(g, a.use.join("")), a.pick); assert.ok(r.ok, r.why); tut.advance("homophone");
  },
  join(tut, a) {
    const g = tut.g;
    assert.equal(tut.blocked("join", { from: a.from, to: a.to, face: a.face }), null);
    const [from] = ids(g, a.from), [to] = ids(g, a.to);
    const r = g.joinFace(g.me, from, to, a.face); assert.ok(r.ok, r.why); tut.advance("join");
  },
  take(tut) { takeAll(tut); },
};
function playAll(tut, onStep) {
  let guard = 0;
  while (!tut.atEnd() && guard++ < 40) {
    if (tut.g.me.takes > 0 && tut.act().op !== "take") { takeAll(tut); continue; }
    const a = tut.act();
    PLAY[a.op](tut, a);
    if (onStep) onStep(a);
  }
}

test("データ：チュートリアルの手札・ストック・場・段（data/tutorial.json）", () => {
  const TD = D.tutorial;
  assert.ok(TD.version);
  assert.equal(TD.level, "N4", "好 は N4 の字なので、チュートリアルは N4 の表で動かす");
  assert.equal(TD.hand.length, D.rules.hand_max, "手札は上の段いっぱい");
  assert.ok(TD.hand.length + TD.stock.length <= D.rules.hand_max + D.rules.split_extra);
  assert.equal(TD.field.length, D.rules.field_size);
  assert.ok(TD.refill.length >= 12, "6回放って12枚取る分の補充");
  assert.equal(TD.steps.length, 8);
  assert.deepEqual(TD.steps.map((s) => s.title), ["放つ", "取る", "割る", "くっつける", "反転", "巡り", "同音", "おわり"]);
  for (const s of TD.steps) for (const a of s.actions) assert.ok(a.line && a.line.length <= 40, `1行（40字まで）：${a.line}`);
  for (const w of ["大雨", "女子", "古本", "上手", "火山", "気分"]) assert.ok(T4.WORDS.has(w), w + " は N4 の語にある");
  assert.ok(TD.ui.button && TD.ui.skip && TD.ui.go);
  // 札の字は、手札・ストック・場・補充のどれかに出てくる字だけ
  for (const c of [...TD.hand, ...TD.stock, ...TD.field, ...TD.refill]) assert.ok(K.isChar(T4, c), c + " は字として出る");
  for (const c of [...TD.field, ...TD.refill]) assert.ok(T4.CHARS.has(c), c + " は N4 の字（山に入る字）");
});

test("はじまり：決まった手札8・ストック4・場3。時間なし・CPU なし・ストックの部品は入らない", () => {
  const tut = newTut(), g = tut.g;
  assert.equal(g.opponent, "tutorial");
  assert.equal(g.tutorial, true);
  assert.equal(g.solo, true, "CPU は出ない");
  assert.equal(g.me.cards.filter((x) => !x.tray).map((x) => x.c).join(""), D.tutorial.hand.join(""));
  assert.equal(g.me.cards.filter((x) => x.tray).map((x) => x.c).join(""), D.tutorial.stock.join(""));
  assert.equal(g.field.map((x) => x.c).join(""), D.tutorial.field.join(""));
  assert.equal(tut.stepNo(), 1);
  assert.equal(tut.title(), "放つ");
  assert.equal(tut.atEnd(), false);
  // 時間は動かない：2時間たっても終わらない・待ち時間の表示もない
  tut.clock.t += 7200;
  assert.equal(g.tick(), false);
  assert.equal(g.over, false);
  assert.equal(g.cpuTurn(), null);
});

test("8段を通して終われる：各段の秒数がログに残り、画面と同じ順で本番へ", () => {
  const tut = newTut(), g = tut.g;
  const seen = [];
  const sec = () => { tut.clock.t += 3; };
  playAll(tut, (a) => { seen.push(a.op); sec(); });
  assert.deepEqual(seen, ["release", "take", "split", "release", "join", "release", "invert", "release", "cycle", "release", "homophone", "release"]);
  assert.equal(tut.atEnd(), true);
  assert.equal(tut.stepNo(), 8);
  assert.equal(tut.info.done, 7);
  assert.equal(tut.info.secs.length, 7);
  assert.ok(tut.info.secs.every((s) => s >= 0));
  assert.deepEqual([...g.used].sort(), ["古本", "大雨", "女子", "上手", "気分", "火山"].sort());
  // 放った語の点：2字3点×6
  assert.equal(g.me.score, 18);
  assert.equal(tut.finish("done"), true);
  assert.equal(g.over, true);
  assert.equal(tut.info.finished, "done");
  const rows = g.log.filter((e) => e.op === "段");
  assert.equal(rows.length, 7);
  assert.match(rows[0].note, /^1 放つ：\d+(\.\d+)?秒$/);
  assert.match(rows[2].note, /^3 割る：/);
  assert.ok(g.log.some((e) => e.op === "終わり" && /チュートリアルを終えた（7段が済み/.test(e.note)));
  // 手札・ストックは16マスを超えない
  assert.ok(g.me.cards.length <= 16);
});

test("N5 の表では 好 が割れない（チュートリアルは N4 の表で動かす理由）", () => {
  assert.equal(T.parts["好"], undefined);
  assert.deepEqual(T4.parts["好"], ["女", "子"]);
});

test("その手だけ通す：いまの段の手以外は理由つきではじく", () => {
  const tut = newTut();
  // 段1（放つ・大雨）
  assert.match(tut.blocked("split", { chars: ["好"] }), /いまは使わない（チュートリアル 1：放つ）/);
  assert.match(tut.blocked("invert", { chars: ["下"] }), /いまは使わない/);
  assert.match(tut.blocked("redraw"), /いまは使わない/);
  assert.match(tut.blocked("join", { from: "十", to: "口", face: "top" }), /いまは使わない/);
  assert.match(tut.blocked("release", { text: "天上" }), /いまは 大 → 雨 を使う/);
  assert.equal(tut.blocked("release", { text: "雨大" }) !== null, true, "順がちがう");
  assert.equal(tut.blocked("release", { text: "大雨" }), null);
  assert.equal(tut.blocked("take"), null, "取るは遊びの決まり（取れる枚数）が見る");
  // 光る札・ボタン・選べる札
  assert.deepEqual(tut.glow(), { chars: ["大", "雨"], button: "bRelease", pick: null });
  assert.equal(tut.canSelect("大"), true);
  assert.equal(tut.canSelect("好"), false);
  assert.equal(tut.canDrag("十"), false);
  assert.equal(tut.buttonOn("bRelease"), true);
  assert.equal(tut.buttonOn("bSplit"), false);
  assert.equal(tut.buttonOn("bRedraw"), false);
});

test("放ったあと、取りきるまで：案内は取る。ほかの手は決まりで止まる。取りきると次へ", () => {
  const tut = newTut(), g = tut.g;
  PLAY.release(tut, tut.act());
  assert.equal(g.me.takes, 2);
  assert.equal(tut.act().op, "take");
  assert.equal(tut.stepNo(), 2);
  assert.match(tut.line(), /場の札を2枚タップして取る/);
  assert.equal(g.split(g.me, ids(g, "好")).ok, false, "取りきるまで割れない");
  assert.equal(tut.canSelect("好"), false);
  assert.equal(tut.buttonOn("bRelease"), false);
  assert.equal(g.take(g.me, g.field[0].id).ok, true);
  assert.equal(tut.advance("take"), false, "1枚ではまだ");
  assert.equal(tut.act().op, "take");
  assert.equal(g.take(g.me, g.field[0].id).ok, true);
  assert.equal(tut.advance("take"), true);
  assert.equal(tut.stepNo(), 3);
  assert.equal(tut.title(), "割る");
  assert.equal(tut.info.done, 2);
  // 場は決まった補充の順で出る
  // 取ったところ（左端）に補充が出る：1枚目で refill[0]、それを取って refill[1]
  assert.deepEqual(g.field.map((x) => x.c), [D.tutorial.refill[1], D.tutorial.field[1], D.tutorial.field[2]]);
});

test("段3 以降の放ったあとの取るは、案内だけ取るに替わり、段は進んだまま", () => {
  const tut = newTut(), g = tut.g;
  playAll(tut, (a) => { if (a.op === "release" && tut.stepNo() >= 3) { /* 取る前 */ } });
  // 段を1つずつ見て確かめる（最初から手で）
  const t2 = newTut(), g2 = t2.g;
  PLAY.release(t2, t2.act()); takeAll(t2);
  PLAY.split(t2, t2.act());
  assert.equal(g2.me.cards.some((x) => x.c === "好"), false);
  assert.match(t2.line(), /女 → 子 の順に選んで、Play（女子）/);
  PLAY.release(t2, t2.act());
  assert.equal(g2.me.takes, 2);
  assert.equal(t2.stepNo(), 4);
  assert.match(t2.line(), /場から自動で取る（あと 2 枚）/);
  assert.equal(t2.glow().chars.length, 0, "取るあいだは札もボタンも光らせない");
  assert.equal(t2.autoPending(), true, "段2 のあとは自動で取る番");
  takeAll(t2);
  assert.match(t2.line(), /十 を指で引きずって/);
  assert.equal(tut.atEnd(), true);
  assert.equal(g.over, false);
});

test("くっつける：十 を 口 の上の面にだけ通す。ほかの面・別の札・ボタンの Join は通さない", () => {
  const t = newTut(), g = t.g;
  PLAY.release(t, t.act()); takeAll(t); PLAY.split(t, t.act()); PLAY.release(t, t.act()); takeAll(t);
  assert.equal(t.act().op, "join");
  assert.equal(t.canDrag("十"), true);
  assert.equal(t.canDrag("口"), false);
  assert.deepEqual(t.glow().chars, ["十", "口"]);
  assert.equal(t.glow().button, null, "引きずる手なのでボタンは光らない");
  assert.match(t.blocked("join", { from: "十", to: "口", face: "center" }), /十 を 口 の上の面に/);
  assert.match(t.blocked("join", { from: "十", to: "口", face: null }), /チュートリアル：いまは/);
  assert.match(t.blocked("join", { from: "口", to: "十", face: "top" }), /チュートリアル：いまは/);
  assert.notEqual(t.blocked("join", { chars: ["十", "口"] }), null);
  assert.match(t.blocked("join", { from: "十", to: "口", face: "center" }), /上の面/);
  // ボタンの Join は段4 では通さない
  assert.match(t.blocked("join", {}), /チュートリアル/);
  PLAY.join(t, t.act());
  assert.equal(g.me.cards.some((x) => x.c === "古"), true);
  assert.equal(g.me.cards.some((x) => x.c === "十" || x.c === "口"), false);
  assert.match(t.line(), /古 → 本 の順に選んで/);
});

test("同音：木 の選びで 気 だけ通す", () => {
  const t = newTut();
  while (t.act().op !== "homophone") {
    if (t.g.me.takes > 0) { takeAll(t); continue; }
    PLAY[t.act().op](t, t.act());
  }
  takeAll(t);
  assert.equal(t.blocked("homophone", { chars: ["木"] }), null);
  assert.match(t.blocked("homophone", { chars: ["木"], pick: "本" }), /木 → 気/);
  assert.match(t.blocked("homophone", { chars: ["月"] }), /木 → 気/);
  assert.deepEqual(t.glow(), { chars: ["木"], button: "bHomo", pick: "気" });
  assert.equal(t.g.homophone(t.g.me, ids(t.g, "木"), "気").ok, true);
});

test("とばす：どの段でも終えられる。ログに「とばす」と段が残り、1手も動かなくても play_logs の行ができる", () => {
  const t = newTut(), g = t.g;
  assert.equal(K.playLogRow(g, "dev-0001"), null, "とばしていない・1手も動いていない");
  assert.equal(t.finish("done"), false, "おわりの段まで来ていないと「本番へ」は通らない");
  assert.equal(t.finish("skip"), true);
  assert.equal(t.finish("skip"), false);
  assert.equal(g.over, true);
  const row = K.playLogRow(g, "dev-0001");
  assert.ok(row, "とばしたことは1手も動かなくても送る");
  assert.equal(row.opponent, "tutorial");
  assert.equal(row.level, "N4");
  assert.match(row.result, /^チュートリアル（とばした・8段のうち 1 段まで・0段が済み）$/);
  assert.match(row.log, /\tとばす\t/);
  assert.match(row.log, /# 相手 チュートリアル/);
  assert.match(row.log, /# 時間 なし（チュートリアル）/);
  assert.match(row.log, /# データ .*tutorial=/);
});

test("途中でやめた・終えた：play_logs の行の result に、どの段まで進んだかが出る", () => {
  const a = newTut();
  PLAY.release(a, a.act()); takeAll(a); PLAY.split(a, a.act());
  const mid = K.playLogRow(a.g, "d");
  assert.match(mid.result, /^チュートリアル（途中でやめた・8段のうち 3 段まで・2段が済み）$/);
  assert.match(mid.log, /\t段\t[^\n]*\t1 放つ：/);
  const b = newTut();
  playAll(b);
  assert.equal(b.finish("done"), true);
  const done = K.playLogRow(b.g, "d");
  assert.match(done.result, /^チュートリアル（終えた・8段のうち 8 段まで・7段が済み）$/);
  assert.ok(done.log.length < K.PLAY_LOG_LIMITS.log);
});

test("はじかれた手は「ためした」に残る（その手の理由つき）。自動のヒントは出ない", () => {
  const t = newTut(), g = t.g;
  for (let i = 0; i < 5; i++) {
    const why = t.blocked("split", { chars: ["好"] });
    g.triedOp(g.me, "割る", ["好"], why);
  }
  const rows = g.log.filter((e) => e.op === "ためした");
  assert.equal(rows.length, 1, "同じ理由は1行にまとまる");
  assert.match(rows[0].note, /割る：いまは使わない（チュートリアル 1：放つ） ×5/);
  // g.tried（辞書にない並びなど）を3回しても、ヒントは出ない
  for (let i = 0; i < 4; i++) g.tried(g.me, ["天", "上"], "辞書にない");
  assert.equal(g.hintActive(), null);
  assert.equal(g.log.some((e) => e.op === "ヒント"), false);
  // KJ-086：放たずに時限（hint.timed_sec）がたっても、チュートリアルには出ない（チュートリアルは自分の光りを出す）
  t.clock.t += D.rules.hint.timed_sec * 3; g.tick();
  assert.equal(g.timedHint(), false);
  assert.equal(g.hintActive(), null);
  assert.equal(g.log.some((e) => e.op === "ヒント"), false);
  assert.equal(g.log.some((e) => e.op === "動けない"), false);
});

test("ふつうの試合には出ない：createGame の相手・時間は変わらない。ログの送り先 opponent は tutorial", () => {
  const g = K.createGame(D, T4, { now: () => 1, opponent: "weak" });
  assert.equal(g.tutorial, false);
  assert.equal(g.tutorialInfo, undefined);
  assert.equal(g.opponent, "weak");
  assert.equal(K.OPPONENTS.some((o) => o.key === "tutorial"), false, "相手の選びには出さない");
  assert.equal(K.TUTORIAL_OPPONENT.key, "tutorial");
});

// KJ-046（D-060）：段7（同音）の 気分 を放ったあと、取りきるまでは「8/8 おわり」に進まない
test("段7 の 気分 のあと：取りきるまで段7 のまま、取りきったら段8（おわり）。ほかの段は今まで通り", () => {
  const tut = newTut(), g = tut.g;
  while (!(tut.act().op === "release" && tut.act().word === "気分")) {
    if (g.me.takes > 0 && tut.act().op !== "take") { takeAll(tut); continue; }
    PLAY[tut.act().op](tut, tut.act());
  }
  assert.equal(tut.stepNo(), 7);
  assert.equal(tut.title(), "同音");
  PLAY.release(tut, tut.act());
  assert.equal(g.me.takes, 2);
  assert.equal(tut.act().op, "end", "手の順は次の段へ進んでいる");
  assert.equal(tut.stepNo(), 7, "取りきるまで画面の段は 7");
  assert.equal(tut.title(), "同音");
  assert.equal(tut.atEnd(), false);
  assert.match(tut.line(), /場から自動で取る（あと 2 枚）/);
  assert.equal(tut.autoTake().ok, true);
  assert.equal(tut.stepNo(), 7, "1枚ではまだ");
  assert.equal(tut.autoTake().ok, true);
  assert.equal(tut.stepNo(), 8);
  assert.equal(tut.title(), "おわり");
  assert.equal(tut.atEnd(), true);
});

test("段7 の取りきる前にとばす：ログは 7 同音 でとばした（8 おわり ではない）", () => {
  const tut = newTut(), g = tut.g;
  while (!(tut.act().op === "release" && tut.act().word === "気分")) {
    if (g.me.takes > 0 && tut.act().op !== "take") { takeAll(tut); continue; }
    PLAY[tut.act().op](tut, tut.act());
  }
  PLAY.release(tut, tut.act());
  assert.equal(tut.finish("skip"), true);
  assert.ok(g.log.some((e) => e.op === "とばす" && /^7 同音でとばした/.test(e.note)), g.log.map((e) => e.note).join("|"));
});

// KJ-055（D-071）：段2（取る）のあと、放ったあとは場の左から自動で取る。段2 は人が取る。本番の決まりは変えない
test("自動取り：段2 は人が取る（自動にならない）。段3 以降の放ったあとは自動の番", () => {
  const tut = newTut(), g = tut.g;
  PLAY.release(tut, tut.act());
  assert.equal(g.me.takes, 2);
  assert.equal(tut.act().op, "take", "段2：取る");
  assert.equal(tut.autoPending(), false, "段2 は人がタップして取る");
  assert.equal(tut.autoTake().ok, false, "段2 では自動で取らない");
  assert.equal(g.me.takes, 2);
  assert.match(tut.line(), /場の札を2枚タップして取る/);
  takeAll(tut);
  PLAY.split(tut, tut.act()); PLAY.release(tut, tut.act());
  assert.equal(tut.autoPending(), true, "段3 の 女子 のあとは自動");
});

test("自動取り：場の左の札から1枚ずつ。ログの「取る」に「チュートリアルで自動」。取りきったら次の案内。段8 まで通せる", () => {
  const tut = newTut(), g = tut.g;
  let autoTaken = 0, humanTaken = 0;
  while (!tut.atEnd()) {
    if (tut.autoPending()) {
      const first = g.field[0].c, hand0 = g.me.cards.length;
      const r = tut.autoTake();
      assert.ok(r.ok, r.why);
      assert.equal(r.c, first, "場の左の札を取る");
      assert.equal(g.me.cards.length, hand0 + 1);
      autoTaken++;
      continue;
    }
    const a = tut.act();
    if (a.op === "take") { takeAll(tut); humanTaken += 2; continue; }
    PLAY[a.op](tut, a);
  }
  assert.equal(humanTaken, 2, "人が取るのは段2 の2枚だけ");
  assert.equal(autoTaken, 10, "放った 女子・古本・上手・火山・気分 の10字ぶん");
  assert.equal(g.me.takes, 0);
  assert.equal(tut.stepNo(), 8);
  const takes = g.log.filter((e) => e.op === "取る");
  assert.equal(takes.length, 12);
  assert.equal(takes.filter((e) => /チュートリアルで自動/.test(e.note)).length, 10, "自動の行にメモ");
  assert.equal(takes.filter((e) => !/チュートリアルで自動/.test(e.note)).length, 2, "段2 の人の取りにはメモなし");
});

test("自動取り：終えた・とばしたあとは取らない。本番（チュートリアルでない試合）の take は今まで通り、メモなし", () => {
  const tut = newTut(), g = tut.g;
  PLAY.release(tut, tut.act()); takeAll(tut); PLAY.split(tut, tut.act()); PLAY.release(tut, tut.act());
  assert.equal(tut.autoPending(), true);
  assert.equal(tut.finish("skip"), true);
  assert.equal(tut.autoPending(), false);
  assert.equal(tut.autoTake().ok, false);
  const real = K.createGame(D, T, { now: () => 1000 });
  assert.equal(typeof real.take, "function");
  assert.equal(real.tutorialInfo, undefined, "本番の試合には自動取りの仕組みがない");
  assert.equal(real.autoPending, undefined);
  assert.equal(real.autoTake, undefined);
  // 本番で実際に放って取る：取るのは人の呼び出しだけで、ログのメモに「チュートリアルで自動」は付かない
  let done = false;
  for (let seed = 1; seed <= 200 && !done; seed++) {
    let x = seed;
    const g = K.createGame(D, T, { now: () => 1000, rand: () => ((x = (x * 16807) % 2147483647) / 2147483647) });
    const cs = g.me.cards;
    for (const a of cs) for (const b of cs) {
      if (done || a.id === b.id || !g.canRelease(g.me, [a.id, b.id]).ok) continue;
      assert.equal(g.release(g.me, [a.id, b.id]).ok, true);
      assert.equal(g.me.takes, 2, "放っただけでは取らない（自動で取らない）");
      assert.equal(g.take(g.me, g.field[0].id).ok, true);
      const e = g.log.filter((l) => l.op === "取る");
      assert.equal(e.length, 1);
      assert.doesNotMatch(e[0].note, /チュートリアルで自動/);
      done = true;
    }
  }
  assert.equal(done, true, "2字の言葉が放てる手札が見つかる");
});
