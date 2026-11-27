// 合言葉の共有の画面（KJ-107）：部屋を作ると「共有」が出る・navigator.share に ?room= 付きのリンクが渡る・share が無いとクリップボードに写る・
// ?room= で開くと「友だちと」が選ばれ合言葉が入っている（まだ入っていない）・合わない合言葉は入らない。kj_claims は page.route の偽物。本物の Supabase には出さない
// Playwright の Chromium がないと skip になる。skip は「通った」ではない
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
try { ({ chromium } = require("./pwja.cjs")); } catch { /* 入っていない */ }
const skip = chromium ? false : "Playwright が入っていない";

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

// 主キーの先着をまねる kj_claims の偽物（tests/browser.test.mjs の合言葉の部屋と同じ形）
function fakeClaims() {
  const store = new Map();
  const pk = (r) => [r.match_id, r.kind, r.key].join("\u0000");
  let tick = Date.now();
  return async (route) => {
    const req = route.request(), u = new URL(req.url());
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
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  };
}

// share: "ok"＝navigator.share を差し替え（呼ばれた引数を window.__shared に残す）／"abort"＝閉じた（AbortError）／"fail"＝閉じた以外の失敗／"none"＝navigator.share が無い端末
async function open(browser, url, { share = "none", handler = null, pre = null, vp = { width: 375, height: 667 } } = {}) {
  const ctx = await browser.newContext({ viewport: vp, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([s, pre]) => {
    try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ }
    window.__shared = [];
    window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; } }) };
    if (s === "none") Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    else Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); if (s === "fail") return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })); return s === "abort" ? Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) : Promise.resolve(); } });
    if (pre) { try { new Function(pre)(); } catch (e) { /* 読めない端末 */ } }
  }, [share, pre]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("https://cdn.jsdelivr.net/**", (r) => { errors.push("CDN を読みに行った"); return r.abort(); });
  if (handler) await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}

