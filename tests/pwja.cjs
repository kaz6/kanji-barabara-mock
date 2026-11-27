// Playwright を、画面の言語が日本語（ja-JP）の端末として開く入れ物（KJ-127）。
// 言語は初めて開いたとき navigator.language で決まる（ja→日本語、ほか→English）。Playwright の既定は en-US なので、そのままだと
// 既存の画面の試験が English で開いてしまう。newContext・newPage に locale: "ja-JP" を足す（試験が locale を渡したらそちらが勝つ）。
// English の試験は locale: "en-US" を渡すか、localStorage kj-lang を入れる
const pw = require("playwright");
const chromium = pw.chromium;
if (!chromium.__kjJa) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...a) => {
    const b = await launch(...a);
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = (o) => nc({ locale: "ja-JP", ...(o || {}) });
    b.newPage = (o) => np({ locale: "ja-JP", ...(o || {}) });
    return b;
  };
  chromium.__kjJa = true;
}
module.exports = pw;
