// 画面のテスト（Playwright の Chromium があるときだけ。ないときは skip）
// 台に札を置いても手札と場の位置が動かないこと、「並べる順が逆」、放つ→場から取る、引き直し、ログ・ログをコピー（KJ-003）
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readBox } from "./dragwait.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* 入っていない */ }

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      const f = p.endsWith("/") ? path.join(p, "index.html") : p;
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

// Redraw は長押しで引き直す（KJ-078。REDRAW_HOLD_MS＝600ms）。マウスを押して、埋まりきるまで待って離す
async function holdRedraw(page, ms = 800) {
  const bb = await page.locator("#bRedraw").boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

const skip = chromium ? false : "Playwright が入っていない";

// 新しい端末の「はじめる」はチュートリアルから始まる（KJ-043）。既存の画面テストは「チュートリアルを見た」印（kj-tutorial）を付けた端末で始める。
// チュートリアルを見るテストは、newContext に { noTutorialMark: true } を渡す
async function launch() {
  const b = await chromium.launch();
  const nc = b.newContext.bind(b);
  b.newContext = async (o) => {
    const { noTutorialMark, motion, ...opts } = o || {};
    // 点の演出（KJ-050）のカウントアップで「放った直後の点」を見るテストが揺れないよう、既定は「動きを減らす」。演出を見るテストだけ motion: true
    const ctx = await nc({ reducedMotion: motion ? "no-preference" : "reduce", ...opts });
    if (!noTutorialMark) await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
    return ctx;
  };
  return b;
}
// localStorage が読めない端末ではチュートリアルの印が残らないので、「はじめる」のあとにとばす
async function clickStart(page) {
  await page.click("#start");
  if (await page.locator("#tut:not([hidden])").count()) await page.click("#tutSkip");
}

// 相手を選ぶ（KJ-045）：中のキー（solo・weak・fair・normal・room）から、画面の2段（遊び方→強さ）を押す。
// solo（ひとりで）は画面から外した（KJ-056）。CPU なしの作りを試すテストのために、画面の外から中のキーだけ入れる（端末には覚えない）
async function pickOpp(page, key) {
  if (key === "solo") return page.evaluate(() => { opponent = "solo"; });
  if (key === "room") return page.check(`#opp input[value="${key}"]`);
  await page.check('#opp input[value="cpu"]');
  await page.check(`#pow input[value="${key}"]`);
}
// 時限ヒント（KJ-086）：ページの時計（performance.now）をずらして、放たずに timed_sec 秒たった形にする。pre に渡す
const shiftClock = (page) => page.addInitScript(() => { window.__shiftSec = 0; window.__shift = (G) => { window.__shiftSec += __KJ.data.rules.hint.timed_sec; G.tick(); }; const pn = performance.now.bind(performance); performance.now = () => pn() + window.__shiftSec * 1000; });
async function open(browser, url, vp, opponent, pre = null, motion = false) {
  const ctx = await browser.newContext({ viewport: vp, motion });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  if (pre) await pre(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  if (opponent) await pickOpp(page, opponent);
  await clickStart(page);
  // CPU を止め、手を決める
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
  });
  await page.evaluate(() => __KJ.render());
  return { ctx, page, errors };
}

