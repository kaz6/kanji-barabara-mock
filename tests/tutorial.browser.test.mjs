// チュートリアルの画面（KJ-043）：はじめて「はじめる」→チュートリアル→8段→本番／とばす／ボタンからいつでも／合言葉では出ない／その手だけ押せる／はじかれた手のログ
// Playwright の Chromium が無いときは skip。skip は「通った」ではない
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
const LOG_ROUTE = "**/rest/v1/play_logs";
const BTNS = ["bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo", "bRedraw"];
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); };

// 印の無い（はじめての）端末のページ。ログは送る処理を見られるよう force し、通信は偽物で受ける（本物の送り先には出さない）
async function fresh(browser, url, { vp = { width: 375, height: 700 }, posts = [], mark = false, opponent = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript((m) => { window.__KJ_LOG_FORCE = true; if (m) { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } } }, mark);
  await page.route(LOG_ROUTE, async (route) => {
    posts.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 201, body: "" });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  if (opponent) await page.check(`#opp input[value="${opponent}"]`);
  return { ctx, page, errors, posts };
}
const tile = (page, ch) => page.locator(`#meHand .tile[title="${ch}"], #meTray .tile[title="${ch}"]`).first();
const enabled = (page) => page.evaluate((ids) => ids.filter((id) => { const b = document.getElementById(id); return !b.disabled && b.getAttribute("aria-disabled") !== "true"; }), BTNS);
const pressOff = (page, id) => page.locator(`#${id}`).click({ force: true }); // 押せない見た目（aria-disabled）のボタンも、指なら押せる
const stepText = (page) => page.textContent("#tutStep");
const lineText = (page) => page.textContent("#tutLine");
async function takeTwo(page) {
  for (let i = 0; i < 2; i++) await page.locator("#field .tile").first().click();
}
async function dragTo(page, from, to, rx, ry) {
  const f = await tile(page, from).boundingBox(), tb = await tile(page, to).boundingBox();
  const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2, x2 = tb.x + tb.width * rx, y2 = tb.y + tb.height * ry;
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
}
// 8段を、画面の操作で通す。onStep(n, page) は各段のはじめ（案内が出た所）で呼ぶ
async function playThrough(page, onStep) {
  const step = async (n, title, only, run) => {
    assert.match(await stepText(page), new RegExp(`^${n} / 8　${title}$`));
    if (onStep) await onStep(n, page);
    await run();
    void only;
  };
  const want = async (ids, msg) => assert.deepEqual(await enabled(page), ids, msg);
  await step(1, "放つ", "bRelease", async () => {
    await want([], "選ぶ前は押せるボタンがない（Play も、選んでから）");
    await tile(page, "大").click(); await tile(page, "雨").click();
    await want(["bRelease"], "段1：Play だけ");
    await page.click("#bRelease");
  });
  await step(2, "取る", "take", async () => {
    assert.match(await lineText(page), /場の札を2枚タップして取る/);
    await want([], "取るあいだは全部押せない");
    assert.ok(await page.locator("#field.glow").count(), "場の札が光る");
    await takeTwo(page);
  });
  await step(3, "割る", "bSplit", async () => {
    await tile(page, "好").click();
    await want(["bSplit"], "段3：Split だけ");
    await page.click("#bSplit");
    assert.match(await lineText(page), /女 → 子/);
    // 割ってできた札は、最初から選ばれている（選んだ順に 女・子）。そのまま Play
    await want(["bRelease"]);
    await page.click("#bRelease");
    assert.match(await lineText(page), /場から取る（あと 2 枚/, "放ったあと、段の外でも取る案内");
    await takeTwo(page);
  });
  await step(4, "くっつける", "join", async () => {
    await want([], "引きずる手なのでボタンは全部押せない");
    await dragTo(page, "十", "口", 0.5, 0.12);
    assert.match(await lineText(page), /古 → 本 の順に選んで/);
    await tile(page, "古").click(); await tile(page, "本").click();
    await page.click("#bRelease");
    await takeTwo(page);
  });
  await step(5, "反転", "bInvert", async () => {
    await tile(page, "下").click();
    await want(["bInvert"], "段5：Flip だけ");
    await page.click("#bInvert");
    await tile(page, "手").click(); // 上 は反転でできて、最初から選ばれている
    assert.equal(await page.evaluate(() => __KJ.row.length), 2);
    await page.click("#bRelease");
    await takeTwo(page);
  });
  await step(6, "巡り", "bCycle", async () => {
    await tile(page, "月").click();
    await want(["bCycle"], "段6：Cycle だけ");
    await page.click("#bCycle");
    await tile(page, "山").click();
    await page.click("#bRelease");
    await takeTwo(page);
  });
  await step(7, "同音", "bHomo", async () => {
    await tile(page, "木").click();
    await want(["bHomo"], "段7：Sound conversion だけ");
    await page.click("#bHomo");
    assert.equal(await page.locator(".choices button.hint").textContent(), "気", "選びの中で 気 が光る");
    await page.locator(".choices button", { hasText: "気" }).click();
    await tile(page, "分").click();
    await page.click("#bRelease");
    await takeTwo(page);
  });
}

