// KJ-138：割る（Split）に待ち時間。5秒（data/rules.json の cooldown_sec.split。仮）。反転・巡り・同音と同じ形（その人の操作ごと。二人は別々）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const SEC = D.rules.cooldown_sec.split;

test("割るの待ち時間：rules.json の cooldown_sec.split は正の数（いまは 5秒・仮）・note に KJ-138", () => {
  assert.ok(SEC > 0, "作者が数値を直しても落ちない");
  assert.match(D.rules.note, /KJ-138/);
});

test("割ったあとは待ち時間のあいだ割れない・満ちたらまた割れる。はじかれた札は動かない", () => {
  const g = newGame();
  const [a] = setHand(g, g.me, "休語");
  assert.ok(g.split(g.me, [a]).ok, "1回目は割れる");
  assert.equal(g.ready(g.me, "split"), false);
  const hand = chars(g.me.cards);
  const second = g.me.cards.find((x) => x.c === "語");
  const r = g.split(g.me, [second.id]);
  assert.equal(r.ok, false);
  assert.equal(r.why, "待ち時間", "反転・巡り・同音と同じ理由の文");
  assert.equal(chars(g.me.cards), hand, "はじかれたら何も変えない");
  g.clock.t += SEC - 0.1;
  assert.equal(g.split(g.me, [second.id]).ok, false, "あと少しで満ちる前は割れない");
  g.clock.t += 0.2;
  assert.ok(g.split(g.me, [second.id]).ok, "満ちたら割れる");
});

test("割れない字を割ろうとしても待ち時間は始まらない・理由は 割れない のまま（待ち時間より先）", () => {
  const g = newGame();
  const [a] = setHand(g, g.me, "一");
  const r = g.split(g.me, [a]);
  assert.equal(r.why, "割れない");
  assert.equal(g.ready(g.me, "split"), true);
  const [b] = setHand(g, g.me, "休");
  g.split(g.me, [b]);
  const [c] = setHand(g, g.me, "一");
  assert.equal(g.split(g.me, [c]).why, "割れない", "待ち中でも 割れない字 はそのまま 割れない");
});

test("手札・ストックがいっぱいで割れなかったときも、待ち時間は始まらない", () => {
  const g = newGame();
  const ALL = D.rules.hand_max + D.rules.split_extra;
  const ids = setHand(g, g.me, "休".repeat(ALL));
  const r = g.split(g.me, [ids[0]]);
  assert.equal(r.why, "手札もストックもいっぱい");
  assert.equal(g.ready(g.me, "split"), true, "割れなかったので待たない");
});

test("待ち時間は人ごと・操作ごと：CPU は別。反転・巡り・同音は割るで待たされない", () => {
  const g = newGame();
  const [a] = setHand(g, g.me, "休");
  g.split(g.me, [a]);
  assert.equal(g.ready(g.cpu, "split"), true, "CPU の待ち時間は別");
  const [c] = setHand(g, g.cpu, "休");
  assert.ok(g.split(g.cpu, [c]).ok);
  assert.equal(g.ready(g.me, "invert"), true);
  assert.equal(g.ready(g.me, "cycle"), true);
  assert.equal(g.ready(g.me, "homophone"), true);
  const [u] = setHand(g, g.me, "上");
  assert.ok(g.invert(g.me, [u]).ok, "反転は割るの待ち中でも使える");
});

test("ゲージ（g.cdFrac）：使う前は満ち・使った直後は空・半分でおよそ半分", () => {
  const g = newGame();
  assert.equal(g.cdFrac(g.me, "split"), 1);
  const [a] = setHand(g, g.me, "休");
  g.split(g.me, [a]);
  assert.ok(g.cdFrac(g.me, "split") < 0.05);
  assert.equal(g.cdFrac(g.cpu, "split"), 1);
  g.clock.t += SEC / 2;
  assert.ok(Math.abs(g.cdFrac(g.me, "split") - 0.5) < 0.01);
  assert.equal(g.cdLeft(g.me, "split") > 0, true);
});

test("whyNot（画面の押せない見え方の理由）が g.split と同じ順・同じ文", () => {
  const g = newGame();
  const [a] = setHand(g, g.me, "休語");
  assert.equal(g.whyNot(g.me, "split", [a]), null);
  g.split(g.me, [a]);
  const second = g.me.cards.find((x) => x.c === "語").id;
  assert.equal(g.whyNot(g.me, "split", [second]), "待ち時間");
  assert.equal(g.split(g.me, [second]).why, "待ち時間");
  const [one] = setHand(g, g.me, "一");
  assert.equal(g.whyNot(g.me, "split", [one]), "割れない", "割れない字は 割れない が先");
});

