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

async function open(browser, url, vp, opponent) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
  if (opponent) await page.check(`#opp input[value="${opponent}"]`);
  await page.click("#start");
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
      assert.match(log, /# 仮置き 場=3枚 最初の手札=8枚 手札の上限=8枚＋部品の置き場4枚/);
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
      // 手札が8枚のときは場から取れない
      await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      assert.match(await page.textContent("#takes"), /手札がいっぱい/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

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