test("合言葉の共有の画面（KJ-107）", { skip }, async (t) => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const shots = process.env.KJ_SHOT_SHARE;
  try {
    await t.test("部屋を作ると「共有」が合言葉の横に出る。作る前・やめたあとは出ない", async () => {
      const A = await open(browser, base, { share: "ok", handler: fakeClaims() });
      await A.page.check('#opp input[value="room"]');
      assert.equal(await A.page.isVisible("#bShare"), false, "部屋を作る前は出ない");
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      assert.equal(await A.page.isVisible("#bShare"), true);
      assert.equal((await A.page.textContent("#bShare")).trim(), "共有");
      const code = (await A.page.textContent("#roomShow")).trim();
      // 合言葉の横（同じ行。はみ出さない）
      const bs = await A.page.locator("#bShare").boundingBox(), cs = await A.page.locator("#roomShow").boundingBox();
      assert.ok(Math.abs((bs.y + bs.height / 2) - (cs.y + cs.height / 2)) < cs.height / 2 && bs.x > cs.x + cs.width - 1, "共有は合言葉の右・同じ行");
      const sw = await A.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(sw, true, "375px で横にはみ出さない");
      if (shots) { fs.mkdirSync(shots, { recursive: true }); await A.page.locator("#roomBox").screenshot({ path: path.join(shots, "share-375x667.png") }); }
      await A.page.click("#bRoomCancel");
      assert.equal(await A.page.isVisible("#bShare"), false, "やめたら消える");
      assert.match(code, /^[0-9]{4}$/);
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("共有を押すと navigator.share に文とリンク（?room=合言葉）が渡る。閉じただけなら何も出ない", async () => {
      const A = await open(browser, base, { share: "ok", handler: fakeClaims() });
      await A.page.check('#opp input[value="room"]');
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      const code = (await A.page.textContent("#roomShow")).trim();
      await A.page.click("#bShare");
      const shared = await A.page.evaluate(() => window.__shared);
      assert.equal(shared.length, 1);
      assert.equal(shared[0].text, `漢対普請瓦版 Split & Join — a Kanji Duel\n漢字を組み合わせて、言葉づくり対戦しよう。合言葉 ${code} ${base}?room=${code}`);
      assert.equal(shared[0].url, undefined, "リンクは文の中。url も渡すと端末で二重に出る");
      assert.equal(shared[0].text.split("?room=").length - 1, 1);
      assert.doesNotMatch(shared[0].text, /gmail|@/);
      assert.equal(await A.page.evaluate(() => !!document.getElementById("bShare")), true);
      await A.ctx.close();
      const B = await open(browser, base, { share: "abort", handler: fakeClaims() });
      await B.page.check('#opp input[value="room"]');
      await B.page.check('#act input[value="host"]');
      await B.page.waitForSelector("#roomShow:not([hidden])");
      const before = await B.page.textContent("#roomMsg");
      await B.page.click("#bShare");
      assert.equal((await B.page.evaluate(() => window.__shared)).length, 1);
      assert.equal(await B.page.textContent("#roomMsg"), before, "閉じただけ（AbortError）では文を出さない");
      assert.deepEqual(B.errors, []);
      await B.ctx.close();
    });

    await t.test("navigator.share が無い端末では、同じ文とリンクをクリップボードに写して「コピーした」", async () => {
      const A = await open(browser, base, { share: "none", handler: fakeClaims() });
      await A.page.check('#opp input[value="room"]');
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      const code = (await A.page.textContent("#roomShow")).trim();
      await A.page.click("#bShare");
      await A.page.waitForFunction(() => document.getElementById("roomMsg").textContent === "コピーした");
      const clip = await A.page.evaluate(() => navigator.clipboard.readText());
      assert.equal(clip, `漢対普請瓦版 Split & Join — a Kanji Duel\n漢字を組み合わせて、言葉づくり対戦しよう。合言葉 ${code} ${base}?room=${code}`);
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("navigator.share が閉じた以外（NotAllowedError など）で失敗したら、コピーに回る", async () => {
      const A = await open(browser, base, { share: "fail", handler: fakeClaims() });
      await A.page.check('#opp input[value="room"]');
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      const code = (await A.page.textContent("#roomShow")).trim();
      await A.page.click("#bShare");
      await A.page.waitForFunction(() => document.getElementById("roomMsg").textContent === "コピーした");
      assert.equal(await A.page.evaluate(() => navigator.clipboard.readText()), `漢対普請瓦版 Split & Join — a Kanji Duel\n漢字を組み合わせて、言葉づくり対戦しよう。合言葉 ${code} ${base}?room=${code}`);
      await A.ctx.close();
    });

    await t.test("?room=合言葉 で開く：「友達と対戦」と［部屋に入る］が選ばれ、入る側の欄に合言葉が入っている。まだ入っていない", async () => {
      const claimsHits = [];
      const handler = async (route) => { claimsHits.push(route.request().method()); return fakeClaims()(route); };
      const B = await open(browser, base + "?room=4821", { handler, pre: "localStorage.setItem('kj-opponent', 'normal')" });
      assert.equal(await B.page.isChecked('#opp input[value="room"]'), true);
      assert.equal(await B.page.isVisible("#roomBox"), true);
      assert.equal(await B.page.isChecked('#act input[value="enter"]'), true, "［部屋に入る］が選ばれている（KJ-123）");
      assert.equal(await B.page.isChecked('#act input[value="host"]'), false);
      assert.equal(await B.page.isVisible("#lvl"), false, "入る側にレベル・時間は出ない");
      assert.equal(await B.page.inputValue("#roomCode"), "4821");
      assert.equal(await B.page.isVisible("#game"), false, "勝手に入らない");
      await B.page.waitForTimeout(400);
      assert.deepEqual(claimsHits, [], "押すまで kj_claims に何も送らない");
      assert.equal(await B.page.isEnabled("#bEnter"), true);
      if (shots) await B.page.screenshot({ path: path.join(shots, "link-375x667.png") });
      // 端末に覚えた遊び方は書き換えない
      const stored = await B.page.evaluate(() => { try { return localStorage.getItem("kj-opponent"); } catch (e) { return "x"; } });
      assert.equal(stored, "normal", "端末に覚えた遊び方（つよい）は書き換えない");
      assert.deepEqual(B.errors, []);
      await B.ctx.close();
    });

    await t.test("?room= が合わない（桁が違う・数字でない・空）と、何も入れず遊び方も変えない", async () => {
      for (const q of ["?room=12", "?room=abcd", "?room=", "?room=123456"]) {
        const B = await open(browser, base + q);
        assert.equal(await B.page.inputValue("#roomCode"), "", q);
        assert.equal(await B.page.isChecked('#opp input[value="cpu"]'), true, q + "：CPU戦 のまま");
        assert.equal(await B.page.isVisible("#roomBox"), false, q);
        assert.deepEqual(B.errors, [], q);
        await B.ctx.close();
      }
    });

    await t.test("リンクで開いた人が「合言葉で入る」を押すと、作った人の部屋に入って二人で始まる", async () => {
      const handler = fakeClaims();
      const A = await open(browser, base, { share: "ok", handler });
      await A.page.addInitScript(() => { window.__KJ_POLL_MS = 150; });
      await A.page.check('#opp input[value="room"]');
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      const code = (await A.page.textContent("#roomShow")).trim();
      await A.page.click("#bShare");
      const link = (await A.page.evaluate(() => window.__shared))[0].text.match(/https?:\/\/\S+/)[0];
      const B = await open(browser, link, { handler });
      assert.equal(await B.page.inputValue("#roomCode"), code);
      await B.page.click("#bEnter");
      for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
      assert.equal(await B.page.$eval("#bShare", (e) => e.hidden), true, "入る側には共有が出ない");
      assert.equal(await A.page.$eval("#bShare", (e) => e.hidden), false, "作った側（対）には出ている");
      assert.deepEqual([...A.errors, ...B.errors], []);
      await A.ctx.close(); await B.ctx.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
});
