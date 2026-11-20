// 画面のテスト（Playwright の Chromium があるときだけ。ないときは skip）
// 台に札を置いても下のカゴが動かないこと（KJ-002 の1）、ログ・設定・「並べる順が逆」が画面に出ること
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

test("画面", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  for (const vp of [{ width: 760, height: 1000, name: "広い画面" }, { width: 375, height: 800, name: "スマホ幅" }]) {
    await t.test(`${vp.name}：台に置いてもカゴが動かない`, async () => {
      const page = await browser.newPage({ viewport: vp });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
      await page.evaluate(() => localStorage.clear());
      await page.click("#start");
      // CPU を止め、手を決める
      await page.evaluate(() => {
        const G = __KJ.game; G.over = false; G.cpuTurn = () => null;
        G.me.cards = [..."天上天下十口言人木"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
      });
      await page.evaluate(() => __KJ.render());
      const top = () => page.evaluate(() => Math.round(document.getElementById("meBasket").getBoundingClientRect().top));
      const tilePos = () => page.evaluate(() => [...document.querySelectorAll("#meBasket > *")].map((e) => Math.round(e.getBoundingClientRect().left) + "," + Math.round(e.getBoundingClientRect().top)).join(" "));
      const y0 = await top(), cells0 = await tilePos();
      const tap = async (n) => page.locator("#meBasket .tile").nth(n).click();
      // 天上天下（四字熟語、英語の説明が長い）
      for (let i = 0; i < 4; i++) { await tap(0); assert.equal(await top(), y0, `${i + 1}枚目`); }
      assert.equal(await tilePos(), cells0, "カゴのマスの並びも変わらない");
      await page.click("#bBack");
      // 口・十 → 並べる順が逆
      await page.locator("#meBasket .tile", { hasText: "口" }).click();
      await page.locator("#meBasket .tile", { hasText: "十" }).click();
      assert.match(await page.textContent("#info"), /並べる順が逆/);
      assert.equal(await top(), y0);
      await page.click("#bBack");
      // 十・口 → くっつけるで 古 か 田 を選ぶ（選ぶ札は重ねて出すのでカゴは動かない）
      await page.locator("#meBasket .tile", { hasText: "十" }).click();
      await page.locator("#meBasket .tile", { hasText: "口" }).click();
      await page.click("#bJoin");
      assert.equal(await top(), y0, "選ぶ札が出てもカゴは動かない");
      await page.locator("#choices button", { hasText: "古" }).click();
      assert.match(await page.textContent("#row"), /^古/);
      await page.click("#bBack");
      // 言 → 同音の候補・待ち時間の表示
      await page.locator("#meBasket .tile", { hasText: "言" }).click();
      await page.click("#bHomo");
      assert.equal(await top(), y0);
      await page.locator("#choices button").first().click();
      assert.match(await page.textContent("#cdHomo"), /\d+s/);
      assert.equal(await top(), y0, "待ち時間の数字が出てもボタンの並びは変わらない");
      // ログ
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /^# 漢字版（仮）モック ログ/);
      assert.match(log, /# 設定 できた語の行き先=投げる/);
      assert.match(log, /\tためした\t口 十\t\t.*\t並べる順が逆/);
      assert.match(log, /\tくっつける\t十 口\t古\t/);
      assert.match(log, /\t同音\t言\t/);
      assert.deepEqual(errors, []);
      await page.close();
    });
  }

  await t.test("設定：おじゃま札にすると、相手に ■ が落ちる。終わると「ログをコピー」", async () => {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 1000 } });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
    await page.click("#bSettings");
    await page.check('input[name="s_dest"][value="garbage"]');
    await page.check('input[name="s_cpuPace"][value="slow"]');
    await page.reload();
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("字 "));
    assert.equal(await page.isChecked('input[name="s_dest"][value="garbage"]'), true, "設定を覚えている");
    await page.click("#start");
    assert.match(await page.textContent("#nowSettings"), /おじゃま札/);
    await page.evaluate(() => {
      const G = __KJ.game; G.cpuTurn = () => null;
      G.me.cards = [..."休日"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
      G.cpu.cards = [..."一二三四五六七八九十一二三四五六七八九"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false }));
    });
    await page.evaluate(() => __KJ.render());
    await page.locator("#meBasket .tile").nth(0).click();
    await page.locator("#meBasket .tile").nth(0).click();
    await page.click("#bThrow");
    assert.equal(await page.locator("#cpuBasket .tile.junk").count(), 2);
    assert.match(await page.textContent("#msg"), /勝ち/);
    assert.equal(await page.isVisible("#bCopyEnd"), true);
    await page.click("#bCopyEnd");
    await page.waitForFunction(() => document.getElementById("copyMsg").textContent === "コピーした");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /# 設定 できた語の行き先=消えて、相手におじゃま札/);
    assert.match(clip, /# 設定 CPU の間隔=ゆっくり（8〜12秒）/);
    assert.match(clip, /\t投げる\t休 日\t■ ■\t/);
    assert.match(clip, /\t終わり\t.*あなたの勝ち/);
    await ctx.close();
  });
});
