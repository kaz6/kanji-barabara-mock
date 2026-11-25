// 画面テストの共通の手伝い（KJ-100）：引きずる前に、札が見えて大きさがあるのを待ってから位置を読む。
// 札は描き直しで作り替わる。その一瞬は boundingBox() が null になる（遅い端末・負荷のあるときに数回に1回落ちていた）。
// 固い待ち時間だけで済ませず、見える→画面に入れる→位置が取れる（幅と高さが 0 でない）まで、短く待ち直す。
export async function readBox(locator, { timeout = 8000 } = {}) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeout) {
    try {
      await locator.waitFor({ state: "visible", timeout: Math.max(200, timeout - (Date.now() - t0)) });
      await locator.scrollIntoViewIfNeeded({ timeout: 1000 });
      const b = await locator.boundingBox();
      if (b && b.width > 0 && b.height > 0) return b;
      last = "位置が取れない（null か大きさ 0）";
    } catch (e) {
      last = String(e && e.message || e).split("\n")[0]; // 描き直しで外れた・まだ無い：待ち直す
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`札の位置が ${timeout}ms 待っても読めなかった：${last}`);
}
export async function readCenter(locator, opts) {
  const b = await readBox(locator, opts);
  return [b.x + b.width / 2, b.y + b.height / 2];
}
