// KJ-080（D-099）：特別攻撃ワード。操作の意味の語を放つと、相手の札（上の段）にその操作が効く。放った瞬間に（放った側が場から取る前に）。点は普通のまま
// 切る・千切る・区切る・二分＝割る／回転・回る・一周＝巡り／大回転＝巡りを2枚／反転・一転・反る＝反転／合体・集合＝2枚をくっつける／大集合＝できるだけ多くの組をくっつける／同音・同名＝同じ読みの別の字
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const sorted = (cards) => [...chars(cards)].sort().join("");
const FILL = "年万魚肉"; // どの操作も効かない札（割れない・巡りも反転も同じ読みも無い・くっつかない）
// 放つ札：る→儿・の→ノ・な→ナ（かなに読む部品。KJ-053）
const cardsFor = (w) => [...w].map((c) => ({ る: "儿", の: "ノ", な: "ナ" }[c] || c)).join("");
function ids(p, chs) { const pool = p.cards.slice(), out = []; for (const ch of chs) { const i = pool.findIndex((x) => x.c === ch); out.push(pool[i].id); pool.splice(i, 1); } return out; }
// 人が word を放つ。CPU の手札は cpuHand（上の段）。場と山は割れない字にそろえる
function human(word, cpuHand, { seed = 1, level = "N4", opp = "normal" } = {}) {
  const g = newGame(seed, opp, level);
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, cardsFor(word) + FILL);
  setHand(g, g.cpu, cpuHand);
  const r = g.release(g.me, ids(g.me, cardsFor(word)));
  return { g, r };
}
const effects = (g) => g.events.filter((e) => e.type === "effect");

// ---- 語ごとに、効く操作と枚数 ----
test("切る・千切る・区切る・二分：相手の上の段の割れる札が1枚割れる（放った瞬間。まだ場から取っていない）", () => {
  for (const w of ["切る", "千切る", "区切る", "二分"]) {
    const { g, r } = human(w, "休年年年年年年年");
    assert.ok(r.ok, `${w}：${r.why}`);
    assert.ok(g.me.takes > 0, `${w}：放った瞬間（取る前）に効く`);
    assert.equal(sorted(g.cpu.cards), sorted([..."人木年年年年年年年"].map((c) => ({ c }))), w);
    assert.equal(chars(g.me.cards), FILL, `${w}：人の札は放った札が減っただけ`);
    const ev = effects(g);
    assert.equal(ev.length, 1, w);
    assert.deepEqual({ who: ev[0].who, victim: ev[0].victim, op: ev[0].op, hit: ev[0].hit, hits: ev[0].hits }, { who: "あなた", victim: "CPU", op: "split", hit: true, hits: [{ from: ["休"], to: ["人", "木"] }] }, w);
    assert.equal(r.pts, K.scoreOf(D, T4, w).pts, `${w}：点は普通のまま`);
    assert.equal(g.cpu.score, 0, "相手の点は動かない");
  }
});

test("回転・回る・一周：相手の札1枚が巡りで次の字に（六→七）", () => {
  for (const w of ["回転", "回る", "一周"]) {
    const { g } = human(w, "六年年年年年年年");
    assert.equal(chars(g.cpu.cards), "七年年年年年年年", w);
    assert.equal(effects(g).length, 1);
    assert.equal(effects(g)[0].op, "cycle");
  }
});

test("大回転だけ2枚：巡りが効く札が2枚以上あれば2枚、1枚しか無ければそのぶんだけ", () => {
  let { g } = human("大回転", "六六六年年年年年");
  assert.equal([...chars(g.cpu.cards)].filter((c) => c === "七").length, 2);
  assert.equal([...chars(g.cpu.cards)].filter((c) => c === "六").length, 1);
  assert.equal(effects(g)[0].hits.length, 2);
  ({ g } = human("大回転", "六年年年年年年年"));
  assert.equal(chars(g.cpu.cards), "七年年年年年年年");
  assert.equal(effects(g)[0].hits.length, 1, "効くぶんだけ");
  ({ g } = human("回転", "六六六年年年年年"));
  assert.equal([...chars(g.cpu.cards)].filter((c) => c === "七").length, 1, "回転は1枚だけ");
});