test("チュートリアルの画面", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("はじめて「はじめる」を押すとチュートリアルから。8段を通して「本番へ」で、選んでいた設定の本番が始まり、印が付く。次からは本番から", async () => {
    const posts = [];
    const { ctx, page, errors } = await fresh(browser, url, { posts, opponent: "fair" });
    await page.check('#lvl input[value="N5"]'); await page.check('#tim input[value="300"]');
    const t0 = Date.now();
    await page.click("#start");
    // チュートリアルの画面：案内・8段・時間なし・CPU なし
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "tutorial");
    assert.equal(await page.evaluate(() => document.body.classList.contains("tutorial")), true);
    assert.equal(await page.isVisible("#tut"), true);
    assert.equal(await page.isVisible("#clock"), false, "残り時間は出さない");
    assert.equal(await page.isVisible("#cpuSide"), false, "CPU は出ない");
    assert.equal(await page.isVisible("#again"), false);
    assert.equal(await page.isVisible("#tutGo"), false);
    assert.equal(await page.textContent("#tutSkip"), "とばす");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-tutorial")), null, "終えるかとばすまでは印を付けない");
    const glowed = async () => page.evaluate(() => [...document.querySelectorAll(".tile.hint, button.hint")].map((e) => e.title || e.id).sort().join(","));
    const shots = [];
    await playThrough(page, async (n) => {
      if (n === 1) assert.equal(await glowed(), "bRelease,大,雨", "段1：使う札とボタンが光る");
      if (n === 4) assert.equal(await glowed(), "十,口", "段4：引きずる札が光る（ボタンは光らない）");
      if (n === 7) assert.equal(await glowed(), "bHomo,木", "段7：木 と Sound conversion が光る");
      if (process.env.KJ_SHOT && [1, 4, 7].includes(n)) { shots.push(n); await page.screenshot({ path: process.env.KJ_SHOT.replace(/\.png$/, `-step${n}.png`) }); }
    });
    // 8段：おわり
    assert.match(await stepText(page), /^8 \/ 8　おわり$/);
    assert.match(await lineText(page), /分からなくなったら、札が光ってヒントが出る/);
    assert.equal(await page.isVisible("#tutGo"), true);
    assert.equal(await page.textContent("#tutGo"), "本番へ");
    const secs = Math.round((Date.now() - t0) / 100) / 10;
    t.diagnostic(`すぐ押した場合の通し：${secs} 秒（画面の操作ぜんぶ込み）`);
    assert.deepEqual(errors, []);
    await page.click("#tutGo");
    // 本番：選んでいた設定（ふつう・N5・5分）
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "fair");
    assert.equal(await page.evaluate(() => __KJ.game.level), "N5");
    assert.equal(await page.evaluate(() => __KJ.game.timeLimit), 300);
    assert.equal(await page.isVisible("#tut"), false);
    assert.equal(await page.isVisible("#clock"), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-tutorial")), "1");
    // 送ったログ：相手 tutorial、どの段まで・秒数
    await until(() => posts.length >= 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].opponent, "tutorial");
    assert.equal(posts[0].level, "N4");
    assert.equal(posts[0].result, "チュートリアル（終えた・8段のうち 8 段まで・7段が済み）");
    assert.match(posts[0].log, /# 相手 チュートリアル/);
    assert.equal((posts[0].log.match(/\t段\t/g) || []).length, 7, "7段ぶんの秒数の行");
    assert.match(posts[0].log, /\t段\t[^\n]*\t1 放つ：\d/);
    assert.match(posts[0].log, /\t終わり\t[^\n]*チュートリアルを終えた（7段が済み/);
    // 次からは本番から
    await page.click("#bSetup");
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "fair");
    assert.equal(await page.isVisible("#tut"), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("「とばす」でどの段からでも本番へ。印が付き、とばしたことが1手も動かなくても送られる", async () => {
    const posts = [];
    const { ctx, page, errors } = await fresh(browser, url, { posts });
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "tutorial");
    await page.click("#tutSkip");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak", "選んでいた設定（初期値は とても弱い）の本番");
    assert.equal(await page.isVisible("#tut"), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-tutorial")), "1");
    await until(() => posts.length >= 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].opponent, "tutorial");
    assert.equal(posts[0].result, "チュートリアル（とばした・8段のうち 1 段まで・0段が済み）");
    assert.match(posts[0].log, /\tとばす\t[^\n]*1 放つでとばした/);
    // 途中（段3）でとばす
    await page.click("#bSetup");
    await page.click("#bTutorial");
    await tile(page, "大").click(); await tile(page, "雨").click(); await page.click("#bRelease");
    await takeTwo(page);
    assert.match(await stepText(page), /^3 \/ 8/);
    await page.click("#tutSkip");
    await until(() => posts.length >= 2);
    assert.equal(posts[1].result, "チュートリアル（とばした・8段のうち 3 段まで・2段が済み）");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("「チュートリアル」ボタンからいつでも。印があっても出る。途中で設定を変えるとやめた扱いで送る（印は付かない）", async () => {
    const posts = [];
    const { ctx, page, errors } = await fresh(browser, url, { posts, mark: true });
    await page.click("#start");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "weak", "印があれば本番から");
    await page.click("#bSetup");
    assert.equal(await page.textContent("#bTutorial"), "チュートリアル");
    assert.equal(await page.isVisible("#bTutorial"), true);
    await page.click("#bTutorial");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "tutorial");
    assert.match(await stepText(page), /^1 \/ 8　放つ$/);
    await tile(page, "大").click();
    await pressOff(page, "bSplit"); // はじかれた手も1手として残る
    await page.click("#bSetup"); // 途中でやめる
    assert.equal(await page.isVisible("#setup"), true);
    await until(() => posts.length >= 1);
    assert.match(posts[0].result, /^チュートリアル（途中でやめた・8段のうち 1 段まで・0段が済み）$/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("人と対戦（合言葉）では出ない：「はじめる」が無く、はじめて部屋を選んだ人にチュートリアルは出ない。ボタンから見て終えると、はじめる前の画面へ戻る", async () => {
    const { ctx, page, errors } = await fresh(browser, url);
    await page.check('#opp input[value="room"]');
    assert.equal(await page.isVisible("#start"), false);
    assert.equal(await page.isVisible("#tut"), false);
    assert.equal(await page.isVisible("#roomBox"), true);
    assert.equal(await page.isVisible("#bTutorial"), true, "ボタンからは見られる");
    await page.click("#bTutorial");
    assert.equal(await page.evaluate(() => __KJ.game.opponent), "tutorial");
    await page.click("#tutSkip");
    assert.equal(await page.isVisible("#setup"), true, "合言葉を選んでいたら、本番（CPU 戦）は始めずに、はじめる前の画面へ");
    assert.equal(await page.evaluate(() => __KJ.game), null);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-tutorial")), "1");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("その手だけ押せる：ほかの札は選べない・ほかのボタンは押せない見た目。押すと何も起きず、はじかれた手が「ためした」に残る。時間は動かない", async () => {
    const { ctx, page, errors } = await fresh(browser, url);
    await page.click("#start");
    // 段1：大・雨 以外は選べない
    await tile(page, "好").click();
    assert.deepEqual(await page.evaluate(() => __KJ.row), [], "好 は選べない");
    await tile(page, "大").click();
    assert.equal(await page.evaluate(() => __KJ.row.length), 1);
    // 押せない見た目のボタンを押しても、何も起きない
    for (const id of ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo", "bRedraw"]) {
      assert.equal(await page.getAttribute(`#${id}`, "aria-disabled"), "true", id);
      await pressOff(page, id);
    }
    const g = await page.evaluate(() => ({ n: __KJ.game.me.cards.length, text: __KJ.game.me.cards.map((x) => x.c).join(""), score: __KJ.game.me.score }));
    assert.equal(g.n, 12);
    assert.equal(g.score, 0);
    const tried = await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").map((e) => e.note));
    assert.ok(tried.some((n) => /^割る：いまは使わない（チュートリアル 1：放つ）$/.test(n)), tried.join("|"));
    assert.ok(tried.some((n) => /^引き直し：いまは使わない/.test(n)));
    assert.equal(await page.evaluate(() => __KJ.game.log.some((e) => e.op === "ヒント")), false, "自動のヒントは出ない（続けてはじかれても）");
    // 引きずっても入れ替わらない
    const before = await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
    await dragTo(page, "木", "月", 0.5, 0.5);
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join("")), before, "段1 では引きずって入れ替えない");
    // 時間は動かない
    await page.evaluate(() => { __KJ.game.now = () => performance.now() / 1000 + 100000; });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => __KJ.game.over), false, "時間では終わらない");
    // 段3 の 好 を割らずに別の札を割ろうとしても通らない（段の手以外）
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("段4：十 を 口 の上の面以外に落としても（中央・ほかの札・空き）くっつかず入れ替わらない。はじかれた落とし先が残る", async () => {
    const { ctx, page, errors } = await fresh(browser, url);
    await page.click("#start");
    await tile(page, "大").click(); await tile(page, "雨").click(); await page.click("#bRelease"); await takeTwo(page);
    await tile(page, "好").click(); await page.click("#bSplit");
    await page.click("#bRelease"); await takeTwo(page);
    const hand = async () => page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
    const h0 = await hand();
    await dragTo(page, "十", "口", 0.5, 0.5); // 中央（田になる面）
    assert.equal(await hand(), h0, "中央では田にならない（チュートリアルは 古）");
    await dragTo(page, "十", "月", 0.5, 0.5); // ほかの札
    assert.equal(await hand(), h0);
    await dragTo(page, "口", "月", 0.5, 0.5); // 口 は引きずれない
    assert.equal(await hand(), h0);
    const tried = await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").map((e) => e.note).join("|"));
    assert.match(tried, /面でくっつける：チュートリアル：いまは 十 を 口 の上の面に/);
    await dragTo(page, "十", "口", 0.5, 0.12);
    assert.match(await hand(), /古/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("375×700：チュートリアルの画面。案内の高さは段が替わっても動かず、手札・場・ボタン・ストックが収まる", async () => {
    const { ctx, page, errors } = await fresh(browser, url, { vp: { width: 375, height: 700 } });
    await page.click("#start");
    const box = (sel) => page.locator(sel).boundingBox();
    const h1 = (await box("#tut")).height, top1 = (await box("#meHand")).y;
    await tile(page, "大").click(); await tile(page, "雨").click(); await page.click("#bRelease");
    const h2 = (await box("#tut")).height, top2 = (await box("#meHand")).y;
    assert.equal(h1, h2, "案内の高さは段が替わっても同じ");
    assert.equal(top1, top2, "手札の位置も動かない");
    const bottom = await page.evaluate(() => { const r = document.getElementById("trayHead").getBoundingClientRect(); return r.bottom + scrollY; });
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    t.diagnostic(`375 幅：案内 ${h1}px・ストックの見出しの下端 ${Math.round(bottom)}px・ページの高さ ${docH}px`);
    assert.ok(bottom <= 700, "ストックの見出しまで 700px に収まる");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横にはみ出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
