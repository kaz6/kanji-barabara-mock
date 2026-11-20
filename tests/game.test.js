// 遊びの決まり：割る・くっつける・待ち時間（KJ-002 から残す）と、KJ-003 の 放つ・点数・取る・使用済み・引き直し・勝ち・CPU・ログ
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");

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

test("届き方（D-004。KJ-003 の遊びでは使わないが表引きは残す）：1〜2字はそのまま、3字は一段、4字は二段", () => {
  assert.deepEqual(K.delivered(T, "休"), ["休"]);
  assert.deepEqual(K.delivered(T, "休日"), ["休", "日"]);
  assert.deepEqual(K.delivered(T, "一日中"), ["一", "日", "口", "｜"]);
  assert.equal(K.delivered(T, "天上天下").join(""), "一一人卜一一一人一卜");
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


test("はじめ：手札は二人とも8枚、場は6枚、点は0。山は N5 の字を2枚ずつ", () => {
  const g = newGame();
  assert.equal(g.me.cards.length, D.rules.start_hand);
  assert.equal(g.cpu.cards.length, D.rules.start_hand);
  assert.equal(g.field.length, D.rules.field_size);
  assert.equal(g.me.score + g.cpu.score, 0);
  const total = g.deck.length + g.field.length + g.me.cards.length + g.cpu.cards.length;
  assert.equal(total, T.N5.size * D.rules.same_char_in_deck);
});

test("割る：手札が上限の12枚なら割れない", () => {
  const g = newGame();
  const ids = setHand(g, g.me, "休" + "一".repeat(11));
  assert.equal(g.split(g.me, [ids[0]]).why, "手札がいっぱい");
  setHand(g, g.me, "休" + "一".repeat(10));
  assert.ok(g.split(g.me, [g.me.cards[0].id]).ok, "11枚なら割れて12枚になる");
  assert.equal(g.me.cards.length, 12);
});

test("点数：1字1・2字3・3字6・4字12、四字熟語は倍、特別な語はさらに倍", () => {
  assert.equal(K.scoreOf(D, T, "日").pts, 1);
  assert.equal(K.scoreOf(D, T, "休日").pts, 3);
  assert.equal(K.scoreOf(D, T, "一日中").pts, 6);
  const yoji = D.words.words.find((w) => w.yoji && !T.SPECIAL.has(w.w));
  assert.equal(K.scoreOf(D, T, yoji.w).pts, 24, yoji.w);
  const four = D.words.words.find((w) => [...w.w].length === 4 && !w.yoji);
  if (four) assert.equal(K.scoreOf(D, T, four.w).pts, 12, four.w);
  assert.equal(K.scoreOf(D, T, "天上天下").pts, 48, "四字熟語×2・特別な語×2");
  assert.match(K.scoreOf(D, T, "天上天下").how, /四字熟語×2・特別な語×2/);
});

test("放つ：点が入り、札は消え（相手には届かない）、放った字数だけ取れる", () => {
  const g = newGame();
  const ids = setHand(g, g.me, "休日山");
  setHand(g, g.cpu, "一");
  const r = g.release(g.me, ids.slice(0, 2));
  assert.ok(r.ok);
  assert.equal(r.pts, 3);
  assert.equal(g.me.score, 3);
  assert.equal(chars(g.me.cards), "山");
  assert.equal(chars(g.cpu.cards), "一", "相手の手札は変わらない");
  assert.equal(g.me.takes, 2);
});

test("放つ：辞書にない並び・部品だけは放てない。1字の N5 は放てる", () => {
  const g = newGame();
  assert.equal(g.release(g.me, setHand(g, g.me, "日休")).why, "辞書にない");
  assert.equal(g.release(g.me, setHand(g, g.me, "卜")).why, "部品は放てない");
  assert.equal(g.release(g.me, setHand(g, g.me, "玉")).why, "部品は放てない", "玉 は字として見せるが、放てる範囲は変えない");
  assert.ok(g.release(g.me, setHand(g, g.me, "山")).ok);
});

test("使用済み：一度放った言葉は二人とも二度と使えない（言葉ごと。D-005）", () => {
  const g = newGame();
  assert.ok(g.release(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.release(g.cpu, setHand(g, g.cpu, "休日")).why, "放った言葉");
  assert.equal(g.release(g.me, setHand(g, g.me, "休日")).why, "放った言葉", "自分も二度と使えない");
  assert.ok(g.release(g.cpu, setHand(g, g.cpu, "休")).ok, "休日 を放っても 休 は別の言葉");
  assert.equal(g.release(g.me, setHand(g, g.me, "休")).why, "放った言葉");
});

test("取る：場から手札へ。空いたところは同じ位置に山から出る。取れる枚数だけ", () => {
  const g = newGame();
  setHand(g, g.me, "休日");
  assert.equal(g.take(g.me, g.field[0].id).why, "取れる枚数がない");
  g.release(g.me, g.me.cards.map((x) => x.id));
  const f0 = g.field[2], deckTop = g.deck[0];
  const r = g.take(g.me, f0.id);
  assert.ok(r.ok);
  assert.equal(g.me.cards[g.me.cards.length - 1].c, f0.c);
  assert.equal(g.field.length, D.rules.field_size);
  assert.equal(g.field[2].c, deckTop, "同じ位置に山の一番上");
  assert.equal(g.me.takes, 1);
  assert.ok(g.take(g.me, g.field[0].id).ok);
  assert.equal(g.take(g.me, g.field[1].id).why, "取れる枚数がない");
});

test("取る：早い者勝ち。相手が先に取った札は取れない。手札が12枚なら取れない", () => {
  const g = newGame();
  setHand(g, g.me, "山");
  setHand(g, g.cpu, "川");
  g.release(g.me, [g.me.cards[0].id]);
  g.release(g.cpu, [g.cpu.cards[0].id]);
  const id = g.field[0].id;
  assert.ok(g.take(g.cpu, id).ok);
  assert.equal(g.take(g.me, id).why, "場にない");
  setHand(g, g.me, "一".repeat(12));
  assert.equal(g.take(g.me, g.field[1].id).why, "手札がいっぱい");
  assert.equal(g.me.takes, 1, "取れる枚数は残る");
});

test("引き直し：5点払って手札を全部入れ替える（8枚）", () => {
  const g = newGame();
  setHand(g, g.me, "古");
  g.me.score = 7;
  const r = g.redraw(g.me);
  assert.ok(r.ok);
  assert.equal(g.me.score, 2);
  assert.equal(g.me.cards.length, D.rules.start_hand);
  const e = g.log[g.log.length - 1].op === "引き直し" ? g.log[g.log.length - 1] : g.log.filter((x) => x.op === "引き直し").pop();
  assert.deepEqual([e.from, e.pts], [["古"], -5]);
});

test("引き直し：5点ない人は30秒待てば0点で入れ替わる。待つあいだも動ける", () => {
  const g = newGame();
  setHand(g, g.me, "古山");
  g.me.score = 4;
  const r = g.redraw(g.me);
  assert.equal(r.waiting, 30);
  assert.equal(g.redraw(g.me).why, "待っている");
  assert.ok(g.release(g.me, [g.me.cards[1].id]).ok, "待つあいだも放てる");
  assert.equal(g.me.score, 5);
  g.clock.t += 29.9;
  g.tick();
  assert.equal(chars(g.me.cards), "古");
  g.clock.t += 0.2;
  assert.equal(g.tick(), true);
  assert.equal(g.me.cards.length, D.rules.start_hand);
  assert.equal(g.me.score, 5, "0点で入れ替わる");
  assert.equal(g.me.redrawAt, null);
});

test("勝ち：先に50点。終わったら動かせない", () => {
  const g = newGame();
  g.me.score = 48;
  assert.ok(g.release(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.over, true);
  assert.equal(g.winner, g.me);
  assert.equal(g.release(g.cpu, setHand(g, g.cpu, "山")).ok, false);
  assert.match(g.log[g.log.length - 1].note, /あなたの勝ち（先に50点）/);
});

test("勝ち：5分たったら点の多い方。同点は引き分け", () => {
  let g = newGame();
  g.cpu.score = 3;
  g.clock.t += 299.9;
  g.tick();
  assert.equal(g.over, false);
  g.clock.t += 0.2;
  g.tick();
  assert.equal(g.winner, g.cpu);
  g = newGame();
  g.clock.t += 300;
  g.tick();
  assert.equal(g.over, true);
  assert.equal(g.winner, null);
});

test("CPU：8〜12秒に1回", () => {
  const g = newGame();
  for (let i = 0; i < 50; i++) { const d = g.cpuDelay(); assert.ok(d >= 8 && d <= 12, String(d)); }
});

test("CPU：放ったらすぐ場から取る。放てる言葉がなければ引き直す", () => {
  const g = newGame();
  setHand(g, g.cpu, "休日");
  const r = g.cpuTurn();
  assert.ok(r.ok);
  assert.equal(r.text, "休日");
  assert.equal(g.cpu.cards.length, 2, "2枚取った");
  assert.equal(g.cpu.takes, 0);
  const g2 = newGame();
  setHand(g2, g2.cpu, "卜卜");
  const r2 = g2.cpuTurn();
  assert.equal(r2.waiting, 30, "0点なので30秒待つ引き直し");
});

test("CPU：決まった乱数で 5分ぶん回しても壊れない（札の数が合う・使用済みを放たない・点は記録どおり）", () => {
  for (const seed of [1, 7, 42]) {
    const g = newGame(seed);
    const released = [];
    let total = 0;
    while (!g.over) {
      g.clock.t += g.cpuDelay();
      g.tick();
      const r = g.cpuTurn();
      if (r && r.ok && r.text) { assert.ok(!released.includes(r.text), r.text); released.push(r.text); }
      assert.ok(g.cpu.cards.length <= D.rules.hand_max);
      assert.equal(g.field.length, D.rules.field_size);
    }
    for (const e of g.log) if (e.who === "CPU") total += e.pts;
    assert.equal(total, g.cpu.score, "ログの点の合計＝CPU の点");
    assert.ok(released.length > 0, `seed ${seed} で CPU が1度は放つ`);
  }
});

test("ログ：一手ごとに 秒・どちら・手・使った札・できた札・点・二人の点と手札の数", () => {
  const g = newGame();
  setHand(g, g.cpu, "一二");
  const ids = setHand(g, g.me, "人木日山");
  g.clock.t += 1.5;
  const r = g.join(g.me, ids.slice(0, 2));
  g.clock.t += 1;
  g.release(g.me, [r.cards[0].id, ids[2]]);
  const fc = g.field[0].c;
  g.take(g.me, g.field[0].id);
  g.tried(g.me, ["口", "十"], "並べる順が逆");
  const ops = g.log.map((e) => e.op);
  assert.deepEqual(ops, ["はじめ", "くっつける", "放つ", "取る", "ためした"]);
  const j = g.log[1];
  assert.equal(j.t, 1.5);
  assert.equal(j.who, "あなた");
  assert.deepEqual([j.from, j.to, j.me, j.cpu], [["人", "木"], ["休"], 3, 2]);
  const t = g.log[2];
  assert.deepEqual([t.from, t.pts, t.meScore, t.cpuScore, t.me], [["休", "日"], 3, 3, 0, 1]);
  assert.match(t.note, /2字3。場から2枚取れる/);
  assert.deepEqual([g.log[3].from, g.log[3].me], [[fc], 2]);
  assert.deepEqual([g.log[4].from, g.log[4].note], [["口", "十"], "並べる順が逆"]);
});

test("ログ：書き出しの頭に仮置きの値を全部書く", () => {
  const g = newGame();
  const text = g.logText();
  const head = text.split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /場=6枚 最初の手札=8枚 手札の上限=12枚/);
  assert.match(head, /点数 1字1・2字3・3字6・4字12 四字熟語×2 特別な語×2/);
  assert.match(head, /放った字数×1枚を場から選んで取れる/);
  assert.match(head, /引き直し 5点で手札を全部入れ替え（8枚）。5点ない人は30秒待って0点で/);
  assert.match(head, /勝ち 先に50点、または5分で点の多い方/);
  assert.match(head, /反転=10秒 巡り=3秒 同音=20秒/);
  assert.match(head, /CPU 8〜12秒に1回動く/);
  assert.match(head, /rules=2026-11-21\.1/);
  assert.match(head, /はじめた時刻 2026-11-20 18:00:00/);
  assert.match(text, /秒\tどちら\t手\t使った札\tできた札\t点\tあなたの点\tCPUの点\tあなたの手札\tCPUの手札\tメモ/);
});

test("動けない：手札に放てる言葉が無くなったら残し、戻ったら 動ける（R-023）", () => {
  const g = newGame();
  setHand(g, g.cpu, "古");
  g.clock.t += 2;
  setHand(g, g.me, "古山");
  assert.ok(g.release(g.me, [g.me.cards[0].id]).ok);
  const e = g.log.find((x) => x.op === "動けない" && x.who === "CPU");
  assert.ok(e, "CPU の 動けない がある");
  assert.deepEqual(e.from, ["古"]);
  assert.match(e.note, /放てる言葉なし。使える手：割る・反転・引き直し（30秒待つ）/);
  g.clock.t += 1;
  assert.ok(g.invert(g.cpu, [g.cpu.cards[0].id]).ok);
  const back = g.log.find((x) => x.op === "動ける" && x.who === "CPU");
  assert.match(back.note, /放てる言葉：新/);
});
