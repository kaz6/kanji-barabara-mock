// 画面のテスト（Playwright の Chromium があるときだけ。ないときは skip）
// 台に札を置いても手札と場の位置が動かないこと、「並べる順が逆」、放つ→場から取る、引き直し、ログ・ログをコピー（KJ-003）
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* 入っていない */ }

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

const skip = chromium ? false : "Playwright が入っていない";

async function open(browser, url, vp, opponent, layout = "table") {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  if (opponent) await page.check(`#opp input[value="${opponent}"]`);
  await page.check(`#lay input[value="${layout}"]`); // 既存の画面テストは「台に並べる」で見る。手札で選ぶは KJ-005 の下のテスト
  await page.click("#start");
  await page.locator("#field .tile").first().click(); // はじめの1枚（KJ-013。下の専用テストで詳しく見る）。選ぶと時間が動き出す
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
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  for (const vp of [{ width: 760, height: 1100, name: "広い画面" }, { width: 375, height: 900, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：台に置いても手札と場が動かない。放つ→場から取る→ログ`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp);
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      const hand0 = await pos("#meHand > *"), field0 = await pos("#field > *");
      const tap = async (ch) => page.locator("#meHand .tile", { hasText: ch }).first().click();
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
      assert.match(await page.textContent("#takes"), /2 枚取れる/);
      assert.equal(await pos("#field > *"), field0);
      // 取ったあとのマスには山から無作為に字が出る（同じ字が出ることもある）ので、字ではなくマスの位置（山=1番目・川=2番目）で押す
      await page.locator("#field .tile").nth(0).click();
      await page.locator("#field .tile").nth(1).click();
      assert.equal(await page.textContent("#takes"), "");
      assert.equal(await page.locator("#meHand .tile", { hasText: "山" }).count(), 1, "山 が手札に来た");
      assert.equal(await pos("#field > *"), field0, "取ったあとも場の位置は同じ");
      assert.match(await page.textContent("#released"), /休日.*\+3点/);
      // 引き直し（3点しかない → 30秒待ち）
      await page.click("#bRedraw");
      assert.match(await page.textContent("#cdRedraw"), /待ち \d+s/);
      // ログ
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /^# 漢字版（仮）モック ログ/);
      assert.match(log, /# 仮置き 場=3枚 最初の手札=7枚 手札の上限=8枚＋ストック8枚/);
      assert.match(log, /# 相手 とても弱い（CPU は 30〜45秒に1回動く/);
      assert.match(log, /\tためした\t口 十\t\t0\t.*\t並べる順が逆/);
      assert.match(log, /\tくっつける\t十 口\t古\t/);
      assert.match(log, /\t放つ\t休 日\t\t3\t3\t0\t/);
      assert.match(log, /\t取る\t山\t山\t0\t/);
      assert.match(log, /\t引き直し\t\t\t0\t.*30秒待つ/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await t.test("相手の選び方：初期値は とても弱い。選べる3つが並ぶ", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#opp label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["ひとりで", "とても弱い", "いまの強さ"]);
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "weak");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak");
    assert.equal(await page.isVisible("#cpuSide"), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：4つが上から並び、初期値は 相手=とても弱い・レベル=N4・時間=10分・並べ方=台に並べる。下に「はじめる」", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.isVisible("#setup"), true);
    assert.equal(await page.isVisible("#game"), false, "遊ぶ画面はまだ出ない");
    const ys = await page.evaluate(() => ["opp", "lvl", "tim", "lay", "start"].map((id) => document.getElementById(id).getBoundingClientRect().top));
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, "相手・レベル・時間・並べ方・はじめる の順に上から並ぶ");
    const labels = (id) => page.locator(`#${id} label`).allTextContents().then((a) => a.map((x) => x.trim()));
    assert.deepEqual(await labels("opp"), ["ひとりで", "とても弱い", "いまの強さ"]);
    assert.deepEqual(await labels("lvl"), ["N5", "N4"]);
    assert.deepEqual(await labels("tim"), ["5分", "10分", "15分"]);
    assert.deepEqual(await labels("lay"), ["手札で選ぶ", "台に並べる"]);
    for (const [id, v] of [["opp", "weak"], ["lvl", "N4"], ["tim", "600"], ["lay", "table"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
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
      assert.equal(await page.evaluate(() => __KJ.game.picking), true);
      await page.locator("#field .tile").first().click();
      const left = await page.evaluate(() => __KJ.game.timeLeft());
      assert.ok(left > sec - 3 && left <= sec, `残り ${left} 秒（${sec} 秒で始まる）`);
      assert.match(await page.textContent("#clock"), new RegExp(`^残り ${Math.floor(sec / 60)}:`));
      await page.click("#bLog");
      assert.match(await page.inputValue("#logText"), new RegExp(`# 時間 ${sec / 60}分\n`));
      await page.click("#bLog");
      await page.click("#bSetup");
    }
    // 4つ選んで、ログの頭に4つとも出る
    await page.check('#opp input[value="solo"]');
    await page.check('#lvl input[value="N5"]');
    await page.check('#tim input[value="300"]');
    await page.check('#lay input[value="hand"]');
    await page.click("#start");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /# レベル N5\n# 相手 ひとりで（CPU なし。場の取り合いなし。50点では終わらず、5分たったら/);
    assert.match(log, /# 時間 5分\n# 並べ方 手札で選ぶ（はじめたとき/);
    // 4つが端末に残る
    assert.deepEqual(await page.evaluate(() => ["kj-opponent", "kj-level", "kj-time", "kj-layout"].map((k) => localStorage.getItem(k))), ["solo", "N5", "300", "hand"]);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    for (const [id, v] of [["opp", "solo"], ["lvl", "N5"], ["tim", "300"], ["lay", "hand"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, `${id} を覚えている`);
    // 知らない値が残っていても初期値で動く
    await page.evaluate(() => { localStorage.setItem("kj-time", "7"); localStorage.setItem("kj-opponent", "ばか"); });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#tim input:checked").getAttribute("value"), "600");
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "weak");
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
    for (const [id, v] of [["opp", "weak"], ["lvl", "N4"], ["tim", "600"], ["lay", "table"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
    await page.check('#tim input[value="900"]'); // 選んでも壊れない（覚えないだけ）
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.timeLimit), 900);
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：「もう一度」は同じ設定ですぐ始まる。遊ぶ画面では並べ方だけ変えられる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, "normal", "hand");
    await page.click("#bSetup");
    await page.check('#lvl input[value="N5"]');
    await page.check('#tim input[value="300"]');
    await page.check('#opp input[value="solo"]');
    await page.click("#start");
    assert.equal(await page.isVisible("#setup"), false);
    for (const id of ["opp", "lvl", "tim"]) assert.equal(await page.isVisible("#" + id), false, `${id} は遊んでいる途中では変えられない`);
    assert.equal(await page.isVisible("#layNow"), true, "並べ方の切り替えは残る");
    await page.check('#layNow input[value="table"]');
    await page.locator("#field .tile").first().click(); // はじめの1枚
    // 終わらせて もう一度
    await page.evaluate(() => { __KJ.game.endsAt = __KJ.game.now() - 1; });
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("ひとりで "));
    await page.click("#again");
    const g = await page.evaluate(() => ({ lv: __KJ.game.level, t: __KJ.game.timeLimit, o: __KJ.game.opponent, l: __KJ.game.layout, over: __KJ.game.over, picking: __KJ.game.picking }));
    assert.deepEqual(g, { lv: "N5", t: 300, o: "solo", l: "table", over: false, picking: true }, "同じ設定（並べ方は途中で変えた値）で新しく始まる");
    assert.equal(await page.isVisible("#setup"), false);
    assert.equal(await page.textContent("#msg"), "最初の1枚を場から選ぶ（時間は止まっています）");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("レベル（KJ-006）：初期値は N4。N5 を選ぶと字と語が減り、ログの頭に出る。端末に覚える", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#lvl label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["N5", "N4"]);
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
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N4");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめの1枚：選ぶまで時間は止まり操作できない。選ぶと8枚になり時間が動き出す。ストックに部品が1枚入っている。ログに「最初の1枚」", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await page.check('#opp input[value="normal"]');
    await page.check('#lay input[value="table"]');
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.picking), true);
    assert.match(await page.textContent("#msg"), /最初の1枚を場から選ぶ/);
    assert.equal(await page.locator("#meHand .tile").count(), 7, "最初の手札は7枚");
    assert.equal(await page.locator("#meTray .tile").count(), 1, "ストックに部品が1枚");
    assert.ok(await page.evaluate(() => __KJ.game.me.cards.find((x) => x.tray) && !__KJ.tables.CHARS.has(__KJ.game.me.cards.find((x) => x.tray).c)), "山に無い部品");
    assert.equal(await page.evaluate(() => document.getElementById("field").classList.contains("can")), true);
    for (const id of ["bRelease", "bSplit", "bJoin", "bRedraw"]) assert.equal(await page.locator("#" + id).isDisabled(), true, id);
    // 手札をタップしても台に並ばない
    await page.locator("#meHand .tile").first().click();
    assert.equal(await page.evaluate(() => __KJ.row.length), 0);
    // 時間は止まっている
    const left0 = await page.evaluate(() => __KJ.game.timeLeft());
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => __KJ.game.timeLeft()), left0);
    // ログは はじめ だけ（手札しだいで「動けない」の行が付くことはある）。手札のタップや時間では増えない
    assert.deepEqual(await page.evaluate(() => __KJ.game.log.map((e) => e.op).filter((o) => o !== "はじめ" && o !== "動けない")), []);
    // 場の1枚を選ぶ
    await page.locator("#field .tile").first().click();
    assert.equal(await page.evaluate(() => __KJ.game.picking), false);
    assert.equal(await page.locator("#meHand .tile").count(), 8, "最初の1枚で8枚");
    assert.equal(await page.evaluate(() => __KJ.game.cpu.cards.filter((x) => !x.tray).length), 8, "CPU も1枚取った");
    assert.ok(await page.evaluate(() => __KJ.game.timeLeft()) < left0 + 0.01);
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /最初の1枚/);
    assert.match(log, /# 仮置き はじまり：最初の手札7枚のあと、場から1枚だけ選んで取る/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ひとりで：CPU が消える。50点でも終わらず、5分で終わって点と自己ベストを出す。ログの頭に相手", async () => {
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
    assert.match(await page.textContent("#msg"), /ひとりで 51 点（自己ベスト更新）/);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-solo-best")), "51");
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    // もう一度（同じ設定＝ひとりで）：低い点なら 自己ベスト 51 点 を出す
    await page.click("#again");
    await page.locator("#field .tile").first().click(); // はじめの1枚
    await page.evaluate(() => { const G = __KJ.game; G.me.score = 3; G.endsAt = G.now() - 1; });
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("ひとりで 3 点"));
    assert.match(await page.textContent("#msg"), /（自己ベスト 51 点）/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ひとりで：localStorage が使えなくても終われる（自己ベストを出さないだけ）", async () => {
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
      // 割ってできた 人 木 は台に出る。手札側の 人 と、あふれた 木 のマスが点線で残る
      assert.equal(await page.locator("#meTray .slot.held").count(), 1, "あふれた1枚が置き場に入る");
      assert.equal(await page.locator("#meHand .slot.held").count(), 1);
      assert.equal(await page.evaluate(() => __KJ.game.me.cards.filter((x) => x.tray).map((x) => x.c).join("")), "木");
      assert.equal(await page.evaluate(() => __KJ.game.me.cards.length), 9);
      assert.equal(await pos("#meHand > *"), hand0);
      assert.equal(await pos("#meTray > *"), tray0);
      assert.equal(await pos("#field > *"), field0);
      // 置き場の札もタップして台に戻し・並べられる
      await page.locator("#meTray .slot.held").click();
      assert.equal(await page.locator("#meTray .tile").count(), 1, "台から置き場へ戻った");
      assert.equal(await page.locator("#row .tile").count(), 1);
      await page.locator("#meTray .tile").click();
      assert.equal(await page.locator("#row .tile").count(), 2);
      assert.equal(await pos("#meTray > *"), tray0, "置いても置き場は動かない");
      // 手札が8枚のときは場から取れない。台に置いた札は手札に数えない（台は一時置き場。KJ-013）ので、台に置くと取れる
      await page.click("#bBack");
      await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8);
      assert.match(await page.textContent("#takes"), /手札がいっぱい/);
      await page.locator("#meHand .tile").first().click();
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 7, "台の札は数えない");
      assert.match(await page.textContent("#takes"), /取れる（タップ）/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }


  // ---------- KJ-005：手札で選ぶ・入れ替え・切り替え ----------
  for (const vp of [{ width: 760, height: 1100, name: "広い画面" }, { width: 375, height: 900, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：手札で選ぶ。色が変わり選んだ順の数字が出る。台は出ない。放つ・割る・くっつけるが台と同じ結果。外せる`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null, "hand");
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      const hand0 = await pos("#meHand > *");
      const tile = (ch) => page.locator("#meHand .tile", { hasText: ch }).first();
      assert.equal(await page.isVisible("#row"), false, "台は出さない");
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
      await page.click("#bRelease"); // 押せるが、はじかれる
      assert.match(await page.textContent("#msg"), /1字では放てない（2字以上の言葉）/);
      assert.match(await page.textContent("#meScore"), /^0 点/);
      assert.equal(await page.locator("#meHand .tile.sel").count(), 1, "札は選んだまま");
      await page.click("#bBack");
      assert.equal(await page.locator("#meHand .tile.sel").count(), 0);
      // 放つ・割る・くっつけるがログに残る。頭に並べ方
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /# 並べ方 手札で選ぶ（はじめたとき/);
      assert.match(log, /\tくっつける\t十 口\t古\t/);
      assert.match(log, /\t割る\t休\t人 木\t/);
      assert.doesNotMatch(log, /\t放つ\t日\t/, "1字は放てないので 放つ の行はない");
      assert.match(log, /\tためした\t日\t\t0\t.*1字では放てない（2字以上の言葉）/);
      assert.match(log, /\tためした\t口 十\t\t0\t.*並べる順が逆/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    await t.test(`${vp.name}：切り替え。いつでも戻せる。選んだ札は引き継ぐ。端末に覚える。ログに残る`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null, "hand");
      const tile = (ch) => page.locator("#meHand .tile", { hasText: ch }).first();
      await tile("休").click(); await tile("日").click();
      // 台に並べるへ：選んだ札が台に並ぶ
      await page.check('#layNow input[value="table"]');
      assert.equal(await page.isVisible("#row"), true);
      assert.match(await page.textContent("#row"), /^休.*日/);
      assert.equal(await page.locator("#meHand .slot.held").count(), 2);
      // 手札で選ぶへ戻す
      await page.check('#layNow input[value="hand"]');
      assert.equal(await page.isVisible("#row"), false);
      assert.equal(await page.locator("#meHand .tile.sel").count(), 2);
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), "hand");
      await page.check('#layNow input[value="table"]');
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), "table");
      // 再読み込みしても覚えている
      await page.reload();
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      assert.equal(await page.locator("#lay input:checked").getAttribute("value"), "table");
      // 消して読み込み直すと初期値（台に並べる。追記 P-007 で手札で選ぶから戻した）
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      assert.equal(await page.locator("#lay input:checked").getAttribute("value"), "table");
      // 遊んでいる最中の切り替えがログに出る
      await page.check('#lay input[value="hand"]');
      await page.click("#start");
      assert.equal(await page.locator("#layNow input:checked").getAttribute("value"), "hand", "遊ぶ画面の切り替えにも同じ値");
      await page.check('#layNow input[value="table"]');
      await page.click("#bLog");
      assert.match(await page.inputValue("#logText"), /\t並べ方\t\t\t0\t.*台に並べるに切り替え/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });

    await t.test(`${vp.name}：入れ替え。札を引きずって別の札の上で離すと位置が替わる（どちらの並べ方でも。指一本）。ただのタップは選ぶだけ`, async () => {
      for (const layout of ["hand", "table"]) {
        const { ctx, page, errors } = await open(browser, url, vp, null, layout);
        const order = () => page.locator("#meHand > *").evaluateAll((els) => els.map((e) => e.classList.contains("tile") ? e.title : "_").join(""));
        assert.equal(await order(), "天上天下十口休日");
        const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
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
        assert.equal(await order(), "休上天下十口天日", `${layout}：休と最初の天が入れ替わる`);
        assert.equal(await page.locator("#row .tile").count(), 0, "引きずっても台には置かれない");
        assert.equal(await page.locator("#meHand .tile.sel").count(), 0, "引きずっても選ばれない");
        // ただのタップは今までどおり
        await page.locator("#meHand .tile", { hasText: "口" }).click();
        if (layout === "hand") assert.equal(await page.locator("#meHand .tile.sel").count(), 1);
        else assert.equal(await page.locator("#row .tile").count(), 1);
        // 入れ替えは選んだ順に響かない（選んだ札の id の順のまま）
        await drag("日", "上");
        assert.equal(await order(), layout === "hand" ? "休日天下十口天上" : "休日天下十_天上");
        await page.click("#bLog");
        const log = await page.inputValue("#logText");
        assert.match(log, /\t入れ替え\t休 天\t天 休\t/);
        assert.match(log, /\t入れ替え\t日 上\t上 日\t/);
        assert.match(log, /\tはじめ\t/);
        assert.deepEqual(errors, []);
        await ctx.close();
      }
    });
  }

  await t.test("ストック（R-042）：手札の札を引きずってストックの空いたマスへ移す。ストックの札と手札の札を入れ替える。ストックの見出し", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, "hand");
    assert.match(await page.textContent("#trayHead"), /^ストック（字も部品も置ける/);
    const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
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

  await t.test("手札で選ぶ：スマホ幅の画像（選んだ札が目立つ）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 900 }, null, "hand");
    await page.locator("#meHand .tile", { hasText: "休" }).first().click();
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT, fullPage: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // KJ-010：遊ぶ画面を 375×700 に収める。「台に並べる」「手札で選ぶ」の両方で、ストックが全部埋まった（札が一番多い）形で確かめる
  for (const layout of ["table", "hand"]) {
    await t.test(`375×700 に収まる（${layout === "table" ? "台に並べる" : "手札で選ぶ"}）：CPU の点と手札の枚数・場・台・ボタン・手札・ストック・残り時間がスクロールなしで見える`, async () => {
      const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, "normal", layout);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
        [..."山川二三四五六七"].forEach((c, i) => G.me.cards.push({ id: 9100 + i, c, t: 0, fresh: false, tray: true }));
        G.me.takes = 2; // 「取れる」の文も出した形
        __KJ.render();
      });
      assert.equal(await page.evaluate(() => __KJ.game.trayCount(__KJ.game.me)), await page.evaluate(() => __KJ.data.rules.split_extra), "ストックは全部埋まっている");
      for (const ch of "天上天下") await page.locator("#meHand .tile", { hasText: ch }).first().click(); // 台（または選び）に4枚。言葉の説明が2行になる
      const parts = await page.evaluate(() => {
        const box = (sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 }; });
        return [].concat(
          box("#clock"), box("#cpuScore"), box("#cpuCount"), box("#field > *"), box("#takes"), box("#info"), box(".ops button"),
          box("#meHand > *"), box("#meTray > *"), box("#meScore"), box("#meCount"), box("#msg").slice(0, 0));
      });
      const rows = layout === "table" ? await page.evaluate(() => { const r = document.getElementById("row").getBoundingClientRect(); return [{ sel: "#row", l: r.left, t: r.top, r: r.right, b: r.bottom, shown: r.height > 0 }]; }) : [];
      for (const p of parts.concat(rows)) {
        assert.ok(p.shown, `${p.sel} が見えている`);
        assert.ok(p.t >= 0 && p.b <= 700, `${p.sel} が縦に画面内（上${Math.round(p.t)}〜下${Math.round(p.b)}）`);
        assert.ok(p.l >= 0 && p.r <= 375, `${p.sel} が横に画面内（左${Math.round(p.l)}〜右${Math.round(p.r)}）`);
      }
      assert.equal(parts.filter((p) => p.sel === "#meHand > *").length, 8);
      assert.equal(parts.filter((p) => p.sel === "#meTray > *").length, await page.evaluate(() => __KJ.data.rules.split_extra));
      assert.equal(parts.filter((p) => p.sel === ".ops button").length, 8, "ボタンは8つ");
      // 札は指で押せる大きさ（40px 以上）。ボタンは2段まで
      for (const p of parts.filter((x) => x.sel === "#meHand > *" || x.sel === "#meTray > *")) assert.ok(p.w >= 40 && p.h >= 40, `手札・ストックの札が 40px 以上（${p.w}×${p.h}）`);
      const tops = new Set(parts.filter((p) => p.sel === ".ops button").map((p) => Math.round(p.t)));
      assert.ok(tops.size <= 2, `ボタンは2段まで（${tops.size}段）`);
      // 横にあふれない
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "横スクロールがない");
      // 手札と場とストックの札の字が読める大きさ
      const fs = await page.evaluate(() => ["#meHand .tile", "#meTray .tile", "#field .tile"].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)));
      for (const f of fs) assert.ok(f >= 22, `字の大きさ ${f}px`);
      if (process.env.KJ_SHOT) await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, `-${layout}.png`) });
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await t.test("ストック：空のときは低く薄く、札が入ると手札と同じ形。16マス（手札8＋ストック8）。760px でも横にあふれない", async () => {
    for (const vp of [{ width: 375, height: 700 }, { width: 760, height: 1100 }]) {
      const { ctx, page, errors } = await open(browser, url, vp, "normal", "table");
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
});
