# CLAUDE.md（kanji-barabara-mock）

漢字版（仮）のモック。index.html 1枚＋js/core.js＋data/*.json。依存パッケージなし。

## まず読むもの

- docs/DECISION_LOG.md（R-番号。「却下」とある案は再提案しない）。正本は Notion の DECISION_LOG（漢字版）41da8a5d-fd45-8184-b0e9-c164462b1808
- docs/SESSION_STATE.md（進捗・次にやること・未確定）
- ひらがな分解（仮）のリポジトリには触らない

## 中身の分け方

- `js/core.js`：操作の計算だけ（表引き・割る・くっつける・反転・巡り・同音・届き方・投げられるか・待ち時間）。DOM に触らない。ブラウザでは `window.KJ`、Node では `require`
- `index.html`：画面・札の状態・CPU。計算は core.js を呼ぶ（R-025）
- `data/`：表。数値（カゴ・待ち時間・CPU）は `data/rules.json` だけ。表を変えたら `version` を上げる
- `tests/`：テスト（下）
- `tools/build_data.py`：辞書から作る3ファイル（kanji・words・readings）を作り直す

## テストの回し方

```bash
npm test
```

- 中身は `node --test "tests/*.test.js"`。Node 22 以上。入れるものはない
- かかる時間：1回 0.3 秒ほど（2026-11-20、コンテナで 30 件）
- `tests/data.test.js`：データの整合（部品表に輪がない・割れる字と中継ぎ・同じ左右から2字できるのは 十口 だけ・対義・巡り・偏の字・同じ読み・語・特別な語）
- `tests/ops.test.js`：割る（一段）・くっつける（順番つき・中継ぎ）・反転・巡り（最後から最初へ）・同音・届き方・言葉の判定・待ち時間（操作ごと・人ごと）
- 画面・CPU・札の状態はテストしていない（KJ-003 で作り直すため。R-025）。画面を変えたら Playwright かブラウザで手で確かめ、PR に書く
- PR を出すと GitHub Actions（.github/workflows/test.yml）が同じ `npm test` を回す

## データを作り直す（tools/build_data.py）

作り直すのは kanji.json・words.json・readings.json の3つだけ。手作りの表（parts・antonyms・cycles・radical_forms・special・rules）は手で直す。

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install --upgrade pip setuptools wheel
```

```bash
.venv/bin/pip install jamdict-data
```

```bash
.venv/bin/python tools/build_data.py
```

- N5 の字の表を差し替える：`.venv/bin/python tools/build_data.py --kanji-list path/to/n5.txt`（1行1字か空白区切り）
- jamdict-data が入らないとき：`--db /path/to/jamdict.db`（R-002）
- 作り直したら `npm test` を回す。字が変わると、部品表・対義・巡り・同じ読みの字が kanji.json から外れていないかを data.test.js が見る。テストが数を決め打ちしている所（例：一日中 の届き方）が落ちたら、データの変化かテストの直し漏れかを見分けて PR に書く
- `version` を上げる（build_data.py の `VERSION`）

## ローカルで開く

```bash
python3 -m http.server 8000
```

file:// では data/ を読めない。

## PR の決まり

- main に直接 push しない。作業用のブランチを切って、そこから PR を出す（下書きでよい）。main に入ると Pages（公開 URL）に出る
- PR の説明に、次の3つの欄を必ず書く
  - **確かめ方**：何を回して何を見たか（`npm test` の件数と結果、画面で見たこと）。確かめていないことも書く
  - **危ない所**：壊れうる所・遊びの決まりが変わる所・データを変えた所
  - **戻し方**：どのコミットを revert すればよいか、データや設定（localStorage など）に残るものがあるか
- Actions のテストが落ちている PR は出しっぱなしにしない
- 設計の判断をしたら docs/DECISION_LOG.md に R-番号で残し、docs/SESSION_STATE.md を更新する
- 「音」の印のふるい（R-004）は作者の判断待ち。勝手に変えない