test("反転・一転・反る：相手の札1枚が裏返る（左→右）", () => {
  for (const w of ["反転", "一転", "反る"]) {
    const { g } = human(w, "左年年年年年年年");
    assert.equal(chars(g.cpu.cards), "右年年年年年年年", w);
    assert.equal(effects(g)[0].op, "invert");
  }
});

test("同音・同名：相手の札1枚が、同じ読みの別の字に（無作為）", () => {
  const seen = new Set();
  for (const w of ["同音", "同名"]) {
    for (let seed = 1; seed <= 20; seed++) {
      const { g } = human(w, "校年年年年年年年", { seed });
      const x = g.cpu.cards[0].c;
      assert.notEqual(x, "校");
      assert.ok(K.homoChars(T4, "校").includes(x), `${x} は 校 と同じ読み`);
      assert.equal(g.cpu.cards.length, 8);
      seen.add(x);
    }
  }
  assert.ok(seen.size >= 3, "同じ読みの字の中から無作為");
});

test("合体・集合：相手の札2枚を1枚にくっつける（1組だけ）", () => {
  for (const w of ["合体", "集合"]) {
    const { g } = human(w, "人木日月年年年年");
    assert.equal(g.cpu.cards.length, 7, `${w}：2枚が1枚に`);
    assert.equal(effects(g)[0].hits.length, 1, "1組だけ");
    const s = sorted(g.cpu.cards);
    assert.ok(s === [..."休日月年年年年"].sort().join("") || s === [..."人木明年年年年"].sort().join(""), `${w}：${s}`);
  }
});

test("大集合：くっつけられる組をできるだけ多く（組の選びは無作為。1枚は1つの組にしか使わない）", () => {
  let { g } = human("大集合", "人木日月女子年年");
  assert.deepEqual([...chars(g.cpu.cards)].sort(), [..."休明好年年"].sort(), "3組ぜんぶ");
  assert.equal(effects(g)[0].hits.length, 3);
  // 十 一 二 小：(十一)(二小) の2組が最大。(一二) を先に選ぶと1組で終わる（それは選ばない）
  for (let seed = 1; seed <= 30; seed++) {
    ({ g } = human("大集合", "十一二小年年年年", { seed }));
    assert.equal(effects(g)[0].hits.length, 2, `seed ${seed}：最大の2組`);
    assert.equal(g.cpu.cards.length, 6);
  }
  // くっつけられる組が1組なら1組
  ({ g } = human("大集合", "人木年年年年年年"));
  assert.equal(chars(g.cpu.cards), "休年年年年年年");
  // 組が無ければ空振り
  ({ g } = human("大集合", "年年年年年年年年"));
  assert.equal(effects(g)[0].hit, false);
  assert.equal(g.cpu.cards.length, 8);
});

// ---- 効く札・空振り ----
test("効く札が1枚も無ければ空振り（札は何も変わらない・ログも増えない）", () => {
  for (const [w, hand] of [["切る", "年年年年年年年年"], ["回転", "年年年年年年年年"], ["反転", "年年年年年年年年"], ["同音", "年年年年年年年年"], ["合体", "年年年年年年年年"]]) {
    const { g } = human(w, hand);
    assert.equal(chars(g.cpu.cards), hand, w);
    const ev = effects(g);
    assert.equal(ev.length, 1, w);
    assert.equal(ev[0].hit, false);
    assert.equal(K.effectText(ev[0]), `あなたの ${w}：空振り`);
    assert.equal(g.log.filter((x) => x.who === "CPU" && ["割る", "巡り", "反転", "くっつける", "同音"].includes(x.op)).length, 0);
  }
});

test("ストック（下の段）の札には効かない。上の段だけ", () => {
  const g = newGame(1, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, "切儿" + FILL);
  setHand(g, g.cpu, "年年年年年年年年");
  g.cpu.cards.push({ id: 999001, c: "休", t: g.now(), fresh: false, tray: true });
  assert.ok(g.release(g.me, ids(g.me, "切儿")).ok);
  assert.ok(chars(g.cpu.cards).includes("休"), "ストックの 休 は割れない");
  assert.equal(effects(g)[0].hit, false);
});

