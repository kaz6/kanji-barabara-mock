// 遊びの決まり：割る・くっつける・待ち時間（KJ-002 から残す）と、KJ-003 の 放つ・点数・取る・使用済み・引き直し・勝ち・CPU・ログ
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand, takeAll } = require("./helpers");

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

// ---- KJ-017：引きずって相手の札の面に落とすとくっつく（D-035）----
test("面でくっつける：十 を 口 の上に落とすと 古、中央なら 田。字にならない面（下・左・右）は無い", () => {
  assert.deepEqual(K.faceJoins(T, "十", "口"), { top: ["古"], center: ["田"] });
  assert.deepEqual(K.faceJoins(T, "口", "十"), { bottom: ["古"] }, "口 を 十 の下に落とすと 古（口 は 十 の中には入らない）");
  const g = newGame();
  let [a, b] = setHand(g, g.me, "十口");
  let r = g.joinFace(g.me, a, b, "top");
  assert.ok(r.ok); assert.equal(chars(g.me.cards), "古");
  [a, b] = setHand(g, g.me, "十口");
  r = g.joinFace(g.me, a, b, "center");
  assert.ok(r.ok); assert.equal(chars(g.me.cards), "田");
  for (const f of ["bottom", "left", "right"]) {
    [a, b] = setHand(g, g.me, "十口");
    const x = g.joinFace(g.me, a, b, f);
    assert.equal(x.ok, false, `${f} ではくっつかない`);
    assert.equal(chars(g.me.cards), "十口", "札は変わらない");
  }
  const log = g.logText();
  assert.match(log, /\tくっつける\t十 口\t古\t.*引きずって上の面に/);
  assert.match(log, /\tくっつける\t十 口\t田\t.*引きずって中央の面に/);
});

test("面でくっつける：上下（卜一=上・一卜=下）、左右（人木=休）。面の向きが割り方の並びと合う", () => {
  assert.deepEqual(K.faceJoins(T, "卜", "一"), { top: ["上"], bottom: ["下"] });
  assert.deepEqual(K.faceJoins(T, "人", "木"), { left: ["休"] }, "人 を 木 の左に落とすと 休");
  assert.deepEqual(K.faceJoins(T, "木", "人"), { right: ["休"] }, "木 を 人 の右に落とすと 休");
  assert.deepEqual(K.faceJoins(T, "山", "山"), { top: ["出"], bottom: ["出"] }, "同じ2枚はどちらの面でも同じ字");
  assert.deepEqual(K.faceJoins(T4, "木", "木"), { left: ["林"], right: ["林"] });
  const g = newGame();
  const [a, b] = setHand(g, g.me, "木人");
  assert.equal(g.joinFace(g.me, a, b, "right").ok, true);
  assert.equal(chars(g.me.cards), "休");
});

test("面でくっつける：どの面のどの組も、割ると元の2枚に戻る（割り方の形を逆に引いている）。N5・N4", () => {
  for (const TL of [T, T4]) {
    let n = 0;
    for (const [key, rs] of TL.FACE) {
      const [f, d, t] = key.split("\t");
      for (const k of rs) {
        const [a, b] = TL.parts[k];
        const sp = TL.SHAPES[k];
        if (f === "top" || f === "left") assert.deepEqual([d, t], [a, b], key);
        else if (f === "bottom" || f === "right") assert.deepEqual([t, d], [a, b], key);
        else { assert.equal(sp.kind, "囲み"); assert.equal(t, [a, b][sp.out], `${key} 相手が外側`); }
        if (f === "top" || f === "bottom") assert.equal(sp.s, "tb", key);
        if (f === "left" || f === "right") assert.equal(sp.s, "lr", key);
        n++;
      }
    }
    assert.ok(n > 0);
  }
});

test("面でくっつける：形が「それ以外」の割り方（辶・广 など）は、どの面でもくっつかない。ボタンのくっつけるでは今まで通り", () => {
  const T4f = [...T4.FACE.values()].flat();
  for (const [k, sp] of Object.entries(D.split_shapes.shapes)) {
    if (sp.kind === "それ以外" && T4.parts[k]) assert.ok(!T4f.includes(k), `${k} は面ではできない`);
  }
  const [a, b] = T4.parts["道"];
  assert.deepEqual(K.faceJoins(T4, a, b), {});
  assert.deepEqual(K.faceJoins(T4, b, a), {});
  const g = newGame(1, "normal", "N4");
  const ids = setHand(g, g.me, a + b);
  assert.equal(chars(g.join(g.me, ids).cards), "道", "ボタンのくっつけるはそのまま");
});

