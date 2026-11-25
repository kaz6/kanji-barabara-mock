// KJ-079（D-098）：放つと効く語。自刃 を放つと、場から取り終わったあとに、自分の上の段の割れる札が1枚割れる（語は外さない・点はふつう）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T4, TG1, newGame, setHand, takeAll } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
// 場と山を「割れない字（一）」にそろえる（取った札が割れる札にならないように）
function plainField(g) {
  g.deck.splice(0, g.deck.length, ...Array(60).fill("一"));
  for (const f of g.field) f.c = "一";
}
const idsOf = (p, text) => [...text].map((ch) => p.cards.find((x) => x.c === ch).id);

test("データ：effects は 語→{op, target, n}。自刃＝自分に split・ほかは相手に効く（KJ-080）。語は N4 の語の表にある。special・fx_words には入れない（点・演出・振動は普通のまま）", () => {
  const E = D.special.effects;
  assert.deepEqual(E["自刃"], { op: "split", target: "self", n: 1 });
  const want = {
    split: ["切る", "千切る", "区切る", "二分"],
    cycle: ["回転", "回る", "一周", "大回転"],
    invert: ["反転", "一転", "反る"],
    join: ["合体", "集合", "大集合"],
    homophone: ["同音", "同名"],
  };
  const opp = Object.keys(E).filter((w) => w !== "自刃").sort();
  assert.deepEqual(opp, Object.values(want).flat().sort());
  for (const [op, ws] of Object.entries(want)) for (const w of ws) assert.equal(E[w].op, op, w);
  for (const [w, e] of Object.entries(E)) {
    assert.ok(["self", "opp"].includes(e.target), w);
    assert.ok(Number.isInteger(e.n) || e.n === "max", w);
    assert.ok(T4.WORDS.has(w), `${w} は N4 の語`);
    assert.ok(!D.special.special.some((x) => x.w === w) && !D.special.fx_words.some((x) => x.w === w));
    assert.ok(!(D.rules.vibrate.special_words || []).includes(w), "振動は普通のまま");
  }
  assert.equal(E["大回転"].n, 2, "大回転だけ2枚");
  assert.equal(E["大集合"].n, "max");
  for (const w of Object.keys(E)) if (w !== "大回転" && w !== "大集合" && w !== "自刃") assert.equal(E[w].n, 1, w);
  assert.deepEqual(T4.EFFECTS.get("自刃"), { op: "split", target: "self", n: 1 });
  assert.equal(TG1.EFFECTS.has("自刃"), false, "自刃 は小1 の語ではない");
});

test("自刃：放てる（語は外れていない）。点は2字3点のまま。取り終わるまで札は切れず、取り終わると割れる札が1枚割れる", () => {
  const g = newGame(1, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "自刃休一一一");
  const r = g.release(g.me, idsOf(g.me, "自刃"));
  assert.ok(r.ok, r.why);
  assert.equal(r.pts, 3);
  assert.equal(g.me.score, 3);
  assert.ok(chars(g.me.cards).includes("休"), "取り終わるまでは切れない");
  g.take(g.me, g.field[0].id);
  assert.ok(g.me.takes === 1 && chars(g.me.cards).includes("休"), "1枚目を取っただけでは切れない");
  g.take(g.me, g.field[0].id);
  assert.equal(g.me.takes, 0);
  assert.ok(!chars(g.me.cards).includes("休"), "休 が切れた");
  assert.ok(chars(g.me.cards).includes("人") && chars(g.me.cards).includes("木"), "割った部品は手札へ");
  const cut = g.log.filter((x) => x.op === "割る");
  assert.equal(cut.length, 1);
  assert.deepEqual(cut[0].from, ["休"]);
  assert.deepEqual(cut[0].to, ["人", "木"]);
  assert.ok(cut[0].note.includes("自刃で切れた"));
  assert.equal(cut[0].pts, 0);
  const ev = g.events.filter((e) => e.type === "effect");
  assert.equal(ev.length, 1);
  assert.deepEqual({ hit: ev[0].hit, from: ev[0].from, who: ev[0].who }, { hit: true, from: "休", who: "あなた" });
  assert.equal(K.effectText(ev[0]), "自刃：休 が切れた");
});