test("割った部品が手札・ストックに入らない札には効かない（16マスいっぱい）", () => {
  const g = newGame(1, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, "切儿" + FILL);
  setHand(g, g.cpu, "休年年年年年年年");
  for (let i = 0; i < 8; i++) g.cpu.cards.push({ id: 999100 + i, c: "年", t: g.now(), fresh: false, tray: true });
  assert.ok(g.release(g.me, ids(g.me, "切儿")).ok);
  assert.ok(chars(g.cpu.cards).includes("休"));
  assert.equal(effects(g)[0].hit, false);
});

test("効く札が複数あれば無作為に1枚。同じ乱数なら同じ札", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) { const { g } = human("切る", "休校年年年年年年", { seed }); seen.add(g.log.find((x) => x.who === "CPU" && x.op === "割る").from[0]); }
  assert.deepEqual([...seen].sort(), ["休", "校"].sort());
  const run = () => chars(human("切る", "休校年年年年年年", { seed: 9 }).g.cpu.cards);
  assert.equal(run(), run());
});

// ---- ログ・待ち時間・ヒント ----
test("ログ：効かされた側（CPU）の行として残る。手は 割る・巡り・反転・くっつける・同音。メモに「あなた の 切る で」。点は動かない", () => {
  const cases = [["切る", "休年年年年年年年", "割る", ["休"], ["人", "木"]], ["回転", "六年年年年年年年", "巡り", ["六"], ["七"]], ["反転", "左年年年年年年年", "反転", ["左"], ["右"]], ["合体", "人木年年年年年年", "くっつける", ["人", "木"], ["休"]]];
  for (const [w, hand, op, from, to] of cases) {
    const { g } = human(w, hand);
    const row = g.log.find((x) => x.who === "CPU" && x.op === op);
    assert.ok(row, w);
    assert.deepEqual([row.from, row.to, row.pts], [from, to, 0], w);
    assert.ok(row.note.includes(`あなた の ${w} で`), row.note);
  }
});

test("待ち時間はかけない・使わない：効かされた側の待ち時間はそのまま", () => {
  const { g } = human("回転", "六年年年年年年年");
  assert.deepEqual(g.cpu.cd, { invert: 0, cycle: 0, homophone: 0 });
  assert.deepEqual(g.me.cd, { invert: 0, cycle: 0, homophone: 0 });
  assert.equal(g.cpu.takes, 0, "相手は場から取る枚数も増えない");
});

test("人の光っているヒントの札が食らって変わったら、ヒントは消える（今の決まり）", () => {
  const g = newGame(1, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, "年年年年年年年年");
  setHand(g, g.cpu, "切儿" + FILL);
  g.hint = { tier: 1, ids: [g.me.cards[0].id], button: null, op: "放つ", word: null, until: g.now() + 10, redraws: 0 };
  g.me.cards[0].c = "休";
  assert.ok(g.hintActive());
  assert.ok(g.release(g.cpu, ids(g.cpu, "切儿")).ok);
  assert.equal(g.me.cards.length, 9, "休 が 人 と 木 に割れた");
  assert.equal(g.hintActive(), null, "光らせた札が替わった");
});

// ---- CPU が放つ ----
test("CPU が放てば人の札に効く（人の上の段から）。CPU 自身の札は変わらない", () => {
  const g = newGame(2, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, "休年年年年年年年");
  setHand(g, g.cpu, "切儿" + FILL);
  const r = g.release(g.cpu, ids(g.cpu, "切儿"));
  assert.ok(r.ok, r.why);
  assert.equal(sorted(g.me.cards), [..."人木年年年年年年年"].sort().join(""));
  assert.equal(chars(g.cpu.cards), FILL);
  const row = g.log.find((x) => x.who === "あなた" && x.op === "割る");
  assert.ok(row && row.note.includes("CPU の 切る で"), row && row.note);
  const ev = effects(g)[0];
  assert.equal(K.effectText(ev), "CPU の 切る：あなたの 休 が割れた");
});

test("CPU が放った 大回転・合体 も人に効く。人のストックには効かない", () => {
  const g = newGame(3, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("年"));
  for (const f of g.field) f.c = "年";
  setHand(g, g.me, "六六六年年年年年");
  g.me.cards.push({ id: 999201, c: "六", t: g.now(), fresh: false, tray: true });
  setHand(g, g.cpu, "大回転" + FILL.slice(0, 1));
  assert.ok(g.release(g.cpu, ids(g.cpu, "大回転")).ok);
  assert.equal([...chars(g.me.cards.filter((x) => !x.tray))].filter((c) => c === "七").length, 2);
  assert.equal(g.me.cards.find((x) => x.tray).c, "六", "ストックの 六 は変わらない");
});