test("面でくっつける：できた札は相手の札のいた所に入る。ストックの札とも（手札に空きがあれば手札へ）", () => {
  const g = newGame();
  setHand(g, g.me, "日十休口");
  const [, ten, , kuchi] = g.me.cards.map((x) => x.id);
  assert.equal(g.joinFace(g.me, ten, kuchi, "top").ok, true);
  assert.equal(chars(g.me.cards), "日休古");
  // ストックの 口 に、手札の 十 を落とす
  setHand(g, g.me, "十日");
  const x = { id: 777001, c: "口", t: g.now(), fresh: false, tray: true };
  g.me.cards.push(x);
  assert.equal(g.joinFace(g.me, g.me.cards[0].id, x.id, "center").ok, true);
  assert.equal(chars(g.me.cards), "日田");
  assert.equal(g.handCount(g.me) + g.trayCount(g.me), 2);
  // 1枚だけ・同じ札・終わったあと はくっつかない
  const [p, q] = setHand(g, g.me, "十口");
  assert.equal(g.joinFace(g.me, p, p, "top").ok, false);
  assert.equal(g.joinFace(g.me, p, 999, "top").ok, false);
  g.over = true;
  assert.equal(g.joinFace(g.me, p, q, "top").ok, false);
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

test("待ち時間のゲージ（KJ-034）：使った直後は空に近い・半分でおよそ半分・満ちたら押せる・満ちる前は押せない。引き直しの30秒待ちも同じ", () => {
  const g = newGame();
  for (const k of ["invert", "cycle", "homophone"]) assert.equal(g.cdFrac(g.me, k), 1, `${k}：使う前は満ちている`);
  const total = D.rules.cooldown_sec.invert;
  let [id] = setHand(g, g.me, "上");
  assert.ok(g.invert(g.me, [id]).ok);
  assert.ok(g.cdFrac(g.me, "invert") < 0.05, "使った直後は空に近い");
  assert.equal(g.cdFrac(g.cpu, "invert"), 1, "CPU のゲージは別");
  g.clock.t += total / 2;
  assert.ok(Math.abs(g.cdFrac(g.me, "invert") - 0.5) < 0.01, "半分でおよそ半分");
  [id] = setHand(g, g.me, "上");
  assert.equal(g.ready(g.me, "invert"), false);
  assert.equal(g.invert(g.me, [id]).why, "待ち時間", "満ちる前は押せない");
  g.clock.t += total / 2 - 0.1;
  assert.ok(g.cdFrac(g.me, "invert") < 1);
  assert.equal(g.invert(g.me, [id]).ok, false);
  g.clock.t += 0.1;
  assert.equal(g.cdFrac(g.me, "invert"), 1, "満ちた");
  assert.ok(g.invert(g.me, [id]).ok, "満ちたら押せる");
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

test("取る：上の段が8でも、ストックに空きがあれば取れる。16マスが埋まったら取れない（KJ-039・D-053）", () => {
  const g = newGame();
  assert.equal(D.rules.hand_max, 8);
  setHand(g, g.me, "山" + "一".repeat(6)); // 7枚
  g.me.takes = 3;
  const r1 = g.take(g.me, g.field[0].id);
  assert.ok(r1.ok && !r1.card.tray, "7枚なら取れて上の段が8枚になる");
  assert.equal(g.handCount(g.me), 8);
  const r2 = g.take(g.me, g.field[1].id);
  assert.ok(r2.ok, "上の段が8でも取れる");
  assert.ok(r2.card.tray, "上の段が埋まっていれば、取った札はストックへ");
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.trayCount(g.me), 1);
  assert.equal(g.me.takes, 1);
  // 16マスが埋まっている（上8＋ストック8）：取れない
  setHand(g, g.me, "一".repeat(8));
  g.me.cards.push(...[..."二三四五六七八九"].map((c, i) => ({ id: 777000 + i, c, t: g.now(), fresh: false, tray: true })));
  assert.equal(g.me.cards.length, 16);
  assert.equal(g.take(g.me, g.field[0].id).why, "手札もストックもいっぱい");
  assert.equal(g.me.takes, 1, "取れる枚数は残る");
});

test("取りきるまで：放ったら、場から取りきるまで ほかの手は何もできない。取りきったら動ける（KJ-039・D-053）", () => {
  const g = newGame(1);
  setHand(g, g.me, "休日人木山川口十");
  const byChar = (c) => g.me.cards.find((k) => k.c === c).id;
  assert.ok(g.release(g.me, [byChar("山"), byChar("川")]).ok);
  assert.equal(g.me.takes, 2);
  assert.equal(g.locked(g.me), true);
  const WHY = "場から取りきるまで動けない";
  const [x, y, z] = g.me.cards.map((c) => c.id);
  // 割る・くっつける・反転・巡り・同音・放つ・引き直し・入れ替え・移す・引きずってくっつける：全部はじかれる
  assert.equal(g.split(g.me, [byChar("休")]).why, WHY, "割る");
  assert.equal(g.join(g.me, [byChar("人"), byChar("木")]).why, WHY, "くっつける");
  assert.equal(g.joinFace(g.me, byChar("人"), byChar("木"), "right").why, WHY, "引きずってくっつける");
  assert.equal(g.invert(g.me, [byChar("口")]).why, WHY, "反転");
  assert.equal(g.cycle(g.me, [byChar("日")]).why, WHY, "巡り");
  assert.equal(g.homophone(g.me, [byChar("日")], "書").why, WHY, "同音");
  assert.equal(g.release(g.me, [byChar("休"), byChar("日")]).why, WHY, "放つ");
  g.me.score = 50;
  assert.equal(g.redraw(g.me).why, WHY, "引き直し（点があっても）");
  assert.equal(g.me.score, 50, "点は払わない");
  assert.equal(g.swap(g.me, x, y).why, WHY, "入れ替え");
  assert.equal(g.move(g.me, z, true).why, WHY, "移す");
  assert.equal(g.me.takes, 2, "はじかれても取れる枚数は変わらない");
  // 取るだけはできる。1枚では、まだ動けない
  assert.ok(g.take(g.me, g.field[0].id).ok);
  assert.equal(g.me.takes, 1);
  assert.equal(g.split(g.me, [byChar("休")]).why, WHY, "残り1枚のあいだも動けない");
  assert.ok(g.take(g.me, g.field[0].id).ok);
  assert.equal(g.me.takes, 0);
  assert.equal(g.locked(g.me), false);
  // 取りきったら動ける
  assert.ok(g.split(g.me, [byChar("休")]).ok, "取りきったら割れる");
  assert.ok(g.swap(g.me, g.me.cards[0].id, g.me.cards[1].id).ok, "入れ替えもできる");
});

test("取りきるまで：取れる枚数はためられない。放てないので、取りきるまで次の放つが来ない（KJ-039）", () => {
  const g = newGame(1);
  setHand(g, g.me, "休日山川");
  assert.ok(g.release(g.me, g.me.cards.slice(0, 2).map((x) => x.id)).ok);
  assert.equal(g.me.takes, 2);
  assert.equal(g.release(g.me, g.me.cards.map((x) => x.id)).ok, false, "取りきる前には放てない");
  assert.equal(g.me.takes, 2, "足されない");
  takeAll(g, g.me);
  setHand(g, g.me, "山川");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.equal(g.me.takes, 2, "取りきってから放てば、その字数だけ（前の残りは無い）");
  // 相手の動きは、自分の取りきりに関係しない
  assert.equal(g.locked(g.cpu), false);
  setHand(g, g.cpu, "休日");
  assert.ok(g.split(g.cpu, [g.cpu.cards[0].id]).ok, "自分が取りきる前でも、相手は割れる");
});

test("取りきるまで：「ためした」は数えない（取りきるまで手が打てないので、ヒントも出ない）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川");
  assert.ok(g.release(g.me, g.me.cards.slice(0, 2).map((x) => x.id)).ok);
  const n = g.log.length;
  for (let i = 0; i < 5; i++) g.tried(g.me, ["山", "川"], "辞書にない");
  assert.equal(g.log.length, n, "ログに残さない");
  assert.equal(g.hintStreak, 0);
  assert.equal(g.hint, null);
});

test("取りきるまで：時間切れは取りきる前でもそのまま終わる（取れなかった札は数えない）（KJ-039）", () => {
  const g = newGame(1, "solo");
  setHand(g, g.me, "休日山川");
  assert.ok(g.release(g.me, g.me.cards.slice(0, 2).map((x) => x.id)).ok);
  g.clock.t += g.timeLimit;
  assert.equal(g.tick(), true);
  assert.equal(g.over, true);
  assert.equal(g.me.score, 3);
  assert.equal(g.take(g.me, g.field[0].id).why, "終わった");
});

test("割る：手札8＋ストックの全部（rules.json の値。いまは8＋8＝16）まで。いっぱいなら割れない（KJ-004・KJ-010）", () => {
  const g = newGame();
  const X = D.rules.split_extra, ALL = D.rules.hand_max + X;
  assert.equal(X, 8, "ストックは8（KJ-010 追記）");
  setHand(g, g.me, "休" + "一".repeat(7)); // 手札8
  assert.equal(g.handCount(g.me), 8);
  let r = g.split(g.me, [g.me.cards[0].id]);
  assert.ok(r.ok, "手札が8でも割れる");
  assert.equal(g.handCount(g.me), 8, "割ったあとも手札は8まで");
  assert.equal(g.trayCount(g.me), 1, "あふれた1枚は置き場へ");
  assert.equal(g.me.cards.length, 9);
  for (let i = 0; i < X - 1; i++) { // ストックがいっぱいになるまで、手札の1枚を 休 にして割る
    const hand = g.me.cards.find((x) => !x.tray && x.c === "一");
    hand.c = "休";
    assert.ok(g.split(g.me, [hand.id]).ok);
  }
  assert.equal(g.me.cards.length, ALL);
  assert.equal(g.trayCount(g.me), X);
  assert.equal(g.handCount(g.me), 8);
  const spare = g.me.cards.find((x) => !x.tray && (x.c === "一" || x.c === "人")); // 手札の1枚を 休 にする
  spare.c = "休";
  assert.equal(g.split(g.me, [spare.id]).why, "手札もストックもいっぱい", "いっぱいで割れない");
  assert.equal(g.me.cards.length, ALL);
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
  takeAll(g, g.me); // 放ったら取りきるまで動けない（KJ-039）
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

test("取る：早い者勝ち。相手が先に取った札は取れない。16マスが埋まっていれば取れない", () => {
  const g = newGame();
  setHand(g, g.me, "山川");
  setHand(g, g.cpu, "大人");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.ok(g.release(g.cpu, g.cpu.cards.map((x) => x.id)).ok);
  const id = g.field[0].id;
  assert.ok(g.take(g.cpu, id).ok);
  assert.equal(g.take(g.me, id).why, "場にない");
  setHand(g, g.me, "一".repeat(8));
  g.me.cards.push(...[..."二三四五六七八九"].map((c, i) => ({ id: 778000 + i, c, t: g.now(), fresh: false, tray: true })));
  assert.equal(g.take(g.me, g.field[1].id).why, "手札もストックもいっぱい", "上の段・ストックの16マスが埋まっていれば取れない（KJ-039）");
  assert.equal(g.me.takes, 2, "取れる枚数は残る（2字放ったので2枚）");
});

test("引き直し：その試合の何回目かで値段が決まる（0・5・10・15・20）。手札を全部入れ替える（8枚）。一人ずつ数える（KJ-049）", () => {
  const g = newGame();
  setHand(g, g.me, "古");
  g.me.score = 7;
  assert.equal(g.redrawCost(g.me), 0);
  assert.equal(g.redrawsLeft(g.me), 5);
  const r = g.redraw(g.me);
  assert.ok(r.ok);
  assert.deepEqual([r.paid, r.nth], [0, 1]);
  assert.equal(g.me.score, 7, "1回目は0点");
  assert.equal(g.me.cards.length, D.rules.start_hand);
  const e = g.log.filter((x) => x.op === "引き直し").pop();
  assert.deepEqual([e.from, e.pts], [["古"], 0]);
  assert.match(e.note, /1回目 0点/, "ログに何回目と値段");
  assert.equal(g.redrawCost(g.me), 5);
  assert.equal(g.redrawCost(g.cpu), 0, "相手の回数は別（一人ずつ数える）");
  const paid = [];
  for (let i = 0; i < 4; i++) { const x = g.redraw(g.me); paid.push(x.paid); }
  assert.deepEqual(paid, [5, 10, 15, 20]);
  assert.equal(g.me.score, 7 - 50);
  const e5 = g.log.filter((x) => x.op === "引き直し").pop();
  assert.deepEqual([e5.pts], [-20]);
  assert.match(e5.note, /5回目 20点/);
});

test("引き直し：5回まで。6回目は押せない（理由つき）。点が足りなくても払えて、マイナスになってよい。30秒待ちはない（KJ-049）", () => {
  const g = newGame();
  g.me.score = 0;
  for (let i = 0; i < 5; i++) assert.ok(g.redraw(g.me).ok, `${i + 1}回目`);
  assert.equal(g.me.score, -50, "0＋5＋10＋15＋20 を払って -50 点");
  const before = g.me.cards.map((x) => x.id).join();
  const r = g.redraw(g.me);
  assert.equal(r.ok, false);
  assert.equal(r.why, "引き直しは5回まで");
  assert.equal(g.me.cards.map((x) => x.id).join(), before, "6回目は何も変えない");
  assert.equal(g.redrawCost(g.me), null);
  assert.equal(g.redrawsLeft(g.me), 0);
  assert.equal(g.whyNot(g.me, "redraw"), "引き直しは5回まで");
  assert.equal(g.me.redrawAt, undefined, "待つ仕組みはない");
  g.clock.t += 60;
  assert.equal(g.tick(), false, "待ちが明けて勝手に入れ替わることはない");
  assert.equal(g.me.score, -50);
  assert.equal(g.redraw(g.cpu).ok, true, "相手は相手の回数で引き直せる");
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

test("CPU（ふつう・KJ-035）：15〜20秒に1回。とても弱い（30〜45）といまの強さ（8〜12）の間", () => {
  const g = newGame(1, "fair");
  assert.equal(g.opponent, "fair");
  assert.deepEqual(D.rules.cpu.fair_interval_sec, [15, 20]);
  for (let i = 0; i < 50; i++) { const d = g.cpuDelay(); assert.ok(d >= 15 && d <= 20, String(d)); }
});

test("CPU（ふつう・KJ-035）：決まった乱数（1・7・42）で ふつう × N5・N4 の10分。動く回数（CPU の番）は 600÷20〜600÷15 回で、とても弱い より多い（いまの強さ は 50点で早く終わるので比べない）。1回以上放つ", () => {
  const run = (seed, opp, level) => {
    const g = newGame(seed, opp, level, { startStock: true });
    let turns = 0;
    while (!g.over) { g.clock.t += g.cpuDelay(); g.tick(); if (g.over) break; g.cpuTurn(); turns++; }
    return { turns, secs: g.clock.t - 1000, releases: cpuReleases(g).length, score: g.cpu.score };
  };
  for (const level of ["N5", "N4"]) {
    for (const seed of [1, 7, 42]) {
      const [w, f] = ["weak", "fair"].map((o) => run(seed, o, level));
      // 50点で早く終わることがある（KJ-049 で CPU が引き直しで点を捨てなくなった）ので、番の数でなく、1秒あたりの番で見る
      const rate = (x) => x.turns / x.secs;
      assert.ok(rate(f) >= 1 / 20 - 0.005 && rate(f) <= 1 / 15 + 0.005, `${level} seed ${seed}: ふつうの番 ${f.turns}（${f.secs}秒）`);
      assert.ok(rate(w) < rate(f), `${level} seed ${seed}: 弱い ${w.turns}/${w.secs} < ふつう ${f.turns}/${f.secs}`);
      assert.ok(f.releases >= 1, `${level} seed ${seed}: ふつうが放った回数 ${f.releases}`);
    }
  }
});

test("CPU（KJ-039）：放ったらすぐ取りきる。上の段が8でもストックへ取る。取りきるまで次の手は打たない", () => {
  const g = newGame();
  setHand(g, g.cpu, "休日人木山川口十"); // 上の段8。休日 を放つと6枚になる
  const r = g.cpuTurn();
  assert.ok(r.ok && r.text === "休日");
  assert.equal(g.cpu.takes, 0, "取りきった");
  assert.equal(g.cpu.cards.length, 8);
  assert.equal(g.locked(g.cpu), false);
  // 上の段が8のまま、取れる枚数だけストックへ入る
  setHand(g, g.cpu, "山川人木口十一二"); // 上の段8
  g.cpu.takes = 2;
  assert.ok(g.cpuTurn().ok);
  assert.equal(g.handCount(g.cpu), 8);
  assert.equal(g.trayCount(g.cpu), 2, "ストックへ取った");
  assert.equal(g.cpu.takes, 0);
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
  assert.deepEqual([r2.ok, r2.nth, r2.paid], [true, 1, 0], "放てる言葉も1手先もなければ、1回目は0点で引き直す（KJ-049）");
});

test("CPU（KJ-049）：1手先（反転・巡り・同音）で放てる語が作れるなら、引き直さずに待つ／その手を使う", () => {
  const g = newGame(3, "weak", "N5");
  setHand(g, g.cpu, "人円"); // 人 を 同じ読みの 一 にすると 一円 が放てる（1手先）
  assert.ok(g.cpu.cards.length === 2);
  for (const k of ["homophone", "cycle", "invert"]) g.cpu.cd[k] = g.now() + 20; // どの手も待ち時間中
  assert.equal(g.cpuTurn(), null, "待ち時間中は、引き直さずに待つ");
  assert.equal(g.cpu.redraws, 0);
  assert.equal(g.log.filter((e) => e.who === "CPU" && e.op === "引き直し").length, 0);
  g.clock.t += 21;
  const r = g.cpuTurn();
  assert.ok(r && r.ok, "待ちが明けたら、その手を使う");
  assert.notEqual(r.op, "引き直し");
  assert.equal(g.cpu.redraws, 0, "引き直さずに手を使った");
});

test("CPU（KJ-049）：引き直しの値段と5回までは人と同じ。5回使いきったら引き直さない。点はマイナスになる", () => {
  const g = newGame(1, "weak", "N5");
  const paid = [];
  for (let i = 0; i < 7; i++) {
    setHand(g, g.cpu, "卜卜"); // 放てる語も1手先も無い手札
    g.cpu.cd.homophone = g.cpu.cd.cycle = g.cpu.cd.invert = 0;
    const r = g.cpuTurn();
    paid.push(r && r.ok ? r.paid : null);
  }
  assert.deepEqual(paid, [0, 5, 10, 15, 20, null, null]);
  assert.equal(g.cpu.score, -50);
  assert.equal(g.cpu.redraws, 5);
});

test("CPU：1字を放たない。手札が1字だけなら引き直す。2字以上の語が作れるときだけ放つ（KJ-008）", () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    for (const opp of ["weak", "normal"]) {
      const g = newGame(seed, opp);
      setHand(g, g.cpu, "山");
      const before = g.log.length;
      const r = g.cpuTurn();
      assert.deepEqual([r.ok, r.nth, r.paid], [true, 1, 0], `${opp} seed ${seed}: 1字しかなければ 動けない のときの動き（1回目の引き直しは0点）`);
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

// ---- KJ-015：N4 で CPU が止まる不具合 ----
// 画面と同じはじまり（ストックの部品つき）で、10分ぶん CPU だけを回す
function runCpu10min(seed, opp, level) {
  const g = newGame(seed, opp, level, { startStock: true });
  while (!g.over) {
    g.clock.t += g.cpuDelay();
    g.tick();
    if (g.over) break;
    g.cpuTurn();
  }
  return g;
}
const cpuReleases = (g) => g.log.filter((e) => e.who === "CPU" && e.op === "放つ");

test("CPU（KJ-015）：知っている語が無く、画面では「動ける」の語（よく使わない語）だけが手札にあるときも、引き直す（止まらない）", () => {
  const g = newGame(1, "weak", "N4");
  setHand(g, g.cpu, "図学"); // 図学 は N4 の語の表にある（よく使う語ではない）。割る・くっつける・巡り・反転の手もない手札
  assert.equal(g.releasableInHand(g.cpu), "図学", "画面の「動けない」判定は 動ける");
  const r = g.cpuTurn();
  assert.deepEqual([r.ok, r.nth], [true, 1], "引き直す（前は null を返して何もしなかった）");
});

test("CPU（KJ-015）：CPU が知っている語は、どのレベルでもそのレベルの語の表にある", () => {
  for (const [name, t] of [["N5", T], ["N4", T4]]) {
    assert.ok(t.COMMON_WORDS.length > 0, name);
    assert.deepEqual(t.COMMON_WORDS.filter((w) => !t.WORDS.has(w.w)).map((w) => w.w), [], `${name}: 表にない語を知っていると放てずに止まる`);
  }
});

test("CPU（KJ-015）：N4 でも、決まった乱数（1・7・42）で 10分のうちに 2字以上の言葉を1回以上放つ（とても弱い・いまの強さ）", () => {
  for (const opp of ["weak", "normal"]) {
    for (const seed of [1, 7, 42]) {
      const g = runCpu10min(seed, opp, "N4");
      const rel = cpuReleases(g);
      assert.ok(rel.length >= 1, `N4 ${opp} seed ${seed}: 放った回数 ${rel.length}`);
      assert.ok(rel.every((e) => e.from.length >= 2), "2字以上");
      const rds = g.log.filter((e) => e.who === "CPU" && e.op === "引き直し");
      assert.ok(rds.length <= 5, `N4 ${opp} seed ${seed}: 引き直しは5回まで（${rds.length}回）`);
      rds.forEach((e, i) => assert.match(e.note, new RegExp(`^${i + 1}回目 ${D.rules.redraw.costs[i]}点`), "引き直しの何回目と値段がログに残る"));
    }
  }
});

test("CPU（KJ-015）：N5 の とても弱い CPU の点は、直す前（1・7・42 で 24・21・27、平均24）から大きく変わらない", () => {
  const scores = [1, 7, 42].map((seed) => runCpu10min(seed, "weak", "N5").cpu.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  assert.ok(mean >= 14 && mean <= 36, `平均 ${mean}（${scores}）`);
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
  g.take(g.me, g.field[0].id); // 2字放ったので2枚取りきる（取りきるまで「ためした」も数えない。KJ-039）
  g.tried(g.me, ["口", "十"], "並べる順が逆");
  const ops = g.log.map((e) => e.op);
  assert.deepEqual(ops, ["はじめ", "くっつける", "放つ", "取る", "取る", "ためした"]);
  const j = g.log[1];
  assert.equal(j.t, 1.5);
  assert.equal(j.who, "あなた");
  assert.deepEqual([j.from, j.to, j.me, j.cpu], [["人", "木"], ["休"], 4, 2]);
  const t = g.log[2];
  assert.deepEqual([t.from, t.pts, t.meScore, t.cpuScore, t.me], [["休", "日"], 3, 3, 0, 2]);
  assert.match(t.note, /2字3。場から2枚取れる/);
  assert.deepEqual([g.log[3].from, g.log[3].me], [[fc], 3]);
  assert.deepEqual([g.log[5].from, g.log[5].note], [["口", "十"], "並べる順が逆"]);
});

test("ログ：書き出しの頭に仮置きの値を全部書く", () => {
  const g = newGame();
  const text = g.logText();
  const head = text.split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /場=3枚 最初の手札=8枚 手札の上限=8枚＋ストック8枚（全部で16マス。場から取るのは上の段・ストックを合わせて16マスが埋まるまで（上の段が埋まっていればストックへ）。割る・くっつけるでできた札は、字も部品も、手札が埋まっていればストックへ。手札とストックの間は自分で動かせる）/);
  assert.match(head, /# 相手 いまの強さ（CPU は 8〜12秒に1回動く）/);
  assert.match(head, /点数 2字3・3字6・4字12 四字熟語×2 特別な語×2（1字は放てない）/);
  assert.match(head, /放った字数×1枚を場から選んで、取りきるまで、ほかの手は何もできない（取れる枚数はためられない）/);
  assert.match(head, /引き直し 1試合5回まで・0点→5点→10点→15点→20点と回数で上がる・手札を全部入れ替え（8枚）。点はマイナスになってよい（足りなくても払える）/);
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
  assert.match(e.note, /放てる言葉なし。使える手：割る・反転・巡り・同音・引き直し（0点）/);
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
test("相手：初期値は「とても弱い」。選べるのは ひとりで／とても弱い／ふつう／いまの強さ", () => {
  assert.equal(D.rules.opponent_default, "weak");
  assert.deepEqual(K.OPPONENTS.map((o) => o.label), ["ひとりで", "とても弱い", "ふつう", "いまの強さ"]);
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

test("ひとりで：引き直しも同じ（1回目は0点・5回まで）。待つ仕組みはない（KJ-049）", () => {
  const g = newGame(1, "solo");
  g.me.score = 0;
  assert.equal(g.redraw(g.me).paid, 0, "1回目の引き直しは0点");
  assert.equal(g.me.cards.length, D.rules.start_hand);
  assert.equal(g.redraw(g.me).paid, 5);
  assert.equal(g.me.score, -5);
});

test("ログ：頭に選んだ相手を書く（ひとりで／とても弱い／ふつう／いまの強さ）", () => {
  const head = (opp) => newGame(1, opp).logText().split("\n").filter((l) => l.startsWith("# 相手")).join("");
  assert.match(head("solo"), /# 相手 ひとりで（CPU なし。場の取り合いなし。50点では終わらず、10分たったら終わって点を出す/);
  assert.match(head("weak"), /# 相手 とても弱い（CPU は 30〜45秒に1回動く。動き方はいまの CPU のまま）/);
  assert.match(head("fair"), /# 相手 ふつう（CPU は 15〜20秒に1回動く）/);
  assert.match(head("normal"), /# 相手 いまの強さ（CPU は 8〜12秒に1回動く）/);
  assert.match(newGame(1, "weak").logText(), /# 仮置き CPU 30〜45秒に1回動く/);
  assert.match(newGame(1, "solo").logText(), /# 仮置き CPU なし/);
});

// ---------- KJ-005：入れ替え ／ KJ-030：並べ方の切り替えをなくした ----------
test("並べ方の切り替えはない（KJ-030）：選び方は1つ。ログの頭にも手にも並べ方が出ない", () => {
  const g = newGame(1);
  assert.equal(K.LAYOUTS, undefined);
  assert.equal(K.layoutLabel, undefined);
  assert.equal(g.setLayout, undefined);
  assert.equal(g.layout, undefined);
  assert.equal("layout_default" in D.rules, false, "rules.json から layout_default を消した");
  assert.doesNotMatch(g.logText(), /並べ方/, "ログの頭にも手の説明にも 並べ方 は出ない");
  assert.equal(K.createGame(D, T, { now: () => 0, layout: "hand" }).layout, undefined, "layout を渡しても何も起きない");
});

// ---------- KJ-007：制限時間を選ぶ ----------
test("時間：選べるのは rules の 5・10・15分。知らない値は既定の10分。選んだ時間で終わる時刻が変わる", () => {
  assert.deepEqual(K.timeChoices(D), [300, 600, 900]);
  assert.equal(K.normTime(D, 900), 900);
  assert.equal(K.normTime(D, "300"), 300, "端末に覚えた文字列も読める");
  for (const bad of [7, 0, null, undefined, "", "でたらめ", 1200]) assert.equal(K.normTime(D, bad), D.rules.win.time_limit_sec, String(bad));
  assert.equal(newGame(1).timeLimit, 600, "省くと既定");
  for (const sec of K.timeChoices(D)) {
    const clock = { t: 1000 };
    const g = K.createGame(D, T, { now: () => clock.t, rand: () => 0.5, opponent: "solo", timeLimit: sec, firstPick: false, startStock: false });
    assert.equal(g.timeLimit, sec);
    assert.equal(g.timeLeft(), sec);
    clock.t += sec - 0.1; g.tick();
    assert.equal(g.over, false, `${sec}秒の手前では終わらない`);
    clock.t += 0.2; g.tick();
    assert.equal(g.over, true, `${sec}秒で終わる`);
  }
  // 対 CPU も選んだ時間で点の多い方が勝つ
  const clock = { t: 1000 };
  const g = K.createGame(D, T, { now: () => clock.t, rand: () => 0.5, opponent: "normal", timeLimit: 300, firstPick: false, startStock: false });
  g.me.score = 7; clock.t += 301; g.tick();
  assert.equal(g.over, true);
  assert.equal(g.winner, g.me);
});

test("時間：はじめたらすぐ時間が動く（はじめの1枚は KJ-016 でやめた）。選んだ時間が数えられる", () => {
  const g = newGame(1, "solo", "N5");
  const g2 = K.createGame(D, T, { now: () => g.clock.t, rand: () => 0.5, opponent: "solo", timeLimit: 900 });
  assert.equal(g2.picking, undefined, "止まっている状態は無い");
  assert.equal(g2.timeLeft(), 900);
  g.clock.t += 100;
  assert.equal(g2.timeLeft(), 800, "はじめた時から減る");
  assert.equal(g2.elapsed(), 100);
});

test("ログの頭に レベル・相手・時間 の3つが出る（KJ-007。並べ方は KJ-030 でなくした）", () => {
  const clock = { t: 1000 };
  const g = K.createGame(D, T, { now: () => clock.t, rand: () => 0.5, opponent: "solo", timeLimit: 900, date: () => new Date(2026, 10, 21, 9, 0, 0) });
  const head = g.logText().split("\n").filter((l) => /^# (レベル|相手|時間) /.test(l));
  assert.equal(head.length, 3);
  assert.deepEqual(head.map((l) => l.split(" ")[1]), ["レベル", "相手", "時間"]);
  assert.match(g.logText(), /# 時間 15分\n/);
  assert.match(g.logText(), /# 相手 ひとりで（CPU なし。場の取り合いなし。50点では終わらず、15分たったら終わって点を出す/);
  assert.match(g.logText(), /# 仮置き 勝ち 先に50点、または15分で点の多い方（同点は引き分け）。ひとりでは50点で終わらず15分で終わる/);
});

test("選んだ順がそのまま効く。放つ・くっつける・割る の結果（KJ-005。KJ-030 で選び方は1つ）", () => {
  // 画面は「選んだ札の id の並び」を台の並びと同じ形で core に渡す。順番ちがいで結果が変わることを確かめる
  {
    const run = (chars, op) => {
      const g = K.createGame(D, T, { now: () => 1000, rand: () => 0.5, date: () => new Date(2026, 10, 21), firstPick: false, startStock: false });
      const ids = setHand(g, g.me, "休日十口人木");
      const pick = (s) => [...s].map((c) => g.me.cards.find((x) => x.c === c).id);
      return { g, ids, r: op(g, pick(chars)) };
    };
    const a = run("休日", (g, ids) => g.release(g.me, ids));
    assert.deepEqual([a.r.ok, a.r.text, a.r.pts], [true, "休日", 3]);
    const b = run("日休", (g, ids) => g.release(g.me, ids));
    assert.equal(b.r.ok, false, "日休 は放てない（選んだ順）");
    const c = run("十口", (g, ids) => g.join(g.me, ids));
    assert.equal(c.r.ok, true);
    assert.ok(["古", "田"].includes(c.r.cards[0].c));
    const d = run("口十", (g, ids) => g.join(g.me, ids));
    assert.deepEqual([d.r.ok, d.r.why], [false, "並べる順が逆"]);
    const e = run("休", (g, ids) => g.split(g.me, ids));
    assert.deepEqual([e.r.ok, e.r.cards.map((x) => x.c).join("")], [true, "人木"]);
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
  assert.equal(total, (D.kanji.count_by_level.N5 + D.kanji.count_by_level.N4) * D.rules.same_char_in_deck);
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
test("ストック：最初の手札は8枚（手札が埋まっている）。ストックは空（部品を入れない形で作ったとき）", () => {
  const g = newGame(1, "normal", "N4");
  assert.equal(D.rules.start_hand, 8);
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.trayCount(g.me), 0);
  assert.equal(g.cpu.cards.length, 8);
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
  const X = D.rules.split_extra;
  assert.ok(g.move(g.me, ids[0], true).ok, "手札→ストック");
  assert.equal(g.trayCount(g.me), 1);
  assert.equal(g.handCount(g.me), 6);
  assert.equal(g.log[g.log.length - 1].op, "移す");
  assert.equal(g.move(g.me, ids[0], true).why, "同じ段");
  assert.ok(g.move(g.me, ids[0], false).ok, "ストック→手札");
  assert.equal(g.trayCount(g.me), 0);
  // ストックを rules.json の枚数までいっぱいにしてから、手札の1枚を移そうとするとはじかれる
  const g1 = newGame(1);
  const h1 = setHand(g1, g1.me, "山川一二三四五六");
  for (let i = 0; i < X; i++) g1.me.cards.push({ id: 880000 + i, c: "七", t: 0, fresh: false, tray: true });
  assert.equal(g1.trayCount(g1.me), X);
  assert.equal(g1.move(g1.me, h1[0], true).why, "ストックがいっぱい");
  const full = newGame(1);
  const fids = setHand(full, full.me, "山川一二三四五六");
  full.me.cards.push({ id: 888001, c: "七", t: 0, fresh: false, tray: true });
  assert.equal(full.move(full.me, 888001, false).why, "手札がいっぱい");
  assert.ok(fids.length === 8);
});

test("ストック：上の段が8のとき、取った札はストックに入る。上の段に空きがあれば上（KJ-039。もとは手札の8マスまで）", () => {
  const g = newGame(1);
  setHand(g, g.me, "山川一二三四五六");
  g.me.takes = 1;
  const r0 = g.take(g.me, g.field[0].id);
  assert.ok(r0.ok && r0.card.tray, "手札が8なら、取った札はストックへ");
  assert.ok(g.move(g.me, g.me.cards[0].id, true).ok); // 取りきったので、上の段の1枚をストックへ移して、上の段に空きを作れる
  g.me.takes = 1;
  const r = g.take(g.me, g.field[0].id);
  assert.ok(r.ok);
  assert.ok(!r.card.tray, "上の段に空きがあれば、取った札は上の段へ");
});

// ---------- KJ-013：ストックに部品1枚（作者 2026-11-21。D-030）。KJ-016 で、はじめの1枚と台の一時置き場はやめた（D-033・D-034） ----------
test("はじまり：最初の手札は8枚。ストックに使いやすい部品が1枚入っている（山に無い部品。候補の上位5つから）", () => {
  assert.equal(D.rules.first_pick, undefined, "はじめの1枚はやめた（KJ-016）");
  assert.equal(D.rules.start_stock_parts, 1);
  for (const lv of ["N5", "N4"]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = newGame(seed, "normal", lv, { startStock: true });
      const T0 = lv === "N5" ? T : T4;
      const cand = g.stockCandidates.map((x) => x.c);
      assert.equal(cand.length, D.rules.start_stock_top, lv);
      for (const p of [g.me, g.cpu]) {
        assert.equal(g.handCount(p), 8, `${lv} 手札8`);
        assert.equal(g.trayCount(p), 1, `${lv} ストックに1枚`);
        const part = p.cards.find((x) => x.tray).c;
        assert.ok(cand.includes(part), `${lv} ${part} は候補`);
        assert.ok(!T0.CHARS.has(part) && !K.isChar(T0, part), `${lv} ${part} は山に無い部品`);
      }
    }
  }
});

test("使いやすい部品の候補：行き先（くっつけてできる字）の数が多い順。N5・N4 とも行き先は1つ以上", () => {
  for (const [lv, TT] of [["N5", T], ["N4", T4]]) {
    const g = newGame(1, "normal", lv, { startStock: true });
    const ns = g.stockCandidates.map((x) => x.n);
    assert.deepEqual(ns, [...ns].sort((a, b) => b - a), `${lv} 多い順`);
    assert.ok(ns.every((n) => n >= 1));
    for (const { c, n } of g.stockCandidates) {
      const dest = new Set();
      for (const [key, res] of TT.JOIN) if ([...key].includes(c)) res.forEach((r) => dest.add(r));
      assert.equal(dest.size, n, `${lv} ${c}`);
    }
  }
});

test("ひとりで：CPU には手札もストックも配らない（山からも引かない）", () => {
  const g = newGame(1, "solo", "N5", { startStock: true });
  assert.equal(g.cpu.cards.length, 0);
  assert.equal(g.trayCount(g.me), 1);
});

test("はじまり（KJ-016）：8枚で始まり、始めてすぐ時間が動く。操作もすぐできる。はじめの1枚はない", () => {
  const g = newGame(1, "normal", "N5", { startStock: true });
  assert.equal(g.picking, undefined);
  assert.equal(g.pickFirst, undefined, "はじめの1枚の操作はやめた");
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.handCount(g.cpu), 8, "CPU も8枚");
  const limit = D.rules.win.time_limit_sec;
  assert.equal(g.timeLeft(), limit);
  g.clock.t += 10;
  assert.equal(g.timeLeft(), limit - 10, "始めたところから減る");
  const ids = setHand(g, g.me, "休日十口人木七山");
  assert.ok(g.release(g.me, ids.slice(0, 2)).ok, "始めてすぐ放てる");
  assert.equal(g.field.length, D.rules.field_size);
});

test("はじまり（KJ-016）：ログに「最初の1枚」「はじまり」の行がない。頭に はじまり の説明が出る", () => {
  const g = newGame(1, "normal", "N5", { startStock: true });
  assert.equal(g.log.filter((e) => e.op === "最初の1枚" || e.op === "はじまり").length, 0);
  assert.deepEqual(g.log.map((e) => e.op), ["はじめ"]);
  assert.ok(!g.log[0].note.includes("時間は止まっている"));
  const text = g.logText();
  assert.ok(!text.includes("最初の1枚"), "ログの頭の 手 の一覧にも出ない");
  assert.match(text, /# 仮置き はじまり：最初の手札8枚で、すぐ時間が動く。ストックに使いやすい部品を1枚入れて始める/);
  assert.ok(!text.includes("場から1枚だけ選んで取る"));
});

test("はじまりのあと：場から取るのは放った字数だけ。放たないと取れない（8枚で始まるので、放つ前は上の段がいっぱい）", () => {
  const g = newGame(1, "normal", "N5", { startStock: true });
  assert.equal(g.me.takes, 0);
  assert.equal(g.handCount(g.me), 8);
  assert.equal(g.take(g.me, g.field[0].id).why, "取れる枚数がない");
  setHand(g, g.me, "休日十口人木七山");
  const ids = g.me.cards.slice(0, 2).map((x) => x.id);
  assert.ok(g.release(g.me, ids).ok);
  assert.equal(g.me.takes, 2);
  assert.ok(g.take(g.me, g.field[0].id).ok);
});

test("引き直し（KJ-016）：配る枚数は8枚。人も CPU も。ひとりでも8枚", () => {
  for (const opp of ["normal", "weak", "solo"]) {
    const g = newGame(1, opp, "N5", { startStock: true });
    setHand(g, g.me, "古");
    g.me.score = 9;
    assert.ok(g.redraw(g.me).ok);
    assert.equal(g.handCount(g.me), 8, opp);
    assert.equal(g.me.cards.length, 8, opp);
    assert.equal(g.me.cards.filter((x) => x.tray).length, 0, "引き直しで配る札は手札（上の段）へ");
  }
  const g = newGame(1, "normal", "N5");
  setHand(g, g.cpu, "古");
  g.cpu.score = 9;
  assert.ok(g.redraw(g.cpu).ok);
  assert.equal(g.cpu.cards.length, 8, "CPU も8枚");
});

// ---------- KJ-016：台は並べて見る場所（作者 2026-11-21 20:18。D-034）。台の札も段の枚数に数える ----------
test("台（KJ-016）：台に出した札も上の段・下の段の枚数に数える。台を使っても手札の枚数は変わらない", () => {
  const g = newGame(1);
  assert.equal(g.setTable, undefined, "台を一時置き場にする仕組み（setTable）はやめた");
  const ids = setHand(g, g.me, "休古日十口人木七"); // 手札8
  assert.equal(g.handCount(g.me), 8, "台に出しても出さなくても8");
  g.me.takes = 3;
  const r = g.take(g.me, g.field[0].id);
  assert.ok(r.ok && r.card.tray, "上の段が8なら、取った札はストックへ（KJ-039）");
  assert.equal(g.handCount(g.me), 8, "上の段は8のまま");
  assert.ok(ids.length === 8);
});

test("台（KJ-016）：割る・くっつけるでできた札は、空きがある段へ。段が全部埋まっていればその操作はできない", () => {
  const ALL = D.rules.hand_max + D.rules.split_extra;
  const full = (seed) => {
    const g = newGame(seed);
    const ids = setHand(g, g.me, "休古日十口人木七");
    for (let i = 0; i < D.rules.split_extra; i++) g.me.cards.push({ id: 700000 + i, c: "山川一二三四五六七八"[i], t: 0, fresh: false, tray: true });
    assert.equal(g.handCount(g.me) + g.trayCount(g.me), ALL);
    return { g, ids };
  };
  // 全マス埋まり：割ると 休→人木 で +1 になるので割れない（台に出していても同じ）
  const { g, ids } = full(1);
  assert.equal(g.split(g.me, [ids[0]]).why, "手札もストックもいっぱい");
  assert.equal(g.fits(g.me, [g.byId(g.me, ids[0])], 2), false);
  // くっつける：2枚→1枚なので置き場はある
  const j = g.join(g.me, [ids[3], ids[4]], "古");
  assert.ok(j.ok, j.why);
  assert.equal(g.handCount(g.me) + g.trayCount(g.me), ALL - 1);
  // 1マス空けると割れる。できた札は空きのある段（手札が埋まっていればストック。ストックが埋まっていれば手札の空き）へ
  assert.ok(g.split(g.me, [ids[0]]).ok, "空きがあれば割れる");
  assert.equal(g.handCount(g.me) + g.trayCount(g.me), ALL);
  assert.ok(g.handCount(g.me) <= D.rules.hand_max && g.trayCount(g.me) <= D.rules.split_extra, "どの段も上限を超えない");
});

test("台（KJ-016）：台に置いたまま取り続けても、台から戻しても、手札は上限を超えない", () => {
  const g = newGame(1);
  setHand(g, g.me, "休古日十口人木");
  g.me.takes = 5;
  let n = 0;
  while (g.take(g.me, g.field[0].id).ok) n++;
  assert.equal(n, 5, "7枚のとき、取れるのは取れる枚数の5枚（上の段が埋まったら、あとはストックへ。KJ-039）");
  assert.equal(g.handCount(g.me), D.rules.hand_max);
  assert.equal(g.trayCount(g.me), 4);
  assert.equal(g.take(g.me, g.field[0].id).why, "取れる枚数がない");
  assert.equal(g.me.cards.length, 12);
  // 台から戻す＝札は元の段にいるまま。枚数は変わらない
  assert.equal(g.handCount(g.me), 8);
});

// ---------- 十二支（KJ-009・D-027） ----------
test("十二支：巡りで子から一周して亥から子へ戻る。N5・N4 どちらでも。レベルの外の字が手札に来る", () => {
  const order = [..."子丑寅卯辰巳午未申酉戌亥"];
  for (const lv of ["N5", "N4"]) {
    const g = newGame(1, "solo", lv);
    let [id] = setHand(g, g.me, "子");
    const seen = ["子"];
    for (let i = 0; i < 12; i++) {
      g.clock.t += D.rules.cooldown_sec.cycle;
      const r = g.cycle(g.me, [id]);
      assert.ok(r.ok, `${lv}：${seen[seen.length - 1]} から巡れない`);
      seen.push(r.cards[0].c);
      id = r.cards[0].id;
    }
    assert.deepEqual(seen, [...order, "子"], `${lv}：一周して子に戻る`);
    assert.ok(!g.T.CHARS.has("丑") && K.isChar(g.T, "丑"), `${lv}：丑 は山の字ではないが「字」として見せる`);
  }
});

test("十二支：レベルの外の字（丑など）は山にも場にも出ない。引き直し・取るで補充されても出ない", () => {
  const out = [..."丑寅卯辰巳未申酉戌亥"];
  for (const lv of ["N5", "N4"]) {
    for (const seed of [1, 2, 3]) {
      const g = newGame(seed, "solo", lv);
      for (const c of out) {
        assert.ok(!g.deck.includes(c), `${lv} 山に ${c}`);
        assert.ok(!g.field.some((f) => f.c === c), `${lv} 場に ${c}`);
        assert.ok(!g.me.cards.some((x) => x.c === c), `${lv} 手札に ${c}`);
      }
      setHand(g, g.me, "丑辰未");
      g.me.score = 10;
      assert.ok(g.redraw(g.me).ok);
      for (const c of out) {
        assert.ok(!g.deck.includes(c), `${lv} 引き直しのあと山に ${c}`);
        assert.ok(!g.me.cards.some((x) => x.c === c), `${lv} 引き直しで手札に ${c}`);
      }
    }
  }
});

test("十二支：レベルの外の字も同じ読みの字に変えられる。変えた先から外の字にも変えられる", () => {
  const g = newGame(1, "solo", "N5");
  let [id] = setHand(g, g.me, "丑");
  assert.ok(K.homoChars(g.T, "丑").includes("中"));
  let r = g.homophone(g.me, [id], "中");
  assert.ok(r.ok, "丑→中（チュウ）");
  assert.equal(chars(g.me.cards), "中");
  g.clock.t += D.rules.cooldown_sec.homophone;
  [id] = setHand(g, g.me, "新");
  r = g.homophone(g.me, [id], "辰");
  assert.ok(r.ok, "新→辰（シン）。レベルの字から外の字へ");
  assert.equal(chars(g.me.cards), "辰");
  g.clock.t += D.rules.cooldown_sec.homophone;
  [id] = setHand(g, g.me, "辰");
  assert.ok(g.homophone(g.me, [id], "申").ok, "辰→申（シン）。外の字どうし");
});

test("十二支：外の字を含む語が放てる（未来・丑年）。N5 でも N4 でも", () => {
  for (const lv of ["N5", "N4"]) {
    const g = newGame(1, "solo", lv);
    let r = g.release(g.me, setHand(g, g.me, "未来山"));
    assert.equal(r.ok, false, "未来山 は語にない");
    r = g.release(g.me, setHand(g, g.me, "未来").slice(0, 2));
    assert.ok(r.ok && r.pts === 3, `${lv}：未来`);
    takeAll(g, g.me); // 取りきるまで次を放てない（KJ-039）
    r = g.release(g.me, setHand(g, g.me, "丑年").slice(0, 2));
    assert.ok(r.ok && r.pts === 3, `${lv}：丑年`);
  }
});

// ---------- KJ-020 ログの自動送信：送る中身の形と、送ってよい場所 ----------
test("ログの送信（KJ-020）：1手も動いていなければ送らない。動いたら決まった形の1行", () => {
  const g = newGame(1, "normal");
  assert.equal(K.playLogRow(g, "dev-1"), null, "はじめただけでは送らない");
  g.tried(g.me, ["天", "口"], "辞書にない");
  const row = K.playLogRow(g, "dev-1");
  assert.deepEqual(Object.keys(row).sort(), ["app_version", "device_id", "level", "log", "opponent", "result"]);
  assert.equal(row.device_id, "dev-1");
  assert.equal(row.app_version, D.rules.version);
  assert.equal(row.level, "N5");
  assert.equal(row.opponent, "normal");
  assert.match(row.result, /^途中でやめた（/);
  assert.equal(row.log, g.logText());
  assert.ok(row.result.length <= K.PLAY_LOG_LIMITS.result && row.device_id.length <= K.PLAY_LOG_LIMITS.device_id);
});

test("ログの送信（KJ-020）：終わったときの result（勝ち・ひとりで）と、長すぎる値は切る", () => {
  const g = newGame(1, "normal");
  setHand(g, g.me, "休日");
  g.me.score = 48;
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.ok(g.over);
  const row = K.playLogRow(g, "x".repeat(100));
  assert.match(row.result, /^あなたの勝ち（10分 51対\d+）$/);
  assert.equal(row.device_id.length, 64);
  const s = newGame(1, "solo");
  setHand(s, s.me, "休日");
  assert.ok(s.release(s.me, s.me.cards.map((x) => x.id)).ok);
  s.clock.t += 700;
  s.tick();
  assert.ok(s.over);
  assert.equal(K.playLogRow(s, "d").result, "ひとりで 3点（10分）");
  const big = newGame(1);
  big.tried(big.me, ["天"], "x".repeat(300000));
  assert.equal(K.playLogRow(big, "d").log.length, K.PLAY_LOG_LIMITS.log);
});

test("ログの送信（KJ-020）：手元（localhost・127.0.0.1・file）とテストでは送らない。公開ページでは送る", () => {
  assert.equal(K.logSendAllowed({ hostname: "kaz6.github.io", webdriver: false }), true);
  for (const h of ["localhost", "127.0.0.1", "", "[::1]", "foo.localhost"]) assert.equal(K.logSendAllowed({ hostname: h, webdriver: false }), false, h);
  assert.equal(K.logSendAllowed({ hostname: "kaz6.github.io", webdriver: true }), false, "テスト（webdriver）では送らない");
  assert.equal(K.logSendAllowed({ hostname: "127.0.0.1", webdriver: true, force: true }), true, "force は送る処理を確かめるときだけ");
});

// 画面の文言（KJ-024・KJ-048）：ボタンの文字は英語、角の印は字に組み込んだ SVG（Flip・Cycle・Same reading）。js/strings.js に置き、index.html はそこから出す
test("文言（KJ-024・KJ-048）：js/strings.js のボタンは8つで英語。同音は Same reading。印は ⇄・↻・♪ の文字でなく SVG（Fl＋印＋p・印＋ycle・印＋ame reading）", () => {
  const fs = require("fs");
  const path = require("path");
  const S = require("../js/strings.js");
  assert.equal(S.ICONS, undefined, "⇄・↻・♪ の文字の印は持たない（KJ-048）");
  assert.deepEqual(S.BUTTONS, { bRelease: "Play", bSplit: "Split", bJoin: "Join", bInvert: "Flip", bCycle: "Cycle", bHomo: "Same reading", bBack: "Back", bRedraw: "Redraw" }, "読み上げの名前");
  assert.deepEqual(S.LOGO, { bInvert: ["Fl", "invert", "p"], bCycle: ["", "cycle", "ycle"], bHomo: ["", "homophone", "ame reading"] }, "印を字の1つに組み込む");
  // 印の SVG：相談チャットの見本（C1・S1・F2）の形と色（currentColor）
  const svg = (k) => S.iconSvg(k);
  assert.match(svg("cycle"), /viewBox="0 0 20 24"/);
  assert.match(svg("cycle"), /M16 6\.5A8 8 0 1 0 16 17\.5/);
  assert.match(svg("cycle"), /M12\.5 3\.5L16 6\.5L12 8\.5/);
  assert.match(svg("homophone"), /viewBox="0 0 18 24"/);
  assert.match(svg("homophone"), /M14\.5 6\.5C13\.5 4 4 3 4 8C4 12\.5 14 11\.5 14 16C14 21 4\.5 20\.5 3\.5 17\.5/);
  assert.match(svg("homophone"), /M14\.5 3\.5V6\.5H11\.5/);
  assert.match(svg("homophone"), /M3\.5 20\.5V17\.5H6\.5/);
  assert.match(svg("invert"), /viewBox="0 0 12 24"/);
  assert.match(svg("invert"), /<circle cx="6" cy="3" r="1\.7"/);
  assert.match(svg("invert"), /M6 8\.5V21\.5M3\.5 11L6 8\.5L8\.5 11M3\.5 19L6 21\.5L8\.5 19/);
  for (const k of ["invert", "cycle", "homophone"]) {
    assert.match(svg(k), /stroke="currentColor"/, `${k} の色は文字と同じ`);
    assert.match(svg(k), /aria-hidden="true"/, `${k} は読み上げに出さない`);
  }
  assert.equal(S.buttonHtml("bRelease"), "Play");
  assert.equal(S.buttonHtml("bInvert"), `Fl${svg("invert")}p`);
  assert.equal(S.buttonHtml("bCycle"), `${svg("cycle")}ycle`);
  assert.equal(S.buttonHtml("bHomo"), `${svg("homophone")}ame reading`);
  for (const t of [...Object.values(S.BUTTONS), ...Object.values(S.LOGO).flat()]) assert.doesNotMatch(t, /[⇄↻♪]|Sound conversion/, "古い印・古い名前が残っていない");
  assert.equal(S.redrawNote.cost(5), "-5pt", "点が減ることが分かる添え字（KJ-034 追記）");
  assert.equal(S.redrawNote.cost(0), "0pt", "1回目は 0pt（KJ-049）");
  assert.equal(S.redrawNote.text(0, 5), "0pt あと5回");
  assert.equal(S.redrawNote.text(10, 3), "-10pt あと3回");
  assert.equal(S.redrawNote.text(null, 0), "あと0回", "使いきったら値段は出さない");
  assert.equal(S.redrawNote.free, undefined, "30秒待ちの添え字はなくした（KJ-049）");
  assert.equal(S.redrawNote.wait, undefined, "待っているあいだの秒数の文字は出さない（KJ-034）");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const id of Object.keys(S.BUTTONS)) assert.match(html, new RegExp(`<button class="op[^"]*" id="${id}"><span class="lb"></span>`), `${id} の文字は strings.js から入れる（直書きしない）`);
  const ops = html.slice(html.indexOf('<div class="ops">'), html.indexOf('<div class="choices"'));
  assert.doesNotMatch(ops.replace(/<!--[\s\S]*?-->/g, ""), /[぀-ヿ㐀-鿿]/, "ボタンの並びに日本語を直書きしていない");
  assert.equal(K.marks(T, "上", { invert: "F", cycle: "C", homophone: "S" }), "FS", "core.marks は渡された印の字で並べる（画面は SVG を使う）");
  assert.equal(K.marks(T, "上"), "反音", "icons を渡さなければ 反・巡・音");
  assert.equal(K.marks(T, "国", { invert: "F", cycle: "C", homophone: "S" }), "", "印の無い字");
  assert.deepEqual(K.markKinds(T, "上"), ["invert", "homophone"], "印の種類（KJ-040）：反転・巡り・同音の順");
  assert.deepEqual(K.markKinds(T, "十"), ["cycle", "homophone"]);
  assert.deepEqual(K.markKinds(T, "国"), []);
});

// ---------- KJ-036：画面が裏に回って時計が止まっても、時間どおりに終わる ----------
test("KJ-036 裏から戻ると制限時間で終わる：終わりの秒は制限時間を超えない（1時間たっていても）", () => {
  for (const opp of ["solo", "weak", "fair", "normal"]) {
    const g = newGame(1, opp);
    const lim = g.timeLimit;
    g.clock.t += 3596.3; // 裏にいて、1時間近くたった
    g.tick(); // 戻ったときの1回目の tick
    assert.equal(g.over, true, opp);
    const end = g.log[g.log.length - 1];
    assert.equal(end.op, "終わり", opp);
    assert.ok(end.t <= lim, `${opp}: 終わりの秒 ${end.t}`);
    assert.equal(end.t, lim, `${opp}: 制限時間ちょうど`);
    assert.ok(g.log.every((e) => e.t <= lim), `${opp}: ログの秒がどれも制限時間以内`);
  }
});

test("KJ-036 時間切れのあと CPU は手を打たない（裏にいた間の手を取り戻さない）", () => {
  const g = newGame(1, "normal");
  const n0 = g.log.length;
  g.clock.t += 3600;
  assert.equal(g.cpuTurn(), null, "時間切れのあとは動かない");
  assert.equal(g.over, true, "cpuTurn が呼ばれても時間切れで終わる");
  assert.deepEqual(g.log.slice(n0).map((e) => e.op), ["終わり"], "増えたのは「終わり」だけ");
  assert.equal(g.cpuTurn(), null, "終わったあとも動かない");
  assert.equal(g.log.length, n0 + 1);
});

test("KJ-036 制限時間の前なら CPU は1回に1手だけ（まとめて動かない）", () => {
  const g = newGame(1, "normal");
  g.clock.t += g.timeLimit - 60; // 裏で長くいたが、まだ時間内
  const n0 = g.log.filter((e) => e.who === "CPU").length;
  g.cpuTurn();
  assert.equal(g.over, false);
  const n1 = g.log.filter((e) => e.who === "CPU" && e.op !== "動けない" && e.op !== "動ける").length;
  assert.ok(n1 - n0 <= 3, `1回の cpuTurn で増えた手 ${n1 - n0}`); // 取る→放つ→取るの連なりまで
});

// ---------- KJ-037 ヒント（D-052）：続けて3回はじかれたら、自動で札とボタンを光らせる ----------
const tryN = (g, n, p = g.me) => { for (let i = 0; i < n; i++) g.tried(p, [p.cards[0].c, p.cards[1].c], "辞書にない"); };
const idsOf = (g, text) => [...text].map((c) => g.me.cards.find((x) => x.c === c).id);

test("KJ-037 ヒント：決まり（rules.json の hint）。3回・10秒", () => {
  assert.deepEqual(D.rules.hint, { fail_streak: 3, glow_sec: 10 });
});

test("KJ-037 ヒント：3回はじかれると出る。2回では出ない", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川");
  tryN(g, 2);
  assert.equal(g.hint, null, "2回では出ない");
  assert.equal(g.log.some((e) => e.op === "ヒント"), false);
  tryN(g, 1);
  assert.ok(g.hintActive(), "3回目で出る");
  assert.equal(g.hintCount, 1);
});

test("KJ-037 ヒント：放つ・割る・くっつける・反転・巡り・同音が通ったら数え直し。ヒントを出したら数え直し", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川人木");
  tryN(g, 2);
  assert.ok(g.split(g.me, idsOf(g, "休")).ok, "割るが通る");
  assert.equal(g.hintStreak, 0, "数え直し");
  tryN(g, 2);
  assert.equal(g.hint, null, "通ったあとは、また3回はじかれるまで出ない");
  g.clock.t += 1;
  tryN(g, 1);
  assert.ok(g.hint, "数え直して3回");
  assert.equal(g.hintStreak, 0, "出したら数え直し");
  tryN(g, 2);
  assert.equal(g.hintCount, 1, "出した直後の2回では、もう一度は出ない");
  tryN(g, 1);
  assert.equal(g.hintCount, 2, "さらに3回で、もう一度");
  // 放つ・くっつける・反転・巡り・同音
  setHand(g, g.me, "休日");
  tryN(g, 2);
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.equal(g.hintStreak, 0, "放つが通ったら数え直し");
  takeAll(g, g.me); // 取りきるまで、ほかの手はできない（KJ-039）
  setHand(g, g.me, "人木");
  tryN(g, 2);
  assert.ok(g.join(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.equal(g.hintStreak, 0, "くっつけるが通ったら数え直し");
  for (const [op, hand] of [["invert", "男"], ["cycle", "日"], ["homophone", "日"]]) {
    setHand(g, g.me, hand);
    g.clock.t += 60;
    tryN(g, 1, { ...g.me, cards: [{ c: "一" }, { c: "二" }], name: g.me.name }); // 数えるのは g.me だけ（別の人は数えない）
    assert.equal(g.hintStreak, 0, "別の人（CPU）のためしは数えない");
    g.hintStreak = 2;
    const r = op === "homophone" ? g.homophone(g.me, g.me.cards.map((x) => x.id), "書") : g[op](g.me, g.me.cards.map((x) => x.id));
    assert.ok(r.ok, op);
    assert.equal(g.hintStreak, 0, `${op} が通ったら数え直し`);
  }
});

test("KJ-037 ヒント：CPU のはじかれは数えない。CPU は自分でヒントを出さない", () => {
  const g = newGame(1, "normal", "N5");
  tryN(g, 5, g.cpu);
  assert.equal(g.hint, null);
  assert.equal(g.hintStreak, 0);
  assert.equal(g.log.some((e) => e.op === "ヒント"), false);
});

test("KJ-037 ヒント：段1 いま並べれば放てる札の組が光る（手札とストックから）。言葉は ids に出さない", () => {
  const g = newGame(1, "weak", "N5");
  const ids = setHand(g, g.me, "休日山川");
  g.me.cards[1].tray = true; // 日 はストックにいる
  tryN(g, 3);
  const h = g.hintActive();
  assert.equal(h.tier, 1);
  assert.deepEqual([...h.ids].sort(), [ids[0], ids[1]].sort(), "休 と 日（ストックの札も使う）");
  assert.equal(h.button, null, "段1 はボタンを光らせない（札だけ）");
  assert.equal(h.word, "休日");
});

test("KJ-037 ヒント：放った言葉は狙わない。よく使う語を先に", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川");
  g.used.add("休日");
  tryN(g, 3);
  assert.notEqual(g.hint.word, "休日", "放った言葉は狙わない");
  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "休日山川");
  tryN(g2, 3);
  assert.ok(T.COMMON_WORDS.some((w) => w.w === g2.hint.word), "段1 の語はよく使う語（common）から");
});

test("KJ-037 ヒント：段2 1手（割る・反転・巡り・同音）で放てる言葉になる札と、その操作のボタンが光る", () => {
  for (const [hand, op, btn, word] of [["日年", "巡り", "bCycle", "年月"], ["日分", "割る", "bSplit", "八日"], ["日男", "反転", "bInvert", "日女"], ["日国", "同音", "bHomo", "国書"]]) {
    const g = newGame(1, "weak", "N5");
    const ids = setHand(g, g.me, hand);
    tryN(g, 3);
    const h = g.hintActive();
    assert.equal(h.tier, 2, hand);
    assert.equal(h.op, op, hand);
    assert.equal(h.button, btn, hand);
    assert.equal(h.word, word, hand);
    assert.deepEqual([...h.ids].sort(), [...ids].sort(), `${hand}：操作する札と、言葉に使う残りの札が光る`);
    assert.ok(g.log.some((e) => e.op === "ヒント" && e.note.includes(`段2：${op}`)), "ログに段2");
  }
});

test("KJ-037 ヒント：段2 は、その試合でまだ使っていない操作を先にする", () => {
  const first = newGame(1, "weak", "N5");
  setHand(first, first.me, "日年国");
  tryN(first, 3);
  assert.equal(first.hint.op, "巡り", "まだどれも使っていないときは、よく使う語が先（年月）");
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "日年国");
  g.log.push({ t: 0, who: g.me.name, op: "巡り", from: ["一"], to: ["二"], pts: 0, meScore: 0, cpuScore: 0, me: 0, cpu: 0, note: "" }); // 巡りは使った
  tryN(g, 3);
  assert.equal(g.hint.tier, 2);
  assert.equal(g.hint.op, "同音", "巡りは使ったので、まだ使っていない 同音 を先に");
  assert.equal(g.hint.button, "bHomo");
});

test("KJ-037 ヒント：待ち時間の操作・手札がいっぱいで割れない操作は狙わない", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "日年");
  g.me.cd.cycle = g.now() + 5; // 巡りは待っている
  tryN(g, 3);
  assert.notEqual(g.hint.op, "巡り", "待っている操作は光らせない");
  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "日分" + "山".repeat(14)); // 16枚（手札8＋ストック8）。割ると17枚になる
  g2.me.cards.slice(8).forEach((x) => { x.tray = true; });
  tryN(g2, 3);
  assert.notEqual(g2.hint.op, "割る", "いっぱいで割れないときは割るを光らせない");
});

test("KJ-037 ヒント：段3 どれも無ければ Redraw のボタンが光る。5回使いきったあとは札もボタンも光らない（KJ-049）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "日刀");
  tryN(g, 3);
  const h = g.hintActive();
  assert.equal(h.tier, 3);
  assert.deepEqual(h.ids, []);
  assert.equal(h.button, "bRedraw");
  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "日刀");
  for (let i = 0; i < 5; i++) assert.ok(g2.redraw(g2.me).ok);
  setHand(g2, g2.me, "日刀");
  tryN(g2, 3);
  assert.equal(g2.hint, null, "引き直しを使いきったときは何も光らせず、札も出さない");
  assert.ok(g2.log.some((e) => e.op === "ヒント" && e.note.includes("使いきった")), "ログには残す");
});

test("KJ-037・KJ-065 ヒント：光るのは10秒。ほかの手（札を動かす・別の言葉を放つ）をしても残る。ログに残る（狙った言葉はログにだけ）", () => {
  const g = newGame(1, "weak", "N5");
  const ids = setHand(g, g.me, "休日山川");
  tryN(g, 3);
  assert.ok(g.hintActive());
  g.clock.t += 9;
  assert.ok(g.hintActive(), "9秒ではまだ光る");
  g.clock.t += 1.5;
  assert.equal(g.hintActive(), null, "10秒たったら消える");
  tryN(g, 3);
  assert.ok(g.hintActive());
  assert.ok(g.swap(g.me, ids[0], ids[2]).ok);
  assert.ok(g.hintActive(), "KJ-065：札を動かしても、10秒は残る");
  g.clock.t += 9;
  assert.ok(g.hintActive(), "動かしたあとも、出してから9秒ではまだ光る");
  g.clock.t += 1.5;
  assert.equal(g.hintActive(), null, "出してから10秒で消える");
  tryN(g, 3);
  assert.ok(g.hintActive());
  g.tried(g.me, ["山"], "1字では放てない");
  assert.ok(g.hintActive(), "はじかれる（ためした）では消えない");
  const e = g.log.filter((x) => x.op === "ヒント");
  assert.equal(e.length, 3, "出した回数だけ ヒント の行がある");
  assert.match(e[0].note, /^段1：放つ。狙った言葉：休日$/);
  assert.deepEqual(e[0].from, ["休", "日"], "光らせた札");
  assert.match(g.logText(), /ヒント\t休 日\t\t0\t.*段1：放つ。狙った言葉：休日/);
  assert.match(g.logText(), /# 手 .*ヒント/, "ログの頭に ヒント の説明");
  assert.match(g.logText(), /# 仮置き ヒント 人が続けて3回はじかれたら/);
});

test("KJ-037 ヒント：終わったあとは出ない。ためした（1字）も数える。点はかからない", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川");
  g.me.score = 7;
  g.tried(g.me, ["山"], "1字では放てない");
  g.tried(g.me, ["山"], "1字では放てない");
  g.tried(g.me, ["山", "川"], "辞書にない");
  assert.ok(g.hint, "1字のためしも数える");
  assert.equal(g.me.score, 7, "ヒントに点はかけない");
  const over = newGame(1, "weak", "N5");
  setHand(over, over.me, "休日山川");
  over.clock.t += over.timeLimit + 1;
  over.tick();
  tryN(over, 5);
  assert.equal(over.hint, null, "終わったあとは出ない");
});

test("KJ-037 ヒント：N4 でも出る（段1・段2・段3 のどれかになる）。無作為の手札で、必ず札か Redraw が光る", () => {
  const tally = { 1: 0, 2: 0, 3: 0 };
  for (const seed of [1, 7, 42]) {
    for (let i = 0; i < 20; i++) {
      const g = newGame(seed * 1000 + i, "weak", "N4", { startStock: true });
      tryN(g, 3);
      const h = g.hint;
      assert.ok(h, `seed ${seed}-${i}`);
      tally[h.tier]++;
      if (h.tier === 3) assert.equal(h.button, "bRedraw");
      else assert.ok(h.ids.length >= 1 && h.ids.every((id) => g.byId(g.me, id)), "光る札は手札かストックにある");
    }
  }
  assert.equal(tally[1] + tally[2] + tally[3], 60);
});

test("KJ-037 ヒント：狙った言葉を先に使われたら、光りは消える（CPU が放った・部屋で相手が放った・先着に負けた）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川");
  tryN(g, 3);
  assert.equal(g.hintActive().word, "休日");
  g.used.add("休日"); // CPU・相手・先着の負けのどれでも、使った言葉は g.used に入る
  assert.equal(g.hintActive(), null, "もう放てない言葉は光らせ続けない");
});

test("KJ-065 ヒント：光らせた言葉を放つと消える・光らせた札が1枚でも手札から無くなると消える・ほかの言葉を放っても残る・点は変わらない", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日山川火水");
  tryN(g, 3);
  const h = g.hintActive();
  assert.equal(h.word, "休日");
  const sc = g.me.score;
  const other = g.me.cards.filter((x) => "火水".includes(x.c)).map((x) => x.id);
  assert.ok(g.release(g.me, other).ok, "ほかの言葉（火水）を放つ");
  assert.ok(g.hintActive(), "ほかの言葉を放っても、光りは残る");
  assert.ok(g.me.score > sc);
  assert.equal(g.hintActive().word, "休日");
  takeAll(g, g.me); // 放ったあとは場から取りきる
  assert.ok(g.hintActive(), "取っても残る");
  assert.ok(g.release(g.me, h.ids).ok, "光らせた言葉を放つ");
  assert.equal(g.hintActive(), null, "光らせた言葉を放ったら消える");

  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "休日山川");
  tryN(g2, 3);
  const lit = g2.hintActive().ids;
  g2.me.cards = g2.me.cards.filter((x) => !lit.includes(x.id)); // 光らせた札が全部無くなる
  assert.equal(g2.hintActive(), null, "光らせた札が手札から無くなったら消える");

  const g3 = newGame(1, "weak", "N5");
  setHand(g3, g3.me, "休日山川");
  tryN(g3, 3);
  const l3 = g3.hintActive().ids;
  g3.me.cards = g3.me.cards.filter((x) => x.id !== l3[0]); // 1枚だけ無くなったら消える
  assert.equal(g3.hintActive(), null, "光らせた札が1枚でも無くなったら消える");
});

test("KJ-065 ヒント：段2は光らせた操作をしたら消える（札が替わる）・段3は引き直しを使ったら消える", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "日分");
  tryN(g, 3);
  assert.equal(g.hintActive().tier, 2);
  const split = g.me.cards.find((x) => x.c === "分");
  assert.ok(g.split(g.me, [split.id]).ok, "光らせた札を割る");
  assert.equal(g.hintActive(), null, "操作した札が替わったら消える");

  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "刀刀");
  tryN(g2, 3);
  assert.equal(g2.hintActive().tier, 3);
  assert.ok(g2.redraw(g2.me).ok, "引き直す");
  assert.equal(g2.hintActive(), null, "引き直しを使ったら消える");
});

// ---------- KJ-041 はじかれた操作もログに残す（D-055）----------
const triedRows = (g) => g.log.filter((e) => e.op === "ためした");

test("KJ-041：割れない字を Split→「ためした」（札・メモ「割る：割れない」）。手札は変わらない", () => {
  const g = newGame(1, "weak", "N5");
  const ids = setHand(g, g.me, "一口");
  const why = g.whyNot(g.me, "split", [ids[0]]);
  assert.equal(why, "割れない");
  g.triedOp(g.me, "割る", ["一"], why);
  const rows = triedRows(g);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].who, rows[0].from, rows[0].to, rows[0].pts, rows[0].note], [g.me.name, ["一"], [], 0, "割る：割れない"]);
  assert.equal(chars(g.me.cards), "一口");
});

test("KJ-041：待ち時間中の Flip・巡りの無い字の Cycle・読みの無い字の Same reading→「ためした」", () => {
  const g = newGame(1, "weak", "N5");
  const [a] = setHand(g, g.me, "上");
  assert.equal(g.invert(g.me, [a]).ok, true);
  const [b] = setHand(g, g.me, "下");
  assert.equal(g.whyNot(g.me, "invert", [b]), "待ち時間");
  g.triedOp(g.me, "反転", ["下"], g.whyNot(g.me, "invert", [b]));
  const [c] = setHand(g, g.me, "休");
  g.triedOp(g.me, "巡り", ["休"], g.whyNot(g.me, "cycle", [c]));
  const [d] = setHand(g, g.me, "田");
  g.triedOp(g.me, "同音", ["田"], g.whyNot(g.me, "homophone", [d]));
  assert.deepEqual(triedRows(g).map((e) => e.note), ["反転：待ち時間", "巡り：できない字", "同音：同じ読みの字がない"]);
});

test("KJ-069：同じ読みの字が1つも無い札は「同じ読みの字がない」。行き先が違うときだけ「同じ読みではない」。小1・N5・N4 とも whyNot と実際の操作が同じ理由", () => {
  for (const level of ["G1", "N5", "N4"]) {
    const g = newGame(1, "weak", level);
    const TT = level === "G1" ? TG1 : level === "N4" ? T4 : T;
    let none = 0, some = 0;
    for (const c of TT.HOLD) {
      const homo = K.homoChars(TT, c);
      const [id] = setHand(g, g.me, c);
      const why = g.whyNot(g.me, "homophone", [id]);
      if (!homo.length) {
        none++;
        assert.equal(why, "同じ読みの字がない", `${level} ${c}`);
        assert.equal(g.homophone(g.me, [id], "x").why, "同じ読みの字がない", `${level} ${c}`);
        assert.equal(TT.HOMO.has(c), false, `${level} ${c}：ボタンの見た目（TT.HOMO.has）と判定が食い違わない`);
      } else {
        some++;
        assert.equal(why, null, `${level} ${c}`);
        assert.equal(g.homophone(g.me, [id], "x").why, "同じ読みではない", `${level} ${c}：行き先が違う`);
        assert.equal(TT.HOMO.has(c), true, `${level} ${c}`);
      }
    }
    assert.ok(none > 0 && some > 0, `${level}：${none} 字は同じ読みの字なし・${some} 字はあり`);
  }
});

test("KJ-041：同じ札・同じ理由が続けて押されたら1行（×回数）。間に別の行が入る・札が違う・理由が違うと新しい行", () => {
  const g = newGame(1, "weak", "N5");
  const t = (c, why) => g.triedOp(g.me, "割る", [c], why);
  t("一", "割れない"); t("一", "割れない"); t("一", "割れない");
  assert.deepEqual(triedRows(g).map((e) => e.note), ["割る：割れない ×3"]);
  t("二", "割れない");
  t("二", "手札もストックもいっぱい");
  assert.deepEqual(triedRows(g).map((e) => e.note), ["割る：割れない ×3", "割る：割れない", "割る：手札もストックもいっぱい"]);
  g.addLog(g.me.name, "入れ替え", ["山"], ["川"], 0, "");
  t("二", "手札もストックもいっぱい");
  assert.equal(triedRows(g).length, 4, "間に別の行が入ったら、まとめない");
});

test("KJ-041：面でくっつける：くっつく面を理由のあとに書く。ヒントの数え方は変わらない（g.tried だけが数える）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "十口山川");
  for (let i = 0; i < 5; i++) g.triedOp(g.me, "面でくっつける", ["十", "口"], "その面ではくっつかない", "（くっつく面：上・中央）");
  assert.deepEqual(triedRows(g).map((e) => e.note), ["面でくっつける：その面ではくっつかない（くっつく面：上・中央） ×5"]);
  assert.equal(g.hintStreak, 0, "続けて5回でも数えない");
  assert.equal(g.hint, null);
  assert.equal(g.log.some((e) => e.op === "ヒント"), false);
  g.tried(g.me, ["山", "川"], "辞書にない");
  assert.equal(g.hintStreak, 1, "g.tried は今まで通り数える");
});

test("KJ-041：放ったあとの取りきるまで・終わったあとは残さない。取るは取りきるまでの間も残る（呼ぶ側が決める）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日");
  assert.equal(g.release(g.me, g.me.cards.map((x) => x.id)).ok, true);
  assert.ok(g.locked(g.me));
  g.triedOp(g.me, "割る", ["一"], g.whyNot(g.me, "split", [1]));
  assert.equal(g.whyNot(g.me, "split", [1]), "場から取りきるまで動けない");
  assert.equal(triedRows(g).length, 0, "取りきるまでの「動けない」は残さない");
  g.triedOp(g.me, "取る", ["山"], "手札もストックもいっぱい");
  assert.equal(triedRows(g).length, 1, "取るのはじかれは残る");
  takeAll(g, g.me);
  const n = triedRows(g).length;
  g.over = true;
  g.triedOp(g.me, "割る", ["一"], "割れない");
  assert.equal(triedRows(g).length, n, "終わったあとは残さない");
});

test("KJ-041：whyNot は、実際の操作がはじかれる理由と同じ（割る・くっつける・反転・巡り・同音・引き直し）", () => {
  const cases = [];
  for (const c of ["一", "休", "上", "田", "月", "語"]) for (const op of ["split", "invert", "cycle", "homophone"]) cases.push([op, c]);
  for (const pair of ["人木", "木人", "一一", "卜一", "口十", "十口"]) cases.push(["join", pair]);
  for (const [op, text] of cases) for (const wait of [false, true]) {
    const g = newGame(1, "weak", "N5");
    const ids = setHand(g, g.me, text);
    if (wait) for (const k of ["invert", "cycle", "homophone"]) g.me.cd[k] = g.now() + 5;
    const why = g.whyNot(g.me, op, ids);
    const to = op === "homophone" ? [...(T.HOMO.get(text) || []).flatMap((x) => x.chars), "x"].find((x) => x !== text) : undefined; // 同じ読みの別の字（無ければ ない字）
    const r = op === "homophone" ? g.homophone(g.me, ids, to) : g[op](g.me, ids);
    assert.equal(why, r.ok ? null : r.why, `${op} ${text} 待ち${wait}`);
  }
  const g = newGame(1, "weak", "N5");
  assert.equal(g.whyNot(g.me, "redraw"), null);
  g.me.redraws = D.rules.redraw.costs.length;
  assert.equal(g.whyNot(g.me, "redraw"), "引き直しは5回まで");
  assert.equal(g.redraw(g.me).why, "引き直しは5回まで");
});

// ---------- KJ-018：試合が終わったときの表示の中身（K.endShow）----------
function pushReleased(g, who, text, pts) { g.log.push({ t: 1, who: who.name, op: "放つ", from: [...text], to: [], pts, note: "" }); }

test("KJ-018 endShow：勝ち・負け・引き分け・ひとりでの4つで、見出しと点が正しい", () => {
  const g = newGame(1, "weak");
  g.me.score = 27; g.cpu.score = 6;
  const w = K.endShow(g, T, g.me), l = K.endShow(g, T, g.cpu), d = K.endShow(g, T, null);
  assert.deepEqual([w.kind, w.label, w.me, w.cpu], ["win", "勝ち！", 27, 6]);
  assert.deepEqual([l.kind, l.label, l.me, l.cpu], ["lose", "負け…", 27, 6]);
  assert.deepEqual([d.kind, d.label], ["draw", "引き分け"]);
  const s = newGame(1, "solo");
  s.me.score = 9;
  const e = K.endShow(s, T, null);
  assert.deepEqual([e.kind, e.label, e.me, e.cpu], ["solo", "おわり", 9, null]);
});

test("KJ-018 endShow：自分が放った言葉だけを、放った順に。2字=段1・3字=段2・4字=段3。読みと点つき。相手の言葉・割る・くっつけるは出ない", () => {
  const g = newGame(1, "weak");
  pushReleased(g, g.me, "休日", 4);
  pushReleased(g, g.cpu, "大雨", 4);
  g.log.push({ t: 2, who: g.me.name, op: "くっつける", from: [..."木木"], to: ["林"], pts: 0, note: "" });
  pushReleased(g, g.me, "日本人", 9);
  pushReleased(g, g.me, "天上天下", 90);
  const r = K.endShow(g, T, g.me);
  assert.deepEqual(r.items.map((x) => x.text), ["休日", "日本人", "天上天下"]);
  assert.deepEqual(r.items.map((x) => x.tier), [1, 2, 3]);
  assert.deepEqual(r.items.map((x) => x.pts), [4, 9, 90]);
  assert.equal(r.items[0].kana, T.WORDS.get("休日").kana, "読み（台の行と同じ）");
});

test("KJ-018 endShow：放った言葉が0でも作れる（items は空）", () => {
  const g = newGame(1, "weak");
  assert.deepEqual(K.endShow(g, T, g.cpu).items, []);
});

// KJ-046（D-060）：大＋丶 は 太 と 犬 の2通り。選ぶ・面で分かれる・犬を割ると 大 と 丶
test("大＋丶：Join は 太・犬 の2通り（選ぶ）。選ばなければ 太。割ると 大 と 丶（N4）", () => {
  assert.deepEqual(K.joinResults(T4, "大", "丶"), ["太", "犬"]);
  assert.deepEqual(K.joinResults(T4, "丶", "大"), [], "順が逆はくっつかない");
  assert.equal(K.joinReversed(T4, "丶", "大"), true);
  let g = newGame(1, "normal", "N4");
  let ids = setHand(g, g.me, "大丶");
  assert.equal(chars(g.join(g.me, ids).cards), "太", "選ばなければ最初の 太（いまの動きのまま）");
  g = newGame(1, "normal", "N4");
  ids = setHand(g, g.me, "大丶");
  assert.equal(chars(g.join(g.me, ids, "犬").cards), "犬", "犬 を選べる");
  g = newGame(1, "normal", "N4");
  ids = setHand(g, g.me, "大丶");
  assert.equal(g.join(g.me, ids, "木").ok, false, "ほかの字にはならない");
  g = newGame(1, "normal", "N4");
  const [d] = setHand(g, g.me, "犬");
  assert.equal(chars(g.split(g.me, [d]).cards), "大丶", "犬を割ると 大 と 丶");
  g = newGame(1, "normal", "N4");
  const [t] = setHand(g, g.me, "太");
  assert.equal(chars(g.split(g.me, [t]).cards), "大丶", "太を割るのは今まで通り");
});

test("大＋丶：面で落とす。下の面＝太、右の面＝犬。ほかの面ではくっつかない（N4）", () => {
  assert.deepEqual(K.faceJoins(T4, "丶", "大"), { bottom: ["太"], right: ["犬"] });
  assert.deepEqual(K.faceJoins(T4, "大", "丶"), { top: ["太"], left: ["犬"] }, "大 を 丶 の上に落とすと 太、左に落とすと 犬");
  let g = newGame(1, "normal", "N4");
  let [a, b] = setHand(g, g.me, "丶大");
  assert.equal(chars(g.joinFace(g.me, a, b, "bottom").cards), "太");
  g = newGame(1, "normal", "N4");
  [a, b] = setHand(g, g.me, "丶大");
  assert.equal(chars(g.joinFace(g.me, a, b, "right").cards), "犬");
  g = newGame(1, "normal", "N4");
  [a, b] = setHand(g, g.me, "丶大");
  assert.equal(g.joinFace(g.me, a, b, "top").ok, false, "上の面では字にならない");
  assert.equal(g.joinFace(g.me, a, b, "left").ok, false, "左の面では字にならない");
});

test("大＋丶：N5 では 太・犬 は出ない（N4 の字）", () => {
  assert.deepEqual(K.joinResults(T, "大", "丶"), []);
  assert.equal(T.parts["犬"], undefined);
});

// KJ-047（P-047・D-061・D-062）：玉＝王＋丶・足＝口＋止 を足した。国→玉→王 と割れる。主＝丶＋王 との並びの違い
test("玉＝王＋丶：国→玉→王 と割れる（N5・N4・小1）。王 は割れない。王＋丶 で 玉", () => {
  for (const L of [T, T4]) {
    assert.deepEqual(K.splitOnce(L, "国"), ["囗", "玉"], `${L.level}`);
    assert.deepEqual(K.splitOnce(L, "玉"), ["王", "丶"], `${L.level}`);
    assert.ok(!K.canSplit(L, "王"), `${L.level}: 王 は割れない`);
    assert.deepEqual(K.joinResults(L, "王", "丶"), ["玉"], `${L.level}`);
    assert.deepEqual(K.joinResults(L, "丶", "王").includes("玉"), false, "順が逆では 玉 にならない");
    assert.ok(L.HOLD.has("王") && L.HOLD.has("玉"), `${L.level}: 王・玉 は手に持てる字`);
  }
  assert.deepEqual(K.joinResults(T4, "丶", "王"), ["主"], "丶＋王 は今まで通り 主");
  const g = newGame(1, "normal", "N5");
  let [id] = setHand(g, g.me, "国");
  assert.equal(chars(g.split(g.me, [id]).cards), "囗玉");
  const [yu] = g.me.cards.filter((c) => c.c === "玉").map((c) => c.id);
  assert.equal(chars(g.split(g.me, [yu]).cards), "王丶", "玉 をもう一度割ると 王 と 丶");
  assert.equal(g.join(g.me, g.me.cards.filter((c) => "王丶".includes(c.c)).map((c) => c.id)).ok, true);
});

test("玉＝王＋丶：N5 でも 王 を含む語（国王・王女 など）が放てる。N4 の語の数は変わらない", () => {
  for (const w of ["国王", "王女", "王子", "王国", "女王", "王手", "王立"]) {
    assert.ok(T.WORDS.has(w), `N5：${w}`);
    assert.equal(T.WORDS.get(w).lv, "N5", w);
    assert.ok(T4.WORDS.has(w), `N4：${w}`);
  }
  // KJ-032 で地名・名字を足し（N5 +8・N4 +24）、全レベルで 買春・売春 を外した（N4 −2）：N5 2458→2466・N4 10438→10460。KJ-068（D-087）で 売女・売色 も外した（売女 は N5・N4 に、売色 は N4 だけにあった）：N5 2465・N4 10458
  assert.equal(T.WORDS.size, 2465);
  assert.equal(T4.WORDS.size, 10458);
});

test("玉＝王＋丶・主＝丶＋王：面で落とす。丶 を 王 の上に落とすと 主、下に落とすと 玉（N4）", () => {
  assert.deepEqual(K.faceJoins(T4, "丶", "王"), { top: ["主"], bottom: ["玉"] });
  assert.deepEqual(K.faceJoins(T4, "王", "丶"), { top: ["玉"], bottom: ["主"] }, "王 を 丶 の上に落とすと 玉、下に落とすと 主");
  let g = newGame(1, "normal", "N4");
  let [a, b] = setHand(g, g.me, "丶王");
  assert.equal(chars(g.joinFace(g.me, a, b, "top").cards), "主");
  g = newGame(1, "normal", "N4");
  [a, b] = setHand(g, g.me, "丶王");
  assert.equal(chars(g.joinFace(g.me, a, b, "bottom").cards), "玉");
  g = newGame(1, "normal", "N4");
  [a, b] = setHand(g, g.me, "丶王");
  assert.equal(g.joinFace(g.me, a, b, "left").ok, false, "左の面では字にならない");
  // 並べた順（Join）は 王丶＝玉・丶王＝主 で、どちらも今まで通りの決まり
  g = newGame(1, "normal", "N4");
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "王丶")).cards), "玉");
  g = newGame(1, "normal", "N4");
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "丶王")).cards), "主");
});