test("画面", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();
  t.after(async () => { await browser.close(); srv.close(); });

  for (const vp of [{ width: 760, height: 1100, name: "広い画面" }, { width: 375, height: 900, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：台に置いても手札と場が動かない。放つ→場から取る→ログ`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp);
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      const hand0 = await pos("#meHand > *"), field0 = await pos("#field > *");
      const tap = async (ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click(); // 選んでいない札を押す（天 は2枚ある）
      // 天上天下（四字熟語、英語の説明が長い）
      for (const ch of "天上天下") {
        await tap(ch);
        assert.equal(await pos("#meHand > *"), hand0, `${ch} を置いても手札のマスは動かない`);
        assert.equal(await pos("#field > *"), field0, `${ch} を置いても場は動かない`);
      }
      assert.match(await page.textContent("#info"), /48点/);
      await page.click("#bBack");
      // 口・十 → 並べる順が逆
      await tap("口"); await tap("十");
      assert.match(await page.textContent("#info"), /並べる順が逆/);
      assert.equal(await pos("#meHand > *"), hand0);
      await page.click("#bBack");
      // 十・口 → くっつけるで 古 か 田 を選ぶ（選ぶ札は重ねて出すので動かない）
      await tap("十"); await tap("口");
      await page.click("#bJoin");
      assert.equal(await pos("#meHand > *"), hand0, "選ぶ札が出ても手札は動かない");
      await page.locator("#choices button", { hasText: "古" }).click();
      assert.match(await page.textContent("#row"), /^古/);
      await page.click("#bBack");
      // 玉 は字として見せる（部品の色にしない）
      assert.equal(await page.locator("#field .tile", { hasText: "玉" }).evaluate((e) => e.classList.contains("part")), false);
      // 休日 を放つ → 3点、2枚取れる
      await tap("休"); await tap("日");
      await page.click("#bRelease");
      assert.match(await page.textContent("#meScore"), /^3 点/);
      assert.match(await page.textContent("#takes"), /場から あと 2 枚 取る/);
      assert.equal(await page.locator("#field.glow").count(), 1, "放ったあと、取りきるまで場が光る（KJ-039）");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll(".ops button")].every((b) => b.disabled || b.getAttribute("aria-disabled") === "true")), true, "取りきるまで、ほかのボタンは全部押せない（KJ-039）");
      assert.equal(await pos("#field > *"), field0);
      // 取ったあとのマスには山から無作為に字が出る（同じ字が出ることもある）ので、字ではなくマスの位置（山=1番目・川=2番目）で押す
      await page.locator("#field .tile").nth(0).click();
      await page.locator("#field .tile").nth(1).click();
      assert.equal(await page.textContent("#takes"), "");
      assert.equal(await page.locator("#field.glow").count(), 0, "取りきったら光りは消える");
      assert.equal(await page.evaluate(() => document.getElementById("bRedraw").getAttribute("aria-disabled")), "false", "取りきったら動ける");
      assert.equal(await page.locator("#meHand .tile", { hasText: "山" }).count(), 1, "山 が手札に来た");
      assert.equal(await pos("#field > *"), field0, "取ったあとも場の位置は同じ");
      assert.match(await page.textContent("#released"), /^アナタ、休日（キュウジツ）ヲ放ツ。二字ニテ三点。場ヨリ山・川ヲ取ル。$/); // 戦況の文（KJ-094）：読みと点は文の中・取った字が足される
      // 引き直し（1回目は0点。KJ-049）：添え字は次の値段と残りの回数
      assert.equal(await page.textContent("#cdRedraw"), "0pt あと5回", "はじめは 0pt あと5回");
      await holdRedraw(page);
      assert.equal(await page.textContent("#cdRedraw"), "-5pt あと4回", "2回目は 5点・あと4回");
      assert.equal(await page.evaluate(() => document.getElementById("bRedraw").classList.contains("cd")), false, "待たない（ゲージにならない）");
      // ログ
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /^# 漢対普請瓦版 ログ/);
      assert.match(log, /# 仮置き 場=3枚 最初の手札=8枚 手札の上限=8枚＋ストック8枚/);
      assert.match(log, /# 相手 とても弱い（CPU は 30〜45秒に1回動く/);
      assert.match(log, /\tためした\t口 十\t\t0\t.*\t並べる順が逆/);
      assert.match(log, /\tくっつける\t十 口\t古\t/);
      assert.match(log, /\t放つ\t休 日\t\t3\t3\t0\t/);
      assert.match(log, /\t取る\t山\t山\t0\t/);
      assert.match(log, /\t引き直し\t.*\t0\t.*1回目 0点/, "引き直しの行に何回目と値段（KJ-049）");
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await t.test("地名・名字（KJ-032）：台の行に〔名字〕〔地名・名字〕の印。普通の言葉には付かない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 });
    await page.evaluate(() => { __KJ.game.me.cards = [..."田中石川休日"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); });
    const tap = async (ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
    await tap("田"); await tap("中");
    assert.match(await page.textContent("#info"), /^田中 \d+点 たなか〔名字〕/);
    if (process.env.KJ_SHOT_PN) await page.screenshot({ path: process.env.KJ_SHOT_PN }); // 報告の画像（KJ-032）
    await page.click("#bBack");
    await tap("石"); await tap("川");
    assert.match(await page.textContent("#info"), /いしかわ〔地名・名字〕/);
    await page.click("#bBack");
    // もとの読みが違う語は、名前の読みを並べる（大分 だいぶ／おおいた〔地名〕）
    await page.evaluate(() => { __KJ.game.me.cards.push(...[..."大分"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false }))); __KJ.render(); });
    await tap("大"); await tap("分");
    assert.match(await page.textContent("#info"), /だいぶ／おおいた〔地名〕/);
    await page.click("#bBack");
    await tap("休"); await tap("日");
    assert.equal(await page.locator("#info .pn").count(), 0, "普通の言葉には印なし");
    assert.doesNotMatch(await page.textContent("#info"), /〔/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("かなに読む部品（KJ-053）：ノ・儿・ナ の札を台に並べると、言葉はひらがなで出る（天の川・見る）。かなだけは放てない。放った言葉もひらがな", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 });
    await page.evaluate(() => { __KJ.game.me.cards = [..."天ノ川見儿休日ナ"].map((c, i) => ({ id: 9400 + i, c, t: 0, fresh: false })); __KJ.render(); });
    const tap = async (ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
    assert.equal(await page.locator("#meHand .tile", { hasText: "ノ" }).count(), 1, "札は部品の ノ のまま");
    await tap("儿"); await tap("ナ");
    assert.match(await page.textContent("#info"), /かなだけでは放てない/);
    assert.ok(await page.locator("#bRelease").isDisabled(), "Play は押せない");
    await page.click("#bBack");
    await tap("見"); await tap("儿");
    // 部品の札の意味（KJ-021。#info .rad）は1行目に出る。ここは言葉の行を見る
    const wordInfo = () => page.evaluate(() => { const c = document.getElementById("info").cloneNode(true); c.querySelectorAll(".rad").forEach((e) => e.remove()); return c.textContent; });
    assert.match(await wordInfo(), /^見る 3点 みる/);
    await page.click("#bBack");
    await tap("天"); await tap("ノ"); await tap("川");
    assert.match(await wordInfo(), /^天の川 9点 あまのがわ/);
    assert.doesNotMatch(await wordInfo(), /ノ/);
    if (process.env.KJ_SHOT_KANA) await page.screenshot({ path: process.env.KJ_SHOT_KANA }); // 報告の画像（KJ-053）
    await page.click("#bRelease");
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 9);
    assert.match(await page.textContent("#released"), /^アナタ、天の川（アマノガワ）ヲ放ツ。三字ニテ九点。/); // 戦況の文（KJ-094）：言葉は放ったとおり（ひらがなの の も残る）・読みはカタカナ
    assert.ok(await page.evaluate(() => __KJ.game.log.some((e) => e.op === "放つ" && e.from.join("") === "天の川")), "ログの 放つ はひらがな");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("相手の選び方（KJ-045）：初期値は CPU と＋とても弱い。遊び方は2つ（ひとりで は無い）、強さは CPU とのときだけ3つ", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#opp label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["CPU と", "友だちと（合言葉）"]);
    assert.deepEqual((await page.locator("#pow label").allTextContents()).map((x) => x.trim()), ["とても弱い", "ふつう", "つよい"]);
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "cpu");
    assert.equal(await page.locator("#pow input:checked").getAttribute("value"), "weak");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak");
    assert.equal(await page.isVisible("#cpuSide"), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：3つが上から並び、初期値は 遊び方=CPU と・強さ=とても弱い・レベル=N4・時間=10分。下に「はじめる」（並べ方の選びは KJ-030 でなくした）", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.isVisible("#setup"), true);
    assert.equal(await page.isVisible("#game"), false, "遊ぶ画面はまだ出ない");
    const ys = await page.evaluate(() => ["opp", "pow", "lvl", "tim", "start"].map((id) => document.getElementById(id).getBoundingClientRect().top));
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, "遊び方・強さ・レベル・時間・はじめる の順に上から並ぶ");
    const labels = (id) => page.locator(`#${id} label`).allTextContents().then((a) => a.map((x) => x.trim()));
    assert.deepEqual(await labels("opp"), ["CPU と", "友だちと（合言葉）"]);
    assert.deepEqual(await labels("pow"), ["とても弱い", "ふつう", "つよい"]);
    assert.deepEqual(await labels("lvl"), ["小1", "N5", "N4"]);
    assert.deepEqual(await labels("tim"), ["5分", "10分", "15分"]);
    assert.equal(await page.locator("#lay").count(), 0, "並べ方の選びはない（KJ-030）");
    for (const [id, v] of [["opp", "cpu"], ["pow", "weak"], ["lvl", "N4"], ["tim", "600"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横にはみ出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：時間の3択で終わる時刻が変わる。4つが端末に残り、ログの頭に出る", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 });
    await page.click("#bSetup");
    assert.equal(await page.isVisible("#setup"), true, "設定を変えるで はじめる前の画面へ戻る");
    assert.equal(await page.isVisible("#game"), false);
    assert.equal(await page.evaluate(() => __KJ.game), null, "遊びは捨てる");
    for (const sec of [300, 600, 900]) {
      await page.check(`#tim input[value="${sec}"]`);
      await page.click("#start");
      assert.equal(await page.evaluate(() => __KJ.game.timeLimit), sec);
      assert.equal(await page.evaluate(() => __KJ.game.picking), undefined, "はじめの1枚はない（KJ-016）");
      const left = await page.evaluate(() => __KJ.game.timeLeft());
      assert.ok(left > sec - 3 && left <= sec, `残り ${left} 秒（${sec} 秒で始まる）`);
      assert.match(await page.textContent("#clock"), new RegExp(`^残り ${Math.floor(sec / 60)}:`));
      await page.click("#bLog");
      assert.match(await page.inputValue("#logText"), new RegExp(`# 時間 ${sec / 60}分\n`));
      await page.click("#bLog");
      await page.click("#bSetup");
    }
    // 3つ選んで、ログの頭に3つとも出る
    await pickOpp(page, "normal");
    await page.check('#lvl input[value="N5"]');
    await page.check('#tim input[value="300"]');
    await page.click("#start");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /# レベル N5\n# 相手 つよい（CPU は /);
    assert.match(log, /# 時間 5分\n# 仮置き /);
    // 3つが端末に残る（並べ方の kj-layout はもう使わない）
    assert.deepEqual(await page.evaluate(() => ["kj-opponent", "kj-level", "kj-time", "kj-layout"].map((k) => localStorage.getItem(k))), ["normal", "N5", "300", null]);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    for (const [id, v] of [["opp", "cpu"], ["pow", "normal"], ["lvl", "N5"], ["tim", "300"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, `${id} を覚えている`);
    // ふつう（KJ-035）：選ぶと端末に覚え、再読み込みでも選ばれていて、はじめるとログの頭に出る
    await pickOpp(page, "fair");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-opponent")), "fair");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "cpu", "CPU と を覚えている");
    assert.equal(await page.locator("#pow input:checked").getAttribute("value"), "fair", "ふつうを覚えている");
    await page.click("#start");
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# 相手 ふつう（CPU は 25〜30秒に1回動く。1手先は反転・巡り）/);
    await page.click("#bLog");
    await page.click("#bSetup");
    // 知らない値が残っていても初期値で動く
    await page.evaluate(() => { localStorage.setItem("kj-time", "7"); localStorage.setItem("kj-opponent", "ばか"); });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#tim input:checked").getAttribute("value"), "600");
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "cpu");
    assert.equal(await page.locator("#pow input:checked").getAttribute("value"), "weak");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("相手の整理（KJ-045）：遊び方で出る段が変わる（強さは CPU と のときだけ・部屋は 友だちと のときだけ・レベル時間は部屋を作る側）", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    const vis = (sel) => page.isVisible(sel);
    // CPU と（初期値）：強さが出る。部屋は出ない
    assert.deepEqual([await vis("#pow"), await vis("#roomBox"), await vis("#start"), await vis("#lvl"), await vis("#tim")], [true, false, true, true, true]);
    // ひとりで は画面にない（KJ-056）
    assert.equal(await page.locator('#opp input[value="solo"]').count(), 0);
    // 友だちと：部屋を作る・合言葉で入るが出る。強さは出ない。レベル・時間は「部屋を作る」の側にあり、入る側（合言葉の欄）には無い
    await page.check('#opp input[value="room"]');
    assert.deepEqual([await vis("#pow"), await vis("#roomBox"), await vis("#start"), await vis("#bHost"), await vis("#bEnter"), await vis("#lvl"), await vis("#tim")], [false, true, false, true, true, true, true]);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-opponent")), "room");
    const place = await page.evaluate(() => {
      const y = (id) => document.getElementById(id).getBoundingClientRect().top;
      return { inHost: document.getElementById("hostSlot").contains(document.getElementById("lvl")) && document.getElementById("hostSlot").contains(document.getElementById("tim")),
        order: y("lvl") < y("bHost") && y("tim") < y("bHost") && y("bHost") < y("roomCode") };
    });
    assert.deepEqual(place, { inHost: true, order: true });
    // CPU と に戻すと、前に選んだ強さを覚えている。レベル・時間はもとの場所に戻る
    await page.check('#opp input[value="cpu"]');
    await page.check('#pow input[value="normal"]');
    await page.check('#opp input[value="room"]');
    await page.check('#opp input[value="cpu"]');
    assert.equal(await page.locator("#pow input:checked").getAttribute("value"), "normal");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-opponent")), "normal");
    assert.equal(await page.evaluate(() => document.getElementById("setSlot").contains(document.getElementById("lvl"))), true);
    // 375×700 で、はじめる前の画面が横にはみ出さない（2つの遊び方・3つの強さが折り返して収まる）
    for (const m of ["cpu", "room"]) {
      await page.check(`#opp input[value="${m}"]`);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(w.sw <= w.cw, `${m}：横にはみ出さない ${JSON.stringify(w)}`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("相手の整理（KJ-045）：前の形で覚えた値は新しい形に読み替える（room→友だちと・weak→CPU と＋とても弱い・normal→つよい・読めなければ CPU と＋とても弱い）。ログの「相手」の書き方は今のまま", async () => {
    const cases = [["room", "room", null], ["weak", "cpu", "weak"], ["fair", "cpu", "fair"], ["normal", "cpu", "normal"], ["solo", "cpu", "weak"], ["ばか", "cpu", "weak"]];
    for (const [stored, mode, power] of cases) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
      const page = await ctx.newPage();
      await page.addInitScript((v) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("kj-opponent", v); sessionStorage.setItem("seeded", "1"); } } catch (e) {} }, stored);
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      assert.equal(await page.locator("#opp input:checked").getAttribute("value"), mode, `${stored} → 遊び方 ${mode}`);
      if (power) assert.equal(await page.locator("#pow input:checked").getAttribute("value"), power, `${stored} → 強さ ${power}`);
      assert.equal(await page.isVisible("#pow"), mode === "cpu");
      if (stored === "solo") { // 端末に solo を覚えた人は、そのまま「はじめる」と CPU と＋とても弱い で始まる（KJ-056）
        await page.click("#start");
        if (await page.locator("#tut:not([hidden])").count()) await page.click("#tutSkip");
        assert.deepEqual(await page.evaluate(() => [__KJ.game.opponent, __KJ.game.solo]), ["weak", false]);
      }
      await ctx.close();
    }
    // ログの「相手」の行も、画面の呼び名の「つよい」で出る（KJ-019 追記2。前は「いまの強さ」だった）
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "normal");
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# 相手 つよい/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：localStorage が使えなくても始められる（初期値で動く）", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    for (const [id, v] of [["opp", "cpu"], ["pow", "weak"], ["lvl", "N4"], ["tim", "600"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
    await page.check('#tim input[value="900"]'); // 選んでも壊れない（覚えないだけ）
    await clickStart(page); // 印が残せない端末はチュートリアルから。とばして本番へ
    assert.equal(await page.evaluate(() => __KJ.game.timeLimit), 900);
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：「もう一度」は同じ設定ですぐ始まる。遊ぶ画面では何も変えられない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, "normal");
    await page.click("#bSetup");
    await page.check('#lvl input[value="N5"]');
    await page.check('#tim input[value="300"]');
    await pickOpp(page, "weak");
    await page.click("#start");
    assert.equal(await page.isVisible("#setup"), false);
    for (const id of ["opp", "lvl", "tim"]) assert.equal(await page.isVisible("#" + id), false, `${id} は遊んでいる途中では変えられない`);
    assert.equal(await page.locator("#layNow").count(), 0, "並べ方の切り替えはなくした（KJ-030）");
    // 終わらせて もう一度
    await page.evaluate(() => { __KJ.game.endsAt = __KJ.game.now() - 1; });
    await page.waitForFunction(() => /^(勝ち|負け|引き分け)/.test(document.getElementById("msg").textContent));
    await page.click("#again");
    const g = await page.evaluate(() => ({ lv: __KJ.game.level, t: __KJ.game.timeLimit, o: __KJ.game.opponent, over: __KJ.game.over, picking: __KJ.game.picking }));
    assert.deepEqual(g, { lv: "N5", t: 300, o: "weak", over: false, picking: undefined }, "同じ設定で新しく始まる");
    assert.equal(await page.isVisible("#setup"), false);
    assert.equal(await page.textContent("#msg"), "", "はじめの1枚はない。始めてすぐ遊べる");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("レベル（KJ-006）：初期値は N4。N5 を選ぶと字と語が減り、ログの頭に出る。端末に覚える", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#lvl label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["小1", "N5", "N4"]);
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N4");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N4");
    const n4 = await page.evaluate(() => [__KJ.tables.CHARS.size, __KJ.tables.WORDS.size]);
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# レベル N4（N5＋N4 の字）/);
    assert.equal(await page.isVisible("#lvl"), false, "遊んでいる途中では変えられない");
    await page.click("#bSetup");
    await page.check('#lvl input[value="N5"]');
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N5");
    const n5 = await page.evaluate(() => [__KJ.tables.CHARS.size, __KJ.tables.WORDS.size]);
    assert.ok(n5[0] < n4[0] && n5[1] < n4[1], `${n5} < ${n4}`);
    await page.click("#bLog"); await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# レベル N5\n/);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-level")), "N5");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N5");
    assert.match(await page.textContent("#setupInfo"), /レベル N5/);
    // localStorage が読めなくても初期値で始められる
    await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N4");
    await clickStart(page);
    assert.equal(await page.evaluate(() => __KJ.game.level), "N4");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("小1（KJ-044）：選ぶと山は80字だけ。字・語の数が出て、ログの頭に「小1」。端末に覚える。N4 に戻せる", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.deepEqual((await page.locator("#lvl label").allTextContents()).map((x) => x.trim()), ["小1", "N5", "N4"], "選びの順");
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N4", "初期値は N4 のまま");
    await page.check('#lvl input[value="G1"]');
    assert.match(await page.textContent("#setupInfo"), /^字 80・語 \d+（レベル 小1/);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-level")), "G1");
    if (process.env.KJ_SHOT) await page.screenshot({ path: "docs/img/kj-044-setup-375.png" });
    await pickOpp(page, "weak");
    await clickStart(page);
    assert.equal(await page.evaluate(() => __KJ.game.level), "G1");
    const G1 = [..."日一人年大十二本中出三見月生五上四金九入立手力学円子目田八六下気小七山正女百先名川文千水男村口町校空土木車石足早白字音天火花赤青竹右森左休林王玉夕雨草犬耳虫糸貝"];
    const seen = await page.evaluate(() => [...__KJ.game.me.cards, ...__KJ.game.field].map((c) => c.c));
    assert.ok(seen.length >= 8);
    const outside = seen.filter((c) => !G1.includes(c));
    assert.ok(outside.length <= 1, `80字の外は、ストックに入れる部品1枚だけ：${outside}`);
    for (const c of await page.evaluate(() => __KJ.game.field.map((x) => x.c))) assert.ok(G1.includes(c), `場の ${c} は80字の外`);
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# レベル 小1（小学1年の漢字80字）/);
    await page.click("#bLog");
    await page.click("#bSetup");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "G1", "端末に覚える");
    await page.check('#lvl input[value="N4"]');
    assert.match(await page.textContent("#setupInfo"), /^字 284・語 11036（レベル N4/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("小1・同音（KJ-070）：五 を選んで Same reading を押すと 午・後・語 の一覧が出て、選ぶと変わる", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await page.check('#lvl input[value="G1"]');
    await pickOpp(page, "weak");
    await clickStart(page);
    assert.equal(await page.evaluate(() => __KJ.game.level), "G1");
    await page.evaluate(() => { __KJ.game.me.cards = [..."五山川日月木火水"].map((c, i) => ({ id: 9900 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.locator("#meHand .tile", { hasText: "五" }).click();
    await page.click("#bHomo");
    const opts = (await page.locator("#choices.on button").allTextContents()).map((x) => x.trim()).sort();
    assert.deepEqual(opts, [..."午後語"].sort(), "小1 でも N5 の字（午・後・語）が選べる");
    if (process.env.KJ_SHOT) await page.screenshot({ path: "docs/img/kj-070-homophone-g1-375.png" });
    await page.locator("#choices.on button", { hasText: "後" }).click();
    assert.equal(await page.locator("#meHand .tile", { hasText: "後" }).count(), 1);
    assert.equal(await page.locator("#meHand .tile", { hasText: "五" }).count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじまり（KJ-016）：8枚で始まり、すぐ時間が動いて操作できる。ストックに部品が1枚。「最初の1枚を選ぶ」は出ない", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await pickOpp(page, "normal");
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.picking), undefined);
    assert.doesNotMatch(await page.textContent("#msg"), /最初の1枚/);
    assert.doesNotMatch(await page.textContent("body"), /最初の1枚を/);
    assert.equal(await page.locator("#meHand .tile").count(), 8, "最初の手札は8枚");
    assert.equal(await page.locator("#meTray .tile").count(), 1, "ストックに部品が1枚");
    assert.ok(await page.evaluate(() => __KJ.game.me.cards.find((x) => x.tray) && !__KJ.tables.CHARS.has(__KJ.game.me.cards.find((x) => x.tray).c)), "山に無い部品");
    assert.equal(await page.evaluate(() => __KJ.game.cpu.cards.filter((x) => !x.tray).length), 8, "CPU も8枚");
    // 始めてすぐ手札をタップして台に並べられる
    await page.locator("#meHand .tile").first().click();
    assert.equal(await page.evaluate(() => __KJ.row.length), 1, "すぐ操作できる");
    // 時間は動いている
    const left0 = await page.evaluate(() => __KJ.game.timeLeft());
    await page.waitForTimeout(1200);
    assert.ok(await page.evaluate(() => __KJ.game.timeLeft()) < left0, "時間が減る");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.doesNotMatch(log, /最初の1枚/);
    assert.match(log, /# 仮置き はじまり：最初の手札8枚で、すぐ時間が動く/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("中の solo（画面からは選べない。KJ-056）：CPU が消える。50点でも終わらず、5分で終わって点を出す（自己ベストは出さない）。ログの頭に相手", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, "solo");
    assert.equal(await page.evaluate(() => __KJ.game.solo), true);
    assert.equal(await page.isVisible("#cpuSide"), false);
    await page.evaluate(() => { __KJ.game.me.score = 48; });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
    assert.match(await page.textContent("#meScore"), /^51 点/);
    assert.equal(await page.textContent("#msg"), "", "50点を超えても終わらない");
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# 相手 ひとりで（CPU なし/);
    // 5分たった
    await page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 1; });
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("ひとりで 51 点"));
    assert.equal(await page.textContent("#msg"), "ひとりで 51 点", "自己ベストは出さない（KJ-056）");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-solo-best")), null, "自己ベストを端末に書かない");
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("KJ-036 裏から戻ると、制限時間をすぎていればすぐ終わる（終わりの秒は制限時間を超えない）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, "normal");
    // 裏にいて時計の処理が止まった形：interval を止め、制限時間の1時間後まで進んだ
    // 止める細工を先に入れてから、制限時間を過去にする（同じ evaluate の中。別々にすると、そのあいだの 250ms の pump が終わらせてしまい、遅い実行環境で落ちる）
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; window.__hold = true; G.tick = (orig => function () { return window.__hold ? false : orig.call(this); })(G.tick); G.endsAt = G.now() - 3596; });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => __KJ.game.over), false, "止めているあいだは終わらない");
    // 戻った一拍のうちに（setInterval を待たずに）終わる＝visibilitychange の処理が効いている
    const r = await page.evaluate(() => {
      window.__hold = false; const G = __KJ.game;
      document.dispatchEvent(new Event("visibilitychange"));
      return { over: G.over };
    });
    assert.equal(r.over, true, "戻った直後に終わる");
    const end = await page.evaluate(() => { const G = __KJ.game; const e = G.log[G.log.length - 1]; return { op: e.op, t: e.t, lim: G.timeLimit }; });
    assert.equal(end.op, "終わり");
    assert.ok(end.t <= end.lim, `終わりの秒 ${end.t}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("中の solo：localStorage が使えなくても終われる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 }, "solo");
    await page.evaluate(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
      const G = __KJ.game; G.me.score = 4; G.endsAt = G.now() - 1;
    });
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("ひとりで 4 点"));
    assert.equal(await page.textContent("#msg"), "ひとりで 4 点");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  for (const vp of [{ width: 760, height: 1100, name: "広い画面" }, { width: 375, height: 900, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：手札8＋ストック（rules.json の枚数）。手札が8枚でも割れて、あふれた札は置き場に入る。位置は動かない`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."休一二三四五六七"].map((c, i) => ({ id: 8000 + i, c, t: 0, fresh: false }));
        __KJ.render();
      });
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      assert.equal(await page.locator("#meHand > *").count(), 8);
      assert.equal(await page.locator("#meTray > *").count(), await page.evaluate(() => __KJ.data.rules.split_extra));
      assert.equal(await page.locator("#meTray .tile").count(), 0);
      assert.match(await page.textContent("#meCount"), /手札 8 \/ 8/);
      const hand0 = await pos("#meHand > *"), tray0 = await pos("#meTray > *"), field0 = await pos("#field > *");
      assert.equal(await page.locator("#field > *").count(), 3);
      const ty = await page.evaluate(() => document.getElementById("meTray").getBoundingClientRect().top - document.getElementById("meHand").getBoundingClientRect().bottom);
      assert.ok(ty > 0, "置き場は手札の下");
      await page.locator("#meHand .tile", { hasText: "休" }).click();
      assert.equal(await page.isEnabled("#bSplit"), true, "手札8枚でも割れる");
      await page.click("#bSplit");
      // 割ってできた 人 木 は選ばれたまま。手札側の 人 と、あふれた 木（ストック）のマスに札がいて、台には写しが出る
      assert.equal(await page.locator("#meTray .tile.sel").count(), 1, "あふれた1枚が置き場に入る");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 1);
      assert.equal(await page.locator("#row .tile").count(), 2);
      assert.equal(await page.evaluate(() => __KJ.game.me.cards.filter((x) => x.tray).map((x) => x.c).join("")), "木");
      assert.equal(await page.evaluate(() => __KJ.game.me.cards.length), 9);
      assert.equal(await pos("#meHand > *"), hand0);
      assert.equal(await pos("#meTray > *"), tray0);
      assert.equal(await pos("#field > *"), field0);
      // 置き場の札もタップして外し・選べる（札はずっとストックのマスにいる）
      await page.locator("#meTray .tile.sel").click();
      assert.equal(await page.locator("#meTray .tile").count(), 1, "外しても札はストックにいる");
      assert.equal(await page.locator("#meTray .tile.sel").count(), 0);
      assert.equal(await page.locator("#row .tile").count(), 1);
      await page.locator("#meTray .tile").click();
      assert.equal(await page.locator("#row .tile").count(), 2);
      assert.equal(await pos("#meTray > *"), tray0, "置いても置き場は動かない");
      // 上の段が8枚でも、場から取れる。取った札はストックへ入る（KJ-039）。台に置いた札も段の枚数に数える（台は並べて見る場所。KJ-016）
      await page.click("#bBack");
      await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8);
      assert.match(await page.textContent("#takes"), /場から あと 2 枚 取る/);
      assert.equal(await page.locator("#field.glow").count(), 1, "場が光る");
      await page.locator("#field .tile").nth(0).click();
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8, "上の段は8のまま");
      assert.equal(await page.evaluate(() => __KJ.game.trayCount(__KJ.game.me)), 2, "取った札はストックへ（木 のほかにもう1枚）");
      await page.locator("#field .tile").nth(1).click();
      assert.equal(await page.evaluate(() => __KJ.game.trayCount(__KJ.game.me)), 3);
      assert.equal(await page.textContent("#takes"), "", "取りきった");
      await page.locator("#meHand .tile").first().click();
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8, "台の札も数える");
      await page.click("#bBack");
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8, "台から戻しても8");
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }


  // ---------- KJ-005・KJ-030：選ぶ・入れ替え ----------
  for (const vp of [{ width: 760, height: 1100, name: "広い画面" }, { width: 375, height: 900, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：選ぶと色が変わり選んだ順の数字が出る。台には写しが並ぶ。放つ・割る・くっつけるの結果。外せる`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null);
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      const hand0 = await pos("#meHand > *");
      const tile = (ch) => page.locator("#meHand .tile", { hasText: ch }).first();
      assert.equal(await page.locator("#row .tile").count(), 0, "選ぶ前の台は空");
      // 休 → 日 の順に選ぶ：色が変わり 1・2
      await tile("休").click(); await tile("日").click();
      assert.equal(await tile("休").evaluate((e) => e.classList.contains("sel")), true);
      assert.equal(await tile("休").locator(".ord").textContent(), "1");
      assert.equal(await tile("日").locator(".ord").textContent(), "2");
      assert.equal(await pos("#meHand > *"), hand0, "選んでも手札は動かない");
      assert.match(await page.textContent("#info"), /休日.*3点/);
      // もう一度タップで外れる。外した札の数字は消え、残りは詰める
      await tile("休").click();
      assert.equal(await tile("休").evaluate((e) => e.classList.contains("sel")), false);
      assert.equal(await tile("日").locator(".ord").textContent(), "1");
      // 選んだ順が効く：日 → 休 は放てない（休日 とは別）
      await tile("休").click();
      assert.equal(await tile("日").locator(".ord").textContent(), "1");
      assert.equal(await tile("休").locator(".ord").textContent(), "2");
      assert.equal(await page.isDisabled("#bRelease"), true, "日休 は放てない");
      await page.click("#bBack");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 0);
      // 口 → 十 は くっつけない（並べる順が逆）。十 → 口 は 古 か 田
      await tile("口").click(); await tile("十").click();
      assert.match(await page.textContent("#info"), /並べる順が逆/);
      assert.equal(await page.isDisabled("#bJoin"), true);
      await page.click("#bBack");
      await tile("十").click(); await tile("口").click();
      await page.click("#bJoin");
      await page.locator("#choices button", { hasText: "古" }).click();
      assert.equal(await page.locator("#meHand .tile", { hasText: "古" }).count(), 1, "古 が手札にできた");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 1, "できた札は選んだまま");
      await page.click("#bBack");
      // 割る：休 → 人木
      await tile("休").click();
      await page.click("#bSplit");
      assert.equal(await page.locator("#meHand .tile, #meTray .tile", { hasText: "木" }).count(), 1);
      // 1字では放てない（KJ-008）：割ってできた札は選んだままなので、戻してから選ぶ
      await page.click("#bBack");
      await tile("日").click();
      assert.match(await page.textContent("#info"), /1字では放てない（2字以上の言葉）/);
      await page.click("#bRelease", { force: true }); // KJ-117：押せない見え方（aria-disabled）だが、押すとはじかれて理由が出る
      assert.equal(await page.textContent("#nopeWhy"), "2字から！", "はじかれた理由は画面の真ん中に出す（KJ-022）");
      assert.match(await page.textContent("#meScore"), /^0 点/);
      assert.equal(await page.locator("#meHand .tile.sel").count(), 1, "札は選んだまま");
      await page.click("#bBack");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 0);
      // 放つ・割る・くっつけるがログに残る。並べ方の行はない（KJ-030）
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.doesNotMatch(log, /並べ方/);
      assert.match(log, /\tくっつける\t十 口\t古\t/);
      assert.match(log, /\t割る\t休\t人 木\t/);
      assert.doesNotMatch(log, /\t放つ\t日\t/, "1字は放てないので 放つ の行はない");
      assert.match(log, /\tためした\t日\t\t0\t.*1字では放てない（2字以上の言葉）/);
      assert.match(log, /\tためした\t口 十\t\t0\t.*並べる順が逆/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    await t.test(`${vp.name}：台に写しが選んだ順に並ぶ（KJ-030）。選んでも札は手札・ストックのマスに残る。台の写しをタップでも外れる。並べ方の切り替えはない`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null);
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      const hand0 = await pos("#meHand > *");
      const tile = (ch) => page.locator("#meHand .tile", { hasText: ch }).first();
      assert.equal(await page.locator("#lay, #layNow").count(), 0, "並べ方の切り替えはない");
      assert.equal(await page.isVisible("#row"), true, "台はいつも出る");
      // 日 → 休 の順に選ぶ：台には 日 休 の順の写し。手札の札は動かず、空きのマスもできない
      await tile("日").click(); await tile("休").click();
      assert.equal(await page.locator("#meHand .slot").count(), 0, "手札8枚のまま。点線の空きはできない");
      assert.equal(await page.locator("#meHand .tile").count(), 8);
      assert.equal(await pos("#meHand > *"), hand0);
      assert.equal((await page.locator("#row .tile").allTextContents()).map((x) => x.trim()[0]).join(""), "日休", "台は選んだ順");
      assert.equal(await tile("日").locator(".ord").textContent(), "1");
      assert.equal(await tile("休").locator(".ord").textContent(), "2");
      assert.equal(await page.locator("#row .tile.sel, #row .tile .ord").count(), 0, "台の写しには印も数字も付けない");
      // 台の写しをタップすると、その札の選びが外れる（札は手札のマスのまま）
      await page.locator("#row .tile").first().click();
      assert.equal(await page.locator("#row .tile").count(), 1);
      assert.equal(await tile("日").evaluate((e) => e.classList.contains("sel")), false);
      assert.equal(await tile("休").locator(".ord").textContent(), "1", "残りは詰める");
      assert.equal(await pos("#meHand > *"), hand0);
      // 部品の札（色の薄い札）も選ぶと弁柄の縁になり、数字が読める（KJ-093：選んだ札＝弁柄の縁・字は墨）
      await page.evaluate(() => { const G = __KJ.game; G.me.cards.push({ id: 9300, c: "亻", t: 0, fresh: false, tray: true }); __KJ.render(); });
      await page.locator("#meTray .tile", { hasText: "亻" }).click();
      const pt = page.locator("#meTray .tile", { hasText: "亻" });
      assert.equal(await pt.evaluate((e) => e.classList.contains("part")), true, "亻 は部品の札");
      assert.equal(await pt.evaluate((e) => getComputedStyle(e).borderTopColor), await tile("休").evaluate((e) => getComputedStyle(e).borderTopColor), "部品でも選ぶと漢字の札と同じ弁柄の縁");
      assert.equal(await pt.evaluate((e) => getComputedStyle(e).borderTopColor), "rgb(156, 59, 46)");
      assert.equal(await pt.evaluate((e) => getComputedStyle(e).color), "rgb(42, 38, 34)");
      assert.equal(await pt.locator(".ord").textContent(), "2");
      // 戻す＝全部外す
      await page.click("#bBack");
      assert.equal(await page.locator("#row .tile").count(), 0);
      assert.equal(await page.locator("#meHand .tile.sel").count(), 0);
      // 端末に並べ方を覚えない
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), null);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    await t.test(`${vp.name}：2枚選んで Split は最後に選んだ札を割る。前の札の選びは残り、できた札は選ばれたまま台の最後に並ぶ（KJ-054）。Flip も最後の札`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null);
      const tile = (ch) => page.locator("#meHand .tile, #meTray .tile", { hasText: ch }).first();
      const rowText = async () => (await page.locator("#row .tile").allTextContents()).map((x) => x.trim()[0]).join("");
      await tile("日").click(); await tile("休").click();
      assert.equal(await page.getAttribute("#bSplit", "aria-disabled"), "false", "2枚でも、最後の札（休）が割れるなら押せる見た目");
      await page.click("#bSplit");
      assert.equal(await rowText(), "日人木", "日 の選びは残り、休 の位置に 人 木");
      assert.equal(await tile("日").locator(".ord").textContent(), "1");
      assert.equal(await tile("人").locator(".ord").textContent(), "2");
      assert.equal(await tile("木").locator(".ord").textContent(), "3");
      // 最後の札（木）は割れない：押せない見た目。押すと「割れない」
      assert.equal(await page.getAttribute("#bSplit", "aria-disabled"), "true");
      await page.evaluate(() => document.getElementById("bSplit").click()); // 押せない見た目（aria-disabled）でも押せる
      assert.equal(await page.textContent("#nopeWhy"), "割れない！");
      assert.equal(await rowText(), "日人木", "はじかれても選びはそのまま");
      // Flip：日 上 の順に選ぶと 上 が 下 になる。日 の選びは残る
      await page.click("#bBack");
      await tile("日").click(); await tile("上").click();
      assert.equal(await page.getAttribute("#bInvert", "aria-disabled"), "false");
      await page.click("#bInvert");
      assert.equal(await rowText(), "日下");
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    await t.test(`${vp.name}：入れ替え。札を引きずって別の札の上で離すと位置が替わる（指一本）。ただのタップは選ぶだけ`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null);
      const order = () => page.locator("#meHand > *").evaluateAll((els) => els.map((e) => e.classList.contains("tile") ? e.title : "_").join(""));
      assert.equal(await order(), "天上天下十口休日");
      const center = async (loc) => { const b = await readBox(loc); return [b.x + b.width / 2, b.y + b.height / 2]; };
      const drag = async (from, to) => {
        await page.locator("#meHand .tile", { hasText: to }).first().scrollIntoViewIfNeeded();
        await page.locator("#meHand .tile", { hasText: from }).first().scrollIntoViewIfNeeded();
        const [x1, y1] = await center(page.locator("#meHand .tile", { hasText: from }).first());
        const [x2, y2] = await center(page.locator("#meHand .tile", { hasText: to }).first());
        await page.mouse.move(x1, y1); await page.mouse.down();
        await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
        await page.mouse.move(x2, y2, { steps: 4 });
        await page.mouse.up();
      };
      await drag("休", "天");
      assert.equal(await order(), "休上天下十口天日", "休と最初の天が入れ替わる");
      assert.equal(await page.locator("#row .tile").count(), 0, "引きずっても台には出ない");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 0, "引きずっても選ばれない");
      // ただのタップは今までどおり選ぶだけ
      await page.locator("#meHand .tile", { hasText: "口" }).click();
      assert.equal(await page.locator("#meHand .tile.sel").count(), 1);
      assert.equal(await page.locator("#row .tile").count(), 1);
      // 入れ替えは選んだ順に響かない（選んだ札の id の順のまま）
      await drag("日", "上");
      assert.equal(await order(), "休日天下十口天上");
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /\t入れ替え\t休 天\t天 休\t/);
      assert.match(log, /\t入れ替え\t日 上\t上 日\t/);
      assert.match(log, /\tはじめ\t/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  // KJ-017：引きずって相手の札の面に落とすとくっつく。字になる面だけ青く光る（D-035）
  await t.test("引きずってくっつける（KJ-017）：十 を 口 の上で 古・中央で 田。光る面は 上・中央だけ。光っていない面なら入れ替え", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, null);
    const order = () => page.locator("#meHand > *").evaluateAll((els) => els.map((e) => e.classList.contains("tile") ? e.title : "_").join(""));
    const reset = async () => {
      await page.evaluate(() => { __KJ.game.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9100 + i + Math.floor(Math.random() * 1e5) * 10, c, t: 0, fresh: false })); __KJ.render(); });
    };
    // from の札を引きずって、to の札の (rx, ry)（0〜1。引きずる前の札の大きさで）に持っていく。hold の間に見る
    const dragTo = async (from, to, rx, ry, hold) => {
      await page.locator("#meHand").scrollIntoViewIfNeeded();
      const f = await readBox(page.locator("#meHand .tile", { hasText: from }).first());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: to }).first());
      const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2;
      const x2 = tb.x + tb.width * rx, y2 = tb.y + tb.height * ry;
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
      await page.mouse.move(x2, y2, { steps: 4 });
      if (hold) await hold();
      await page.mouse.up();
    };
    const lit = () => page.evaluate(() => {
      const t = document.querySelector("#meHand .tile.jt");
      return t ? { c: t.title, faces: [...t.querySelectorAll(".fz")].map((z) => z.dataset.face).sort().join(","), on: [...t.querySelectorAll(".fz.on")].map((z) => z.dataset.face).join(",") } : null;
    });
    const joinable = () => page.locator("#meHand .tile.joinable").evaluateAll((els) => els.map((e) => e.title).join(""));
    // 上の面 → 古
    await dragTo("十", "口", 0.5, 0.12, async () => {
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "top" }, "口 の上と中央だけ光り、上が濃い");
      assert.match(await joinable(), /口/, "くっつけられる相手の枠が青");
      assert.doesNotMatch(await joinable(), /[天上下休]/, "くっつかない札は青くならない");
      assert.equal(await page.locator("#meHand .tile.over").count(), 0, "光る面の上では入れ替えの印を出さない");
      if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-top.png") });
    });
    assert.equal(await order(), "天上天下古休日_", "十 と 口 が 古 になり、口 のいた所に入る");
    assert.equal(await page.locator(".tile.joinable, .tile.jt, .fz").count(), 0, "離したら青は消える");
    // 中央 → 田
    await reset();
    await dragTo("十", "口", 0.5, 0.5, async () => {
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "center" });
      if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-center.png") });
    });
    assert.equal(await order(), "天上天下田休日_");
    // 引きずっている途中で画面が描き直されても（CPU の手など）、動かせば光り直し、光った面でくっつく。光っていない面なら入れ替え
    await reset();
    await dragTo("十", "口", 0.5, 0.12, async () => {
      await page.evaluate(() => __KJ.render());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: "口" }).first());
      await page.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.15, { steps: 2 });
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "top" }, "描き直しのあとも光る");
      assert.match(await joinable(), /口/);
    });
    assert.equal(await order(), "天上天下古休日_");
    await reset();
    await dragTo("十", "口", 0.5, 0.9, async () => {
      await page.evaluate(() => __KJ.render());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: "口" }).first());
      await page.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.88, { steps: 2 });
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "" });
    });
    assert.equal(await order(), "天上天下口十休日", "描き直しのあとも、光っていない面なら入れ替え");
    // 1回の動きで札に入って、そのまま離す：濃く光る面と結果がそろう（口 の右寄り＝大きくなった札では中央）
    await reset();
    {
      await page.locator("#meHand").scrollIntoViewIfNeeded();
      const f = await readBox(page.locator("#meHand .tile", { hasText: "十" }).first());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: "口" }).first());
      await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await page.mouse.down();
      await page.mouse.move(f.x + f.width / 2, f.y - 30, { steps: 3 });
      await page.mouse.move(tb.x + tb.width * 0.75, tb.y + tb.height * 0.5);
      const l = await lit();
      await page.mouse.up();
      assert.equal(l.on, "center", "大きくなった札で面を決める");
      assert.equal(await order(), "天上天下田休日_", "濃く光った面（中央）のとおりになる");
    }
    // 光っていない面（下）で離す → いまの入れ替え
    await reset();
    await dragTo("十", "口", 0.5, 0.9, async () => {
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "" }, "下は光らない");
      assert.equal(await page.locator("#meHand .tile.over").count(), 1, "入れ替えの印");
    });
    assert.equal(await order(), "天上天下口十休日", "入れ替わる（くっつかない）");
    // くっつかない札同士（休 → 天）は光らず、入れ替え
    await dragTo("休", "天", 0.5, 0.5, async () => { assert.equal(await lit(), null); });
    assert.equal(await order(), "休上天下口十天日");
    assert.equal(await page.locator("#meHand .tile.sel").count(), 0, "引きずっても選ばれない");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /\tくっつける\t十 口\t古\t.*引きずって上の面に/);
    assert.match(log, /\tくっつける\t十 口\t田\t.*引きずって中央の面に/);
    assert.match(log, /\t入れ替え\t十 口\t口 十\t/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("引きずってくっつける（KJ-017）：ストックの札にも落とせる。ボタンのくっつける（台に並べた順）は今のまま", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null);
    await page.evaluate(() => { const G = __KJ.game; G.me.cards.push({ id: 9700, c: "口", t: 0, fresh: false, tray: true }); __KJ.render(); });
    await page.locator("#meTray").scrollIntoViewIfNeeded();
    const f = await readBox(page.locator("#meHand .tile", { hasText: "十" }).first());
    const tb = await readBox(page.locator("#meTray .tile").first());
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator("#meTray .tile").count(), 0, "ストックの 口 と 十 が田になり、手札に空きがあるので手札へ");
    assert.equal(await page.locator("#meHand .tile", { hasText: "田" }).count(), 1);
    // ボタン：十・口 を選んで Join → 古 か 田 を選ぶ（今まで通り）
    await page.evaluate(() => { __KJ.game.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9800 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.locator("#meHand .tile", { hasText: "十" }).click();
    await page.locator("#meHand .tile", { hasText: "口" }).click();
    await page.click("#bJoin");
    assert.equal(await page.locator("#choices.on button").count(), 2);
    await page.locator("#choices.on button", { hasText: "古" }).click();
    assert.equal(await page.locator("#meHand .tile", { hasText: "古" }).count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ストック（R-042）：手札の札を引きずってストックの空いたマスへ移す。ストックの札と手札の札を入れ替える。ストックの見出し", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null);
    assert.match(await page.textContent("#trayHead"), /^ストック \d+ \/ \d+$/);
    const center = async (loc) => { const b = await readBox(loc); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const dragTo = async (from, to) => {
      await page.locator("#meTray").scrollIntoViewIfNeeded(); // 手札とストックが両方見える所で（先に動かしておかないと座標がずれる）
      const [x1, y1] = await center(from); const [x2, y2] = await center(to);
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
      await page.mouse.move(x2, y2, { steps: 4 });
      await page.mouse.up();
    };
    // 休 をストックの空いたマスへ
    await dragTo(page.locator("#meHand .tile", { hasText: "休" }).first(), page.locator("#meTray .slot").first());
    assert.equal(await page.locator("#meTray .tile").count(), 1);
    assert.equal(await page.locator("#meTray .tile").first().getAttribute("title"), "休");
    assert.equal(await page.locator("#meHand .tile").count(), 7);
    // ストックの 休 と手札の 日 を入れ替え
    await dragTo(page.locator("#meTray .tile").first(), page.locator("#meHand .tile", { hasText: "日" }).first());
    assert.equal(await page.locator("#meTray .tile").first().getAttribute("title"), "日");
    assert.equal(await page.locator("#meHand .tile", { hasText: "休" }).count(), 1);
    // 日 を手札の空いたマスへ戻す
    await dragTo(page.locator("#meTray .tile").first(), page.locator("#meHand .slot").first());
    assert.equal(await page.locator("#meTray .tile").count(), 0);
    assert.equal(await page.locator("#meHand .tile").count(), 8);
    assert.equal(await page.locator("#meHand .tile.sel").count(), 0, "引きずっても選ばれない");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /\t移す\t休\t休\t.*手札→ストック/);
    assert.match(log, /\t入れ替え\t休 日\t日 休\t.*手札とストックの間/);
    assert.match(log, /\t移す\t日\t日\t.*ストック→手札/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("待ち時間のゲージ（KJ-034）：使った直後は空に近い・半分でおよそ半分・満ちる前は押せない・満ちたら押せて小さく光る・秒数の文字が出ない・375×700 に収まる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, null, null, true);
    const st = () => page.evaluate(() => {
      const b = document.getElementById("bInvert"), r = b.getBoundingClientRect();
      const w = parseFloat(getComputedStyle(b, "::before").width) || 0;
      return { cd: b.classList.contains("cd"), full: b.classList.contains("full"), g: parseFloat(b.style.getPropertyValue("--g") || "NaN"), disabled: b.disabled || b.getAttribute("aria-disabled") === "true", text: b.textContent.trim(), w: r.width, before: w, l: r.left, r: r.right, t: r.top, b: r.bottom };
    });
    // 時計は差し替える代わりに、待ちが明ける時刻（cd）を G.now() からの秒で置く
    const setLeft = (sec) => page.evaluate((s) => { const G = __KJ.game; G.me.cd.invert = G.now() + s; __KJ.render(); }, sec);
    const total = await page.evaluate(() => __KJ.data.rules.cooldown_sec.invert);
    await page.locator("#meHand .tile", { hasText: "上" }).first().click();
    await page.click("#bInvert");
    assert.equal(await page.evaluate(() => __KJ.row.length), 1, "反転でできた 下 は選ばれたまま（下 も反転できる）");
    let s = await st();
    assert.equal(s.cd, true, "使ったあとは地がゲージ");
    assert.ok(s.g < 0.1, `使った直後は空に近い（${s.g}）`);
    assert.equal(s.disabled, true, "満ちる前は押せない");
    await setLeft(total / 2);
    s = await st();
    assert.ok(Math.abs(s.g - 0.5) < 0.05, `待ち時間の半分でおよそ半分（${s.g}）`);
    assert.equal(s.disabled, true, "半分では押せない");
    assert.equal(s.text, "Flp", "秒数の文字が出ない（Fl＋印の SVG＋p）");
    await page.waitForTimeout(350); // 幅の動き（.25s）が落ち着くのを待つ
    s = await st();
    assert.ok(Math.abs(s.before / s.w - 0.5) < 0.08, `ゲージの幅もおよそ半分（${Math.round(s.before)} / ${Math.round(s.w)}）`);
    assert.ok(s.l >= 0 && s.r <= 375 && s.t >= 0 && s.b <= 700, "375×700 に収まる");
    assert.ok(new Set(await page.evaluate(() => [...document.querySelectorAll(".ops button")].map((b) => Math.round(b.getBoundingClientRect().top)))).size <= 2, "ボタンは2段のまま");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "横スクロールがない");
    if (process.env.KJ_GAUGE_SHOT) await page.screenshot({ path: process.env.KJ_GAUGE_SHOT });
    for (const t of await page.locator(".ops button").allTextContents()) assert.doesNotMatch(t, /\d|wait/, `ボタンに残りの秒数が出ない（${t}）`);
    await setLeft(-0.01);
    s = await st();
    assert.equal(s.cd, false, "満ちたらゲージを外す");
    assert.equal(s.disabled, false, "満ちたら押せる");
    assert.equal(s.full, true, "満ちた瞬間に小さく光る");
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById("bInvert")).animationName), "none");
    // 動きを減らす設定：光るのはやめる。ゲージの満ち方は出す
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.click("#bInvert");
    assert.equal(await page.evaluate(() => __KJ.row.length), 1);
    await setLeft(total / 2);
    s = await st();
    assert.equal(s.cd, true);
    assert.ok(Math.abs(s.g - 0.5) < 0.05, "動きを減らす設定でもゲージは満ちていく");
    await setLeft(-0.01);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("bInvert")).animationName), "none", "動きを減らす設定では光らない");
    // 引き直しに待ち（ゲージ）はない（KJ-049）。添え字は次の値段と残りの回数
    await holdRedraw(page);
    const rd = await page.evaluate(() => { const b = document.getElementById("bRedraw"); return { cd: b.classList.contains("cd"), g: b.style.getPropertyValue("--g"), text: b.textContent.trim() }; });
    assert.equal(rd.cd, false);
    assert.equal(rd.g, "");
    assert.equal(rd.text, "Redraw-5pt あと4回"); // 2行に積む（KJ-078）。textContent では間の空白が無い
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("待ち時間の印（KJ-040）：使った直後は待っている操作の印だけ薄い・待っていない方は濃いまま・選んだ札でも薄い・手札/ストック/場/台に出る・満ちたら元の濃さ・相手の手札は変えない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, null);
    await page.evaluate(() => { const G = __KJ.game; G.me.cards.push({ id: 9100, c: "月", t: 0, fresh: false, tray: true }); G.field = [..."上月玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false })); __KJ.render(); });
    const op = (sel, ch, k) => page.evaluate(([s, c, kk]) => { const t = [...document.querySelectorAll(s + " .tile")].find((x) => x.title === c); return parseFloat(getComputedStyle(t.querySelector(`.mi[data-k="${kk}"]`)).opacity); }, [sel, ch, k]);
    assert.equal(await op("#meHand", "上", "invert"), 1, "待っていないとき濃い");
    assert.equal(await op("#field", "上", "invert"), 1);
    assert.equal(await op("#meTray", "月", "cycle"), 1);
    await page.locator("#meHand .tile", { hasText: "上" }).first().click();
    await page.click("#bInvert"); // 上→下。反転の待ちが始まる。下 は選ばれたまま
    assert.equal(await page.evaluate(() => __KJ.game.cdLeft(__KJ.game.me, "invert") > 0), true);
    const pick = await page.evaluate(() => [...document.querySelectorAll("#row .tile")].map((x) => ({ t: x.title, k: [...x.querySelectorAll(".mi")].map((m) => m.dataset.k + ":" + getComputedStyle(m).opacity) })));
    assert.ok(pick.length >= 1, "台に札がある");
    assert.ok(pick.some((x) => x.k.some((kv) => kv.startsWith("invert"))), "台の札に反転の印がある");
    for (const x of pick) for (const kv of x.k) { const [k, o] = kv.split(":"); assert.equal(+o, k === "invert" ? 0.3 : 1, `台の ${x.t} の ${k} の印の濃さ（${o}）`); }
    const sel = await page.evaluate(() => { const t = document.querySelector("#meHand .tile.sel"); const m = t && t.querySelector('.mi[data-k="invert"]'); return { has: !!t, op: m ? parseFloat(getComputedStyle(m).opacity) : null }; });
    assert.equal(sel.has, true, "選んだ札がある");
    assert.equal(sel.op, 0.3, "選んだ札（弁柄の縁・墨の印）の反転の印も薄い");
    assert.equal(await page.locator('.tile .mi[data-k="homophone"]').count(), 0, "同音の印は札の角に出ない（KJ-057）");
    assert.equal(await op("#field", "上", "invert"), 0.3, "場の札の反転の印も薄い");
    assert.equal(await op("#meTray", "月", "cycle"), 1, "巡りは待っていないのでストックの印は濃い");
    await page.evaluate(() => { const G = __KJ.game; G.me.cd.cycle = G.now() + 5; __KJ.render(); });
    assert.equal(await op("#meTray", "月", "cycle"), 0.3, "ストックの札の巡りの印が薄い");
    assert.equal(await page.evaluate(() => document.querySelectorAll("#cpuHand.wait-invert,#cpuHand.wait-cycle,#cpuHand.wait-homophone").length), 0, "相手の手札には待ちの印を付けない");
    await page.evaluate(() => { const G = __KJ.game; G.me.cd.invert = 0; G.me.cd.cycle = 0; G.me.cd.homophone = 0; __KJ.render(); });
    assert.equal(await op("#field", "上", "invert"), 1, "待ちが明けたら元の濃さ");
    assert.equal(await op("#meTray", "月", "cycle"), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ヒント（KJ-037・KJ-086）：放たずに時限（90秒）たつと札が光り「ヒント」の札が出る（はじかれ続けても出ない）。言葉は文字で出ない。10秒か手札を動かすまで。375×700 に収まる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "weak", shiftClock);
    const jump = () => page.evaluate(() => { window.__shift(__KJ.game); __KJ.render(); }); // 放たずに時限の秒数がたった形
    const setHand = (chars) => page.evaluate((cs) => { const G = __KJ.game; G.me.cards = [...cs].map((c, i) => ({ id: 7000 + i, c, t: 0, fresh: false })); __KJ.row.length = 0; __KJ.render(); }, chars);
    const tryPair = async (a, b) => { // 2枚を選んで外す＝並べたのに放てない・くっつかない（ためした）
      await page.locator("#meHand .tile:not(.sel)", { hasText: a }).first().click();
      await page.locator("#meHand .tile:not(.sel)", { hasText: b }).first().click();
      await page.click("#bBack");
    };
    const st = () => page.evaluate(() => {
      const G = __KJ.game, tag = document.getElementById("hintTag");
      return { tag: !tag.hidden, tagText: tag.textContent, lit: [...document.querySelectorAll("#meHand .hint,#meTray .hint")].map((e) => +e.dataset.id), litBtn: [...document.querySelectorAll("button.op.hint")].map((b) => b.id),
        tried: G.log.filter((e) => e.op === "ためした").length, hints: G.log.filter((e) => e.op === "ヒント").length, hint: G.hintActive() && { tier: G.hintActive().tier, ids: G.hintActive().ids, button: G.hintActive().button, word: G.hintActive().word },
        visible: ["msg", "info", "row", "hintTag"].map((i) => document.getElementById(i).textContent).join("|") };
    });
    // 段1：いま並べれば放てる（休日）
    await setHand("休日山川刀国");
    await tryPair("刀", "国");
    await tryPair("刀", "山");
    let s = await st();
    assert.equal(s.tried, 2);
    assert.equal(s.tag, false, "はじかれただけでは出ない");
    assert.deepEqual(s.lit, []);
    await tryPair("国", "川");
    s = await st();
    assert.equal(s.tried, 3);
    assert.equal(s.hints, 0);
    assert.equal(s.tag, false, "はじかれ続けても出ない（KJ-086）");
    await jump();
    s = await st();
    assert.equal(s.hints, 1);
    assert.equal(s.tag, true, "放たずに時限の秒数がたつと「ヒント」の札が出る");
    assert.equal(s.tagText, "ヒント");
    assert.equal(s.hint.tier, 1);
    assert.deepEqual([...s.lit].sort(), [...s.hint.ids].sort(), "光る札は ids のとおり");
    assert.equal(s.lit.length, 2);
    assert.deepEqual(s.litBtn, [], "段1 はボタンを光らせない");
    assert.ok(!s.visible.includes(s.hint.word), `言葉（${s.hint.word}）は文字で出ない（${s.visible}）`);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector("#meHand .hint")).boxShadow), "none");
    const lit = await page.evaluate(() => __KJ.game.hintActive().ids);
    if (process.env.KJ_HINT_SHOT) await page.screenshot({ path: process.env.KJ_HINT_SHOT.replace(/\.png$/, "-1.png") });
    // 光った札を選んでも光りは消えない。そのまま放てる（言葉は光った札の順）
    for (const id of lit) await page.locator(`#meHand [data-id="${id}"]`).click({ force: true }); // 光る札は動いているので、止まるのを待たない（KJ-065）
    s = await st();
    assert.equal(s.tag, true, "選んでも消えない");
    assert.equal(await page.evaluate(() => document.getElementById("bRelease").disabled), false, "光った札を選ぶと放てる");
    await page.click("#bRelease");
    s = await st();
    assert.equal(s.tag, false, "放ったら（手札が動いたら）消える");
    assert.deepEqual(s.lit, []);
    await page.locator("#field .tile").nth(0).click(); // 放ったら、取りきるまで次の手は打てない（KJ-039）
    await page.locator("#field .tile").nth(1).click();
    // 段2：1手で放てる言葉になる。ボタンも光る。10秒たつと消える
    await setHand("日年刀");
    await tryPair("日", "刀");
    await tryPair("年", "刀");
    assert.equal((await st()).tag, false);
    await jump();
    s = await st();
    assert.equal(s.hint.tier, 2);
    assert.equal(s.hint.button, "bHomo");
    assert.deepEqual(s.litBtn, ["bHomo"], "同音のボタンが光る");
    assert.equal(s.lit.length, s.hint.ids.length);
    assert.ok(!s.visible.includes(s.hint.word));
    const geo = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, h: innerHeight }));
    assert.ok(geo.sw <= 375, "横スクロールがない");
    // 戦況の欄（KJ-094）は、1つ放つと 150px に伸びる（前の「放った言葉」も放つたびに伸びた）。ここでは欄を空の高さ（40px。KJ-106）にしたときの全体が 700 に収まること、札・ストックが画面の中にあること
    const senH = await page.evaluate(() => document.getElementById("senkyo").getBoundingClientRect().height);
    assert.ok(geo.sh - (senH - 40) <= 700, `375×700 に収まる（欄を空の高さにして ${geo.sh - (senH - 40)}）`);
    assert.ok(await page.evaluate(() => document.getElementById("meTray").getBoundingClientRect().bottom <= 700), "ストックの下端は 700 以内");
    if (process.env.KJ_HINT_SHOT) await page.screenshot({ path: process.env.KJ_HINT_SHOT.replace(/\.png$/, "-2.png") });
    await page.evaluate(() => { const G = __KJ.game; G.hint.until = G.now() - 0.01; __KJ.render(); });
    s = await st();
    assert.equal(s.tag, false, "10秒たったら消える");
    assert.deepEqual(s.litBtn, []);
    // 段3：Redraw が光る（札は光らない）
    await setHand("刀刀");
    await page.evaluate(() => { const G = __KJ.game; window.__shift(G); __KJ.render(); });
    s = await st();
    assert.equal(s.hint.tier, 3);
    assert.deepEqual(s.litBtn, ["bRedraw"]);
    assert.deepEqual(s.lit, []);
    // 動きを減らす設定でも光りは出る（点滅だけやめる）
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("bRedraw")).animationName), "none");
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById("bRedraw")).boxShadow), "none");
    // ログに残る（狙った言葉はログにだけ）
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /\tヒント\t休 日\t\t0\t.*段1：放つ。狙った言葉：休日/);
    assert.match(log, /\tヒント\t.*段2：同音。狙った言葉：/);
    assert.match(log, /\tヒント\t\t\t0\t.*段3：引き直し/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ヒント（KJ-065）：ほかの手をしても10秒は残る。光る札は持ち上がり、地の色が薄い金。動きを減らす設定では動かさない。375px", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "weak", shiftClock, true); // 既定は「動きを減らす」。動きを見るので motion: true
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."休日山川火水"].map((c, i) => ({ id: 7000 + i, c, t: 0, fresh: false })); __KJ.row.length = 0; window.__shift(G); __KJ.render(); });
    const lit = () => page.evaluate(() => [...document.querySelectorAll("#meHand .hint")].map((e) => +e.dataset.id));
    const hintId = await page.evaluate(() => __KJ.game.hintActive().ids);
    assert.deepEqual((await lit()).sort(), [...hintId].sort());
    const css = () => page.evaluate(() => { const e = document.querySelector("#meHand .hint"), c = getComputedStyle(e); return { bg: c.backgroundColor, anim: c.animationName, tf: c.transform }; });
    const m = await css();
    assert.equal(m.bg, "rgb(255, 241, 196)", "地の色が薄い金");
    assert.match(m.anim, /kjLift/, "持ち上げる（上に数 px ゆっくり上下）");
    assert.notEqual(m.tf, "none", "いま持ち上がっている");
    if (process.env.KJ_HINT_SHOT) await page.screenshot({ path: process.env.KJ_HINT_SHOT.replace(/\.png$/, "-065.png") });
    // ほかの手（札の入れ替え）をしても残る
    await page.evaluate(() => { const G = __KJ.game; G.swap(G.me, G.me.cards[4].id, G.me.cards[5].id); __KJ.render(); });
    assert.deepEqual((await lit()).sort(), [...hintId].sort(), "札を動かしても光りは残る");
    assert.equal(await page.evaluate(() => document.getElementById("hintTag").hidden), false);
    // くっつけ先（.jt）になった光る札は、持ち上げを止めて 1.5 倍のまま
    await page.evaluate(() => document.querySelector("#meHand .hint").classList.add("jt"));
    assert.doesNotMatch(await page.evaluate(() => getComputedStyle(document.querySelector("#meHand .hint.jt")).animationName), /kjLift/);
    await page.evaluate(() => document.querySelector("#meHand .hint.jt").classList.remove("jt"));
    // ボタンも薄い金の地で持ち上がる（段3：Redraw は quiet。段2：当の札を選ぶまで押せない見た目）
    await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."刀刀"].map((c, i) => ({ id: 7100 + i, c, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
    const btn = (id) => page.evaluate((i) => { const c = getComputedStyle(document.getElementById(i)); return { bg: c.backgroundColor, anim: c.animationName, color: c.color }; }, id);
    let bb = await btn("bRedraw");
    assert.equal(bb.bg, "rgb(255, 241, 196)", "Redraw（quiet）も薄い金の地");
    assert.match(bb.anim, /kjLift/);
    await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."日分"].map((c, i) => ({ id: 7200 + i, c, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
    assert.equal(await page.evaluate(() => __KJ.game.hintActive().button), "bSplit");
    bb = await btn("bSplit");
    assert.equal(bb.bg, "rgb(255, 241, 196)", "Split（当の札を選ぶまで押せない見た目）も薄い金の地");
    assert.match(bb.anim, /kjLift/);
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."休日山川火水"].map((c, i) => ({ id: 7000 + i, c, t: 0, fresh: false })); G.hint = null; window.__shift(G); __KJ.render(); });
    // 動きを減らす設定：動かさず、縁と地の色だけ
    await page.emulateMedia({ reducedMotion: "reduce" });
    const r = await css();
    assert.equal(r.anim, "none");
    assert.equal(r.tf, "none", "動かさない");
    assert.equal(r.bg, "rgb(255, 241, 196)");
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector("#meHand .hint")).boxShadow), "none");
    // くっつけ先（.jt）の光る札も、動きを減らす設定では影を明滅させない
    assert.equal(await page.evaluate(() => { const t = document.querySelector("#meHand .hint"); t.classList.add("jt"); const a = getComputedStyle(t).animationName; t.classList.remove("jt"); return a; }), "none", "reduce では .jt の光る札も動かさない");
    // 10秒たつと消える
    await page.evaluate(() => { const G = __KJ.game; G.hint.until = G.now() - 0.01; __KJ.render(); });
    assert.deepEqual(await lit(), []);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("選ぶ：スマホ幅の画像（選んだ札が目立つ）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null);
    await page.locator("#meHand .tile", { hasText: "休" }).first().click();
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT, fullPage: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // KJ-010：遊ぶ画面を 375×700 に収める。ストックが全部埋まった（札が一番多い）形で、4枚選んで台に写しが並んだ形で確かめる（並べ方は KJ-030 で1つになった）
  {
    await t.test(`375×700 に収まる：CPU の点と手札の枚数・場・台・ボタン・手札・ストック・残り時間がスクロールなしで見える`, async () => {
      const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "normal");
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
        [..."山川二三四五六七"].forEach((c, i) => G.me.cards.push({ id: 9100 + i, c, t: 0, fresh: false, tray: true }));
        __KJ.render();
      });
      assert.equal(await page.evaluate(() => __KJ.game.trayCount(__KJ.game.me)), await page.evaluate(() => __KJ.data.rules.split_extra), "ストックは全部埋まっている");
      for (const ch of "天上天下") await page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click(); // 4枚選ぶ（天 は2枚ある）。言葉の説明が2行になる
      // 「取る」の文も出した形（放ったあとは札を選べないので、選んだあとに取れる枚数を足す。KJ-039）
      await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      assert.equal(await page.locator("#row .tile").count(), 4, "取れる枚数が付いても台の写しは残る");
      assert.match(await page.textContent("#takes"), /場から あと 2 枚 取る/);
      const parts = await page.evaluate(() => {
        const box = (sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 }; });
        return [].concat(
          box("#clock"), box("#cpuScore"), box("#cpuCount"), box("#field > *"), box("#takes"), box("#info"), box(".ops button"), box("#bBack"), box("#bRedraw"),
          box("#meHand > *"), box("#meTray > *"), box("#meScore"), box("#meCount"), box("#msg").slice(0, 0));
      });
      const rows = await page.evaluate(() => { const r = document.getElementById("row").getBoundingClientRect(); return [{ sel: "#row", l: r.left, t: r.top, r: r.right, b: r.bottom, shown: r.height > 0 }]; });
      assert.equal(await page.locator("#row .tile").count(), 4, "台に写しが4枚");
      for (const p of parts.concat(rows)) {
        assert.ok(p.shown, `${p.sel} が見えている`);
        assert.ok(p.t >= 0 && p.b <= 700, `${p.sel} が縦に画面内（上${Math.round(p.t)}〜下${Math.round(p.b)}）`);
        assert.ok(p.l >= 0 && p.r <= 375, `${p.sel} が横に画面内（左${Math.round(p.l)}〜右${Math.round(p.r)}）`);
      }
      assert.equal(parts.filter((p) => p.sel === "#meHand > *").length, 8);
      assert.equal(parts.filter((p) => p.sel === "#meTray > *").length, await page.evaluate(() => __KJ.data.rules.split_extra));
      assert.equal(parts.filter((p) => p.sel === ".ops button").length, 6, "卓のボタンは6つ（Play と群の5つ。Back は台の右端・Redraw は卓の外。KJ-078）");
      const bk = parts.find((p) => p.sel === "#bBack"), rdp = parts.find((p) => p.sel === "#bRedraw");
      assert.ok(bk.w >= 44 && Math.abs(bk.h - rdp.h) <= 1, `Back は幅 44px 以上・高さは Redraw と同じ（${bk.w}×${bk.h}・Redraw ${rdp.h}。KJ-090）`);
      assert.ok(bk.r <= rdp.l - 8 && Math.abs(bk.t - rdp.t) <= 1, "Back は Redraw のすぐ左（8px 以上あく。KJ-090）");
      assert.ok(rdp.h >= 36, `Redraw は指で押せる高さ（${rdp.h}）`);
      assert.ok(parts.find((p) => p.sel === "#meScore").t <= rdp.b && rdp.t <= parts.find((p) => p.sel === "#meScore").b, "Redraw は「あなた ○点 手札」と同じ行");
      assert.ok(await page.evaluate(() => !document.querySelector(".table").contains(document.getElementById("bBack"))), "Back は卓の外（「あなた ○点 手札」の行。KJ-090）");
      // 札は指で押せる大きさ（40px 以上）。ボタンは2段まで
      for (const p of parts.filter((x) => x.sel === "#meHand > *" || x.sel === "#meTray > *")) assert.ok(p.w >= 40 && p.h >= 40, `手札・ストックの札が 40px 以上（${p.w}×${p.h}）`);
      const tops = new Set(parts.filter((p) => p.sel === ".ops button").map((p) => Math.round(p.t)));
      assert.ok(tops.size <= 2, `ボタンは2段まで（${tops.size}段）`);
      // 字の幅が環境でちがっても、ボタンの中身が枠からはみ出さない（CI の Chromium で3段になった。KJ-010）
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ops button")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id)), [], "ボタンの中身が枠に収まる");
      // 待ち時間の表示が入った形でも2段のまま
      await page.evaluate(() => { const G = __KJ.game; for (const k of ["invert", "cycle", "homophone"]) G.me.cd[k] = G.now() + 0.5; G.me.score = 0; G.me.redraws = 4; __KJ.render(); }); // ゲージが出ている形（KJ-034）・引き直しの添え字がいちばん長い形（-20pt あと1回。KJ-049）
      assert.ok(new Set(await page.evaluate(() => [...document.querySelectorAll(".ops button")].map((b) => Math.round(b.getBoundingClientRect().top)))).size <= 2, "待ち時間が出ても2段");
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ops button,#bBack,#bRedraw")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id)), [], "待ち時間が出てもボタンの中身が枠に収まる");
      // 横にあふれない
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "横スクロールがない");
      // 手札と場とストックの札の字が読める大きさ
      const fs = await page.evaluate(() => ["#meHand .tile", "#meTray .tile", "#field .tile"].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)));
      for (const f of fs) assert.ok(f >= 22, `字の大きさ ${f}px`);
      if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, ".png") });
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await t.test("ストック：空のときは低く薄く、札が入ると手札と同じ形。16マス（手札8＋ストック8）。760px でも横にあふれない", async () => {
    for (const vp of [{ width: 375, height: 700 }, { width: 760, height: 1100 }]) {
      const { ctx, page, errors } = await open(browser, url, vp, "normal");
      await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false })); __KJ.render(); });
      const R = await page.evaluate(() => __KJ.data.rules);
      assert.equal(await page.locator("#meHand > *").count() + await page.locator("#meTray > *").count(), R.hand_max + R.split_extra, "全部で16マス");
      const h = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, sel);
      assert.ok(await page.evaluate(() => document.getElementById("meTray").classList.contains("empty")));
      const lowH = await h("#meTray > *"), handH = await h("#meHand > *");
      assert.ok(lowH < handH, `空のストックは手札の札より低い（${lowH} < ${handH}）`);
      await page.evaluate(() => { __KJ.game.me.cards.push({ id: 9100, c: "山", t: 0, fresh: false, tray: true }); __KJ.render(); });
      assert.equal(await page.evaluate(() => document.getElementById("meTray").classList.contains("empty")), false);
      assert.ok(Math.abs((await h("#meTray > *")) - handH) < 1, "札が入ったら手札と同じ形");
      assert.ok(await page.evaluate((w) => document.documentElement.scrollWidth <= w, vp.width), `${vp.width}px で横にあふれない`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("割れる札に点線（左右＝縦・上下＝横・囲み＝「割」）。割れない札には出ない。手札・ストック・場・台", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.field = [..."山国古"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
        G.me.cards.push({ id: 9101, c: "親", t: 0, fresh: false, tray: true });
        __KJ.render();
      });
      const cut = (sel, ch) => page.evaluate(([s, c]) => { const e = [...document.querySelectorAll(s)].find((x) => x.title === c); const k = e && e.querySelector(".cut"); return k ? k.dataset.cut + ":" + k.textContent : null; }, [sel, ch]);
      assert.equal(await cut("#meHand .tile", "天"), "h:", "天（上下）は横の点線");
      assert.equal(await cut("#meHand .tile", "休"), "v:", "手札の 休（左右）は縦の点線");
      assert.equal(await cut("#meTray .tile", "親"), "v:", "ストックの 親（左右）は縦の点線");
      assert.equal(await cut("#meHand .tile", "十"), null, "割れない 十");
      assert.equal(await cut("#meHand .tile", "口"), null, "割れない 口");
      assert.equal(await cut("#field .tile", "山"), null, "割れない 山");
      assert.equal(await cut("#field .tile", "国"), "x:割", "囲みの 国 は角に「割」");
      assert.equal(await cut("#field .tile", "古"), "h:", "場の 古（上下）");
      // 台に並べても点線は出る
      await page.locator("#meHand .tile", { hasText: "天" }).first().click();
      assert.equal(await cut("#row .tile", "天"), "h:", "台の札にも点線");
      // 点線の位置（休 は左から約 0.3）。親 はストックの札
      const at = await page.evaluate(() => { const k = [...document.querySelectorAll("#meHand .tile")].find((x) => x.title === "休").querySelector(".cut"); return k.style.getPropertyValue("--at"); });
      assert.equal(Number(at), 0.3);
      // 点線が角の印とぶつからない（引 は左右で線の位置が右寄り。右上の印は 反… の字が無いので 巡・音 の付く字で確かめる）
      const hit = await page.evaluate(() => {
        const bad = [];
        for (const t of document.querySelectorAll(".tile")) {
          const k = t.querySelector(".cut:not(.cutx)"), m = t.querySelector(".mk");
          if (!k || !m) continue;
          const a = k.getBoundingClientRect(), b = m.getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) bad.push(t.title);
        }
        return bad;
      });
      assert.deepEqual(hit, [], "点線が 反・巡・音 の印に重ならない");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("点線は薄い茶色（KJ-052）。端末に無い字（𢀖・⺍・电 など）は同梱の字体で出る（KJ-027）", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."後彳𢀖験馬僉学⺍"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
        G.me.cards.push(...[..."電电会𠆢"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false, tray: true })));
        G.field = [..."国古山"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
        __KJ.render();
      });
      // 点線の色：薄い茶色（#b48f62 前後）。前のグレー #aaa59a ほど無彩色ではなく、最初の茶色 #8a6d3b ほど濃くない
      const col = await page.evaluate(() => {
        const out = {};
        for (const sel of [".cutv", ".cuth"]) {
          const e = document.querySelector("#meHand " + sel); if (!e) continue;
          const cs = getComputedStyle(e); out[sel] = cs.borderLeftColor !== "rgba(0, 0, 0, 0)" && cs.borderLeftWidth !== "0px" ? cs.borderLeftColor : cs.borderTopColor;
        }
        out.x = getComputedStyle(document.querySelector("#field .cutx")).color;
        return out;
      });
      for (const [k, v] of Object.entries(col)) {
        const [r, g, b] = v.match(/\d+/g).map(Number);
        assert.ok(r > g && g > b && r - b >= 40 && r - b <= 110, `${k} の色 ${v} は茶色（赤>緑>青で、赤と青の差が大きい。グレーでも濃い茶でもない）`);
        assert.ok(r >= 150 && r <= 210, `${k} の色 ${v} は字の線を邪魔しない薄さ`);
      }
      // 点線だけ少し薄く（KJ-091）：不透明度 0.5〜0.7。角の印 .cutx と 札の字は 1 のまま
      const op = await page.evaluate(() => ({
        v: parseFloat(getComputedStyle(document.querySelector("#meHand .cutv, #meHand .cuth")).opacity),
        x: parseFloat(getComputedStyle(document.querySelector("#field .cutx")).opacity),
        t: parseFloat(getComputedStyle(document.querySelector("#meHand .tile")).opacity),
        sp: parseFloat(getComputedStyle(document.querySelector("#bSplit .sp-cut")).opacity),
      }));
      assert.ok(op.v >= 0.5 && op.v <= 0.7, `札の点線の不透明度 ${op.v}`); assert.equal(op.sp, op.v, "説明の点線（.sp-cut）も同じ薄さ");
      assert.equal(op.x, 1, "角の印は変えない"); assert.equal(op.t, 1, "札そのものは薄くしない");
      // 選んだ札は札の色の地のまま（KJ-093。弁柄は縁だけ）なので、点線も同じ茶色のまま（KJ-052 の「白」は赤地のときの決まりだった）
      await page.locator("#meHand .tile").filter({ has: page.locator(".cutv, .cuth") }).first().click();
      const selCol = await page.evaluate(() => {
        const e = document.querySelector("#meHand .tile.sel .cutv, #meHand .tile.sel .cuth");
        if (!e) return null;
        const cs = getComputedStyle(e); return cs.borderLeftWidth !== "0px" && cs.borderLeftStyle !== "none" ? cs.borderLeftColor : cs.borderTopColor;
      });
      assert.equal(selCol, "rgb(180, 143, 98)", "選んだ札の点線も同じ茶色");
      // 同梱の字体が読み込まれ、𢀖・⺍・电・𠆢 が描ける（空白ではない）
      const r = await page.evaluate(async () => {
        await document.fonts.load('32px "KJ Glyphs"', "𢀖");
        const face = [...document.fonts].find((f) => f.family.replace(/"/g, "") === "KJ Glyphs");
        const ink = (ch) => {
          const cv = document.createElement("canvas"); cv.width = cv.height = 64;
          const g = cv.getContext("2d"); g.font = '48px "KJ Glyphs"'; g.fillStyle = "#000"; g.textBaseline = "top"; g.fillText(ch, 4, 4);
          let n = 0; const d = g.getImageData(0, 0, 64, 64).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
          return n;
        };
        return { status: face && face.status, ink: Object.fromEntries([..."𢀖⺍电𠆢𠂉产"].map((c) => [c, ink(c)])) };
      });
      assert.equal(r.status, "loaded", "KJ Glyphs が読み込まれる");
      for (const [c, n] of Object.entries(r.ink)) assert.ok(n > 40, `${c} が描ける（${n}）`);
      // 札の字は文字のまま（選んでコピーできる）。後 の右側 𢀖・験 の右側 僉 が札になっている
      for (const c of [..."𢀖僉⺍"]) assert.equal(await page.locator("#meHand .tile", { hasText: c }).count(), 1, `${c} の札`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  // ---------- KJ-018：試合が終わったら、勝ち負け→点→放った言葉を1つずつ（長いほど派手）----------
  await t.test("KJ-018 終わり：最初に「勝ち！」と両方の点が大きく出て、放った言葉が放った順に1つずつ出る（2字・3字・4字で段が違う）。タップで全部いっぺんに。出し終わると今の終わりの画面", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 });
    await page.evaluate(() => { // 先に放った言葉を3つ（2字・3字・4字）。最後に休日を放って50点に届く
      const G = __KJ.game, me = G.me.name;
      for (const [w, p] of [["大雨", 4], ["日本人", 9], ["天上天下", 20]]) G.log.push({ t: 1, who: me, op: "放つ", from: [...w], to: [], pts: p, note: "" });
      G.log.push({ t: 1, who: G.cpu.name, op: "放つ", from: [..."火山"], to: [], pts: 4, note: "" });
      G.me.score = 48;
    });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
    await page.waitForSelector("#endShow.on");
    assert.equal(await page.textContent("#esLabel"), "勝ち！");
    assert.equal(await page.getAttribute("#esLabel", "class"), "win");
    assert.equal(await page.textContent("#esScore .you"), "51");
    assert.equal(await page.textContent("#esScore .them"), "0");
    const fs2 = await page.$$eval("#esScore .you,#esScore .them", (a) => a.map((x) => parseFloat(getComputedStyle(x).fontSize)));
    assert.ok(fs2[0] >= 40 && fs2[1] >= 40, "両方の点が大きい " + fs2);
    // まだ1つも出ていない → 放った順に1つずつ出る
    const shown = () => page.$$eval("#esWords .esw.in .w", (a) => a.map((x) => x.textContent));
    assert.deepEqual(await shown(), [], "最初に見出しと点だけ");
    const order = [];
    await page.waitForFunction(() => document.querySelectorAll("#esWords .esw.in").length >= 1);
    order.push((await shown()).length);
    await page.waitForFunction(() => document.querySelectorAll("#esWords .esw.in").length >= 2);
    order.push((await shown()).length);
    assert.ok(order[0] === 1 && order[1] === 2, "1つずつ増える " + order);
    // 長さで段が変わる。相手の言葉は出ない。読みと点がつく
    assert.deepEqual(await page.$$eval("#esWords .esw", (a) => a.map((x) => [x.querySelector(".w").textContent, x.className.match(/t\d/)[0]])),
      [["大雨", "t1"], ["日本人", "t2"], ["天上天下", "t3"], ["休日", "t1"]]);
    assert.match(await page.textContent("#esWords .esw:nth-child(2) .p"), /\+9点/);
    assert.ok((await page.textContent("#esWords .esw:nth-child(2) .k")).length > 0, "読み");
    // 上の帯（もう一度・設定を変える・ログをコピー）は出たまま押せる
    assert.equal(await page.isVisible("#again"), true);
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    // タップで全部いっぺんに出る
    await page.click("#endShow", { position: { x: 180, y: 300 } });
    assert.deepEqual(await shown(), ["大雨", "日本人", "天上天下", "休日"]);
    if (process.env.KJ_SHOT) await page.screenshot({ path: "docs/img/kj-018-end-375.png" });
    // 出し終わって少したつと、いまの終わりの画面（#msg・ボタン）が見える
    await page.waitForFunction(() => !document.getElementById("endShow").classList.contains("on"), null, { timeout: 8000 });
    assert.match(await page.textContent("#msg"), /勝ち（51 対 0）/);
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    // もう一度（同じ設定）：表示は閉じて、新しい試合になる
    await page.click("#again");
    assert.equal(await page.evaluate(() => document.getElementById("endShow").classList.contains("on")), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("KJ-066 上の3ボタン（もう一度・設定を変える・ログ）は文字だけ（囲み線・地なし・大きさは前のまま・文字と地の明暗差 4.5 以上）。終わりの画面は言葉を出し終わってから 4秒で閉じる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 });
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
    const look = () => page.evaluate(() => ["again", "bSetup", "bLog"].map((id) => { const b = document.getElementById(id), cs = getComputedStyle(b), r = b.getBoundingClientRect(); return { id, bg: cs.backgroundColor, bw: ["Top", "Right", "Bottom", "Left"].map((k) => cs["border" + k + "Color"]), color: cs.color, w: Math.round(r.width), h: Math.round(r.height) }; }));
    const rows = await look();
    for (const r of rows) {
      assert.equal(r.bg, "rgba(0, 0, 0, 0)", `${r.id} は地がない`);
      assert.ok(r.bw.every((c) => c === "rgba(0, 0, 0, 0)"), `${r.id} は囲み線が見えない（${r.bw}）`);
      assert.ok(ratio(r.color, await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) >= 4.5, `${r.id} 文字と地の明暗差 4.5 以上（${r.color}）`);
      assert.ok(r.h >= 24 && r.w >= 40, `${r.id} 押せる大きさが残っている（${r.w}×${r.h}）`);
    }
    // 囲み線をやめても大きさは変わらない（枠は透明で残してある）：Back・Redraw と同じ文字だけ。ログをコピー（出ているとき）は今のまま
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("bCopyEnd")).borderTopWidth), "1px", "ほかのボタンは変えない");
    assert.equal(await page.evaluate(() => END_PACE.hold), 4000, "終わりの画面：出し終わってから閉じるまで 4秒");
    // 押せる（もう一度・ログ・設定を変える）
    await page.click("#bLog");
    assert.equal(await page.evaluate(() => document.getElementById("logPanel") ? document.getElementById("logPanel").classList.contains("on") : true), true);
    await page.click("#bLog");
    if (process.env.KJ_SHOT) { // 画像（KJ_SHOT のときだけ撮る）：上の帯と、終わりの画面
      await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-bar.png"), clip: { x: 0, y: 0, width: 375, height: 80 } });
      await page.evaluate(() => { const G = __KJ.game; G.me.score = 49; G.cpu.score = 0; G.log.push({ t: 1, who: G.me.name, op: "放つ", from: [..."大雨"], to: [], pts: 4, note: "" }); });
      await page.locator("#meHand .tile", { hasText: "休" }).click();
      await page.locator("#meHand .tile", { hasText: "日" }).click();
      await page.click("#bRelease");
      await page.waitForSelector("#endShow[data-done='1']", { timeout: 5000 });
      await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-end.png") });
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("KJ-018 終わり：出し終わる前にタップしなくても、言葉が全部出てから閉じる。出し終わったあとのタップで閉じる。放った言葉が0でも終われる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 });
    await page.evaluate(() => { const G = __KJ.game; G.me.score = 49; G.cpu.score = 0; G.log.push({ t: 1, who: G.me.name, op: "放つ", from: [..."大雨"], to: [], pts: 4, note: "" }); });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
    await page.waitForSelector("#endShow[data-done='1']", { timeout: 5000 });
    assert.equal(await page.locator("#esWords .esw.in").count(), 2, "出し終わった");
    await page.click("#endShow", { position: { x: 180, y: 300 } }); // 出し終わったあとのタップで閉じる
    assert.equal(await page.evaluate(() => document.getElementById("endShow").classList.contains("on")), false);
    // 放った言葉が0：もう一度 → 時間切れで終わる
    await page.click("#again");
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.endsAt = G.now() - 1; });
    await page.waitForSelector("#endShow.on");
    assert.equal(await page.textContent("#esLabel"), "引き分け");
    assert.equal(await page.locator("#esWords .esw").count(), 0);
    await page.waitForFunction(() => !document.getElementById("endShow").classList.contains("on"), null, { timeout: 8000 });
    assert.match(await page.textContent("#msg"), /引き分け/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("KJ-064 金玉を放つと、金色の筆文字の2字が同時に出る（点は3）。天上天下は1字ずつのまま。375px", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 });
    await page.evaluate(() => { __KJ.game.me.cards = [..."金玉十口休日天下"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false })); __KJ.render(); });
    const before = await page.evaluate(() => __KJ.game.me.score);
    await page.locator("#meHand .tile").nth(0).click();
    await page.locator("#meHand .tile").nth(1).click();
    await page.click("#bRelease");
    await page.waitForSelector("#fx.on");
    assert.equal(await page.evaluate(() => document.getElementById("fx").classList.contains("gold")), true, "金色の印");
    await page.waitForFunction(() => document.querySelectorAll("#fxChars .c.in").length >= 1, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#fxChars .c")].map((e) => e.classList.contains("in")).join()), "true,true", "2字が同時に出ている（1字ずつではない）");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#fxChars .c")].map((e) => e.textContent).join("")), "金玉");
    const st = await page.$eval("#fxChars .c", (e) => { const c = getComputedStyle(e); return { ff: c.fontFamily, color: c.color }; });
    assert.match(st.ff, /KJ Fx/, "筆文字");
    assert.equal(st.color, await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--shine)"; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }), "色は --shine（新しい色を足さない）");
    assert.equal(await page.evaluate(() => __KJ.game.me.score), before + 3, "点は2字3点のまま");
    await page.screenshot({ path: "test-results/kj064-kintama-375.png" });
    await page.waitForFunction(() => !document.getElementById("fx").classList.contains("on"), null, { timeout: 4000 });
    assert.deepEqual(errors, []);
    await ctx.close();
    // 天上天下は今まで通り：金色でない・1字ずつ（放ったあとは取りきるまで手ができないので、開き直す）
    const o = await open(browser, url, { width: 375, height: 700 });
    for (let i = 0; i < 4; i++) await o.page.locator("#meHand .tile").nth(i).click();
    await o.page.click("#bRelease");
    await o.page.waitForSelector("#fx.on");
    assert.equal(await o.page.evaluate(() => document.getElementById("fx").classList.contains("gold")), false, "天上天下は金色にしない");
    await o.page.waitForTimeout(450);
    assert.equal(await o.page.evaluate(() => document.querySelectorAll("#fxChars .c.in").length), 1, "天上天下は1字ずつ（450ms では1字目だけ）");
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  });

  await t.test("KJ-018 終わり：特別な語で勝つと、放った言葉の演出（#fx）が終わってから出る。動きを減らす設定では動かさない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { __KJ.game.me.score = 20; }); // 天上天下で50点に届く
    for (let i = 0; i < 4; i++) await page.locator("#meHand .tile").nth(i).click(); // 天・上・天・下
    await page.click("#bRelease");
    await page.waitForSelector("#fx.on");
    assert.equal(await page.evaluate(() => document.getElementById("endShow").classList.contains("on")), false, "演出のあいだは出さない");
    await page.waitForSelector("#endShow.on", { timeout: 6000 });
    assert.equal(await page.evaluate(() => document.getElementById("fx").classList.contains("on")), false, "演出が終わってから");
    assert.equal(await page.textContent("#esLabel"), "勝ち！");
    await page.waitForSelector("#esWords .esw.in.fresh");
    assert.equal(await page.$eval("#esWords .esw.in.fresh", (e) => getComputedStyle(e).animationName), "none", "動きを減らす設定");
    assert.equal(await page.$eval("#esWords .esw.in.fresh .w", (e) => getComputedStyle(e).animationName), "none");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("KJ-018 終わり：負け…（相手が先に50点）と、ひとりでは「おわり」と点。色が勝ちと変わる", async () => {
    const lose = await open(browser, url, { width: 375, height: 700 });
    await lose.page.evaluate(() => { __KJ.game.cpu.score = 50; });
    await lose.page.locator("#meHand .tile", { hasText: "休" }).click();
    await lose.page.locator("#meHand .tile", { hasText: "日" }).click();
    await lose.page.click("#bRelease");
    await lose.page.waitForSelector("#endShow.on");
    assert.equal(await lose.page.textContent("#esLabel"), "負け…");
    assert.equal(await lose.page.getAttribute("#esLabel", "class"), "lose");
    assert.equal(await lose.page.textContent("#esScore .them"), "50");
    const loseColor = await lose.page.$eval("#esLabel", (e) => getComputedStyle(e).color);
    await lose.page.click("#again"); // 面が出ているあいだも、上の帯は押せる（面に隠れない）
    assert.equal(await lose.page.evaluate(() => document.getElementById("endShow").classList.contains("on")), false);
    assert.deepEqual(lose.errors, []);
    await lose.ctx.close();

    const win = await open(browser, url, { width: 375, height: 700 });
    await win.page.evaluate(() => { __KJ.game.me.score = 48; });
    await win.page.locator("#meHand .tile", { hasText: "休" }).click();
    await win.page.locator("#meHand .tile", { hasText: "日" }).click();
    await win.page.click("#bRelease");
    await win.page.waitForSelector("#endShow.on");
    const winColor = await win.page.$eval("#esLabel", (e) => getComputedStyle(e).color);
    assert.notEqual(winColor, loseColor, "勝ちと負けで色が違う");
    await win.ctx.close();

    const solo = await open(browser, url, { width: 375, height: 700 }, "solo");
    await solo.page.evaluate(() => { const G = __KJ.game; G.me.score = 51; G.endsAt = G.now() - 1; });
    await solo.page.waitForSelector("#endShow.on");
    assert.equal(await solo.page.textContent("#esLabel"), "おわり");
    assert.equal(await solo.page.textContent("#esScore .you"), "51");
    assert.equal(await solo.page.locator("#esScore .them").count(), 0, "ひとりでは相手の点が無い");
    assert.deepEqual(solo.errors, []);
    await solo.ctx.close();
  });

  await t.test("終わると「ログをコピー」が出て、クリップボードに入る", async () => {
    const { ctx, page } = await open(browser, url, { width: 760, height: 1100 });
    await page.evaluate(() => { __KJ.game.me.score = 48; });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
    assert.match(await page.textContent("#msg"), /勝ち（51 対 0）/);
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    await page.click("#bCopyEnd");
    await page.waitForFunction(() => document.getElementById("copyMsg").textContent === "コピーした");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /# 仮置き 勝ち 先に50点/);
    assert.match(clip, /\t終わり\t.*あなたの勝ち（先に50点）/);
    await ctx.close();
  });

  // ---------- KJ-020 ログの自動送信（本物の送り先には送らない。通信は page.route で受ける） ----------
  const LOG_ROUTE = "**/rest/v1/play_logs";
  // force：手元・テストでは送らない決まりを、送る処理を確かめるときだけ外す。status：受け側の返事（201＝入った／500＝失敗）
  const forced = (posts, status = () => 201) => async (page) => {
    await page.addInitScript(() => { window.__KJ_LOG_FORCE = true; });
    await page.route(LOG_ROUTE, async (route) => {
      posts.push({ headers: route.request().headers(), body: JSON.parse(route.request().postData()) });
      await route.fulfill({ status: status(posts.length), body: "" });
    });
  };
  const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); };
  const winNow = async (page) => {
    await page.evaluate(() => { __KJ.game.me.score = 48; });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
  };

  await t.test("ログの送信（KJ-020）：終わったら1行送る。中身の形・同じ端末は同じ device_id・何も表示しない", async () => {
    const posts = [];
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, forced(posts));
    const before = await page.evaluate(() => document.body.innerText);
    await winNow(page);
    await until(() => posts.length >= 1);
    await page.waitForTimeout(200);
    assert.equal(posts.length, 1, "終わりで1回だけ送る");
    const { headers, body } = posts[0];
    assert.match(headers.apikey, /^sb_publishable_/);
    assert.equal(headers.authorization, undefined, "秘密の鍵は使わない");
    assert.deepEqual(Object.keys(body).sort(), ["app_version", "device_id", "level", "log", "opponent", "result"]);
    assert.match(body.result, /^あなたの勝ち（10分 51対\d+）$/);
    assert.equal(body.level, "N4");
    assert.equal(body.opponent, "weak");
    assert.match(body.log, /^# 漢対普請瓦版 ログ/);
    assert.match(body.log, /\t終わり\t/);
    assert.match(body.device_id, /^[0-9a-f]{24}$/);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-device")), body.device_id);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-unsent-log")), null, "入ったので残さない");
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /送り|送信|送っ/, "画面に送ったことを出さない");
    assert.doesNotMatch(before, /送り|送信|送っ/);
    // 2試合目も同じ device_id
    await page.click("#again");
    await page.locator("#field .tile").first().click();
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [..."休日"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); });
    await page.evaluate(() => __KJ.render());
    await winNow(page);
    await until(() => posts.length >= 2);
    assert.equal(posts.length, 2);
    assert.equal(posts[1].body.device_id, body.device_id);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ログの送信（KJ-020）：途中で捨てても、1手以上動いていれば送る。1手も動いていなければ送らない", async () => {
    const posts = [];
    const { ctx, page } = await open(browser, url, { width: 375, height: 900 }, null, forced(posts));
    await page.click("#bSetup"); // 1手も動かず捨てる
    await page.waitForTimeout(300);
    assert.equal(posts.length, 0, "1手も動いていない");
    await page.click("#start");
    await page.locator("#field .tile").first().click();
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [..."口十"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false })); });
    await page.evaluate(() => __KJ.render());
    await page.locator("#meHand .tile", { hasText: "口" }).click();
    await page.locator("#meHand .tile", { hasText: "十" }).click();
    await page.click("#bBack"); // 並べ方が逆のまま戻す＝「ためした」が残る＝動いた
    await page.click("#again");
    await until(() => posts.length >= 1);
    assert.equal(posts.length, 1, "もう一度で捨てた試合を送る");
    assert.match(posts[0].body.result, /^途中でやめた（/);
    await page.locator("#field .tile").first().click();
    await page.evaluate(() => { __KJ.game.cpuTurn = () => null; __KJ.game.tried(__KJ.game.me, ["天"], "辞書にない"); });
    await page.click("#bSetup");
    await until(() => posts.length >= 2);
    assert.equal(posts.length, 2, "設定を変えるで捨てた試合も送る");
    await ctx.close();
  });

  await t.test("ログの送信（KJ-020）：失敗しても遊びは止まらない。1件だけ残し、次の試合の終わりに送り直す", async () => {
    const posts = [];
    const { ctx, page } = await open(browser, url, { width: 375, height: 900 }, null, forced(posts, (n) => (n === 1 ? 500 : 201)));
    await winNow(page);
    await until(() => posts.length >= 1);
    await page.waitForTimeout(200);
    assert.match(await page.textContent("#msg"), /勝ち/, "失敗しても終わりの画面は出る");
    assert.equal(await page.isVisible("#again"), true);
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem("kj-unsent-log")));
    assert.equal(kept.device_id, posts[0].body.device_id, "失敗した1件が残る");
    await page.click("#again");
    await page.locator("#field .tile").first().click();
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [..."休日"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false })); });
    await page.evaluate(() => __KJ.render());
    await winNow(page);
    await until(() => posts.length >= 3);
    assert.equal(posts.length, 3, "残していた1件＋今回の1件を送る");
    assert.deepEqual(posts[1].body, posts[0].body, "残していたものがそのまま送り直される");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-unsent-log")), null);
    await ctx.close();
  });

  await t.test("ログの送信（KJ-020）：通信が落ちていても遊びは止まらない／localStorage が読めなくても送れる", async () => {
    const posts = [];
    const { ctx, page } = await open(browser, url, { width: 375, height: 900 }, null, async (p) => {
      await forced(posts)(p);
      await p.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    });
    await winNow(page);
    // 読めない端末はチュートリアルの印が残らず、はじめにチュートリアルをとばした行（opponent=tutorial）も送られる（KJ-043）。試合の行だけ数える
    const games = () => posts.filter((p) => p.body.opponent !== "tutorial");
    await until(() => games().length >= 1);
    assert.equal(games().length, 1);
    assert.equal(posts.filter((p) => p.body.opponent === "tutorial").length, 1, "とばしたチュートリアルの行");
    assert.ok(games()[0].body.device_id.length >= 8, "読めないときは試合ごとの無作為");
    await ctx.close();
    const { ctx: c2, page: p2 } = await open(browser, url, { width: 375, height: 900 }, null, async (p) => {
      await p.addInitScript(() => { window.__KJ_LOG_FORCE = true; });
      await p.route(LOG_ROUTE, (route) => route.abort());
    });
    await winNow(p2);
    await p2.waitForTimeout(300);
    assert.match(await p2.textContent("#msg"), /勝ち/, "通信が切れていても終われる");
    await c2.close();
  });

  await t.test("Split のボタンはロゴ（KJ-059）：Sp｜lit の間に札の割れ目と同じ点線・逆ハの字・割れたら割れ目が開く・はじかれたら動かさない・動きを減らす設定では動かさない", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp, null, null, true);
      const info = await page.evaluate(() => {
        const b = document.getElementById("bSplit"), a = b.querySelector(".sp-a"), c = b.querySelector(".sp-cut"), l = b.querySelector(".sp-b");
        const root = getComputedStyle(document.documentElement).getPropertyValue("--cut").trim();
        const cs = getComputedStyle(c), tile = document.createElement("div"); tile.className = "tile"; tile.innerHTML = '<i class="cutv"></i>'; document.body.appendChild(tile);
        const tileLine = getComputedStyle(tile.firstChild); const r = { cutColor: cs.borderLeftColor, cutStyle: cs.borderLeftStyle, cutW: cs.borderLeftWidth, tileColor: tileLine.borderLeftColor, tileStyle: tileLine.borderLeftStyle, root, a: getComputedStyle(a).transform, aOrigin: getComputedStyle(a).transformOrigin, l: getComputedStyle(l).transform, lOrigin: getComputedStyle(l).transformOrigin, text: b.querySelector(".lb").textContent, aria: b.getAttribute("aria-label"), lines: b.querySelector(".lb").getClientRects().length, right: b.getBoundingClientRect().right, parts: [a.textContent, l.textContent] }; tile.remove(); return r;
      });
      assert.equal(info.text, "Split"); assert.deepEqual(info.parts, ["Sp", "lit"]); assert.equal(info.aria, "Split", "読み上げは Split のまま");
      assert.equal(info.cutStyle, "dashed"); assert.ok(parseFloat(info.cutW) >= 1 && parseFloat(info.cutW) <= 1.6, `割れ目の太さ（1.6px を端末の画素に丸めた値。${info.cutW}）`); assert.match(await page.evaluate(() => [...document.styleSheets].flatMap((ss) => [...ss.cssRules]).find((r) => r.selectorText === ".sp-cut").style.borderLeft), /1\.6px dashed var\(--cut\)/, "太さ1.6px・--cut を使う"); assert.equal(info.cutColor, info.tileColor, "札の割れ目と同じ色（--cut）"); assert.equal(info.tileStyle, "dashed");
      const ang = (m) => { const v = m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI); };
      assert.equal(ang(info.a), -9, "Sp は左へ約9度"); assert.equal(ang(info.l), 9, "lit は右へ約9度");
      assert.equal(info.aOrigin.split(" ")[0] !== "0px", true, "Sp は右下の角が軸"); assert.equal(info.lOrigin.split(" ")[0], "0px", "lit は左下の角が軸");
      if (vp.width === 375) assert.ok(info.lines === 1 && info.right <= 375, `375px でボタンが1行に収まる（行 ${info.lines}・右端 ${info.right}）`);
      // 押せば今まで通り割れる。割れたら cutopen が付き、アニメが走る（角度が約9度→16度を通る）
      const tile = (ch) => page.locator("#meHand .tile", { hasText: ch }).first();
      await tile("休").click();
      await page.click("#bSplit");
      assert.equal(await page.locator("#row .tile").count(), 2, "休 が 人 木 に割れる");
      assert.equal(await page.evaluate(() => document.getElementById("bSplit").classList.contains("cutopen")), true, "割れたら割れ目が開く");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#bSplit .sp-a")).animationName), "kjSpA");
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => document.getElementById("bSplit").classList.contains("cutopen")), false, "開いたあとは戻る");
      // はじかれたら動かさない（木 は割れない）
      await page.evaluate(() => document.getElementById("bSplit").click());
      assert.equal(await page.textContent("#nopeWhy"), "割れない！");
      assert.equal(await page.evaluate(() => document.getElementById("bSplit").classList.contains("cutopen")), false, "はじかれたら動かさない");
      assert.deepEqual(errors, []); await ctx.close();
    }
    // 動きを減らす設定：割れても動かさない（既定が reduce）
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 }, null, null, false);
    await page.locator("#meHand .tile", { hasText: "休" }).first().click();
    await page.click("#bSplit");
    assert.equal(await page.locator("#row .tile").count(), 2, "reduce でも割れる");
    assert.equal(await page.evaluate(() => document.getElementById("bSplit").classList.contains("cutopen")), false, "reduce では割れ目を動かさない");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#bSplit .sp-a")).animationName), "none");
    assert.deepEqual(errors, []); await ctx.close();
  });

  await t.test("ボタンの文字は英語（KJ-024・KJ-048）。印は字に組み込んだ SVG（Flip・Cycle・Same reading）で角の印と同じ形。選んだ札でも印が見える。ほかの文言とログは日本語のまま", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp);
      const label = (id) => page.evaluate((i) => document.querySelector(`#${i} .lb`).textContent, id);
      // 印の SVG は文字に数えない：Flip＝Fl＋印＋p、Cycle＝印＋ycle、Same reading＝印＋ame reading。読み上げ（aria-label）は Flip・Cycle・Same reading
      const want = { bRelease: "Play", bSplit: "Split", bJoin: "Join", bInvert: "Flp", bCycle: "ycle", bHomo: "ame reading", bBack: "Back", bRedraw: "Redraw" };
      for (const [id, text] of Object.entries(want)) assert.equal(await label(id), text, `${id} の文字`);
      const aria = { bSplit: "Split", bInvert: "Flip", bCycle: "Cycle", bHomo: "Same reading" };
      for (const [id, text] of Object.entries(aria)) assert.equal(await page.getAttribute(`#${id}`, "aria-label"), text, `${id} の読み上げ`);
      for (const id of ["bRelease", "bBack", "bRedraw"]) assert.equal(await page.getAttribute(`#${id}`, "aria-label"), null, `${id} は印の無いボタン。aria-label を付けない（Redraw の添え字を読み上げから消さない）`);
      assert.equal(await page.getAttribute("#bJoin", "aria-label"), "Join", "Join は印（Jo｜in。KJ-103）を字に組み込むので、読み上げは Join のまま");
      if (vp.width === 375) {
        const rows = await page.evaluate(() => ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"].map((i) => { const b = document.getElementById(i); const lb = b.querySelector(".lb"); return { i, lines: lb.getClientRects().length, right: b.getBoundingClientRect().right }; }));
        for (const r of rows) assert.ok(r.lines === 1 && r.right <= 375, `375×700 でボタンが1行に収まる（${r.i} の行 ${r.lines}・右端 ${r.right}）`);
      }
      assert.equal(await page.locator("#bInvert .lb svg.ic-invert").count(), 1, "Flip の印は SVG");
      assert.equal(await page.locator("#bCycle .lb svg.ic-cycle").count(), 1, "Cycle の印は SVG");
      assert.equal(await page.locator("#bHomo .lb svg.ic-homophone").count(), 1, "Same reading の印は SVG");
      assert.equal(await page.locator(".ops svg").count(), 4, "ボタンの印はこの4つだけ（Flip・Cycle・Same reading の印と、Join の放射。KJ-103）");
      for (const g of ["⇄", "↻", "♪", "Sound conversion"]) assert.ok(!(await page.evaluate(() => document.body.innerText)).includes(g), `${g} が画面に残っていない`);
      // ボタンの中に日本語（かな・漢字）が無い。待ち時間・引き直しの添え字が入っても
      await page.evaluate(() => { __KJ.game.me.score = 9; __KJ.render(); });
      assert.equal(await page.textContent("#cdRedraw"), "0pt あと5回", "はじめは Redraw 0pt あと5回（KJ-049）");
      await page.evaluate(() => { __KJ.game.me.redraws = 2; __KJ.render(); });
      assert.equal(await page.textContent("#cdRedraw"), "-10pt あと3回", "3回目は Redraw -10pt あと3回（KJ-049）");
      await page.evaluate(() => { __KJ.game.me.redraws = 5; __KJ.render(); });
      assert.equal(await page.textContent("#cdRedraw"), "あと0回", "使いきったら あと0回");
      const jp = /[\u3040-\u30ff\u3400-\u9fff]/;
      // 添え字の「あと◯回」はカードの文言（仮）。ボタンの字（.lb）に日本語が無いことを見る
      for (const t of await page.locator(".ops button .lb").allTextContents()) assert.doesNotMatch(t, jp, `ボタンに日本語が無い（${t}）`);
      // 角の印：上＝反転と同音 → Flip・Same reading の SVG、十＝巡りと同音 → Cycle・Same reading、口＝同音だけ。文字（⇄・↻・♪・反・巡・音）は出ない
      const mk = (ch) => page.evaluate((c) => { const e = [...document.querySelectorAll("#meHand .tile")].find((x) => x.title === c).querySelector(".mk"); return e ? { kinds: [...e.querySelectorAll(".mi svg")].map((v) => v.getAttribute("class").replace("ic ic-", "")), text: e.textContent } : { kinds: [], text: "" }; }, ch);
      assert.deepEqual(await mk("上"), { kinds: ["invert"], text: "" });
      assert.deepEqual(await mk("十"), { kinds: ["cycle"], text: "" });
      assert.deepEqual(await mk("口"), { kinds: [], text: "" }, "同音の S は札の角に出ない（KJ-057）");
      assert.deepEqual(await mk("休"), { kinds: [], text: "" });
      assert.equal(await page.locator("#meHand .tile svg.ic-homophone, #field .tile svg.ic-homophone, #meTray .tile svg.ic-homophone").count(), 0, "手札・ストック・場に S の SVG が無い");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll(".tile .mk")].filter((e) => /[反巡音]/.test(e.textContent)).length), 0, "角の印に 反・巡・音 の字が無い");
      // 札の角の印とボタンの印が同じ形（path が同じ）
      const pathsOf = (sel) => page.evaluate((q) => [...document.querySelector(q).querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"), sel);
      for (const [id, k] of [["bInvert", "invert"], ["bCycle", "cycle"]]) { // 同音の印は札の角に出さない（KJ-057）。ボタンの S はそのまま
        const btn = await pathsOf(`#${id} svg`);
        const corner = await page.evaluate(([kk]) => { const e = document.querySelector(`#meHand .tile .mi[data-k="${kk}"] svg`); return e ? [...e.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|") : ""; }, [k]);
        assert.ok(btn.length > 0 && btn === corner, `${id} の印と札の角の印が同じ形`);
      }
      // 選んだ札（弁柄の縁）でも、角の印の色が地の色と違う（PR #22 の気づき）
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      const c = await page.evaluate(() => { const t = [...document.querySelectorAll("#meHand .tile.sel")].find((x) => x.title === "上"); return { bg: getComputedStyle(t).backgroundColor, mk: getComputedStyle(t.querySelector(".mk")).color }; });
      assert.notEqual(c.mk, c.bg, `選んだ札の印（${c.mk}）が地（${c.bg}）と違う色`);
      // 台の写しにも同じ印
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("#row .tile .mk .mi")].map((e) => e.dataset.k).join(",")), "invert");
      // ほかの画面の文言は日本語のまま
      assert.equal(await page.textContent("#meSide .side-head b"), "あなた");
      assert.match(await page.textContent("#trayHead"), /^ストック/);
      assert.equal(await page.locator("#howto svg.ic-invert").count() + await page.locator("#howto svg.ic-cycle").count() + await page.locator("#howto svg.ic-homophone").count(), 2, "しくみの印の説明：反転・巡りは同じ SVG。同音の S は出さない（KJ-057）");
      // ログの手の名前は日本語のまま
      await page.click("#bBack");
      await page.locator("#meHand .tile", { hasText: "休" }).click();
      await page.click("#bSplit");
      await page.click("#bLog");
      assert.match(await page.inputValue("#logText"), /\t割る\t休\t人 木\t/);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("ログの送信（KJ-020）：手元（127.0.0.1）とテスト（webdriver）では、force が無ければ送らない", async () => {
    const posts = [];
    const { ctx, page } = await open(browser, url, { width: 375, height: 900 }, null, async (p) => {
      await p.route(LOG_ROUTE, async (route) => { posts.push(1); await route.fulfill({ status: 201, body: "" }); });
    });
    await winNow(page);
    await page.waitForTimeout(500);
    assert.match(await page.textContent("#msg"), /勝ち/);
    assert.equal(posts.length, 0, "送っていない");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-device")), null, "端末の印も作らない");
    await ctx.close();
  });

  // 合言葉の部屋（KJ-033 後半）：2つのページで1試合。kj_claims への REST は page.route で Node の中の偽物（主キーの先着）に回す。
  // Realtime は差し替え（つながらない形）にして、REST の読み直しだけで動くことも確かめる。本物の Supabase には出さない
  await t.test("合言葉の部屋：部屋を作る→合言葉で入る→二人で同じ場・先に取った方だけ取れる・言葉の点が相手に届く・時間切れで勝ち負けがそろう", async () => {
    const store = new Map(), hits = [];
    const pk = (r) => [r.match_id, r.kind, r.key].join("\u0000");
    let tick = Date.now();
    const handler = async (route) => {
      const req = route.request(), u = new URL(req.url());
      hits.push(req.method());
      if (req.method() === "POST") {
        const row = JSON.parse(req.postData());
        if (store.has(pk(row))) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505" }) });
        tick += 10;
        const r = { ...row, created_at: new Date(Math.max(tick, Date.now())).toISOString().replace("Z", "+00:00") };
        store.set(pk(r), r);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([r]) });
      }
      const eq = (k) => { const v = u.searchParams.get(k); return v === null ? null : v.replace(/^eq\./, ""); };
      const since = u.searchParams.get("created_at");
      let rows = [...store.values()].filter((r) => r.match_id === eq("match_id") && (eq("kind") === null || r.kind === eq("kind")) && (eq("key") === null || r.key === eq("key")));
      if (since) rows = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(since.replace(/^gte\./, "")));
      rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    };
    const mk = async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
      await page.route("https://cdn.jsdelivr.net/**", (r) => { errors.push("CDN を読みに行った"); return r.abort(); });
      await page.addInitScript(() => {
        window.__KJ_POLL_MS = 150;
        // Realtime の差し替え：つながらない（REST の読み直しだけで動く）
        window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; } }) };
      });
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      await pickOpp(page, "room");
      return { ctx, page, errors };
    };
    const A = await mk(), B = await mk();
    assert.equal(await A.page.isVisible("#start"), false, "人と（合言葉）では「はじめる」の代わりに部屋の選び");
    assert.equal(await A.page.isVisible("#bHost"), true);
    await A.page.check('#lvl input[value="N5"]');
    await A.page.check('#tim input[value="300"]');
    await A.page.click("#bHost");
    await A.page.waitForSelector("#roomShow:not([hidden])");
    const code = (await A.page.textContent("#roomShow")).trim();
    assert.match(code, /^[0-9]{4}$/);
    assert.match(await A.page.textContent("#roomMsg"), /相手を待っています/);
    // 入る側（設定は N4・10分のまま。作った人の N5・5分 で遊ぶ）
    await B.page.fill("#roomCode", "99");
    await B.page.click("#bEnter");
    await B.page.waitForFunction(() => /数字4けた/.test(document.getElementById("roomMsg").textContent));
    await B.page.fill("#roomCode", code);
    await B.page.click("#bEnter");
    for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
    assert.match(await B.page.textContent("#msg"), /作った人の設定：レベル N5・5分/);
    for (const P of [A, B]) {
      assert.equal(await P.page.textContent("#cpuName"), "相手");
      assert.equal(await P.page.evaluate(() => __KJ.game.level), "N5");
      assert.equal(await P.page.evaluate(() => __KJ.game.timeLimit), 300);
    }
    const roles = await Promise.all([A, B].map((P) => P.page.evaluate(() => __KJ.game.match.role)));
    assert.deepEqual(roles, ["host", "guest"]);
    for (const P of [A, B]) assert.equal(await P.page.evaluate(() => getComputedStyle(document.getElementById("cpuHand")).display), "none", "合言葉の部屋（人どうし）では相手の上の段を出さない（KJ-092）");
    const left = await Promise.all([A, B].map((P) => P.page.evaluate(() => __KJ.game.timeLeft())));
    assert.ok(Math.abs(left[0] - left[1]) < 2, "二人の残り時間がそろう " + left.join(" "));
    const fieldOf = (P) => P.page.evaluate(() => __KJ.game.field.map((x) => x.n + x.c).join(" "));
    assert.equal(await fieldOf(A), await fieldOf(B), "場は二人で同じ3枚");
    // 二人とも取れる枚数1・手札に空き。同じ場の札（左の1枚）を A が先に押す
    for (const P of [A, B]) await P.page.evaluate(() => { const G = __KJ.game; G.me.cards = G.me.cards.slice(0, 5); G.me.takes = 1; __KJ.render(); });
    await A.page.click("#field .tile >> nth=0");
    await A.page.waitForFunction(() => __KJ.game.me.takes === 0);
    await B.page.waitForFunction(() => !__KJ.game.field.some((x) => x.n === 0), null, { timeout: 5000 });
    assert.equal(await fieldOf(A), await fieldOf(B), "取ったあとも二人の場は同じ");
    // B の画面が古いまま同じ札を押した形：番号0 を直に取りに行くと「相手が先に取った」
    const lost = await B.page.evaluate(async () => { const G = __KJ.game; const x = G.fieldCardAt(0); G.field = [x, ...G.field.slice(1)]; return (await __KJ.mc.take(x.id)).why; });
    assert.equal(lost, "相手が先に取った");
    // A が 学生 を放つ → B の画面に相手の点
    await A.page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."学生"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await A.page.locator("#meHand .tile", { hasText: "学" }).click();
    await A.page.locator("#meHand .tile", { hasText: "生" }).click();
    await A.page.click("#bRelease");
    await A.page.waitForFunction(() => __KJ.game.me.score === 3);
    await B.page.waitForFunction(() => /3 点/.test(document.getElementById("cpuScore").textContent), null, { timeout: 5000 });
    assert.match(await B.page.textContent("#released"), /相手.*学生/);
    // 時間切れ：二人とも終わりの時刻を今に
    for (const P of [A, B]) await P.page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
    await A.page.waitForFunction(() => /勝ち/.test(document.getElementById("msg").textContent), null, { timeout: 8000 });
    await B.page.waitForFunction(() => /負け/.test(document.getElementById("msg").textContent), null, { timeout: 8000 });
    assert.match(await A.page.textContent("#msg"), /勝ち（3 対 0）/);
    assert.match(await B.page.textContent("#msg"), /負け（0 対 3）/);
    // 表に入った行の形
    const rows = [...store.values()];
    const kinds = (k) => rows.filter((r) => r.kind === k);
    assert.equal(kinds("start").length, 1);
    assert.deepEqual(kinds("card").map((r) => [r.key, r.player]), [["0", "host"]]);
    assert.deepEqual(kinds("word").map((r) => [r.key, r.player, r.payload.pts, r.payload.score]), [["学生", "host", 3, 3]]);
    assert.equal(kinds("end").length, 2, "二人とも時間切れの点を送った");
    const lobby = rows.find((r) => r.match_id === "room-" + code);
    assert.deepEqual([lobby.kind, lobby.player, lobby.payload.level, lobby.payload.time], ["join", "host", "N5", 300]);
    for (const P of [A, B]) {
      await P.page.click("#bLog");
      const log = await P.page.inputValue("#logText");
      assert.match(log, /# 相手 人と（合言葉）/);
      assert.equal(log.includes(code), false, "合言葉はログに書かない");
      // 先着でぶつかった（409）ときにブラウザが出す読み込みの失敗の文だけは、決まりどおりの動きなので除く
      assert.deepEqual(P.errors.filter((e) => !/status of 409/.test(e)), []);
    }
    // 「もう一度」は、はじめる前の画面へ（部屋を作り直す）
    await A.page.click("#again");
    assert.equal(await A.page.isVisible("#setup"), true);
    assert.equal(await A.page.isVisible("#bHost"), true);
    assert.equal(await A.page.evaluate(() => __KJ.mc), null);
    await A.ctx.close(); await B.ctx.close();
  });

  await t.test("合言葉の部屋：遊んでいる途中で相手が抜けると「相手の通信が切れた」。試合は続く", async () => {
    const store = new Map();
    const pk = (r) => [r.match_id, r.kind, r.key].join("\u0000");
    const handler = async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === "POST") {
        const row = JSON.parse(req.postData());
        if (store.has(pk(row))) return route.fulfill({ status: 409, body: "{}" });
        const r = { ...row, created_at: new Date().toISOString() };
        store.set(pk(r), r);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([r]) });
      }
      const eq = (k) => { const v = u.searchParams.get(k); return v === null ? null : v.replace(/^eq\./, ""); };
      const rows = [...store.values()].filter((r) => r.match_id === eq("match_id") && (eq("kind") === null || r.kind === eq("kind")) && (eq("key") === null || r.key === eq("key")));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    };
    const mk = async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
      const page = await ctx.newPage();
      await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
      await page.addInitScript(() => { window.__KJ_POLL_MS = 150; window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }; return ch; } }) }; });
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      await pickOpp(page, "room");
      return { ctx, page };
    };
    const A = await mk(), B = await mk();
    await A.page.click("#bHost");
    await A.page.waitForSelector("#roomShow:not([hidden])");
    await B.page.fill("#roomCode", (await A.page.textContent("#roomShow")).trim());
    await B.page.click("#bEnter");
    for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
    assert.equal(await A.page.textContent("#cpuCds"), "");
    await B.page.click("#bSetup"); // B が抜ける
    await A.page.waitForFunction(() => document.getElementById("cpuCds").textContent === "相手の通信が切れた", null, { timeout: 5000 });
    assert.equal(await A.page.evaluate(() => __KJ.game.over), false, "試合は時間どおり続く");
    await A.ctx.close(); await B.ctx.close();
  });
  // KJ-069：押せない見た目のボタンを押すと理由が画面に出る・Same reading の一覧は、もう一度 Same reading で閉じる
  await t.test("KJ-069：押せない見た目のボタンを押すと、はじかれた理由が画面に出る。Same reading の一覧はもう一度押すと閉じる（待ち時間なし・ログなし）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "weak");
    const msg = () => page.textContent("#nopeWhy"); // はじかれた理由（KJ-022：画面の真ん中の 否 の判子の下）
    const hand = () => page.locator("#meHand .tile").evaluateAll((els) => els.map((e) => e.title).join(""));
    const pick = async (c) => { await page.locator("#meHand .tile:not(.sel)", { hasText: c }).first().click(); };
    const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
    const homoC = await page.evaluate(() => { const T = __KJ.tables; return [...T.HOMO.keys()].find((c) => !T.INV.has(c) && T.HOMO.get(c).flatMap((g) => g.chars).some((x) => x !== c)); });
    const noHomo = await page.evaluate(() => { const T = __KJ.tables; return [...T.HOLD].find((c) => !T.HOMO.has(c) && !T.INV.has(c) && !T.NEXT.has(c) && !KJ.canSplit(T, c)); }); // 割れない・反転も巡りも同音も無い字
    assert.ok(homoC && noHomo, `同じ読みの字がある札（${homoC}）と無い札（${noHomo}）`);
    await page.evaluate(([a, b]) => { const G = __KJ.game; G.me.cards = [a, b, "山", "川"].map((c, i) => ({ id: 8100 + i, c, t: 0, fresh: false })); __KJ.row.length = 0; __KJ.render(); }, [homoC, noHomo]);
    // 同じ読みの字が無い札：押せない見た目・押すと画面に理由（今まで「同じ読みではない」。選んだ字が違うと読めた）
    await pick(noHomo);
    assert.equal(await page.getAttribute("#bHomo", "aria-disabled"), "true");
    await click("bHomo");
    assert.equal(await msg(), "同じ読みの字がない！");
    assert.equal(await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").map((e) => e.note).join("|")), "同音：同じ読みの字がない", "ログの「ためした」は今まで通り");
    // ほかの押せないボタン（Split・Flip・Cycle・Join）も理由が出る
    await click("bSplit"); assert.match(await msg(), /割れない/);
    await click("bInvert"); assert.match(await msg(), /できない字/);
    await click("bCycle"); assert.match(await msg(), /できない字/);
    await page.click("#bBack"); assert.equal(await hand(), [homoC, noHomo, "山", "川"].join(""), "手札は動かない");
    // 同じ読みの字がある札：一覧が出る→もう一度 Same reading で閉じる。札は変わらず・待ち時間なし・ログに残さない
    await pick(homoC);
    assert.equal(await page.getAttribute("#bHomo", "aria-disabled"), "false");
    const logN = await page.evaluate(() => __KJ.game.log.length);
    await click("bHomo");
    assert.equal(await page.locator("#choices.on").count(), 1, "一覧が出る");
    await click("bHomo");
    assert.equal(await page.locator("#choices.on").count(), 0, "もう一度押すと閉じる");
    assert.equal(await page.evaluate(() => __KJ.row.length), 1, "選んだ札はそのまま");
    assert.equal(await hand(), [homoC, noHomo, "山", "川"].join(""), "手札は変わらない");
    assert.equal(await page.evaluate(() => __KJ.game.ready(__KJ.game.me, "homophone")), true, "待ち時間はかからない");
    assert.equal(await page.evaluate(() => __KJ.game.log.length), logN, "ログに残さない");
    await click("bHomo");
    assert.equal(await page.locator("#choices.on").count(), 1, "また押すと一覧がまた出る");
    await page.click("#bBack"); // 一覧が出ていても Back は押せる（KJ-090：一覧より上に出している）
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  // KJ-041：押した操作がはじかれたら「ためした」に残る。ボタンは押せない見た目のまま（disabled でなく aria-disabled）で、押しても手札は動かない
  await t.test("はじかれた操作もログに残す（KJ-041）：割れない Split・待ち時間の Flip・巡りの無い Cycle・読みの無い Same reading・待っている Redraw・取れない取る・光っていない面。続けて押すと1行。手札は動かない・ヒントは数えない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "weak");
    const setHand = (chars) => page.evaluate((cs) => { const G = __KJ.game; G.me.cards = [...cs].map((c, i) => ({ id: 8000 + i + Math.floor(Math.random() * 1e5) * 10, c, t: 0, fresh: false })); __KJ.row.length = 0; __KJ.render(); }, chars);
    const tried = () => page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").map((e) => ({ from: e.from.join(""), note: e.note })));
    const hand = () => page.locator("#meHand .tile").evaluateAll((els) => els.map((e) => e.title).join(""));
    const pick = async (c) => { await page.locator("#meHand .tile:not(.sel)", { hasText: c }).first().click(); };
    await setHand("一休田上月");
    assert.equal(await page.getAttribute("#bSplit", "aria-disabled"), "true", "割れない字では押せない見た目");
    assert.equal(await page.evaluate(() => document.getElementById("bSplit").disabled), false, "でも disabled ではない（押すと理由が残る）");
    await pick("一");
    for (let i = 0; i < 3; i++) await page.evaluate(() => document.getElementById("bSplit").click());
    assert.deepEqual(await tried(), [{ from: "一", note: "割る：割れない ×3" }], "3回押しても1行");
    assert.equal(await hand(), "一休田上月", "手札は動かない");
    assert.equal(await page.locator("#meHand .tile.sel").count(), 1, "選びもそのまま");
    await page.click("#bBack");
    // 待ち時間中の Flip
    await page.evaluate(() => { const G = __KJ.game; G.me.cd.invert = G.now() + 5; __KJ.render(); });
    await pick("上");
    await page.evaluate(() => document.getElementById("bInvert").click());
    // 巡りの無い字の Cycle
    await page.click("#bBack"); await pick("休");
    await page.evaluate(() => document.getElementById("bCycle").click());
    // 読みの無い字の Same reading
    await page.click("#bBack"); await pick("月");
    await page.evaluate(() => document.getElementById("bHomo").click());
    await page.click("#bBack");
    // 引き直しを使いきった（5回まで。KJ-049）
    await page.evaluate(() => { const G = __KJ.game; G.me.redraws = 5; __KJ.render(); });
    assert.equal(await page.getAttribute("#bRedraw", "aria-disabled"), "true");
    await page.evaluate(() => document.getElementById("bRedraw").click());
    // 場から取れる枚数が無いのに取る
    await page.evaluate(() => { __KJ.game.me.redraws = 0; __KJ.render(); });
    await page.locator("#field .tile").first().click();
    const t1 = await tried();
    assert.deepEqual(t1.map((x) => x.note), ["割る：割れない ×3", "反転：待ち時間", "巡り：できない字", "同音：同じ読みの字がない", "引き直し：引き直しは5回まで", "取る：取れる枚数がない"]);
    assert.deepEqual(t1.map((x) => x.from).slice(0, 4), ["一", "上", "休", "月"], "使った札の欄に札");
    assert.equal(t1[5].from.length, 1, "取るは場の札");
    assert.equal(await hand(), "一休田上月", "どれも手札は動かない");
    assert.equal(await page.evaluate(() => __KJ.game.hintStreak), 0, "ヒントは数えない");
    assert.equal(await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ヒント").length), 0);
    // ログの頭の説明
    await page.evaluate(() => { window.__logText = __KJ.game.logText(); });
    assert.match(await page.evaluate(() => window.__logText), /# 手 .*ためした（放つ・くっつける・割る・反転・巡り・同音・取る・引き直しがはじかれた。並べてやめた並びも）/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじかれた操作もログに残す（KJ-041）：光っていない面に落とすと「ためした」（くっつく面つき）のあと「入れ替え」。くっつく面の無い札との入れ替えは残さない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "weak");
    await page.evaluate(() => { __KJ.game.me.cards = [..."十口休日"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false })); __KJ.row.length = 0; __KJ.render(); });
    const drag = async (from, to, rx, ry) => {
      await page.locator("#meHand").scrollIntoViewIfNeeded();
      const f = await readBox(page.locator("#meHand .tile", { hasText: from }).first());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: to }).first());
      const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2, x2 = tb.x + tb.width * rx, y2 = tb.y + tb.height * ry;
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
      await page.mouse.move(x2, y2, { steps: 4 });
      await page.mouse.up();
    };
    const rows = () => page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした" || e.op === "入れ替え").map((e) => [e.op, e.from.join(""), e.note]));
    await drag("十", "口", 0.5, 0.9); // 口 の下の面（光っていない）
    assert.deepEqual((await rows()).map((r) => r.slice(0, 2).join(":")), ["ためした:十口", "入れ替え:十口"]);
    const r0 = await rows();
    assert.equal(r0[0][2], "面でくっつける：その面ではくっつかない（くっつく面：上・中央）");
    // くっつく面の無い札との入れ替え（休 と 日）は、ためしたに残さない
    await drag("休", "日", 0.5, 0.5);
    assert.deepEqual((await rows()).map((r) => r[0]), ["ためした", "入れ替え", "入れ替え"]);
    assert.equal(await page.evaluate(() => __KJ.game.hintStreak), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("見た目（KJ-042。KJ-093 で新聞紙風）：紙の色の卓と太い罫線・札・ボタンの重さ3段（押せないときも文字が読める）・色の役割・点と残り時間が大きい・はじめる前は札の形の選択ボタン・375×700 に収まる", async () => {
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
    const ACCENT = "rgb(156, 59, 46)", PAPER = "rgb(232, 219, 180)";
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    // はじめる前：題に「モック」がない・ラジオはブラウザの青ではなく札の形。選んだものが弁柄の地に紙色の字
    assert.doesNotMatch(await page.textContent("#mastTitle"), /モック/); // KJ-109：見出し h1 は消した。題字（表紙）に「モック」が無い
    const lab = (v) => page.evaluate((val) => { const l = document.querySelector(`#opp input[value="${val}"], #pow input[value="${val}"]`).closest("label"), cs = getComputedStyle(l); return { bg: cs.backgroundColor, color: cs.color, edge: cs.borderTopWidth, op: getComputedStyle(l.querySelector("input")).opacity }; }, v);
    await page.check('#opp input[value="cpu"]');
    const on = await lab("cpu"), off = await lab("room");
    assert.equal(on.bg, ACCENT, "選んだものは弁柄の地");
    assert.equal(on.color, PAPER, "選んだものは紙色の字");
    assert.notEqual(off.bg, ACCENT);
    assert.equal(on.op, "0", "ブラウザのラジオは見せない");
    assert.ok(parseFloat(on.edge) >= 1, "札の形（縁がある）");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setup")).backgroundColor), PAPER, "卓は紙の色（暗い面はやめた）");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setup")).borderTopWidth), "3px", "上下に太い罫線");
    const host = (d) => page.evaluate((dis) => { const b = document.getElementById("bHost"); b.disabled = dis; const cs = getComputedStyle(b); return [cs.backgroundColor, cs.color]; }, d);
    const [hOn, hOff] = [await host(false), await host(true)];
    assert.notDeepEqual(hOn, hOff, "はじめる前でも、押せないボタンは見分けられる");
    assert.ok(ratio(hOff[1], hOff[0]) >= 4.5, "押せなくても文字が読める");
    await host(false);
    assert.ok(ratio(await page.evaluate(() => getComputedStyle(document.querySelector("#setup .gt")).color), PAPER) >= 4.5, "はじめる前の小さな字が読める");
    // 色の役割は :root の変数にある
    for (const v of ["--accent", "--join", "--gauge", "--hint", "--table", "--tile", "--edge"]) assert.ok((await page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n), v)).trim(), `${v} が :root にある`);
    await page.click("#start");
    await page.evaluate(() => {
      const G = __KJ.game; G.cpuTurn = () => null;
      G.me.cards = [..."上休十口日月天下"].map((c, i) => ({ id: 9600 + i, c, t: 0, fresh: false }));
      G.field = [..."山川玉"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
      __KJ.row.length = 0; __KJ.render();
    });
    // 卓は紙の色・上下は太い罫線。場と台が卓の中にある
    const table = await page.evaluate(() => { const e = document.querySelector(".table"), cs = getComputedStyle(e); return { bg: cs.backgroundColor, img: cs.backgroundImage, bw: cs.borderTopWidth, field: e.contains(document.getElementById("field")), row: e.contains(document.getElementById("row")), ops: e.contains(document.querySelector(".ops")) }; });
    assert.deepEqual(table, { bg: "rgba(0, 0, 0, 0)", img: "none", bw: "3px", field: true, row: true, ops: true }); // 卓の地は透かす（KJ-094：背景の記事とざらつきが卓の下にも続く）。下の紙は紙の色のまま
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), PAPER, "卓の下の紙は紙の色");
    // 札：細い縁（補助色）で札の色の地。影はない。角の印は墨色
    const tile = await page.evaluate(() => { const e = document.querySelector("#meHand .tile"), cs = getComputedStyle(e), mk = getComputedStyle(e.querySelector(".mk")); return { b: cs.borderBottomWidth, side: cs.borderLeftWidth, bc: cs.borderBottomColor, sc: cs.borderLeftColor, shadow: cs.boxShadow, bg: cs.backgroundColor, mk: mk.color }; });
    assert.equal(tile.b, "1px", "札の縁は細い（厚みの太い縁はやめた）"); assert.equal(tile.side, "1px");
    assert.equal(tile.bc, tile.sc, "縁は四辺とも同じ色");
    assert.equal(tile.bg, "rgb(246, 238, 214)", "札の色");
    assert.equal(tile.shadow, "none", "札に影はない");
    assert.equal(tile.mk, "rgb(42, 38, 34)", "角の印は墨色");
    assert.ok(ratio(tile.bg, PAPER) >= 1.1 && ratio(tile.sc, PAPER) >= 2, "札は紙の上で見分けられる（札の色と縁）");
    assert.equal(await page.evaluate(() => { const s = getComputedStyle(document.querySelector("#meTray .slot")); return [s.backgroundColor, s.borderTopStyle].join("|"); }), "rgba(232, 219, 180, 0.9)|dotted", "空きマスは点線の枠（中は紙の色を濃く敷く。背景の記事が透けない。KJ-094）");
    // 点と残り時間は大きな数字。補足は小さい
    const fs = await page.evaluate(() => ({ score: parseFloat(getComputedStyle(document.querySelector("#meScore .n")).fontSize), clock: parseFloat(getComputedStyle(document.querySelector("#clock .n")).fontSize), count: parseFloat(getComputedStyle(document.getElementById("meCount")).fontSize), tray: parseFloat(getComputedStyle(document.getElementById("trayHead")).fontSize) }));
    assert.ok(fs.score >= 26 && fs.clock >= 20, `点と残り時間が大きい（${fs.score}・${fs.clock}）`);
    assert.ok(fs.count <= 13 && fs.tray <= 12, "補足は小さい");
    assert.match(await page.textContent("#meScore"), /^0 点/);
    assert.equal((await page.textContent("#trayHead")).trim(), "ストック 0 / 8", "補足は短い");
    // ボタンの重さ3段：Play は群より大きく弁柄・群は同じ大きさ・Back と Redraw は枠も地もない文字だけ（待ち時間のゲージを除く）
    const sz = () => page.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; return { play: r("bRelease"), set: ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"].map(r) }; });
    const z = await sz();
    assert.ok(z.play[1] > z.set[0][1] && z.play[0] > z.set[0][0] * 1.5, `Play は大きい（${z.play}・${z.set[0]}）`);
    assert.ok(new Set(z.set.map((s) => s[1])).size === 1, "群は同じ高さ");
    const quiet = await page.evaluate(() => ["bBack", "bRedraw"].map((id) => { const cs = getComputedStyle(document.getElementById(id)); return [cs.backgroundColor, cs.borderBottomWidth]; }));
    assert.deepEqual(quiet, [["rgba(0, 0, 0, 0)", "1px"], ["rgba(0, 0, 0, 0)", "1px"]], "Back・Redraw は地なし・枠線だけ（KJ-078。Back は背景の上の墨色の線）");
    // 文字が読める明暗差：押せるとき・押せないとき・待ち時間のゲージ（満ちた側とまだの側の両方）で 4.5 以上
    const contrasts = () => page.evaluate(() => [...document.querySelectorAll(".ops button")].map((b) => {
      const cs = getComputedStyle(b), bef = getComputedStyle(b, "::before");
      return { id: b.id, off: b.disabled || b.getAttribute("aria-disabled") === "true", color: cs.color, bg: cs.backgroundColor, gauge: b.classList.contains("cd") && parseFloat(bef.width) > 0 ? (() => { // 紙の上では薄く敷く（::before の不透明度）ので、地の色と混ぜた色で見る（KJ-093）
        const g = bef.backgroundColor.match(/[\d.]+/g).map(Number), u = (cs.backgroundColor === "rgba(0, 0, 0, 0)" ? getComputedStyle(document.body).backgroundColor : cs.backgroundColor).match(/[\d.]+/g).map(Number), o = parseFloat(bef.opacity);
        return `rgb(${[0, 1, 2].map((i) => Math.round(g[i] * o + u[i] * (1 - o))).join(", ")})`; })() : null, edge: cs.borderBottomColor };
    }));
    const OPS5 = ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"]; // KJ-099：卓の操作5つの「押せない」は薄い字（押せない部品は明暗差の決まりの外）。ほかのボタンは今まで通り 4.5 以上
    const check = (rows, label) => { for (const r of rows) { if (r.off && [...OPS5, "bRelease"].includes(r.id) && !r.gauge) continue; /* KJ-117：Play の押せないも操作5つと同じ薄い字 */ const under = r.bg === "rgba(0, 0, 0, 0)" ? PAPER : r.bg; assert.ok(ratio(r.color, under) >= 4.5, `${label} ${r.id} 文字と地（${r.color} / ${under}）`); if (r.gauge) assert.ok(ratio(r.color, r.gauge) >= 4.5, `${label} ${r.id} 文字とゲージ（${r.gauge}）`); } };
    let rows = await contrasts();
    assert.ok(rows.every((r) => r.off), "何も選ばないと（卓のボタンは）押せない");
    check(rows, "押せないとき");
    for (const r of rows.filter((q) => !["bBack", "bRedraw"].includes(q.id))) assert.notEqual(r.bg, "rgba(0, 0, 0, 0)", `${r.id} 押せなくても地が残る（KJ-099：操作5つは紙の地。Play は濃い地）`);
    await page.locator("#meHand .tile", { hasText: "上" }).first().click();
    rows = await contrasts();
    assert.ok(rows.some((r) => !r.off && r.id === "bInvert"), "上 を選ぶと Flip が押せる");
    check(rows, "押せるとき");
    // Back は卓の外（KJ-090）：背景の上で読める（押せるとき 4.5 以上）
    const bkc = await page.evaluate(() => ({ color: getComputedStyle(document.getElementById("bBack")).color, bg: getComputedStyle(document.body).backgroundColor, off: document.getElementById("bBack").disabled }));
    assert.equal(bkc.off, false, "札を選ぶと Back が押せる");
    assert.ok(ratio(bkc.color, bkc.bg) >= 4.5, `押せるとき bBack 文字と地（${bkc.color} / ${bkc.bg}）`);
    const enabled = rows.find((r) => r.id === "bInvert"), disabled = rows.find((r) => r.off && !["bBack", "bRedraw", "bRelease"].includes(r.id)); // KJ-117：Play の押せないは操作5つと同じ札の地なので、比べるのは操作5つの中
    assert.ok(disabled, "押せないボタンがある");
    assert.notEqual(enabled.bg, disabled.bg, "押せるときと押せないときが見分けられる");
    // KJ-099：押せない＝紙の地に薄い字（地は濃くしない）。押せるのと地か字の濃さがはっきり違う（押せる字は上で 4.5 以上を見た）
    assert.match(disabled.color, /^rgba\(42, 38, 34, 0\.3[0-9]*\)$/, "押せない操作の字は墨の不透明度 0.35");
    assert.notEqual(enabled.color, disabled.color, "押せると押せないで、字の色も違う")
    await page.click("#bInvert");
    await page.evaluate(() => { const G = __KJ.game; G.me.cd.invert = G.now() + __KJ.data.rules.cooldown_sec.invert / 2; __KJ.render(); });
    await page.waitForTimeout(350);
    rows = await contrasts();
    const w = rows.find((r) => r.id === "bInvert");
    assert.ok(w.off && w.gauge, "待ち時間：押せず、ゲージが出ている");
    check(rows, "待ち時間のゲージ");
    // 色の役割：弁柄は選んだ札の縁・Play・あなたの印だけ。取る・合体・ヒントは別の色
    const reds = await page.evaluate((A) => [...document.querySelectorAll("#game *")].filter((e) => { const cs = getComputedStyle(e); return cs.color === A || cs.backgroundColor === A || cs.borderTopColor === A && parseFloat(cs.borderTopWidth) > 0; }).map((e) => e.id || e.className).filter((n) => typeof n === "string"), ACCENT);
    for (const n of reds) assert.match(n, /\bsel\b|bRelease|^$|ord|^main|\bmain\b/, `弁柄を使っているのは選んだ札と Play だけ（${n}）`);
    assert.ok(reds.some((n) => /sel/.test(n)), "選んだ札は弁柄の縁");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("takes")).color), "rgb(42, 38, 34)", "取る文字は弁柄ではなく墨");
    // 375×700 に収まる
    const geo = await page.evaluate(() => { const r = document.querySelector(".table").getBoundingClientRect(), m = document.getElementById("meTray").getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, tableBottom: r.bottom, trayBottom: m.bottom }; });
    assert.ok(geo.sw <= 375, "横スクロールがない");
    assert.ok(geo.trayBottom <= 700, `ストックまで 375×700 に収まる（${geo.trayBottom}）`);
    if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-kj042.png") });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("取る番の見た目（KJ-046）：場の札が金の太い枠・見出しも金・文は卓の頭に1行・取りきったら戻る。大＋丶 は 太 と 犬（選ぶ・面で分かれる）", async () => {
    const GOLD = "rgb(217, 154, 0)";
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, null);
    await page.evaluate(() => {
      const G = __KJ.game; G.cpuTurn = () => null;
      G.me.cards = [..."丶大上休十口日月"].map((c, i) => ({ id: 9600 + i, c, t: 0, fresh: false }));
      G.field = [..."山川玉"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
      __KJ.row.length = 0; __KJ.render();
    });
    const look = () => page.evaluate(() => {
      const f = [...document.querySelectorAll("#field .tile")].map((e) => { const cs = getComputedStyle(e); return { bc: cs.borderTopColor, bw: parseFloat(cs.borderTopWidth) }; });
      const h = getComputedStyle(document.querySelector("#fieldSide .side-head b")).color;
      const tk = document.getElementById("takes"), r = tk.getBoundingClientRect(), tb = document.querySelector(".table").getBoundingClientRect(), fd = document.getElementById("field").getBoundingClientRect();
      return { f, h, text: tk.textContent, lines: Math.round(r.height / parseFloat(getComputedStyle(tk).lineHeight || 20)), h1: r.height, over: tk.scrollWidth > tk.clientWidth, topIn: r.top >= tb.top && r.bottom <= fd.top, right: r.right };
    });
    let s = await look();
    assert.ok(s.f.every((x) => x.bc !== GOLD), "取る番でないときは金の枠ではない");
    assert.notEqual(s.h, GOLD, "取る番でないときは見出しは金ではない");
    assert.equal(s.text, "");
    const yBefore = await page.evaluate(() => document.getElementById("field").getBoundingClientRect().top);
    await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
    s = await look();
    assert.ok(s.f.length === 3 && s.f.every((x) => x.bc === GOLD && x.bw >= 3), `取る番は場の札が金の太い枠（${JSON.stringify(s.f)}）`);
    assert.equal(s.h, GOLD, "場の見出しも金");
    assert.match(s.text, /場から あと 2 枚 取る/);
    assert.ok(s.h1 <= 24 && !s.over, `文は1行で折り返さない（高さ${s.h1}）`);
    assert.ok(s.topIn, "文は場の上（卓の頭）にある");
    assert.ok(s.right <= 375, "文が画面の横に収まる");
    assert.equal(await page.evaluate(() => document.getElementById("field").getBoundingClientRect().top), yBefore, "文が出ても場は動かない");
    const reds = await page.evaluate(() => [...document.querySelectorAll("#field .tile")].map((e) => { const cs = getComputedStyle(e); return cs.borderTopColor + cs.boxShadow; }).join("|"));
    assert.doesNotMatch(reds, /156, 59, 46/, "弁柄は使わない");
    if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, "-kj046.png") });
    await page.locator("#field .tile").nth(0).click();
    await page.locator("#field .tile").nth(1).click();
    s = await look();
    assert.ok(s.f.every((x) => x.bc !== GOLD), "取りきったら元に戻る（枠）");
    assert.notEqual(s.h, GOLD, "取りきったら元に戻る（見出し）");
    assert.equal(s.text, "");
    // Join：大・丶 を並べて選ぶと 太 か 犬
    await page.evaluate(() => { __KJ.game.me.cards = [..."大丶上休十口日月"].map((c, i) => ({ id: 9800 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.locator("#meHand .tile", { hasText: "大" }).click();
    await page.locator("#meHand .tile", { hasText: "丶" }).click();
    await page.click("#bJoin");
    assert.equal(await page.locator("#choices.on button").count(), 2, "太 と 犬 の2つを選べる");
    assert.deepEqual(await page.locator("#choices.on button").allTextContents(), ["太", "犬"]);
    await page.locator("#choices.on button", { hasText: "犬" }).click();
    assert.equal(await page.locator("#meHand .tile", { hasText: "犬" }).count(), 1, "犬 ができる");
    assert.equal(await page.locator("#meHand .tile", { hasText: "太" }).count(), 0);
    // 犬 を割ると 大 と 丶
    assert.equal(await page.locator("#row .tile").count(), 1, "できた字は選ばれたまま台にいる");
    await page.click("#bSplit");
    assert.equal(await page.locator("#meHand .tile", { hasText: "大" }).count(), 1);
    assert.equal(await page.locator("#meHand .tile", { hasText: "丶" }).count(), 1);
    // 面：丶 を 大 の下に落とすと 太、右に落とすと 犬
    const drop = async (rx, ry) => {
      await page.evaluate(() => { __KJ.game.me.cards = [..."丶大上休十口日月"].map((c, i) => ({ id: 9900 + i + Math.floor(Math.random() * 1e5) * 10, c, t: 0, fresh: false })); __KJ.render(); });
      await page.locator("#meHand").scrollIntoViewIfNeeded();
      const f = await readBox(page.locator("#meHand .tile", { hasText: "丶" }).first());
      const tb = await readBox(page.locator("#meHand .tile", { hasText: "大" }).first());
      const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2, x2 = tb.x + tb.width * rx, y2 = tb.y + tb.height * ry;
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
      await page.mouse.move(x2, y2, { steps: 4 });
      await page.mouse.up();
      return page.locator("#meHand > .tile").evaluateAll((els) => els.map((e) => e.title).join(""));
    };
    assert.match(await drop(0.5, 0.88), /太/, "下の面に落とすと 太");
    assert.match(await drop(0.9, 0.5), /犬/, "右の面に落とすと 犬");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  // 点の演出（KJ-050。作者 2026-11-23。D-065。中身は仮）
  const tapC = async (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
  await t.test("点の演出：2字は小さく・4字（四字熟語）は大きく＋光の輪。点の数字はカウントアップして、着いた点になる。演出のあいだも操作できる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    await tapC(page, "休"); await tapC(page, "日");
    await page.click("#bRelease");
    // 2字：+3（段1）。字が飛ぶ札と +3 が出る
    await page.waitForSelector("#fxPts .pf.gain.t1", { state: "attached" });
    assert.equal(await page.locator("#fxPts .pf.chip").count() + await page.locator("#fxPts .pf.gain.t1").count() >= 2, true, "放った字（札）と +3 が出る");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("fxPts")).pointerEvents), "none", "演出の層は操作を止めない");
    const fs1 = await page.locator("#fxPts .pf.gain.t1").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    // 演出のあいだも操作できる（取る番：場の札を押せる）
    await page.locator("#field .tile").nth(0).click();
    assert.equal(await page.locator("#meHand .tile", { hasText: "山" }).count(), 1, "演出のあいだも場から取れる");
    await page.waitForFunction(() => /^3 点/.test(document.getElementById("meScore").textContent), null, { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4000 });
    assert.equal(await page.locator("#fxPts .pf.ring").count(), 0);
    await page.locator("#field .tile").nth(1).click();
    // 4字（四字熟語）：段3＝さらに大きく＋卓の上の光の輪
    await page.evaluate(() => { const G = __KJ.game; G.me.score = 0; G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); }); // 50点に届かない（届くと終わりの画面になる）ように 0 点から
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 });
    for (const ch of "天上天下") await tapC(page, ch);
    await page.click("#bRelease");
    await page.waitForSelector("#fxPts .pf.gain.t3", { state: "attached" });
    const fs3 = await page.locator("#fxPts .pf.gain.t3").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(fs3 > fs1, `4字の方が大きい（${fs1}→${fs3}）`);
    await page.waitForSelector("#fxPts .pf.ring", { state: "attached", timeout: 3000 });
    await page.waitForFunction(() => /^48 点/.test(document.getElementById("meScore").textContent), null, { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("点の演出：3字は 少し大きく光る（段2）。相手（CPU）の欄の点も小さく同じ動き", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."日本語十口休上"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false })); G.me.score = 0; __KJ.render(); });
    for (const ch of "日本語") await tapC(page, ch);
    await page.click("#bRelease");
    await page.waitForSelector("#fxPts .pf.gain.t2", { state: "attached" });
    assert.match(await page.textContent("#fxPts .pf.gain.t2"), /^\+9$/);
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 });
    // 相手：点が入る（放った言葉は届いていない形）。自分の欄より小さい
    await page.evaluate(() => { __KJ.game.cpu.score += 3; __KJ.render(); });
    await page.waitForSelector("#fxPts .pf.gain", { state: "attached" });
    const me = 24, cpu = await page.locator("#fxPts .pf.gain").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(cpu <= 19 && cpu < me, `相手の欄は小さい（${cpu}）`);
    await page.waitForFunction(() => /^3 点/.test(document.getElementById("cpuScore").textContent), null, { timeout: 4000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("点の演出：引き直しで減る（-〇 が出て点が揺れる）。値段が大きいほど大きい。マイナスになったら点は灰色", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    await holdRedraw(page); // 1回目は0点：演出なし
    assert.equal(await page.locator("#fxPts .pf").count(), 0, "0点の引き直しでは出ない");
    await holdRedraw(page); // 2回目 -5
    await page.waitForSelector("#fxPts .pf.loss", { state: "attached" });
    assert.equal(await page.textContent("#fxPts .pf.loss"), "-5");
    const fsA = await page.locator("#fxPts .pf.loss").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(await page.locator("#meScore .n").evaluate((e) => e.getAnimations().length > 0), "点の数字が揺れる");
    assert.equal(await page.locator("#meScore").evaluate((e) => e.classList.contains("neg")), true, "マイナスの点は灰色の印（neg）");
    const col = await page.locator("#meScore .n").evaluate((e) => getComputedStyle(e).color);
    assert.equal(col, "rgb(98, 90, 80)", "点は灰色（--lose。KJ-093 で紙の上でも読める濃さに）");
    assert.match(await page.textContent("#meScore"), /^-5 点/);
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 });
    await holdRedraw(page); await holdRedraw(page); // -10・-15
    await page.waitForSelector("#fxPts .pf.loss", { state: "attached" });
    const fsB = await page.locator("#fxPts .pf.loss").last().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(fsB > fsA, `値段が大きいほど大きい（${fsA}→${fsB}）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("点の演出：スマホ幅でも相手が放った字は相手の欄から飛ぶ（画面の隅からではない）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById("cpuHand")).display), "none", "CPU 対戦では 375px でも相手の上の段を見せる（KJ-092）");
    await page.evaluate(() => { const G = __KJ.game; G.events.push({ type: "release", who: G.cpu.name, text: "本日", pts: 3 }); G.cpu.score += 3; __KJ.drain(); __KJ.render(); });
    await page.waitForSelector("#fxPts .pf.chip", { state: "attached" });
    const b = await page.locator("#fxPts .pf.chip").boundingBox();
    const cs = await page.evaluate(() => { const r = document.getElementById("cpuSide").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    assert.ok(b.y > 20 && b.y >= cs.top - 40 && b.y <= cs.bottom + 20, `相手の欄の所から飛ぶ（y=${b.y}・欄 ${cs.top}〜${cs.bottom}）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("点の演出：勝ちが決まったら終わりの画面の上には出ない／数えている途中で点が変わっても、いまの点で止まる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    await page.evaluate(() => { __KJ.game.me.score = 47; __KJ.render(); });
    await page.waitForTimeout(100);
    await tapC(page, "休"); await tapC(page, "日");
    await page.click("#bRelease"); // 50点で勝ち
    await page.waitForSelector("#endShow.on", { timeout: 4000 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#fxPts .pf").count(), 0, "終わりの画面の上に演出は出ない");
    await ctx.close();
    const r2 = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    const p2 = r2.page;
    await tapC(p2, "休"); await tapC(p2, "日");
    await p2.click("#bRelease");
    await p2.waitForTimeout(600); // 数えている途中
    await p2.evaluate(() => { __KJ.game.me.score = -2; __KJ.render(); });
    await p2.waitForFunction(() => /^-2 点/.test(document.getElementById("meScore").textContent), null, { timeout: 4000 });
    await p2.waitForTimeout(1200);
    assert.match(await p2.textContent("#meScore"), /^-2 点/, "古い点に戻らない");
    assert.deepEqual([...errors, ...r2.errors], []);
    await r2.ctx.close();
  });
  await t.test("点の演出：字が飛んでいるあいだに試合が終わったら、光の輪などの続きは出ない", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, true);
    await page.evaluate(() => { const G = __KJ.game; G.cpu.score = 40; __KJ.render(); });
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 }); // 40点に動いた分の演出が終わるまで
    await page.evaluate(() => { const G = __KJ.game; G.events.push({ type: "release", who: G.cpu.name, text: "一日一日", pts: 12 }); G.cpu.score += 12; __KJ.drain(); __KJ.render(); });
    await page.waitForSelector("#fxPts .pf.chip", { state: "attached" });
    await page.evaluate(() => { window.__late = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (__KJ.game.over) window.__late.push(n.className); }).observe(document.getElementById("fxPts"), { childList: true }); });
    await page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 1; G.tick(); __KJ.drain(); __KJ.render(); }); // 飛んでいる途中で終わる
    assert.equal(await page.evaluate(() => __KJ.game.over), true);
    assert.match(await page.textContent("#cpuScore"), /^52 点/, "終わったあと卓の相手の欄が本当の点（数えている途中の古い点のままにならない）");
    await page.waitForTimeout(1000); // 飛ぶ時間（0.42秒）のあと
    assert.match(await page.textContent("#cpuScore"), /^52 点/, "あとから古い点に戻らない");
    assert.deepEqual(await page.evaluate(() => window.__late), [], "終わったあとに、輪などを新しく出さない");
    assert.equal(await page.locator("#fxPts .pf").count(), 0, "終わりのあとに演出が残らない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("点の演出：動きを減らす設定では数字（+〇・-〇）を出すだけで、動かさない（飛ばない・カウントアップしない・ポンも揺れもしない）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, null, false); // 既定は reduce
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await tapC(page, "休"); await tapC(page, "日");
    await page.click("#bRelease");
    assert.match(await page.textContent("#meScore"), /^3 点/, "カウントアップせず、すぐ3点");
    assert.equal(await page.textContent("#fxPts .pf.gain"), "+3", "+3 は出る");
    assert.equal(await page.locator("#fxPts .pf.chip").count(), 0, "字は飛ばない");
    assert.equal(await page.locator("#fxPts .pf.ring").count(), 0, "光の輪は出ない");
    assert.equal(await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && (a.effect.target.closest("#fxPts") || a.effect.target.closest("#meScore"))).length), 0, "演出の動きは無い");
    await page.locator("#field .tile").nth(0).click(); await page.locator("#field .tile").nth(1).click();
    await holdRedraw(page); await holdRedraw(page); // 0点・-5
    assert.equal(await page.textContent("#fxPts .pf.loss"), "-5", "-5 は出る");
    assert.equal(await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && (a.effect.target.closest("#fxPts") || a.effect.target.closest("#meScore"))).length), 0, "揺れない");
    await page.waitForFunction(() => document.getElementById("fxPts").childElementCount === 0, null, { timeout: 4500 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
