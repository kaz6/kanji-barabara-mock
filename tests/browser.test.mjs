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
  await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
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
      await page.locator("#field .tile", { hasText: "山" }).click();
      await page.locator("#field .tile", { hasText: "川" }).click();
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
      assert.match(log, /# 仮置き 場=3枚 最初の手札=7枚 手札の上限=8枚＋ストック4枚/);
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

  await t.test("レベル（KJ-006）：初期値は N4。N5 を選ぶと字と語が減り、ログの頭に出る。端末に覚える", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#lvl label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["N5", "N4"]);
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N4");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N4");
    const n4 = await page.evaluate(() => [__KJ.tables.CHARS.size, __KJ.tables.WORDS.size]);
    await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# レベル N4（N5＋N4 の字）/);
    await page.check('#lvl input[value="N5"]');
    assert.equal(await page.evaluate(() => __KJ.game.level), "N4", "遊んでいる途中では変わらない（次にはじめるときに効く）");
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N5");
    const n5 = await page.evaluate(() => [__KJ.tables.CHARS.size, __KJ.tables.WORDS.size]);
    assert.ok(n5[0] < n4[0] && n5[1] < n4[1], `${n5} < ${n4}`);
    await page.click("#bLog"); await page.click("#bLog");
    assert.match(await page.inputValue("#logText"), /# レベル N5\n/);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-level")), "N5");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
    assert.equal(await page.locator("#lvl input:checked").getAttribute("value"), "N5");
    assert.match(await page.textContent("#msg"), /レベル N5/);
    // localStorage が読めなくても初期値で始められる
    await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
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
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
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
    assert.equal(await page.evaluate(() => __KJ.game.log.length), 1, "はじめの1行だけ");
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
    // もう一度（ひとりで）：低い点なら 自己ベスト 51 点 を出す
    await page.click("#start");
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
    await t.test(`${vp.name}：手札8＋部品の置き場4。手札が8枚でも割れて、あふれた札は置き場に入る。位置は動かない`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."休一二三四五六七"].map((c, i) => ({ id: 8000 + i, c, t: 0, fresh: false }));
        __KJ.render();
      });
      const pos = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + scrollX) + "," + Math.round(r.top + scrollY); }).join(" "), sel);
      assert.equal(await page.locator("#meHand > *").count(), 8);
      assert.equal(await page.locator("#meTray > *").count(), 4);
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
      await page.check('#lay input[value="table"]');
      assert.equal(await page.isVisible("#row"), true);
      assert.match(await page.textContent("#row"), /^休.*日/);
      assert.equal(await page.locator("#meHand .slot.held").count(), 2);
      // 手札で選ぶへ戻す
      await page.check('#lay input[value="hand"]');
      assert.equal(await page.isVisible("#row"), false);
      assert.equal(await page.locator("#meHand .tile.sel").count(), 2);
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), "hand");
      await page.check('#lay input[value="table"]');
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), "table");
      // 再読み込みしても覚えている
      await page.reload();
      await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
      assert.equal(await page.locator("#lay input:checked").getAttribute("value"), "table");
      // 消して読み込み直すと初期値（手札で選ぶ）
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
      assert.equal(await page.locator("#lay input:checked").getAttribute("value"), "hand");
      // 遊んでいる最中の切り替えがログに出る
      await page.click("#start");
      await page.check('#lay input[value="table"]');
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