test("自刃：割れる札が1枚も無ければ何も起きない（画面の文は「切れる札が無かった」）", () => {
  const g = newGame(2, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "自刃一一一一");
  g.release(g.me, idsOf(g.me, "自刃"));
  takeAll(g, g.me);
  assert.equal(g.log.filter((x) => x.op === "割る").length, 0);
  assert.equal(chars(g.me.cards), "一一一一一一");
  const ev = g.events.filter((e) => e.type === "effect");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].hit, false);
  assert.equal(K.effectText(ev[0]), "自刃：切れる札が無かった");
});

test("自刃：割った部品が手札・ストックに入らないとき（16マスいっぱい）は、その札は割れる札ではない", () => {
  const g = newGame(3, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "自刃休" + "一".repeat(13));
  g.release(g.me, idsOf(g.me, "自刃"));
  takeAll(g, g.me);
  assert.equal(g.me.cards.length, 16);
  assert.ok(chars(g.me.cards).includes("休"), "入りきらないので割れない");
  assert.equal(g.events.filter((e) => e.type === "effect")[0].hit, false);
});

test("自刃：割れる札が2枚以上あれば無作為に1枚だけ（乱数で決まった札が割れる）", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame(seed, "normal", "N4");
    plainField(g);
    setHand(g, g.me, "自刃休校一");
    g.release(g.me, idsOf(g.me, "自刃"));
    takeAll(g, g.me);
    const cut = g.log.filter((x) => x.op === "割る");
    assert.equal(cut.length, 1, "1枚だけ");
    seen.add(cut[0].from[0]);
  }
  assert.deepEqual([...seen].sort(), ["休", "校"].sort(), "どちらも割れうる");
  // 同じ乱数なら同じ札
  const run = () => { const g = newGame(7, "normal", "N4"); plainField(g); setHand(g, g.me, "自刃休校一"); g.release(g.me, idsOf(g.me, "自刃")); takeAll(g, g.me); return g.log.find((x) => x.op === "割る").from[0]; };
  assert.equal(run(), run());
});

test("自刃：ストック（下の段）の札は切れない。上の段だけ", () => {
  const g = newGame(4, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "自刃一一一一");
  g.me.cards.push({ id: 999001, c: "休", t: g.now(), fresh: false, tray: true });
  g.release(g.me, idsOf(g.me, "自刃"));
  takeAll(g, g.me);
  assert.ok(chars(g.me.cards).includes("休"), "ストックの 休 は残る");
  assert.equal(g.events.filter((e) => e.type === "effect")[0].hit, false);
});

test("ほかの語では起きない（効きの印も出ない）", () => {
  const g = newGame(5, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "日本休一一");
  assert.ok(g.release(g.me, idsOf(g.me, "日本")).ok);
  takeAll(g, g.me);
  assert.ok(chars(g.me.cards).includes("休"));
  assert.equal(g.log.filter((x) => x.op === "割る").length, 0);
  assert.equal(g.events.filter((e) => e.type === "effect").length, 0);
});

test("相手（CPU）が放ったときは、放った本人（CPU）の札が切れる。人の札は切れない", () => {
  const g = newGame(6, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "休一一一一");
  setHand(g, g.cpu, "自刃校一一");
  const r = g.release(g.cpu, idsOf(g.cpu, "自刃"));
  assert.ok(r.ok, r.why);
  takeAll(g, g.cpu);
  assert.ok(!chars(g.cpu.cards).includes("校"), "CPU の 校 が切れた");
  assert.equal(chars(g.me.cards), "休一一一一", "人の札は変わらない");
  const cut = g.log.filter((x) => x.op === "割る");
  assert.equal(cut.length, 1);
  assert.equal(cut[0].who, "CPU");
});

test("自刃を放ったあとに時間切れ・試合終了になっても落ちない（取り終わらないまま残る）", () => {
  const g = newGame(8, "normal", "N4");
  plainField(g);
  setHand(g, g.me, "自刃休一一一");
  g.release(g.me, idsOf(g.me, "自刃"));
  g.clock.t += 100000;
  g.tick();
  assert.ok(g.over);
  assert.ok(chars(g.me.cards).includes("休"));
});
