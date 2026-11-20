// 遊びの決まり（KJ-002 の5）：割る・くっつける・届き方・投げ済み・待ち時間・切り替え・ログ
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");

test("最初の手：二人とも6枚で、袋の同じ字は2枚まで", () => {
  const g = newGame();
  for (const p of [g.me, g.cpu]) {
    assert.equal(p.cards.length, D.rules.start_hand);
    const count = {};
    for (const c of [...p.cards.map((x) => x.c), ...p.bag]) count[c] = (count[c] || 0) + 1;
    assert.ok(Object.values(count).every((n) => n === D.rules.same_char_max_in_start));
  }
});

test("割る：休→人木、吾→五口。一段だけ", () => {
  const g = newGame();
  let [id] = setHand(g, g.me, "休");
  let r = g.split(g.me, [id]);
  assert.ok(r.ok);
  assert.equal(chars(g.me.cards), "人木");
  [id] = setHand(g, g.me, "語");
  r = g.split(g.me, [id]);
  assert.equal(chars(r.cards), "言吾", "語 は一段で 言 吾 まで");
});

test("割る：部品表にない字は割れない", () => {
  const g = newGame();
  const [id] = setHand(g, g.me, "一");
  assert.equal(g.split(g.me, [id]).ok, false);
  assert.equal(chars(g.me.cards), "一");
});

test("くっつける：左→右の順だけ（人木=休、木人 はくっつかない）", () => {
  const g = newGame();
  let ids = setHand(g, g.me, "人木");
  assert.equal(chars(g.join(g.me, ids).cards), "休");
  ids = setHand(g, g.me, "木人");
  const r = g.join(g.me, ids);
  assert.equal(r.ok, false);
  assert.equal(r.why, "並べる順が逆");
});

test("くっつける：上=卜一、下=一卜", () => {
  const g = newGame();
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "卜一")).cards), "上");
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "一卜")).cards), "下");
  assert.equal(K.joinReversed(T, "一", "卜"), false, "どちらの順でもくっつくなら『逆』とは出さない");
});

test("くっつける：口・十 は「並べる順が逆」、十・口 は 古 か 田 を選ぶ（R-016）", () => {
  assert.equal(K.joinReversed(T, "口", "十"), true);
  assert.deepEqual(K.joinResults(T, "十", "口"), ["古", "田"]);
  const g = newGame();
  let ids = setHand(g, g.me, "十口");
  assert.equal(chars(g.join(g.me, ids, "古").cards), "古");
  ids = setHand(g, g.me, "十口");
  assert.equal(chars(g.join(g.me, ids, "田").cards), "田");
  ids = setHand(g, g.me, "十口");
  assert.equal(g.join(g.me, ids, "木").ok, false);
});

test("くっつける：3枚の字は中継ぎを経由して二回（十口→田、田力→男。D-016）", () => {
  const g = newGame();
  const ids = setHand(g, g.me, "十口力");
  const r1 = g.join(g.me, ids.slice(0, 2), "田");
  const r2 = g.join(g.me, [r1.cards[0].id, ids[2]]);
  assert.equal(chars(r2.cards), "男");
});

test("届き方：1〜2字はそのまま、3字は一段、4字は二段（D-004）", () => {
  assert.deepEqual(K.delivered(T, "休"), ["休"]);
  assert.deepEqual(K.delivered(T, "休日"), ["休", "日"]);
  assert.deepEqual(K.delivered(T, "一日中"), ["一", "日", "口", "｜"]);
  assert.equal(K.delivered(T, "天上天下").join(""), "一一人卜一一一人一卜");
});

test("投げる：相手のカゴに届き、自分のカゴから消える", () => {
  const g = newGame();
  const ids = setHand(g, g.me, "休日");
  setHand(g, g.cpu, "一");
  const r = g.throw(g.me, ids);
  assert.ok(r.ok);
  assert.equal(chars(g.cpu.cards), "一休日");
  assert.ok(g.cpu.cards.slice(1).every((x) => x.fresh));
  assert.equal(g.me.cards.length, D.rules.refill_when_empty, "空になったら袋から補充");
});

test("投げる：辞書にない並び・部品だけは投げられない", () => {
  const g = newGame();
  assert.equal(g.throw(g.me, setHand(g, g.me, "日休")).why, "辞書にない");
  assert.equal(g.throw(g.me, setHand(g, g.me, "卜")).why, "部品は投げられない");
});