test("足＝口＋止：割ると 口 と 止。口＋止 で 足（N5・N4・小1）。止＋口 は足にならない", () => {
  for (const L of [T, T4]) {
    assert.deepEqual(K.splitOnce(L, "足"), ["口", "止"], `${L.level}`);
    assert.deepEqual(K.joinResults(L, "口", "止"), ["足"], `${L.level}`);
    assert.deepEqual(K.joinResults(L, "止", "口"), [], `${L.level}：順が逆はくっつかない`);
    assert.deepEqual(K.faceJoins(L, "口", "止"), { top: ["足"] }, `${L.level}：口 を 止 の上に落とすと 足`);
    assert.deepEqual(K.faceJoins(L, "止", "口"), { bottom: ["足"] }, `${L.level}：止 を 口 の下に落とすと 足`);
  }
  for (const L of [T, T4]) assert.ok(L.HOLD.has("止") && K.isChar(L, "止"), `${L.level}: 止 は字として見せる（部品の見た目にしない）`);
  const g = newGame(1, "normal", "N5");
  const [id] = setHand(g, g.me, "足");
  assert.equal(chars(g.split(g.me, [id]).cards), "口止");
});

test("相手の選び（KJ-045）：遊び方は3つ・強さは3つ。前の形のキーを新しい形に読み替える。中のキーとログの書き方は変えない", () => {
  assert.deepEqual(K.PLAY_MODES.map((o) => o.label), ["ひとりで", "CPU と", "友だちと（合言葉）"]);
  assert.deepEqual(K.CPU_POWERS.map((o) => [o.key, o.label]), [["weak", "とても弱い"], ["fair", "ふつう"], ["normal", "つよい"]]);
  // 中のキーは前のまま（ログ・CPU の間隔・部屋が使う）
  assert.deepEqual(K.OPPONENTS.map((o) => o.key), ["solo", "weak", "fair", "normal"]);
  assert.equal(K.ROOM_OPPONENT.key, "room");
  const D = { rules: { opponent_default: "weak" } };
  assert.deepEqual(K.readOpponent(D, "room"), { key: "room", mode: "room", power: "weak" });
  assert.deepEqual(K.readOpponent(D, "solo"), { key: "solo", mode: "solo", power: "weak" });
  assert.deepEqual(K.readOpponent(D, "weak"), { key: "weak", mode: "cpu", power: "weak" });
  assert.deepEqual(K.readOpponent(D, "fair"), { key: "fair", mode: "cpu", power: "fair" });
  assert.deepEqual(K.readOpponent(D, "normal"), { key: "normal", mode: "cpu", power: "normal" });
  for (const bad of [null, undefined, "", "ばか", "cpu", "tutorial"]) assert.deepEqual(K.readOpponent(D, bad), { key: "weak", mode: "cpu", power: "weak" }, `読めない値 ${bad} は CPU と＋とても弱い`);
  assert.equal(K.opponentKey("solo", "fair"), "solo");
  assert.equal(K.opponentKey("room", "fair"), "room");
  assert.equal(K.opponentKey("cpu", "fair"), "fair");
  assert.equal(K.opponentKey("cpu", "ばか"), "weak");
  // 画面の初期値は rules.opponent_default（いまの数値ファイルで CPU と＋とても弱い）
  assert.deepEqual(K.readOpponent(D, null), { key: "weak", mode: "cpu", power: "weak" });
});
