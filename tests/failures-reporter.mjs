// 落ちたテストのまとめ（KJ-062）：npm test が落ちたとき、落ちたテストのファイル・名前・失敗の文を
// 標準出力の最後と test-results/failures.txt にまとめて出す。係が控え忘れても残るように。
// 全部通ったときは何も出さず、failures.txt も消す（前の回の結果が残って紛らわしくならないように）
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "test-results", "failures.txt");

function message(err) {
  const e = err && err.cause ? err.cause : err; // node:test は失敗を ERR_TEST_FAILURE で包み、元の失敗を cause に持つ
  if (!e) return "";
  const s = typeof e === "string" ? e : (e.message || String(e));
  return s.split("\n").map((l) => l.trimEnd()).filter((l) => l).join("\n");
}

export default async function* failuresReporter(source) {
  const fails = [];
  for await (const ev of source) {
    if (ev.type !== "test:fail") continue;
    const d = ev.data;
    const err = d.details && d.details.error;
    // 子のテストが落ちただけの親（「1 subtest failed」）は、子の行で分かるので省く
    if (err && err.failureType === "subtestsFailed") continue;
    const file = d.file ? path.relative(process.cwd(), d.file) : "(ファイル不明)";
    fails.push(`- ${file}:${d.line || "?"}\n  ${d.name}\n  ${message(err).replace(/\n/g, "\n  ")}`);
  }
  if (!fails.length) {
    try { fs.rmSync(OUT, { force: true }); } catch (e) { /* 消せなくても止めない */ }
    return;
  }
  const text = `# 落ちたテスト ${fails.length} 件（${new Date().toISOString()}）\n${fails.join("\n")}\n`;
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
  } catch (e) { /* 書けなくても標準出力には出す */ }
  yield `\n${text}（同じものを ${path.relative(process.cwd(), OUT)} にも書いた）\n`;
}
