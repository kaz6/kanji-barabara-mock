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

const skip = chromium ? false : "Playwright が入っていない";

async function open(browser, url, vp, opponent, pre = null) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  if (pre) await pre(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
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
      assert.equal(await page.textContent("#cdRedraw"), "30s", "待っているあいだも添え字は 30s のまま（秒数は数えない。KJ-034）");
      assert.equal(await page.evaluate(() => document.getElementById("bRedraw").classList.contains("cd")), true, "Redraw の地がゲージになる");
      // ログ
      await page.click("#bLog");
      const log = await page.inputValue("#logText");
      assert.match(log, /^# 漢字版（仮）モック ログ/);
      assert.match(log, /# 仮置き 場=3枚 最初の手札=8枚 手札の上限=8枚＋ストック8枚/);
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

  await t.test("相手の選び方：初期値は とても弱い。選べる5つが並ぶ（人と（合言葉）は いまの強さ の後ろ。KJ-033）", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 760, height: 1100 });
    const labels = await page.locator("#opp label").allTextContents();
    assert.deepEqual(labels.map((x) => x.trim()), ["ひとりで", "とても弱い", "ふつう", "いまの強さ", "人と（合言葉）"]);
    assert.equal(await page.locator("#opp input:checked").getAttribute("value"), "weak");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak");
    assert.equal(await page.isVisible("#cpuSide"), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("はじめる前の画面（KJ-007）：3つが上から並び、初期値は 相手=とても弱い・レベル=N4・時間=10分。下に「はじめる」（並べ方の選びは KJ-030 でなくした）", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.isVisible("#setup"), true);
    assert.equal(await page.isVisible("#game"), false, "遊ぶ画面はまだ出ない");
    const ys = await page.evaluate(() => ["opp", "lvl", "tim", "start"].map((id) => document.getElementById(id).getBoundingClientRect().top));
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, "相手・レベル・時間・はじめる の順に上から並ぶ");
    const labels = (id) => page.locator(`#${id} label`).allTextContents().then((a) => a.map((x) => x.trim()));
    assert.deepEqual(await labels("opp"), ["ひとりで", "とても弱い", "ふつう", "いまの強さ", "人と（合言葉）"]);
    assert.deepEqual(await labels("lvl"), ["N5", "N4"]);
    assert.deepEqual(await labels("tim"), ["5分", "10分", "15分"]);
    assert.equal(await page.locator("#lay").count(), 0, "並べ方の選びはない（KJ-030）");
    for (const [id, v] of [["opp", "weak"], ["lvl", "N4"], ["tim", "600"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
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
    await page.check('#opp input[value="solo"]');
    await page.check('#lvl input[value="N5"]');
    await page.check('#tim input[value="300"]');
    await page.click("#start");
    await page.click("#bLog");
    const log = await page.inputValue("#logText");
    assert.match(log, /# レベル N5\n# 相手 ひとりで（CPU なし。場の取り合いなし。50点では終わらず、5分たったら/);
    assert.match(log, /# 時間 5分\n# 仮置き /);
    // 3つが端末に残る（並べ方の kj-layout はもう使わない）
    assert.deepEqual(await page.evaluate(() => ["kj-opponent", "kj-level", "kj-time", "kj-layout"].map((k) => localStorage.getItem(k))), ["solo", "N5", "300", null]);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    for (const [id, v] of [["opp", "solo"], ["lvl", "N5"], ["tim", "300"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, `${id} を覚えている`);
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
    for (const [id, v] of [["opp", "weak"], ["lvl", "N4"], ["tim", "600"]]) assert.equal(await page.locator(`#${id} input:checked`).getAttribute("value"), v, id);
    await page.check('#tim input[value="900"]'); // 選んでも壊れない（覚えないだけ）
    await page.click("#start");
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
    await page.check('#opp input[value="solo"]');
    await page.click("#start");
    assert.equal(await page.isVisible("#setup"), false);
    for (const id of ["opp", "lvl", "tim"]) assert.equal(await page.isVisible("#" + id), false, `${id} は遊んでいる途中では変えられない`);
    assert.equal(await page.locator("#layNow").count(), 0, "並べ方の切り替えはなくした（KJ-030）");
    // 終わらせて もう一度
    await page.evaluate(() => { __KJ.game.endsAt = __KJ.game.now() - 1; });
    await page.waitForFunction(() => document.getElementById("msg").textContent.startsWith("ひとりで "));
    await page.click("#again");
    const g = await page.evaluate(() => ({ lv: __KJ.game.level, t: __KJ.game.timeLimit, o: __KJ.game.opponent, over: __KJ.game.over, picking: __KJ.game.picking }));
    assert.deepEqual(g, { lv: "N5", t: 300, o: "solo", over: false, picking: undefined }, "同じ設定で新しく始まる");
    assert.equal(await page.isVisible("#setup"), false);
    assert.equal(await page.textContent("#msg"), "", "はじめの1枚はない。始めてすぐ遊べる");
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

  await t.test("はじまり（KJ-016）：8枚で始まり、すぐ時間が動いて操作できる。ストックに部品が1枚。「最初の1枚を選ぶ」は出ない", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await page.check('#opp input[value="normal"]');
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
      // 手札が8枚のときは場から取れない。台に置いた札も手札に数える（台は並べて見る場所。KJ-016）ので、台に置いても取れない
      await page.click("#bBack");
      await page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8);
      assert.match(await page.textContent("#takes"), /手札がいっぱい/);
      await page.locator("#meHand .tile").first().click();
      assert.equal(await page.evaluate(() => __KJ.game.handCount(__KJ.game.me)), 8, "台の札も数える");
      assert.match(await page.textContent("#takes"), /手札がいっぱい/, "台に置いても取れない");
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
      await page.click("#bRelease"); // 押せるが、はじかれる
      assert.match(await page.textContent("#msg"), /1字では放てない（2字以上の言葉）/);
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
      // 部品の札（色の薄い札）も選ぶと赤地に白になり、数字が読める
      await page.evaluate(() => { const G = __KJ.game; G.me.cards.push({ id: 9300, c: "亻", t: 0, fresh: false, tray: true }); __KJ.render(); });
      await page.locator("#meTray .tile", { hasText: "亻" }).click();
      const pt = page.locator("#meTray .tile", { hasText: "亻" });
      assert.equal(await pt.evaluate((e) => e.classList.contains("part")), true, "亻 は部品の札");
      assert.equal(await pt.evaluate((e) => getComputedStyle(e).backgroundColor), await tile("休").evaluate((e) => getComputedStyle(e).backgroundColor), "部品でも選ぶと漢字の札と同じ赤地");
      assert.equal(await pt.evaluate((e) => getComputedStyle(e).color), "rgb(255, 255, 255)");
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

    await t.test(`${vp.name}：入れ替え。札を引きずって別の札の上で離すと位置が替わる（指一本）。ただのタップは選ぶだけ`, async () => {
      const { ctx, page, errors } = await open(browser, url, vp, null);
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
      const f = await page.locator("#meHand .tile", { hasText: from }).first().boundingBox();
      const tb = await page.locator("#meHand .tile", { hasText: to }).first().boundingBox();
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
      const tb = await page.locator("#meHand .tile", { hasText: "口" }).first().boundingBox();
      await page.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.15, { steps: 2 });
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "top" }, "描き直しのあとも光る");
      assert.match(await joinable(), /口/);
    });
    assert.equal(await order(), "天上天下古休日_");
    await reset();
    await dragTo("十", "口", 0.5, 0.9, async () => {
      await page.evaluate(() => __KJ.render());
      const tb = await page.locator("#meHand .tile", { hasText: "口" }).first().boundingBox();
      await page.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.88, { steps: 2 });
      assert.deepEqual(await lit(), { c: "口", faces: "center,top", on: "" });
    });
    assert.equal(await order(), "天上天下口十休日", "描き直しのあとも、光っていない面なら入れ替え");
    // 1回の動きで札に入って、そのまま離す：濃く光る面と結果がそろう（口 の右寄り＝大きくなった札では中央）
    await reset();
    {
      await page.locator("#meHand").scrollIntoViewIfNeeded();
      const f = await page.locator("#meHand .tile", { hasText: "十" }).first().boundingBox();
      const tb = await page.locator("#meHand .tile", { hasText: "口" }).first().boundingBox();
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
    const f = await page.locator("#meHand .tile", { hasText: "十" }).first().boundingBox();
    const tb = await page.locator("#meTray .tile").first().boundingBox();
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

  await t.test("待ち時間のゲージ（KJ-034）：使った直後は空に近い・半分でおよそ半分・満ちる前は押せない・満ちたら押せて小さく光る・秒数の文字が出ない・375×700 に収まる", async () => {
    const { ctx, page, errors } = await open(browser, url, { width: 375, height: 700 }, null);
    const st = () => page.evaluate(() => {
      const b = document.getElementById("bInvert"), r = b.getBoundingClientRect();
      const w = parseFloat(getComputedStyle(b, "::before").width) || 0;
      return { cd: b.classList.contains("cd"), full: b.classList.contains("full"), g: parseFloat(b.style.getPropertyValue("--g") || "NaN"), disabled: b.disabled, text: b.textContent.trim(), w: r.width, before: w, l: r.left, r: r.right, t: r.top, b: r.bottom };
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
    assert.equal(s.text, "⇄ Flip", "秒数の文字が出ない");
    await page.waitForTimeout(350); // 幅の動き（.25s）が落ち着くのを待つ
    s = await st();
    assert.ok(Math.abs(s.before / s.w - 0.5) < 0.08, `ゲージの幅もおよそ半分（${Math.round(s.before)} / ${Math.round(s.w)}）`);
    assert.ok(s.l >= 0 && s.r <= 375 && s.t >= 0 && s.b <= 700, "375×700 に収まる");
    assert.ok(new Set(await page.evaluate(() => [...document.querySelectorAll(".ops button")].map((b) => Math.round(b.getBoundingClientRect().top)))).size <= 2, "ボタンは2段のまま");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "横スクロールがない");
    if (process.env.KJ_GAUGE_SHOT) await page.screenshot({ path: process.env.KJ_GAUGE_SHOT });
    for (const t of await page.locator(".ops button:not(#bRedraw)").allTextContents()) assert.doesNotMatch(t, /\d|wait/, `ボタンに残りの秒数が出ない（${t}）`);
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
    // 引き直しの30秒待ちも同じゲージ（添え字 30s は残す）
    await page.evaluate(() => { const G = __KJ.game; G.me.score = 0; __KJ.render(); });
    await page.click("#bRedraw");
    await page.evaluate(() => { const G = __KJ.game; G.me.redrawAt = G.now() + __KJ.data.rules.redraw.free_wait_sec / 2; __KJ.render(); });
    const rd = await page.evaluate(() => { const b = document.getElementById("bRedraw"); return { cd: b.classList.contains("cd"), g: parseFloat(b.style.getPropertyValue("--g")), text: b.textContent.trim() }; });
    assert.equal(rd.cd, true);
    assert.ok(Math.abs(rd.g - 0.5) < 0.05, `Redraw の待ちも半分でおよそ半分（${rd.g}）`);
    assert.equal(rd.text, "Redraw 30s", "Redraw の添え字は 30s のまま");
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
        G.me.takes = 2; // 「取れる」の文も出した形
        __KJ.render();
      });
      assert.equal(await page.evaluate(() => __KJ.game.trayCount(__KJ.game.me)), await page.evaluate(() => __KJ.data.rules.split_extra), "ストックは全部埋まっている");
      for (const ch of "天上天下") await page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click(); // 4枚選ぶ（天 は2枚ある）。言葉の説明が2行になる
      const parts = await page.evaluate(() => {
        const box = (sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 }; });
        return [].concat(
          box("#clock"), box("#cpuScore"), box("#cpuCount"), box("#field > *"), box("#takes"), box("#info"), box(".ops button"),
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
      assert.equal(parts.filter((p) => p.sel === ".ops button").length, 8, "ボタンは8つ");
      // 札は指で押せる大きさ（40px 以上）。ボタンは2段まで
      for (const p of parts.filter((x) => x.sel === "#meHand > *" || x.sel === "#meTray > *")) assert.ok(p.w >= 40 && p.h >= 40, `手札・ストックの札が 40px 以上（${p.w}×${p.h}）`);
      const tops = new Set(parts.filter((p) => p.sel === ".ops button").map((p) => Math.round(p.t)));
      assert.ok(tops.size <= 2, `ボタンは2段まで（${tops.size}段）`);
      // 字の幅が環境でちがっても、ボタンの中身が枠からはみ出さない（CI の Chromium で3段になった。KJ-010）
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ops button")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id)), [], "ボタンの中身が枠に収まる");
      // 待ち時間の表示が入った形でも2段のまま
      await page.evaluate(() => { const G = __KJ.game; for (const k of ["invert", "cycle", "homophone"]) G.me.cd[k] = G.now() + 0.5; G.me.score = 0; G.me.redrawAt = G.now() + 15; __KJ.render(); }); // ゲージが出ている形（KJ-034）
      assert.ok(new Set(await page.evaluate(() => [...document.querySelectorAll(".ops button")].map((b) => Math.round(b.getBoundingClientRect().top)))).size <= 2, "待ち時間が出ても2段");
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ops button")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id)), [], "待ち時間が出てもボタンの中身が枠に収まる");
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

  await t.test("点線は薄いグレー。端末に無い字（𢀖・⺍・电 など）は同梱の字体で出る（KJ-027）", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp);
      await page.evaluate(() => {
        const G = __KJ.game;
        G.me.cards = [..."後彳𢀖験馬僉学⺍"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
        G.me.cards.push(...[..."電电会𠆢"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false, tray: true })));
        G.field = [..."国古山"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
        __KJ.render();
      });
      // 点線の色：茶色ではなく、赤青の差が小さい薄いグレー
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
        assert.ok(Math.abs(r - b) <= 24 && Math.abs(r - g) <= 16, `${k} の色 ${v} はグレー`);
        assert.ok(r >= 120 && r <= 200, `${k} の色 ${v} は字が読める薄さ`);
      }
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
    assert.match(body.log, /^# 漢字版（仮）モック ログ/);
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
    await until(() => posts.length >= 1);
    assert.equal(posts.length, 1);
    assert.ok(posts[0].body.device_id.length >= 8, "読めないときは試合ごとの無作為");
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

  await t.test("ボタンの文字は英語（KJ-024）。角の印は ⇄・↻・♪ でボタンと同じ。選んだ札でも印が見える。ほかの文言とログは日本語のまま", async () => {
    for (const vp of [{ width: 760, height: 1100 }, { width: 375, height: 700 }]) {
      const { ctx, page, errors } = await open(browser, url, vp);
      const label = (id) => page.evaluate((i) => document.querySelector(`#${i} .lb`).textContent, id);
      const want = { bRelease: "Play", bSplit: "Split", bJoin: "Join", bInvert: "⇄ Flip", bCycle: "↻ Cycle", bHomo: "♪ Sound conversion", bBack: "Back", bRedraw: "Redraw" };
      for (const [id, text] of Object.entries(want)) assert.equal(await label(id), text, `${id} の文字`);
      // ボタンの中に日本語（かな・漢字）が無い。待ち時間・引き直しの添え字が入っても
      await page.evaluate(() => { __KJ.game.me.score = 9; __KJ.render(); });
      assert.match(await page.textContent("#cdRedraw"), /^-\d+pt$/, "点があるときは Redraw -5pt の形（KJ-034 追記）");
      await page.evaluate(() => { __KJ.game.me.score = 0; __KJ.render(); });
      assert.match(await page.textContent("#cdRedraw"), /^\d+s$/, "点がないときは Redraw 30s の形");
      const jp = /[\u3040-\u30ff\u3400-\u9fff]/;
      for (const t of await page.locator(".ops button").allTextContents()) assert.doesNotMatch(t, jp, `ボタンに日本語が無い（${t}）`);
      // 角の印：上＝反転と同音 → ⇄♪、十＝巡りと同音 → ↻♪、口＝同音だけ → ♪。日本語の 反・巡・音 は出ない
      const mk = (ch) => page.evaluate((c) => { const e = [...document.querySelectorAll("#meHand .tile")].find((x) => x.title === c).querySelector(".mk"); return e ? e.textContent : ""; }, ch);
      assert.equal(await mk("上"), "⇄♪");
      assert.equal(await mk("十"), "↻♪");
      assert.equal(await mk("口"), "♪");
      assert.equal(await mk("休"), "♪");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll(".tile .mk")].filter((e) => /[反巡音]/.test(e.textContent)).length), 0, "角の印に 反・巡・音 の字が無い");
      // 印とボタンの前のアイコンが同じ形
      for (const [id, ic] of [["bInvert", "⇄"], ["bCycle", "↻"], ["bHomo", "♪"]]) assert.ok((await label(id)).startsWith(ic + " "), `${id} の前に ${ic}`);
      // 選んだ札（赤地）でも、角の印の色が地の色と違う（PR #22 の気づき）
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      const c = await page.evaluate(() => { const t = [...document.querySelectorAll("#meHand .tile.sel")].find((x) => x.title === "上"); return { bg: getComputedStyle(t).backgroundColor, mk: getComputedStyle(t.querySelector(".mk")).color }; });
      assert.notEqual(c.mk, c.bg, `選んだ札の印（${c.mk}）が地（${c.bg}）と違う色`);
      // 台の写しにも同じ印
      assert.equal(await page.evaluate(() => document.querySelector("#row .tile .mk").textContent), "⇄♪");
      // ほかの画面の文言は日本語のまま
      assert.equal(await page.textContent("#meSide .side-head b"), "あなた");
      assert.match(await page.textContent("#trayHead"), /^ストック/);
      assert.match(await page.textContent("#howto"), /（印：⇄）.*（印：↻）.*（印：♪）/, "しくみの印の説明もアイコン");
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
      await page.check('#opp input[value="room"]');
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
      await page.check('#opp input[value="room"]');
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
});
