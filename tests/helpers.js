// テスト共通：data/*.json を読み、js/core.js の表を作る
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILES = ["kanji", "words", "readings", "parts", "antonyms", "cycles", "radical_forms", "special", "rules"];

function loadData() {
  const D = {};
  for (const f of FILES) D[f] = JSON.parse(fs.readFileSync(path.join(ROOT, "data", f + ".json"), "utf8"));
  return D;
}

const KJ = require(path.join(ROOT, "js", "core.js"));
const D = loadData();
const T = KJ.buildTables(D);

module.exports = { ROOT, FILES, KJ, D, T, loadData };