test("裏技（二→巡り→三→割る→一＋二→巡り…）：巡りは1秒でも、割るで5秒待たされる", () => {
  const g = newGame(1, "normal", "N5");
  let [id] = setHand(g, g.me, "二");
  assert.equal(chars(g.cycle(g.me, [id]).cards), "三", "二 の巡りは 三");
  [id] = [g.me.cards[0].id];
  assert.ok(g.split(g.me, [id]).ok, "三 を割る（一＋二）");
  assert.equal(chars(g.me.cards), "一二");
  g.clock.t += D.rules.cooldown_sec.cycle; // 巡りの待ちだけ満ちる
  const two = g.me.cards.find((x) => x.c === "二");
  assert.equal(chars(g.cycle(g.me, [two.id]).cards), "三");
  const three = g.me.cards.find((x) => x.c === "三");
  assert.equal(g.split(g.me, [three.id]).why, "待ち時間", "2回目の割るは待たされる");
  g.clock.t += SEC;
  assert.ok(g.split(g.me, [three.id]).ok);
});

test("movesInHand（動けないときのログ）：割るの待ち時間は残りの秒数を添える", () => {
  const g = newGame();
  const [a] = setHand(g, g.me, "休語");
  g.split(g.me, [a]);
  assert.ok(g.movesInHand(g.me).some((m) => /^割る（待ち \d+秒）$/.test(m)), g.movesInHand(g.me).join("・"));
  g.clock.t += SEC;
  assert.ok(g.movesInHand(g.me).includes("割る"));
});

test("ヒント（段2）：割るで放てる言葉になるとき、割るが待ち中なら Split を光らせない・満ちていれば Split を光らせる", () => {
  const { hintNow } = require("./helpers");
  const mk = () => { const g = newGame(1, "weak", "N5"); setHand(g, g.me, "日分"); return g; }; // 分 を割ると 八日 が放てる（tests/game.test.js の段2と同じ手札）
  const g1 = mk(); hintNow(g1);
  assert.equal(g1.hint && g1.hint.button, "bSplit", "待ち時間が無ければ割るを光らせる");
  const g2 = mk(); g2.me.cd.split = g2.now() + 100; hintNow(g2);
  assert.notEqual(g2.hint && g2.hint.button, "bSplit", "割るの待ち中は割るを光らせない");
});

test("CPU（つよい）：割るの待ち中は割らない。待ち時間が満ちたら割る（ほかの1手先は待ち中にして割る候補だけにする）", () => {
  const g = newGame(3, "normal", "N5");
  setHand(g, g.cpu, "天万");
  for (const k of ["homophone", "cycle", "invert"]) g.cpu.cd[k] = g.now() + 100;
  g.cpu.cd.split = g.now() + SEC;
  const before = g.log.length;
  const r = g.cpuTurn();
  assert.ok(r === null || r.ok !== false);
  assert.ok(!g.log.slice(before).some((e) => e.who === "CPU" && e.op === "割る"), "待ち中は割らない");
  g.clock.t += SEC + 0.1;
  for (const k of ["homophone", "cycle", "invert"]) g.cpu.cd[k] = g.now() + 100;
  const b2 = g.log.length;
  g.cpuTurn();
  assert.ok(g.log.slice(b2).some((e) => e.who === "CPU" && e.op === "割る"), "満ちたら割る");
  assert.equal(g.ready(g.cpu, "split"), false, "割ったので CPU もまた待つ");
});

test("ログの頭：待ち時間の行に 割る が入る", () => {
  const g = newGame();
  assert.match(g.logText(), new RegExp(`待ち時間 割る=${SEC}秒 反転=`));
});

test("しくみの説明（ja・en）に割るの待ち時間が出る", () => {
  const S = require("../js/strings.js");
  const fs = require("node:fs"), path = require("node:path");
  const radical = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "radical_forms.json"), "utf8"));
  const arg = { R: D.rules, min: 5, levelLabel: "N5", chars: 100, words: 900, cycles: ["春夏秋冬"], radKeys: Object.keys(radical.left), radVals: Object.values(radical.left) };
  try {
    S.setLang("ja");
    assert.ok(S.howto(arg).join("").includes(`割る：${SEC} 秒待ち`));
    S.setLang("en");
    assert.ok(S.howto(arg).join("").includes(`Split: ${SEC} s cooldown`));
  } finally { S.setLang("ja"); }
});