test("CPU の 自刃 は CPU 自身の札が切れるまま。人の札には効かない（KJ-079 のまま）", () => {
  const g = newGame(4, "normal", "N4");
  g.deck.splice(0, g.deck.length, ...Array(60).fill("一"));
  for (const f of g.field) f.c = "一";
  setHand(g, g.me, "休一一一一");
  setHand(g, g.cpu, "自刃校一一");
  assert.ok(g.release(g.cpu, ids(g.cpu, "自刃")).ok);
  assert.equal(chars(g.me.cards), "休一一一一");
  while (g.cpu.takes > 0) g.take(g.cpu, g.field[0].id);
  assert.ok(!chars(g.cpu.cards).includes("校"));
});

// ---- 起きないとき ----
test("ほかの語では起きない（効きの印も出ない）", () => {
  const { g } = human("日本", "休六左校人木年年");
  assert.equal(effects(g).length, 0);
  assert.equal(chars(g.cpu.cards), "休六左校人木年年");
});

test("ひとりで（CPU 無し）：放っても何も起きず、落ちない", () => {
  const { g, r } = human("切る", "", { opp: "solo" });
  assert.ok(r.ok, r.why);
  assert.equal(effects(g).length, 0);
});

test("レベル：小1 は 二分 だけ・N5 は 二分・一周・N4 は全部が効く語（語の表にあるものだけ）", () => {
  assert.deepEqual([...TG1.EFFECTS.keys()].sort(), ["二分"]);
  assert.deepEqual([...T.EFFECTS.keys()].sort(), ["一周", "二分"]);
  assert.deepEqual([...T4.EFFECTS.keys()].sort(), Object.keys(D.special.effects).sort());
  const { g, r } = human("二分", "休年年年年年年年", { level: "G1" });
  assert.ok(r.ok, r.why);
  assert.ok(!chars(g.cpu.cards).includes("休"), "小1 でも 二分 は割る");
});

test("画面の文：食らわせた・食らった・空振り", () => {
  const t = (w, hand, p) => K.effectText(effects(p ? human(w, hand).g : human(w, hand).g)[0]);
  assert.equal(t("回転", "六年年年年年年年"), "あなたの 回転：CPU の 六 が 七 に");
  assert.equal(t("反転", "左年年年年年年年"), "あなたの 反転：CPU の 左 が 右 に");
  assert.equal(t("合体", "人木年年年年年年"), "あなたの 合体：CPU の 人 と 木 が 休 に");
  assert.equal(t("切る", "休年年年年年年年"), "あなたの 切る：CPU の 休 が割れた");
  assert.equal(t("切る", "年年年年年年年年"), "あなたの 切る：空振り");
  assert.equal(t("大回転", "六六年年年年年年"), "あなたの 大回転：CPU の 六 が 七 に、CPU の 六 が 七 に");
});

// ---- 食らいの演出（KJ-081）：画面が効いた札を見つけるための ids（効いた札の新しい id。hits と同じ順） ----
test("効いたとき event.ids が hits と同じ並びで、いまの札の id を指す（割る＝2枚・くっつける＝1枚）", () => {
  let { g } = human("切る", "休年年年年年年年");
  let ev = effects(g)[0];
  assert.equal(ev.ids.length, ev.hits.length);
  assert.deepEqual(ev.ids[0].map((id) => g.cpu.cards.find((x) => x.id === id).c), ["人", "木"]);
  ({ g } = human("集合", "人木年年年年年年"));
  ev = effects(g)[0];
  assert.equal(ev.hits.length, 1);
  assert.deepEqual(ev.ids[0].map((id) => g.cpu.cards.find((x) => x.id === id).c), ev.hits[0].to);
  assert.equal(ev.ids[0].length, 1);
  ({ g } = human("回転", "年年年年年年年年"));
  ev = effects(g)[0];
  assert.deepEqual([ev.hit, ev.hits, ev.ids], [false, [], []], "空振りは ids も空");
});