test("投げ済み：一度投げた語は二人とも投げられない。1字で投げた字も（R-011）", () => {
  const g = newGame();
  setHand(g, g.cpu, "");
  assert.ok(g.throw(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.throw(g.cpu, setHand(g, g.cpu, "休日")).why, "投げ済み");
  assert.ok(g.throw(g.me, setHand(g, g.me, "休")).ok);
  assert.equal(g.throw(g.cpu, setHand(g, g.cpu, "休")).why, "投げ済み");
  assert.ok(g.throw(g.cpu, setHand(g, g.cpu, "日")).ok, "日 はまだ投げていない");
});

test("待ち時間：反転10秒・巡り3秒・同音20秒。二人は別々", () => {
  const g = newGame();
  let [id] = setHand(g, g.me, "上");
  assert.equal(chars(g.invert(g.me, [id]).cards), "下");
  [id] = setHand(g, g.me, "上");
  assert.equal(g.invert(g.me, [id]).why, "待ち時間");
  const [cid] = setHand(g, g.cpu, "上");
  assert.ok(g.invert(g.cpu, [cid]).ok, "CPU の待ち時間は別");
  g.clock.t += D.rules.cooldown_sec.invert - 0.1;
  assert.equal(g.invert(g.me, [id]).ok, false);
  g.clock.t += 0.2;
  assert.ok(g.invert(g.me, [id]).ok);

  [id] = setHand(g, g.me, "十");
  assert.equal(chars(g.cycle(g.me, [id]).cards), "一", "数の巡りは十から一へ");
  [id] = setHand(g, g.me, "日");
  assert.equal(g.cycle(g.me, [id]).ok, false);
  g.clock.t += D.rules.cooldown_sec.cycle;
  assert.equal(chars(g.cycle(g.me, [id]).cards), "月", "曜日の巡りは日から月へ");

  [id] = setHand(g, g.me, "言");
  assert.ok(K.homoChars(T, "言").includes("出"));
  assert.ok(g.homophone(g.me, [id], "出").ok);
  [id] = setHand(g, g.me, "言");
  assert.equal(g.homophone(g.me, [id], "出").why, "待ち時間");
  g.clock.t += D.rules.cooldown_sec.homophone;
  assert.ok(g.homophone(g.me, [id], "出").ok);
  assert.equal(g.homophone(g.me, setHand(g, g.me, "言"), "木").ok, false, "同じ読みでない字には変えられない");
});

test("あふれ：相手が 20 マスを超えたら投げた人の勝ち", () => {
  const g = newGame();
  setHand(g, g.cpu, "一".repeat(19));
  g.throw(g.me, setHand(g, g.me, "休日"));
  assert.equal(g.over, true);
  assert.equal(g.winner, g.me);
  assert.equal(g.throw(g.me, setHand(g, g.me, "日")).ok, false, "終わったら動かせない");
});

test("切り替え：初期値は KJ-001 の形（投げる・落ちてこない・2〜4秒）", () => {
  assert.deepEqual(K.normalizeSettings({}), { dest: "throw", drop: "off", cpuPace: "normal" });
  assert.deepEqual(K.normalizeSettings({ dest: "xxx", drop: "on" }), { dest: "throw", drop: "on", cpuPace: "normal" });
  const g = newGame();
  g.clock.t += 60;
  assert.equal(g.tick(), false, "落ちてこない");
  for (let i = 0; i < 50; i++) { const d = g.cpuDelay(); assert.ok(d >= 2 && d <= 4); }
});

test("切り替え：消える＝相手には何も起きない", () => {
  const g = newGame({ dest: "vanish" });
  setHand(g, g.cpu, "一");
  const r = g.throw(g.me, setHand(g, g.me, "一日中"));
  assert.ok(r.ok);
  assert.deepEqual(r.pieces, []);
  assert.equal(chars(g.cpu.cards), "一", "相手のカゴは変わらない");
  assert.equal(g.throw(g.cpu, setHand(g, g.cpu, "一日中")).why, "投げ済み", "消えても投げ済みにはなる（D-005）");
});

test("切り替え：消えておじゃま札＝相手に ■ が字数ぶん。■ は割れず・くっつかず・投げられない", () => {
  const g = newGame({ dest: "garbage" });
  setHand(g, g.cpu, "");
  assert.ok(g.throw(g.me, setHand(g, g.me, "天上天下")).ok);
  assert.equal(chars(g.cpu.cards), "■■■■");
  const ids = g.cpu.cards.map((x) => x.id);
  assert.equal(g.split(g.cpu, [ids[0]]).ok, false);
  assert.equal(g.join(g.cpu, ids.slice(0, 2)).ok, false);
  assert.equal(g.throw(g.cpu, [ids[0]]).why, "■ は使えない");
  assert.equal(K.marks(T, K.GARBAGE), "");
});

test("切り替え：時間で落ちてくる＝8秒ごとに二人とも袋から1枚", () => {
  const g = newGame({ drop: "on" });
  const n = g.me.cards.length, m = g.cpu.cards.length;
  g.clock.t += 7.9;
  assert.equal(g.tick(), false);
  g.clock.t += 0.2;
  assert.equal(g.tick(), true);
  assert.equal(g.me.cards.length, n + 1);
  assert.equal(g.cpu.cards.length, m + 1);
  g.clock.t += 16;
  g.tick();
  assert.equal(g.me.cards.length, n + 3, "まとめて進んでも回数ぶん落ちる");
});

test("切り替え：落ちてきてあふれたら負け。二人同時なら引き分け", () => {
  let g = newGame({ drop: "on" });
  setHand(g, g.me, "一".repeat(20));
  setHand(g, g.cpu, "一".repeat(5));
  g.clock.t += 8;
  g.tick();
  assert.equal(g.winner, g.cpu);
  g = newGame({ drop: "on" });
  setHand(g, g.me, "一".repeat(20));
  setHand(g, g.cpu, "一".repeat(20));
  g.clock.t += 8;
  g.tick();
  assert.equal(g.over, true);
  assert.equal(g.winner, null);
});

test("切り替え：CPU の間隔 ゆっくり＝8〜12秒", () => {
  const g = newGame({ cpuPace: "slow" });
  for (let i = 0; i < 50; i++) { const d = g.cpuDelay(); assert.ok(d >= 8 && d <= 12, String(d)); }
});

test("CPU：決まった乱数で 200 手打っても壊れない（札の数が合う・投げ済みを投げない）", () => {
  for (const dest of ["throw", "vanish", "garbage"]) {
    const g = newGame({ dest, drop: "on" }, 7);
    const thrown = [];
    for (let i = 0; i < 200 && !g.over; i++) {
      g.clock.t += 3;
      g.tick();
      const r = g.cpuTurn();
      if (r && r.ok && r.text) { assert.ok(!thrown.includes(r.text), r.text); thrown.push(r.text); }
      assert.ok(g.cpu.cards.every((x) => typeof x.c === "string" && x.c.length > 0));
    }
    assert.ok(thrown.length > 0, dest + " で CPU が1度は投げる");
  }
});

test("ログ：一手ごとに 秒・どちら・手・使った札・できた札・二人のカゴの数", () => {
  const g = newGame();
  setHand(g, g.cpu, "一二");
  const ids = setHand(g, g.me, "人木日山");
  g.clock.t += 1.5;
  const r = g.join(g.me, ids.slice(0, 2));
  g.clock.t += 1;
  g.throw(g.me, [r.cards[0].id, ids[2]]);
  g.tried(g.me, ["口", "十"], "並べる順が逆");
  const ops = g.log.map((e) => e.op);
  assert.deepEqual(ops, ["はじめ", "くっつける", "投げる", "ためした"]);
  const j = g.log[1];
  assert.equal(j.t, 1.5);
  assert.equal(j.who, "あなた");
  assert.deepEqual([j.from, j.to, j.me, j.cpu], [["人", "木"], ["休"], 3, 2]);
  const t = g.log[2];
  assert.deepEqual([t.from, t.to, t.me, t.cpu, t.note], [["休", "日"], ["休", "日"], 1, 4, "相手に届く"]);
  assert.deepEqual([g.log[3].from, g.log[3].note], [["口", "十"], "並べる順が逆"]);
});

test("ログ：書き出しの頭に設定と決まりを全部書く", () => {
  const g = newGame({ dest: "garbage", drop: "on", cpuPace: "slow" });
  const text = g.logText();
  const head = text.split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /できた語の行き先=消えて、相手におじゃま札/);
  assert.match(head, /時間で落ちてくる=あり（8秒ごと/);
  assert.match(head, /CPU の間隔=ゆっくり（8〜12秒）/);
  assert.match(head, /カゴ=20/);
  assert.match(head, /反転=10秒 巡り=3秒 同音=20秒/);
  assert.match(head, /rules=2026-11-20\.2/);
  assert.match(head, /はじめた時刻 2026-11-20 18:00:00/);
  assert.match(text, /秒\tどちら\t手\t使った札\tできた札\tあなたのカゴ\tCPUのカゴ\tメモ/);
});

