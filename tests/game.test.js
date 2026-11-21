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

test("待ち時間：反転10秒・巡り1秒・同音20秒（値は rules.json から読む）。二人は別々", () => {
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


test("はじめ：手札は二人とも8枚、場は3枚、点は0。山は N5 の字を2枚ずつ（KJ-004 で場3）", () => {
  const g = newGame();
  assert.equal(g.me.cards.length, D.rules.start_hand);
  assert.equal(g.cpu.cards.length, D.rules.start_hand);
  assert.equal(g.field.length, D.rules.field_size);
  assert.equal(D.rules.field_size, 3);
  assert.equal(g.me.score + g.cpu.score, 0);
  const total = g.deck.length + g.field.length + g.me.cards.length + g.cpu.cards.length;
  assert.equal(total, T.CHARS.size * D.rules.same_char_in_deck);
});

test("取る：手札は8枚で止まる（置き場の札は数えない）", () => {
  const g = newGame();
  assert.equal(D.rules.hand_max, 8);
  setHand(g, g.me, "山" + "一".repeat(6)); // 7枚
  g.me.takes = 3;
  assert.ok(g.take(g.me, g.field[0].id).ok, "7枚なら取れて8枚になる");
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.take(g.me, g.field[1].id).why, "手札がいっぱい");
  assert.equal(g.me.takes, 2, "取れる枚数は残る");
});

test("割る：手札8＋置き場4の全部で12枚まで。12枚なら割れない（KJ-004）", () => {
  const g = newGame();
  assert.equal(D.rules.split_extra, 4);
  setHand(g, g.me, "休" + "一".repeat(7)); // 手札8
  assert.equal(g.handCount(g.me), 8);
  let r = g.split(g.me, [g.me.cards[0].id]);
  assert.ok(r.ok, "手札が8でも割れる");
  assert.equal(g.handCount(g.me), 8, "割ったあとも手札は8まで");
  assert.equal(g.trayCount(g.me), 1, "あふれた1枚は置き場へ");
  assert.equal(g.me.cards.length, 9);
  for (let i = 0; i < 3; i++) { // 置き場が4枚になるまで、手札の1枚を 休 にして割る
    const hand = g.me.cards.find((x) => !x.tray && x.c === "一");
    hand.c = "休";
    assert.ok(g.split(g.me, [hand.id]).ok);
  }
  assert.equal(g.me.cards.length, 12);
  assert.equal(g.trayCount(g.me), 4);
  assert.equal(g.handCount(g.me), 8);
  const spare = g.me.cards.find((x) => !x.tray && x.c === "一");
  spare.c = "休";
  assert.equal(g.split(g.me, [spare.id]).why, "手札もストックもいっぱい", "12枚で割れない");
  assert.equal(g.me.cards.length, 12);
});

test("置き場の札：割ってできた札は手札に空きがなければ置き場。くっつけてできた札は手札に空きがあれば手札へ（R-032）", () => {
  const g = newGame();
  setHand(g, g.me, "休" + "一".repeat(7));
  g.split(g.me, [g.me.cards[0].id]); // 人木。人は手札、木は置き場
  const tray = g.me.cards.filter((x) => x.tray);
  assert.deepEqual(tray.map((x) => x.c), ["木"]);
  // 手札の1枚を放って空きを作り、置き場の 木 と手札の 人 をくっつける（人木=休）
  const hand = g.me.cards.filter((x) => !x.tray);
  assert.deepEqual(hand.slice(0, 1).map((x) => x.c), ["人"]);
  const r = g.join(g.me, [hand[0].id, tray[0].id]);
  assert.ok(r.ok);
  assert.equal(chars(r.cards), "休");
  assert.equal(r.cards[0].tray, undefined, "手札に空きがあるので手札側へ戻る");
  assert.equal(g.trayCount(g.me), 0);
  // 置き場の札も放てる・動けない判定に数える
  g.me.cards.push({ id: 777777, c: "山", t: 0, fresh: false, tray: true }, { id: 777778, c: "川", t: 0, fresh: false, tray: true });
  assert.ok(g.release(g.me, [777777, 777778]).ok, "置き場の札も放てる（山川）");
});

test("点数：2字3・3字6・4字12、四字熟語は倍、特別な語はさらに倍。1字の点はない（KJ-008）", () => {
  assert.equal(K.scoreOf(D, T, "日").pts, 0);
  assert.equal(K.scoreOf(D, T, "休日").pts, 3);
  assert.equal(K.scoreOf(D, T, "一日中").pts, 6);
  const yoji = [...T.WORDS.values()].find((w) => w.yoji && !T.SPECIAL.has(w.w));
  assert.equal(K.scoreOf(D, T, yoji.w).pts, 24, yoji.w);
  const four = [...T.WORDS.values()].find((w) => [...w.w].length === 4 && !w.yoji);
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

test("放つ：辞書にない並びは放てない。1字は放てない（N5 の字でも部品でも。KJ-008）", () => {
  const g = newGame();
  const SINGLE = "1字では放てない（2字以上の言葉）";
  assert.equal(g.release(g.me, setHand(g, g.me, "日休")).why, "辞書にない");
  for (const c of ["山", "日", "卜", "玉"]) {
    const ids = setHand(g, g.me, c);
    assert.equal(g.release(g.me, ids).why, SINGLE, c);
    assert.equal(g.me.cards.length, 1, "はじかれたら札は消えない");
    assert.equal(g.me.score, 0);
  }
  assert.deepEqual(K.releasable(T, g.used, "山"), { ok: false, why: SINGLE });
  assert.equal(g.release(g.me, []).ok, false);
});

test("放つ：くっつけて作った字でも1字では放てない。2字以上は今までどおり放てる（KJ-008）", () => {
  const g = newGame();
  const ids = setHand(g, g.me, "人木日");
  const j = g.join(g.me, ids.slice(0, 2));
  assert.equal(chars(j.cards), "休");
  const r = g.release(g.me, [j.cards[0].id]);
  assert.equal(r.ok, false);
  assert.match(r.why, /1字では放てない/);
  assert.ok(g.release(g.me, [j.cards[0].id, g.me.cards.find((x) => x.c === "日").id]).ok, "休日 は放てる");
  assert.equal(g.me.score, 3);
});

test("放つ：1字を放つ試みはログに「ためした」で残る（画面側が g.tried を呼ぶ）", () => {
  const g = newGame();
  g.tried(g.me, ["山"], "1字では放てない（2字以上の言葉）");
  const e = g.log[g.log.length - 1];
  assert.deepEqual([e.op, e.from, e.pts], ["ためした", ["山"], 0]);
  assert.match(e.note, /1字では放てない/);
});

test("使用済み：一度放った言葉は二人とも二度と使えない（言葉ごと。D-005）", () => {
  const g = newGame();
  assert.ok(g.release(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.release(g.cpu, setHand(g, g.cpu, "休日")).why, "放った言葉");
  assert.equal(g.release(g.me, setHand(g, g.me, "休日")).why, "放った言葉", "自分も二度と使えない");
  assert.equal(g.release(g.cpu, setHand(g, g.cpu, "日休")).why, "辞書にない", "日休 は別の並び");
  assert.ok(g.release(g.cpu, setHand(g, g.cpu, "山川")).ok, "別の言葉は放てる");
  assert.equal(g.release(g.me, setHand(g, g.me, "山川")).why, "放った言葉", "相手が放った言葉も使えない");
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

test("取る：早い者勝ち。相手が先に取った札は取れない。手札が8枚なら取れない", () => {
  const g = newGame();
  setHand(g, g.me, "山川");
  setHand(g, g.cpu, "大人");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.ok(g.release(g.cpu, g.cpu.cards.map((x) => x.id)).ok);
  const id = g.field[0].id;
  assert.ok(g.take(g.cpu, id).ok);
  assert.equal(g.take(g.me, id).why, "場にない");
  setHand(g, g.me, "一".repeat(8));
  assert.equal(g.take(g.me, g.field[1].id).why, "手札がいっぱい");
  assert.equal(g.me.takes, 2, "取れる枚数は残る（2字放ったので2枚）");
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
  setHand(g, g.me, "古山川");
  g.me.score = 2;
  const r = g.redraw(g.me);
  assert.equal(r.waiting, 30);
  assert.equal(g.redraw(g.me).why, "待っている");
  assert.ok(g.release(g.me, g.me.cards.slice(1).map((x) => x.id)).ok, "待つあいだも放てる（山川）");
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
  assert.equal(g.release(g.cpu, setHand(g, g.cpu, "山川")).ok, false, "終わったら放てない");
  assert.match(g.log[g.log.length - 1].note, /あなたの勝ち（先に50点）/);
});

test("勝ち：制限時間（rules.json）がたったら点の多い方。同点は引き分け", () => {
  let g = newGame();
  g.cpu.score = 3;
  g.clock.t += D.rules.win.time_limit_sec - 0.1;
  g.tick();
  assert.equal(g.over, false);
  g.clock.t += 0.2;
  g.tick();
  assert.equal(g.winner, g.cpu);
  g = newGame();
  g.clock.t += D.rules.win.time_limit_sec;
  g.tick();
  assert.equal(g.over, true);
  assert.equal(g.winner, null);
});

test("CPU（いまの強さ）：8〜12秒に1回", () => {
  const g = newGame(1, "normal");
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

test("CPU：1字を放たない。手札が1字だけなら引き直す。2字以上の語が作れるときだけ放つ（KJ-008）", () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    for (const opp of ["weak", "normal"]) {
      const g = newGame(seed, opp);
      setHand(g, g.cpu, "山");
      const before = g.log.length;
      const r = g.cpuTurn();
      assert.equal(r.waiting, 30, `${opp} seed ${seed}: 1字しかなければ 動けない のときの動き（点がなければ待つ引き直し）`);
      assert.equal(g.log.slice(before).some((e) => e.op === "放つ"), false, "1字は放たない");
      assert.equal(g.cpu.score, 0);
    }
  }
  assert.equal(D.rules.cpu.single_release_chance, undefined);
});

test("CPU：決まった乱数で 10分ぶん回しても1字を放たない（ログに1字の 放つ がない）", () => {
  for (const opp of ["weak", "normal"]) {
    for (const seed of [1, 7, 42]) {
      const g = newGame(seed, opp);
      while (!g.over) {
        g.clock.t += g.cpuDelay();
        g.tick();
        if (g.over) break;
        g.cpuTurn();
      }
      const singles = g.log.filter((e) => e.op === "放つ" && e.from.length < 2);
      assert.deepEqual(singles, [], `${opp} seed ${seed}`);
    }
  }
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
  setHand(g, g.cpu, "山川");
  const ids = setHand(g, g.me, "人木日山川");
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
  assert.deepEqual([j.from, j.to, j.me, j.cpu], [["人", "木"], ["休"], 4, 2]);
  const t = g.log[2];
  assert.deepEqual([t.from, t.pts, t.meScore, t.cpuScore, t.me], [["休", "日"], 3, 3, 0, 2]);
  assert.match(t.note, /2字3。場から2枚取れる/);
  assert.deepEqual([g.log[3].from, g.log[3].me], [[fc], 3]);
  assert.deepEqual([g.log[4].from, g.log[4].note], [["口", "十"], "並べる順が逆"]);
});

test("ログ：書き出しの頭に仮置きの値を全部書く", () => {
  const g = newGame();
  const text = g.logText();
  const head = text.split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /場=3枚 最初の手札=7枚 手札の上限=8枚＋ストック4枚（全部で12マス。場から取るのは手札の8枚まで。割る・くっつけるでできた札は、字も部品も、手札が埋まっていればストックへ。手札とストックの間は自分で動かせる）/);
  assert.match(head, /# 相手 いまの強さ（CPU は 8〜12秒に1回動く）/);
  assert.match(head, /点数 2字3・3字6・4字12 四字熟語×2 特別な語×2（1字は放てない）/);
  assert.match(head, /放った字数×1枚を場から選んで取れる/);
  assert.match(head, /引き直し 5点で手札を全部入れ替え（7枚）。5点ない人は30秒待って0点で/);
  assert.match(head, /勝ち 先に50点、または10分で点の多い方/);
  assert.match(head, /反転=10秒 巡り=1秒 同音=20秒/);
  assert.match(head, /CPU 8〜12秒に1回動く/);
  assert.ok(head.includes(`rules=${D.rules.version}`), "rules.json の version");
  assert.match(head, /# レベル N5\n/, "選んだレベル（このテストは N5 で作ったゲーム）");
  assert.match(head, /山=N5 の字を2枚ずつ/);
  assert.match(head, /はじめた時刻 2026-11-20 18:00:00/);
  assert.match(text, /秒\tどちら\t手\t使った札\tできた札\t点\tあなたの点\tCPUの点\tあなたの手札\tCPUの手札\tメモ/);
});

test("動けない：2字以上の言葉が作れなくなったら残し、戻ったら 動ける（R-023。KJ-008 で1字は数えない）", () => {
  const g = newGame();
  setHand(g, g.cpu, "古一");
  g.clock.t += 2;
  setHand(g, g.me, "休日山");
  assert.ok(g.release(g.me, g.me.cards.slice(0, 2).map((x) => x.id)).ok);
  const e = g.log.find((x) => x.op === "動けない" && x.who === "CPU");
  assert.ok(e, "CPU の 動けない がある（1字の 古 や 一 は放てる言葉に数えない）");
  assert.deepEqual(e.from, ["古", "一"]);
  assert.match(e.note, /放てる言葉なし。使える手：割る・反転・巡り・同音・引き直し（30秒待つ）/);
  g.clock.t += 1;
  assert.ok(g.invert(g.cpu, [g.cpu.cards[0].id]).ok);
  const back = g.log.find((x) => x.op === "動ける" && x.who === "CPU");
  assert.match(back.note, /放てる言葉：一新/);
});

test("動けない：手札が1字だけ（N5 の字でも）なら 動ける にならない（KJ-008）", () => {
  const g = newGame();
  setHand(g, g.me, "山");
  assert.equal(g.releasableInHand(g.me), null);
  setHand(g, g.me, "山川");
  assert.equal(g.releasableInHand(g.me), "山川");
  g.used.add("山川");
  assert.equal(g.releasableInHand(g.me), null, "放った言葉は数えない");
});

// ---------- KJ-004：相手の選び方 ----------
test("相手：初期値は「とても弱い」。選べるのは ひとりで／とても弱い／いまの強さ", () => {
  assert.equal(D.rules.opponent_default, "weak");
  assert.deepEqual(K.OPPONENTS.map((o) => o.label), ["ひとりで", "とても弱い", "いまの強さ"]);
  const g = K.createGame(D, T, { now: () => 0, rand: () => 0.5 });
  assert.equal(g.opponent, "weak", "選ばなければ とても弱い");
  assert.equal(K.createGame(D, T, { now: () => 0, rand: () => 0.5, opponent: "ばか" }).opponent, "weak");
});

test("とても弱い：30〜45秒に1回。動き方はいまの CPU と同じ", () => {
  const g = newGame(1, "weak");
  assert.deepEqual(D.rules.cpu.weak_interval_sec, [30, 45]);
  for (let i = 0; i < 50; i++) { const d = g.cpuDelay(); assert.ok(d >= 30 && d <= 45, String(d)); }
  setHand(g, g.cpu, "休日");
  const r = g.cpuTurn();
  assert.equal(r.text, "休日", "動きは同じ（放ったらすぐ場から取る）");
  assert.equal(g.cpu.cards.length, 2);
});

test("とても弱い：決まった乱数で5分回すと、50点にならず、動く回数も少ない（3通り）", () => {
  for (const seed of [1, 7, 42]) {
    const run = (opp) => {
      const g = newGame(seed, opp);
      let moves = 0;
      while (!g.over) {
        g.clock.t += g.cpuDelay();
        g.tick();
        if (g.over) break;
        if (g.cpuTurn()) moves++;
      }
      return { score: g.cpu.score, moves, winner: g.winner };
    };
    const weak = run("weak"), normal = run("normal");
    assert.ok(weak.score < D.rules.win.score, `seed ${seed}: 弱い ${weak.score}点`);
    assert.ok(weak.moves <= D.rules.win.time_limit_sec / 30, `seed ${seed}: 動いた回数 ${weak.moves}`);
    // 最初の手札が7枚になってから（作者 2026-11-21、R-042）、いまの強さの CPU も詰まりやすく、点で比べると同点になる種がある（seed 1・42 は どちらも3点）。
    // 「とても弱い」は動く回数が少ないことを見る
    assert.ok(weak.score <= normal.score, `seed ${seed}: 弱い ${weak.score} <= いまの ${normal.score}`);
    assert.ok(weak.moves < normal.moves, `seed ${seed}: 弱い ${weak.moves}手 < いまの ${normal.moves}手`);
  }
});

test("ひとりで：CPU は出ない。山から CPU の分は引かない。場の取り合いはない", () => {
  const g = newGame(1, "solo");
  assert.equal(g.solo, true);
  assert.equal(g.cpu.cards.length, 0);
  assert.equal(g.cpuTurn(), null);
  const total = g.deck.length + g.field.length + g.me.cards.length;
  assert.equal(total, T.CHARS.size * D.rules.same_char_in_deck, "札の数が合う");
  assert.equal(g.log.some((e) => e.who === "CPU"), false, "CPU の行がない（動けない も出ない）");
});

test("ひとりで：50点になっても終わらない。制限時間（10分）がたったら終わり、点を出す", () => {
  const g = newGame(1, "solo");
  g.me.score = 48;
  assert.ok(g.release(g.me, setHand(g, g.me, "休日")).ok);
  assert.equal(g.me.score, 51);
  assert.equal(g.over, false, "50点を超えても続く");
  g.clock.t += D.rules.win.time_limit_sec - 0.1;
  g.tick();
  assert.equal(g.over, false);
  g.clock.t += 0.2;
  assert.equal(g.tick(), true);
  assert.equal(g.over, true);
  assert.equal(g.winner, null);
  const ev = g.events.find((e) => e.type === "over");
  assert.deepEqual([ev.solo, ev.winner], [true, null]);
  assert.match(g.log[g.log.length - 1].note, /ひとりで 51点（10分）/);
  assert.equal(g.release(g.me, setHand(g, g.me, "山川")).ok, false, "終わったら動かせない");
});

test("ひとりで：引き直しの待ちも動く。CPU の待ちは見ない", () => {
  const g = newGame(1, "solo");
  g.me.score = 0;
  assert.equal(g.redraw(g.me).waiting, 30);
  g.clock.t += 30;
  assert.equal(g.tick(), true);
  assert.equal(g.me.cards.length, D.rules.start_hand);
});

test("ログ：頭に選んだ相手を書く（ひとりで／とても弱い／いまの強さ）", () => {
  const head = (opp) => newGame(1, opp).logText().split("\n").filter((l) => l.startsWith("# 相手")).join("");
  assert.match(head("solo"), /# 相手 ひとりで（CPU なし。場の取り合いなし。50点では終わらず、10分たったら終わって点を出す/);
  assert.match(head("weak"), /# 相手 とても弱い（CPU は 30〜45秒に1回動く。動き方はいまの CPU のまま）/);
  assert.match(head("normal"), /# 相手 いまの強さ（CPU は 8〜12秒に1回動く）/);
  assert.match(newGame(1, "weak").logText(), /# 仮置き CPU 30〜45秒に1回動く/);
  assert.match(newGame(1, "solo").logText(), /# 仮置き CPU なし/);
});

// ---------- KJ-005：並べ方・入れ替え ----------
test("並べ方：初期値は 手札で選ぶ。選べる・ログの頭に書く・途中で切り替えるとログに残る", () => {
  const g = newGame(1);
  assert.equal(g.layout, "hand");
  assert.match(g.logText(), /# 並べ方 手札で選ぶ（はじめたとき/);
  assert.equal(K.createGame(D, T, { now: () => 0, layout: "table" }).layout, "table");
  assert.equal(K.createGame(D, T, { now: () => 0, layout: "でたらめ" }).layout, "hand", "知らない値は初期値");
  assert.deepEqual(K.LAYOUTS.map((l) => l.label), ["手札で選ぶ", "台に並べる"]);
  assert.equal(g.setLayout("hand").ok, false, "同じ並べ方への切り替えは何もしない");
  assert.equal(g.setLayout("table").ok, true);
  assert.equal(g.layout, "table");
  const e = g.log[g.log.length - 1];
  assert.deepEqual([e.op, e.note], ["並べ方", "台に並べるに切り替え"]);
  assert.match(g.logText(), /# 並べ方 手札で選ぶ（はじめたとき[^\n]*\n/, "頭は はじめたときの並べ方のまま");
  assert.match(g.logText(), /\t並べ方\t\t\t0\t.*台に並べるに切り替え/);
  assert.equal(g.me.stuck, false, "並べ方の切り替えで 動けない を出さない");
});

test("手札で選ぶ：選んだ順がそのまま効く。放つ・くっつける・割る は台に並べた時と同じ結果", () => {
  // 画面は「選んだ札の id の並び」を台の並びと同じ形で core に渡す。順番ちがいで結果が変わることを確かめる
  for (const layout of ["hand", "table"]) {
    const run = (chars, op) => {
      const g = K.createGame(D, T, { now: () => 1000, rand: () => 0.5, layout, date: () => new Date(2026, 10, 21) });
      const ids = setHand(g, g.me, "休日十口人木");
      const pick = (s) => [...s].map((c) => g.me.cards.find((x) => x.c === c).id);
      return { g, ids, r: op(g, pick(chars)) };
    };
    const a = run("休日", (g, ids) => g.release(g.me, ids));
    assert.deepEqual([a.r.ok, a.r.text, a.r.pts], [true, "休日", 3], layout);
    const b = run("日休", (g, ids) => g.release(g.me, ids));
    assert.equal(b.r.ok, false, layout + "：日休 は放てない（選んだ順）");
    const c = run("十口", (g, ids) => g.join(g.me, ids));
    assert.equal(c.r.ok, true, layout);
    assert.ok(["古", "田"].includes(c.r.cards[0].c));
    const d = run("口十", (g, ids) => g.join(g.me, ids));
    assert.deepEqual([d.r.ok, d.r.why], [false, "並べる順が逆"], layout);
    const e = run("休", (g, ids) => g.split(g.me, ids));
    assert.deepEqual([e.r.ok, e.r.cards.map((x) => x.c).join("")], [true, "人木"], layout);
  }
});

test("入れ替え：手札の中で2枚の位置が替わる。札の数・中身は変わらず、ログに残る", () => {
  const g = newGame(1);
  const ids = setHand(g, g.me, "天上天下十口休日");
  const before = g.me.cards.map((x) => x.c).join("");
  assert.equal(g.swap(g.me, ids[0], ids[7]).ok, true);
  assert.equal(g.me.cards.map((x) => x.c).join(""), "日上天下十口休天");
  assert.equal(g.me.cards.length, 8);
  assert.deepEqual([...g.me.cards.map((x) => x.c)].sort(), [...before].sort());
  const e = g.log[g.log.length - 1];
  assert.deepEqual([e.op, e.from.join(""), e.to.join("")], ["入れ替え", "天日", "日天"]);
  assert.equal(g.me.stuck, false);
  assert.equal(g.swap(g.me, ids[0], ids[0]).ok, false, "同じ札どうしは何もしない");
  assert.equal(g.swap(g.me, ids[0], 999999).ok, false, "手札にない札");
  assert.equal(g.swap(g.cpu, ids[0], ids[1]).ok, false, "相手の札は替えられない");
  g.over = true;
  assert.equal(g.swap(g.me, ids[1], ids[2]).ok, false, "終わったら替えられない");
});

test("入れ替え：手札とストックの間でも替えられる（それぞれ相手の段へ）。入れ替えのあとも割る・放つが同じに働く（R-042）", () => {
  const g = newGame(1);
  setHand(g, g.me, "休山川一二三四五");
  const hand = g.me.cards.map((x) => x.id);
  const r = g.split(g.me, [hand[0]]); // 亻木 のうち手札に入りきらない分が置き場へ
  assert.ok(r.ok);
  const tray = g.me.cards.filter((x) => x.tray), inHand = g.me.cards.filter((x) => !x.tray);
  assert.ok(tray.length >= 1);
  const [t0, h0] = [tray[0], inHand[0]];
  assert.equal(g.swap(g.me, t0.id, h0.id).ok, true, "ストックと手札の間も替えられる");
  assert.ok(!t0.tray && h0.tray, "それぞれ相手の段へ移る");
  assert.match(g.log[g.log.length - 1].note, /手札とストックの間/);
  assert.equal(g.swap(g.me, inHand[1].id, inHand[2].id).ok, true);
  assert.equal(g.me.cards.filter((x) => x.tray).length, tray.length, "ストックの枚数は同じ");
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.me.cards.length, 9);
  const log0 = g.log.length;
  assert.ok(g.release(g.me, ["山", "川"].map((c) => g.me.cards.find((x) => x.c === c).id)).ok, "入れ替えのあとも放てる（山川）");
  assert.ok(g.log.length > log0);
});

// ---------- KJ-006 レベル ----------
test("レベル N4：山は N5＋N4 の字を2枚ずつ。ログの頭にレベルが出る", () => {
  const g = newGame(3, "normal", "N4");
  assert.equal(g.level, "N4");
  const total = g.deck.length + g.me.cards.length + g.cpu.cards.length + g.field.length;
  assert.equal(total, D.kanji.count * D.rules.same_char_in_deck);
  const head = g.logText().split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /# レベル N4（N5＋N4 の字）/);
  assert.match(head, /山=N4 の字を2枚ずつ/);
  assert.match(head, /巡り 曜日・方角・数・四季/);
  const h5 = newGame(3, "normal", "N5").logText();
  assert.match(h5, /# レベル N5\n/);
  assert.doesNotMatch(h5, /四季/);
});

test("レベル N4：四季が巡る（冬→春）。N5 では 春 は巡れない", () => {
  const g = newGame(1, "solo", "N4");
  const [id] = setHand(g, g.me, "冬");
  const r = g.cycle(g.me, [id]);
  assert.ok(r.ok);
  assert.equal(r.cards[0].c, "春");
  const g5 = newGame(1, "solo", "N5");
  const [id5] = setHand(g5, g5.me, "春");
  assert.equal(g5.cycle(g5.me, [id5]).ok, false);
});

test("レベル N4：N4 の字を割る・くっつける（海＝水＋毎、千＋里＝重）。N5 では N4 の字ができない", () => {
  const g = newGame(1, "solo", "N4");
  const [id] = setHand(g, g.me, "海");
  const r = g.split(g.me, [id]);
  assert.ok(r.ok);
  assert.deepEqual(r.cards.map((x) => x.c), ["水", "毎"]);
  const ids = setHand(g, g.me, "千里");
  assert.equal(g.join(g.me, ids).cards[0].c, "重");
  const g5 = newGame(1, "solo", "N5");
  const ids5 = setHand(g5, g5.me, "木木");
  assert.equal(g5.join(g5.me, ids5).ok, false, "林 は N4");
  const [h] = setHand(g5, g5.me, "海");
  assert.equal(g5.split(g5.me, [h]).ok, false);
});

test("レベル N4：N4 の語を放てる（強弱）。N5 では辞書にない", () => {
  const g = newGame(1, "solo", "N4");
  const ids = setHand(g, g.me, "強弱");
  assert.ok(g.release(g.me, ids).ok);
  const g5 = newGame(1, "solo", "N5");
  const ids5 = setHand(g5, g5.me, "強弱");
  assert.equal(g5.release(g5.me, ids5).why, "辞書にない");
});

// ---------- KJ-011：放てる言葉はレベルで縛らない（D-029） ----------
for (const lv of ["N5", "N4"]) {
  test(`放つ（${lv}）：国交 は放てる（交 は 友→又・ナ…の先の中継ぎ。山の字ではない）`, () => {
    const g = newGame(1, "solo", lv);
    assert.ok(!g.T.CHARS.has("交"));
    const r = g.release(g.me, setHand(g, g.me, "国交"));
    assert.ok(r.ok, r.why);
  });
}

test("放つ：手に持てない字の入った語は通らない（N5 の 国際・N4 の字を使う 強弱）", () => {
  const g = newGame(1, "solo", "N5");
  assert.ok(!g.T.HOLD.has("際"));
  assert.equal(g.release(g.me, setHand(g, g.me, "国際")).why, "辞書にない");
  assert.equal(g.release(g.me, setHand(g, g.me, "強弱")).why, "辞書にない");
});

test("山：レベルの外の字（手に持てる字でも）と部品は山にも場にも出ない。引き直しで手札に 交・亠 があっても山に戻らない", () => {
  for (const lv of ["N5", "N4"]) {
    for (const seed of [1, 2, 3]) {
      const g = newGame(seed, "solo", lv);
      const T = g.T;
      for (const c of g.deck) assert.ok(T.CHARS.has(c), `${lv} 山に ${c}`);
      for (const f of g.field) assert.ok(T.CHARS.has(f.c), `${lv} 場に ${f.c}`);
      for (const x of g.me.cards) assert.ok(T.CHARS.has(x.c), `${lv} 手札に ${x.c}`);
      setHand(g, g.me, "交亠国");
      g.me.score = 10;
      assert.ok(g.redraw(g.me).ok);
      for (const c of g.deck) assert.ok(T.CHARS.has(c), `${lv} 引き直しのあと山に ${c}`);
    }
  }
});

// ---------- ストック（作者 2026-11-21、KJ-006 のあと。R-042） ----------
test("ストック：最初の手札は7枚（手札に1マス空き）。ストックは空", () => {
  const g = newGame(1, "normal", "N4");
  assert.equal(D.rules.start_hand, 7);
  assert.equal(g.handCount(g.me), 7);
  assert.equal(g.trayCount(g.me), 0);
  assert.equal(g.cpu.cards.length, 7);
});

test("ストック：割る・くっつけるでできた札は、字も部品も、手札が埋まっていればストックへ", () => {
  const g = newGame(1);
  setHand(g, g.me, "休古" + "一".repeat(6)); // 手札8
  g.split(g.me, [g.me.cards[0].id]); // 人木：人は 休 の位置、木 はストックへ
  assert.deepEqual(g.me.cards.filter((x) => x.tray).map((x) => x.c), ["木"], "字（木）もストックへ");
  const ko = g.me.cards.find((x) => x.c === "古");
  g.split(g.me, [ko.id]); // 十口：口 はストックへ
  assert.deepEqual(g.me.cards.filter((x) => x.tray).map((x) => x.c), ["木", "口"]);
});

test("移す：手札⇄ストックの空いたマスへ1枚ずつ動かせる。いっぱいなら動かせない。ログに残る", () => {
  const g = newGame(1);
  const ids = setHand(g, g.me, "山川一二三四五"); // 手札7
  assert.ok(g.move(g.me, ids[0], true).ok, "手札→ストック");
  assert.equal(g.trayCount(g.me), 1);
  assert.equal(g.handCount(g.me), 6);
  assert.equal(g.log[g.log.length - 1].op, "移す");
  assert.equal(g.move(g.me, ids[0], true).why, "同じ段");
  assert.ok(g.move(g.me, ids[0], false).ok, "ストック→手札");
  assert.equal(g.trayCount(g.me), 0);
  for (const id of ids.slice(0, 4)) assert.ok(g.move(g.me, id, true).ok);
  assert.equal(g.move(g.me, ids[4], true).why, "ストックがいっぱい");
  const full = newGame(1);
  const fids = setHand(full, full.me, "山川一二三四五六");
  full.me.cards.push({ id: 888001, c: "七", t: 0, fresh: false, tray: true });
  assert.equal(full.move(full.me, 888001, false).why, "手札がいっぱい");
  assert.ok(fids.length === 8);
});

test("ストック：場から取るのは手札の8マスまで（ストックには入らない）", () => {
  const g = newGame(1);
  setHand(g, g.me, "山川一二三四五六");
  g.me.takes = 1;
  assert.equal(g.take(g.me, g.field[0].id).why, "手札がいっぱい");
  g.move(g.me, g.me.cards[0].id, true);
  const r = g.take(g.me, g.field[0].id);
  assert.ok(r.ok, "ストックへ移して手札に空きを作れば取れる");
  assert.ok(!r.card.tray);
});