test("動けない：相手の手札が 古 だけで 古 を投げると、相手は動けない と残る（R-023）", () => {
  const g = newGame();
  setHand(g, g.cpu, "古");
  g.clock.t += 2;
  const ids = setHand(g, g.me, "古山");
  assert.ok(g.throw(g.me, [ids[0]]).ok);
  const e = g.log.find((x) => x.op === "動けない" && x.who === "CPU");
  assert.ok(e, "CPU の 動けない がある");
  assert.equal(e.t, 2);
  assert.deepEqual(e.from, ["古", "古"]);
  assert.match(e.note, /投げられる語なし。使える手：割る・反転/);
  assert.equal(g.log.filter((x) => x.op === "動けない" && x.who === "CPU").length, 1, "続くあいだは1回だけ");
  // 反転して 新 になれば戻る
  g.clock.t += 1;
  assert.ok(g.invert(g.cpu, [g.cpu.cards[0].id]).ok);
  const back = g.log.find((x) => x.op === "動ける" && x.who === "CPU");
  assert.ok(back);
  assert.match(back.note, /投げられる語：新/);
});

test("動けない：投げられる語があるあいだは残さない。■ だけでも動けない", () => {
  const g = newGame({ dest: "garbage" });
  setHand(g, g.cpu, "");
  assert.ok(g.throw(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.log.filter((x) => x.op === "動けない" && x.who === "あなた").length, 0, "補充された手札には投げられる字がある");
  const e = g.log.find((x) => x.op === "動けない" && x.who === "CPU");
  assert.deepEqual(e.from, ["■", "■"]);
  assert.match(e.note, /使える手：なし/);
});

test("動けない：ログの頭に手の説明がある", () => {
  assert.match(newGame().logText(), /# 手 .*動けない（投げられる語が手札に無くなった/);
});
