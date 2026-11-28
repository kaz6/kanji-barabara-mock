# CLAUDE.md（kanji-barabara-mock）

漢字版（仮）のモック。タイトルは漢対普請瓦版（KJ-109）。index.html 1枚＋js/core.js＋data/*.json。依存パッケージなし。

## まず読むもの

- docs/DECISION_LOG.md（R-番号。「却下」とある案は再提案しない）。正本は Notion の DECISION_LOG（漢字版）41da8a5d-fd45-8184-b0e9-c164462b1808
- docs/SESSION_STATE.md（進捗・次にやること・未確定）
- 全文は docs/archive/ にある。経緯は検索で引く（毎回は読まない）
- ひらがな分解（仮）のリポジトリには触らない

## 中身の分け方

- `js/core.js`：遊びの決まり（表引き・割る・くっつける・放つ・点数・場から取る・引き直し・待ち時間・勝ち・CPU・ログ）。DOM に触らない。ブラウザでは `window.KJ`、Node では `require`。合言葉の部屋（人と対戦。KJ-033）の先着は `createMatchClient`、部屋を作る／入るは `hostRoom`・`findRoom`・`joinRoom`・`roomWaiter`（つなぎは差し替え。テストは `memoryClaims`。本物のつなぎ〔kj_claims の REST と Realtime〕は index.html。KJ-140：自分の上の段の字を `handTiles`・`handPayload`・`parseHandTiles`・`sendHand`〔event の type hand。0.3秒まとめ〕で相手へ送り、相手の行の下に見せる）
- `index.html`：画面だけ。決まりは core.js を呼ぶ
- `css/`：画面の見た目（もとは index.html の style 要素。KJ-152。base＝色・字体・紙／table＝卓・札・ボタン／screens＝はじめる前・終わり・設定など）。見た目を触るときだけ開く
- `data/parts.json` の `reach`：山に入らない「行き先だけの字」（KJ-077。氷・丸・刃・凡・勺。丶 の行き先。KJ-113 で 旧＝｜＋日、KJ-137 で 良＝丶＋艮 を足した）。割り方（`parts`）とは別の表。左右の部品が両方そのレベルで手に入るときだけ `T.REACH` として使う（`makeTables` と `tools/build_data.py` の `holdable` を同じ決め方に）。字として見せるので `jouyou` にも入れる。形は split_shapes。テストは tests/reach.test.js
- `data/kanji.json`・`words.json`：字と語に `lv`（N5／N4）と、小1（KJ-044。小学1年の80字）の印 `g1`（N5・N4 のどちらにも無い小1 の字は `lv`＝G1）。遊ぶときは `makeTables(D, level)` でレベルに絞る。字には読み `on`（音。カタカナ）・`kun`（訓。送りがななし。多くて2つずつ。KJ-130）も付く（English のときのローマ字のもと。`K.romaji`・`K.charReadingLine`・`K.wordReadingLine`）。作り直しは `python3 tools/build_data.py`（`pip install jamdict-data`。`--level N5` で N5 だけ）。手作りの表（parts など）はこのスクリプトでは作らない。N4 で足した割り方の一覧は docs/N4_TABLES.md、小1 の字と割り方は docs/G1_TABLES.md
- `fonts/kj-glyphs.otf`・`fonts/kj-glyphs.css`・`data/glyphs.json`・`docs/GLYPHS.md`：端末の字体に無い字（JIS X 0208 の外。部首補助・簡体字の形・拡張B など）の字形を同梱したもの。部品表・偏・巡りに新しい字を足したら `python3 tools/build_glyphs.py`（要 fontTools と Noto Serif CJK JP）で作り直す。テスト（tests/data.test.js）が、札の字が全部この一覧にあるかを見る。辶（U+8FB6）は字形だけ ⻌（U+2ECC。点1つ）に差し替え（KJ-116。`tools/build_glyphs.py` の `SUBSTITUTE`。Shippori の範囲から外すのは `tools/build_paper_fonts.py` の `NO_PAPER`。両方そろえて直す）
- `fonts/kj-fx.woff`・`fonts/kj-fx.css`・`fonts/OFL-YujiSyuku.txt`：特別な語の演出（`#fx .c`）だけの筆文字（Yuji Syuku。KJ-063）。字は `data/special.json` の語（`special`）と演出だけ特別の語（`fx_words`。金玉。KJ-064：点は変えず、2字を金色で同時に出す）に絞る。特別な語・演出だけの語を足したら `python3 tools/build_fx_font.py`（元の字体は `npm pack @fontsource/yuji-syuku` で取る。使い方は先頭の説明）で作り直す。テスト：tests/fxfont.test.js・tests/fxfont.browser.test.mjs
- `fonts/kj-paper.css`・`fonts/kj-zen-*.woff2`・`fonts/kj-shippori-400.woff2`・`fonts/kj-kaisei-400.woff2`・`fonts/OFL-Paper.txt`・`docs/PAPER_STYLE.md`：新聞紙風の見た目（KJ-093）の字体。画面の字＝Zen Old Mincho（`--ui`）、札の字＝大正風 Kaisei Tokumin（初期）か 明朝 Shippori Mincho（`--kanji`。設定「札の字」が `<html data-face>` を替える。localStorage `kj-face`）。要る字だけに絞った同梱。字を足したら `python3 tools/build_paper_fonts.py`（元の字体は `npm pack @fontsource/zen-old-mincho @fontsource/shippori-mincho @fontsource/kaisei-tokumin`。使い方は先頭の説明）で作り直す。色は css/base.css の `:root`（紙・札・墨・弁柄）。戦況の欄・背景の記事・紙のざらつき（KJ-094）：文の型と記事の文は `js/strings.js` の `SENKYO`・`NEWS`（仮）、戦況の文を組むのは `K.senkyoLines`、背景の記事はいつも入（KJ-123。`kj-news` は読まない）。文字を足したら画面の字（Zen）も `tools/build_paper_fonts.py` で作り直す（`js/strings.js` の字が入る）。表紙の題字「漢対普請瓦版」（KJ-109。ルビ・英字の副題つき。`js/strings.js` の `TEXT.masthead`・`mastheadRuby`・`mastheadSub`）・号数（localStorage `kj-issue`。`K.issueLabel`）・日付（`K.kansujiDate`）
- `js/strings.js` の言語（KJ-127）：日本語・English の2つ。文の表 `U`（`STR.t`）・core.js の文の言い換え `CORE_EN`（`STR.tr`）・遊び方の説明 `HOWTO`・English の戦果の共有の型 `SHARE_RESULT_EN`。選んだ言語は localStorage `kj-lang`（初めは navigator.language）。index.html に日本語を直書きせず、`data-t`・`data-t-aria`・`data-t-ph`（applyStatic）か `STR.t` で出す。段2（チュートリアル `ui_en`・`title_en`・`line_en`、部品の札の意味 `name_en`・`mean_en`、くっつく相手、台の行の注。KJ-128）。一覧は docs/STRINGS.md
- `js/strings.js`：操作のボタンの文字（英語）と、印の SVG（Flip の i・Cycle の C・Same reading の S に組み込む。札の角の印も同じ形。KJ-048）。操作のボタンの文字は英語。js/strings.js に置き、index.html に直書きしない。ボタン以外の画面の文言とログは日本語のまま（KJ-024。一覧は docs/STRINGS.md）
- `data/tutorial.json`：チュートリアル（KJ-043）の手札・ストック・場・段・文・ボタンの文字。文は全部仮で、ここ1か所で直す。段の進め方と押せる手の制限は `js/core.js` の `createTutorial`（DOM に触らない）
- `data/parts.json` の `reads_as`：部品の札の読み替え（KJ-096。囗→口。言葉を作るときだけ。ろ とは読まない。core.js の `T.READS`・`kanaOf`）。割る・くっつけるの働きは変えない。テストは tests/kuchi.test.js
- `data/parts.json` の `kana_parts`：部品の札をかなに読む表（KJ-053。ノ→の・儿→る・ナ→な）。語の表のかなの語（天の川・見る）は `tools/build_data.py` がこれで作る（印 `kana_at`）。札の並びを言葉の書き方にするのは `K.kanaText`。一覧は docs/KANA_WORDS.md（作り直すと上書き）
- `data/proper_names.json`：言葉として通す地名・名字（KJ-032。都道府県・県庁所在地と政令指定都市・名字上位100）。`tools/build_data.py` が words に入れ、印 `pn`（台の行に〔地名〕〔名字〕）を付ける。一覧は docs/PROPER_NAMES.md
- `data/blocked_words.json`：全レベルで放てない語（D-048。買春・売春）。`tools/build_data.py` が words から外す
- `data/blocked_words_g1.json`：小1 のときだけ放てない語の一覧（KJ-044 追記。語の表から外す。N5・N4 には効かない。中身は作者が決める）
- `data/radical_meanings.json`：部品の札（字として見せない札。全レベルの合計78）が何と同じ意味かの表（KJ-021。name 呼び名・same 同じ意味の字・mean 短い意味・q ？・forms は radical_forms の左の形）。台の行の1行目に出す（`K.radicalNote`。index.html の render）。一覧は docs/RADICAL_MEANINGS.md（手で合わせる。tests/radical.test.js が部品の漏れを見る）
- `data/counters.json`：数＋助数詞（KJ-022。十円・二十日 など。数＝一〜十・百・千・万と 二十〜九十・十一〜十九、助数詞＝円・人・本・日・月・年・時・分・回・台・週・度）。辞書に無くても放てる。一度放った言葉に使った助数詞は、その試合ではもう 数＋助数詞 に使えない（`releasable`・`g.isUsed`）。作り直しは `python3 tools/build_counters.py`（docs/COUNTERS.md も書く）。はじかれたときの 否 の判子（朱の角判。KJ-104。数は css/screens.css の `#nope` の変数）と理由は `K.rejectText`・index.html の `showWhy`。言い方の一覧は docs/REJECT_MESSAGES.md
- `data/special.json` の `effects`：放つと効く語（KJ-079・KJ-080。語→`{op, target, n}`。op＝split・cycle・invert・join・homophone／target＝self〔自刃：放った本人の上の段の割れる札を、場から取り終えたあとに1枚無作為に割る〕・opp〔切る・回転・反転・合体・同音 など：放った瞬間に、相手の上の段の効く札へ。大回転＝2枚・大集合＝`"max"`〔できるだけ多くの組〕〕。点・演出・振動は special・fx_words と別で変えない。core.js の `T.EFFECTS`・`hitOpponent`・`runPendingFx`・`K.effectText`。画面の文は index.html の `drain`。テストは tests/effects.test.js・tests/attack.test.js・tests/effects.browser.test.mjs
- `data/rules.json` の `bgm`・`audio/`・`CREDITS.md`・`tools/build_audio.py`：試合の曲 The Japanese Sandman と針の音・ノイズの輪・はじまりの数え下げ（参・弐・壱。KJ-133）。元は `audio/src/`（加工しない。権利は SOURCES.md）、加工したものが `audio/bgm.mp3`・`needle.mp3`・`noise.wav`（`python3 tools/build_audio.py`。要 ffmpeg・numpy）。数値（数え下げの字・曲が鳴り出す所 onset_sec・最後の1分・1.1倍・止める長さ・音量・ファイル名）は rules の `bgm` だけ。時刻の計算は core.js の `K.bgmPlan`（DOM に触らない）、鳴らすのは index.html の `BGM`・`runCount`（Web Audio。数え下げのあいだ時計は動かさない：CPU 戦は数え終えてから試合を作る・合言葉の部屋は始まりを後ろへ）。曲の入／切は歯車の欄・localStorage `kj-bgm`（初期は入）。端末のテスト（webdriver）では数え下げを出さない（`window.__KJ_COUNT_FORCE` で出す）。チュートリアルでは鳴らさない。テストは tests/bgm.test.js・tests/bgm.browser.test.mjs（偽の AudioContext。`KJ_SHOT_BGM=<フォルダ>` で画像を書く）
- `data/rules.json` の `vibrate`：スマホの振動の形（KJ-074。ms。手ごとに rules の1か所。選び方は `K.vibratePattern`。振動は index.html の `buzz`。入り切りは localStorage `kj-vibe`。`navigator.vibrate` が無い端末では入り切りを出さず何もしない。金玉は special_words で振動だけ特別）
- `data/rules.json`：数値（場・手札・点数・引き直し・勝ち・待ち時間・CPU）。数値を変えるときはここだけ。変えたら `version` を上げる
- `tests/`：テスト

## テストの回し方

```bash
npm test
```

- 中身は `node --test "tests/*.test.js" "tests/*.test.mjs"`（Node 22 以上）
- 落ちたときは、落ちたテストのファイル・名前・失敗の文が、標準出力の最後と `test-results/failures.txt`（git に入れない）にまとまって出る（`tests/failures-reporter.mjs`。KJ-062）。回し直す前にこれを控える
- `tests/data.test.js`：データの整合（レベル・部品表〔輪がない〕・対義・巡り・偏の形・同じ読み・語・特別な語・決まり）
- `tests/game.test.js`：割る・くっつける・待ち時間・放つ・点数・使用済み・取る・引き直し・勝ち・CPU・ログ。時計と乱数は差し替えている（`tests/helpers.js`）
- `tests/match.test.js`：合言葉の部屋の先着（場の札・言葉・勝ちの点・時間切れ・相手が抜けた）と、部屋を作る／入る・届いた行の確かめ・insert の時間切れ。つなぎは偽物（`KJ.memoryClaims`）。本物の Supabase には出さない
- `tests/counters.test.js`・`tests/counters.browser.test.mjs`：数＋助数詞（KJ-022。データ・読み・十円 が放てる・使った助数詞は使えない〔辞書の語にも・CPU も・二人とも〕・動けない・言い方／画面：否 の判子と「〇円は一度きり！」が真ん中に出て消える・ほかのはじかれ方でも出る）
- `tests/vibrate.test.js`・`tests/vibrate.browser.test.mjs`：スマホの振動（KJ-074。形の選び方・手ごとの形・切なら震えない・相手の手で震えない・`navigator.vibrate` が無い端末で落ちない。`navigator.vibrate` は差し替え）
- `tests/radical.test.js`・`tests/radical.browser.test.mjs`：部品の札の意味（KJ-021。部品すべてに行がある・radical_forms と食い違わない・一行の形・一覧にそろっている／画面：部品の札を選ぶと台の行に出る・字の札では出ない・外すと消える）
- `tests/reach.test.js`：丶 の行き先（KJ-077。行き先だけの字・レベルごとの出番〔勺は出番なし〕・くっつける・割る・面で落とす・語・ストック）。KJ-113：旧＝｜＋日（くっつける・割る・面で落とす・語・CPU・ヒント）と、画面の tests/kyuu.browser.test.mjs（中 を割って ｜ を出し、日 と Join で 旧。日｜ の並びは押せない。`KJ_SHOT_KYUU=<フォルダ>` で画像を書く）。KJ-137：良＝丶＋艮（N4 でだけ出番・逆順は通らない・割る・面で落とす〔top／bottom〕・語37）と、画面の tests/ryou.browser.test.mjs（N4 で 銀 を割って 艮 を出し、丶 と Join で 良。艮丶 の並びは押せない。`KJ_SHOT_RYOU=<フォルダ>` で画像を書く）
- `tests/proper_names.test.js`：地名・名字（KJ-032。一覧の数・手に持てるときだけ語に入る・印と読み・点数は普通と同じ・下の名前は通らない）と、全レベルで外す語（買春・売春）
- `tests/splitcd.test.js`・`tests/splitcd.browser.test.mjs`：割る（Split）の待ち時間（KJ-138。`data/rules.json` の `cooldown_sec.split` 5秒〔仮〕。続けて割れない・理由は 待ち時間・満ちたら割れる・割れなかったときは始まらない・人ごと・whyNot と同じ順・CPU・ヒント・しくみの説明・巡りと割るをくり返す裏技が待たされる／画面：ゲージ・押せない見え方）
- `tests/tan.test.js`：旦 を 日＋一 に割る（KJ-098。N4 でだけ・昼 は今のまま・日＋一 は 目 と 旦 の2つ〔選びの一覧・面で落とす〕・N5／小1 は 目 だけ）
- `tests/shinnyo.test.js`・`tests/shinnyo.browser.test.mjs`：辶 を点1つで見せる（KJ-116。データは U+8FB6 のまま・Shippori／Kaisei／Zen の範囲に U+8FB6 が無く kj-glyphs にある／画面：大正風・明朝の両方で 辶 が点1つ〔墨のつながり2〕）。`KJ_SHOT_SHINNYO=<フォルダ>` で画像を書く
- `tests/kuchi.test.js`：囗 を 口 として読む（KJ-096。囗＋人 で 人口・点は普通と同じ・回 は今のまま・ろ にならない・CPU とヒントも使う）
- `tests/kana.test.js`：かなに読む部品（KJ-053。天の川 3字9点・見る 2字3点・かなだけは放てない・ひらがなで残る・CPU とヒント・外す語）
- `tests/g1help.test.js`：小1 の手当て（KJ-067。`data/rules.json` の `g1`。基本の10字は山に3枚・N5/N4 は2枚のまま／手札に放てる語があり30秒なにも手をしないと光る・N5/N4 と放てる語なしでは光らない）
- `tests/attack.test.js`：特別攻撃ワード（KJ-080。語ごとの効く操作と枚数・大回転は2枚・大集合は最大の組数・空振り・ストックには効かない・CPU が放っても人に効く・自刃は自分のまま・ログ・ヒントが消える）
- `tests/lang.test.js`・`tests/lang.browser.test.mjs`・`tests/pwja.cjs`：言語の切り替え（KJ-127。言語は ja・en の2つ・初めの言語・文の表・core の文の言い換え・しくみの English・戦果の共有の English／画面：JP／EN の選びと覚える・English で日本語が残らない・終わりの画面・はじかれた理由・共有の文）。`pwja.cjs` は Playwright を端末の言語 ja-JP で開く入れ物（既定の en-US だと English で開いてしまうため。画面の試験は全部これを通す）。`KJ_SHOT_LANG=<フォルダ>` で画像を書く
- `tests/lang2.test.js`・`tests/lang2.browser.test.mjs`：言語の切り替え 段2（KJ-128。チュートリアルの English〔`ui_en`・`title_en`・`line_en`・`TUT.say`〕・部品の札の English〔`name_en`・`mean_en`・`K.radicalNote` の lang〕・くっつく相手・台の行の注／画面：English でチュートリアルを8段通す・ログは日本語のまま・部品の札と台の行）。`KJ_SHOT_LANG2=<フォルダ>` で画像を書く
- `tests/romaji.test.js`・`tests/romaji.browser.test.mjs`：English のとき読みをローマ字で出す（KJ-130。`K.romaji`〔ヘボン式・長音は oo・ou のまま〕・字の読み on／kun〔全字にある・2つまで〕・台の行の一行〔字・語〕・`K.endShow` の romaji・English のチュートリアルの読みの段〔`en_steps`。9段・日本語は8段のまま・「次へ」だけで進む〕／画面：字の札を選ぶと出る・放つ前の台には出ない・放ったあと台が空のあいだ出る・日本語では出ない・375／320px で2行に収まる・終わりの画面・チュートリアル）。`KJ_SHOT_ROMAJI=<フォルダ>` で画像を書く
- `tests/mincho.test.js`・`tests/mincho.browser.test.mjs`：「明朝体」を放つと、その試合の札の字が明朝に（KJ-131。`data/special.json` の `effects` の op `face`・target `both`・value `mincho`。決まりは core.js の `g.face`・`g.applyFace`・出来事 `face`・ログの手 `札の字`。人・CPU・合言葉の部屋の相手が放っても二人とも替わる・2回目は何もしない・大正 は何も起きない・点は普通／画面：`#game` の写し `.flip` を右端を軸に左へめくる〔0.8秒。`FLIP_MS`・`--flip-ms`〕・めくっている間も札を押せる・reduced-motion では写しが出ず一度に替わる・設定 `kj-face` は書き換えず、試合が終わる・はじめる前の画面へ戻ると設定に戻る・戦況に「明朝体！札ノ字ガ明朝ニ」〔`STR.SENKYO.face`〕・合言葉の部屋の相手のページも替わる）。`KJ_SHOT_MINCHO=<フォルダ>` で画像を書く
- `tests/tutorial.test.js`・`tests/tutorial.browser.test.mjs`：チュートリアル（8段を通せる・その手だけ通す・時間なし CPU なし・ログ／画面で通し・とばす・ボタンから・合言葉では出ない）
- `tests/layout.browser.test.mjs`：試合の画面の置き場（KJ-078・KJ-090。Back は「あなた」の行の Redraw の左・上の3つは「しくみ」の行・残り時間は CPU の行の右端・Play は幅いっぱい・Redraw は卓の外／Redraw の1回タップ・長押し〔ゲージは弁柄。KJ-115〕・途中で離す）
- `tests/cpuhand.browser.test.mjs`：CPU 対戦で相手の上の段を見せる（KJ-092。CPU の行の下に8マス・字だけ・ストックは出さない・押せない・CPU が動くと変わる・375×667 に自分の手札が収まる・ひとりとチュートリアルでは出ない。合言葉の部屋でも出る〔KJ-140〕ことは tests/browser.test.mjs）
- `tests/joinmark.browser.test.mjs`：Join のボタンの印（KJ-103。Jo｜in が Split の逆に傾く〔+5／−5 度〕・継ぎ目の真上に墨の放射3本〔線3本・太さ1.6・端は丸〕・根元と字の上端の間 0〜3px・字に重ならない・押せないとき 0.35・375／320px ではみ出さない・読み上げは Join・押せばくっつく）。`KJ_SHOT_JOIN=<フォルダ>` で画像を書く
- `tests/oigashira.test.js`・`tests/oigashira.browser.test.mjs`：耂 を 土＋ノ に割る（KJ-114。N4 でだけ・輪がない・割る／くっつける〔土＋ノ→耂。逆順は通らない〕・面では落とせない・台の行・CPU が 土ノ子 を 耂子 に・ヒント／画面：教→孝→耂→土ノ→耂 を 375×667 で）。`KJ_SHOT_OIGASHIRA=<フォルダ>` で画像を書く
- `tests/playmark.browser.test.mjs`：Play のボタンの印（KJ-120。点線の弧と矢の SVG〔54×16・太さ1.6・端は丸・点線 3 3〕・字の上端に重ならない・押せない／押せるで字と同じ色・ボタンの中に収まる・高さが変わらない・読み上げは Play・375／320px）。`KJ_SHOT_PLAY=<フォルダ>` で画像を書く
- `tests/joinpop.browser.test.mjs`：Join の放射の弾み（KJ-105。くっつけに成功すると放射だけ一度弾む〔1→約1.6→1・根元が軸〕・面でくっつけても弾む・失敗と CPU のくっつけでは弾まない・押せない見え方でも見える・reduced-motion では弾まない・字とほかは動かさない）。`KJ_SHOT_JOINPOP=<フォルダ>` で画像を書く
- `tests/mastspin.browser.test.mjs`：題字の裏の筋を回す（KJ-125。筋の `<g>` だけに mastspin〔120s・linear・infinite〕・半円と題字の箱には付かない・軸は半円の中心・`--mast-spin` で速さが変わる・30秒で90度・枠の四隅に筋がある・reduced-motion では回さない）。`KJ_SHOT_MAST=<フォルダ>` で画像を書く
- `tests/entry.test.js`・`tests/startscreen.browser.test.mjs`：はじめる前の画面の組み直し（KJ-123。「CPU戦／友達と対戦」・作る／入るの出し分け・?room= で部屋に入る・時間は5分と10分〔900 は10分〕・歯車と振動〔vibrate が無い端末では振動の欄だけ無い。歯車は曲のためいつも出る。KJ-133〕・記事は常に入〔kj-news=0 でも出る〕・ログ頭の「入り方」行）。`KJ_SHOT_START=<フォルダ>` で画像を書く
- `tests/layoutab.browser.test.mjs`：試合の画面の並びは A だけ（KJ-089。並び B と、はじめる前の画面の「並び」の切り替えを消した。切り替えも下の段 `#dock` も無い・端末に `kj-layout` の B が残っていても A の置き場〔Back は Redraw の左・Play は幅いっぱい〕。`kj-layout` は読まない）
- `tests/joinnote.test.js`・`tests/joinnote.browser.test.mjs`：部品の札のくっつく相手（KJ-083。手札・ストックにあるときだけ・字の札では出ない・並べる順・3組まで・3つの形〔`data/rules.json` の `join_note`。full／partner／mask。`K.joinNote`〕／画面：1行目に出る・375／320px で情報の欄が2行のまま）
- `tests/missed.test.js`・`tests/missed.browser.test.mjs`：終わりの「見逃した言葉」（KJ-082。ヒントで光って放たなかった語が出る・放った語は出ない・字数の多いほう→後のほう・ヒントが無ければ出ない・CPU は数えない・小1 の見逃しの光りも／画面：終わりに1行出る・無ければ空）
- `tests/endword.test.js`・`tests/endword.browser.test.mjs`：終わりの画面の言葉をタップ（KJ-087。`K.endShow` の items・missed に reading・ens〔2つまで〕・url〔コトバンク〕・en の無い語・辞書に無い語で落ちない／画面：欄が語の下に開く・もう一度で閉じる・開けるのは1つ・画面が閉じない〔時計が止まる〕・外を押すと閉じる・見逃した言葉にも・リンクの URL と target）
- `tests/paper.test.js`・`tests/paper.browser.test.mjs`：新聞紙風の見た目（KJ-093。漢数字・号数・日付・字体の同梱と落とし先・札に出る字がどれかの字体にある／画面：表紙の題字と号数と日付・号数が試合ごとに増える・札の字の切り替えと覚える・字と地の明暗差 4.5 以上・卓の罫線と見出し・選んだ札の弁柄の縁・角丸なし・375／320px で押せる）
- `tests/senkyo.test.js`・`tests/senkyo.browser.test.mjs`：戦況の欄・背景の記事・紙のざらつき（KJ-094。文の型〔`SENKYO`〕・あなた→アナタ・取った字が文のおわりに増える・新しい順・点と字数は漢数字・読みはカタカナ／画面：縦書きの欄と見出し・あなたの行は弁柄の太字・古い行が左へ流れる・375×700 に収まる〔空のあいだ 40px。KJ-106：見出しは1列〕・記事は押せない／札の下・背景の記事はいつも入〔kj-news=0 でも出る。KJ-123〕・ざらつきの背景・空きマスは透けない）
- `tests/toruban.browser.test.mjs`：取る番の見え方（KJ-119。取る番のあいだ手札・操作・台が薄い〔0.45〕・山札と CPU は濃い・取りきると戻る・入った瞬間に弾みの印 `data-pops` が一度だけ・「あと N 枚」・動きを減らす設定では弾まない）。`KJ_SHOT_TORU=<フォルダ>` で画像を書く
- `tests/btnlook.browser.test.mjs`：卓の操作5つの押せる／押せないの見え方（KJ-099・KJ-102。見え方は下線だけ。設定「ボタン」は無い・`<html data-btn>` も無い・localStorage `kj-btn` は読まない〔端末に white・outline が残っていても下線〕・押せる字は 4.5 以上・押せないは紙の地に墨 0.35・Play の押せないも札の地に墨 0.35〔KJ-117。台が1枚のときも押せない見え方で、押すと 否 と理由〕・押せるときは弁柄の地・Redraw は変わらない・Back は押せるときだけ弁柄の下線〔KJ-115〕・ヒントの光りと待ち時間のゲージが見える）。`KJ_SHOT_BTN=<フォルダ>` で画像を書く
- `tests/share.test.js`・`tests/share.browser.test.mjs`：合言葉の共有（KJ-107。`K.roomCodeFromSearch`・`K.roomShareUrl`・共有の文／画面：部屋を作ると「共有」が出る・`navigator.share` に ?room= 付きのリンクが渡る・share が無いとクリップボードに写る・?room= で開くと押さずにそのまま部屋に入る〔KJ-149。入れないと部屋に入るが選ばれ合言葉が入った画面に戻り理由が出る・入ったら URL から ?room= が消える〕・合わない合言葉は入らない）。文は `js/strings.js` の `TEXT.shareText` ほか。`KJ_SHOT_SHARE=<フォルダ>` で画像を書く
- `tests/shareend.test.js`・`tests/shareend.browser.test.mjs`：戦果の共有（KJ-108。`K.shareResultText`・`K.siteUrl`・勝ち／負け／引き分け／ひとり／言葉なし・型は `SHARE_RESULT` の1か所／画面：終わりに「共有」が出る・`navigator.share` に文と URL〔?room= なし〕・share が無いとクリップボード・チュートリアルでは出ない）。`KJ_SHOT_SHAREEND=<フォルダ>` で画像を書く
- `tests/aori.test.js`・`tests/aori.browser.test.mjs`：煽り文句（KJ-126。`K.aoriLine`〔終わりの画面。9通り〕・`K.aoriShareLine`〔共有。6通り〕・言葉なしは共有の行なし・ひとりは出ない・共有の文の最後が リンク→`#漢対普請瓦版`・合言葉の共有にタグなし・型は `js/strings.js` の `AORI`・`AORI_SHARE`／画面：見出しの下に1行・墨・Zen・飾りなし・375／320px・「、」「！」の後ろでだけ折る）。`KJ_SHOT_AORI=<フォルダ>` で画像を書く
- `tests/browser.test.mjs`：画面（合言葉の部屋を2つのページで1試合〔kj_claims は page.route で偽物に回し、Realtime は差し替え〕・台に札を置いても手札と場が動かない・並べる順が逆・放つ→取る・引き直し・ログをコピー・選ぶと札はマスに残り台に写しが並ぶ・入れ替え）。Playwright の Chromium がないと skip になる。skip は「通った」ではない
- 変えたら必ず `npm test` を回し、件数と結果を PR に書く

## ログの自動送信（KJ-020）

- 試合の終わり・途中で捨てたときに、ログを Supabase の `play_logs` に1行送る（`index.html` の `sendLog`、中身は `js/core.js` の `playLogRow`）。手元（localhost）とテスト（webdriver）では送らない。テストで送る処理を見るときだけ `window.__KJ_LOG_FORCE` を立て、通信は `page.route` で受ける（本物の送り先に出さない）
- 鍵は publishable（`sb_publishable_…`。公開してよい）だけ。secret・service_role は書かない

## ローカルで開く

```bash
python3 -m http.server 8000
```

file:// では data/ を読めない。

## PR の決まり

- main に直接 push しない。ブランチ（名前は `kj-` で始める）を切って PR（下書き）にする。main に入ると Pages（公開 URL）に出る
- PR は下書きで出す。テストと Actions が通ったら、下書きを外す（REST の POST /repos/kaz6/kanji-barabara-mock/pulls/{番号}/ccr/ready_for_review）。マージは `.github/workflows/automerge.yml` がする（test が success・下書きでない・base が main・同じリポジトリの `kj-` ブランチ・mergeable の PR を、30分ごと／test のあと／下書きを外したときにマージする。マージのあと Pages のビルドも頼む）。係はマージの API を呼ばない
- PR の説明に必ず書く
  - **確かめ方**：何を回して何を見たか（`npm test` の件数と結果、画面で見たこと）。確かめていないことも書く
  - **危ない所**：壊れうる所・遊びの決まりが変わる所・データを変えた所
  - **戻し方**：どのコミットを revert すればよいか、データや設定（localStorage など）に残るものがあるか
- 設計の判断をしたら docs/DECISION_LOG.md に R-番号で残し、docs/SESSION_STATE.md を更新する
- R-004（「音」の印のふるい）は閉じた（同音の組はふるわない。D-023 のまま）。ふるいを足さない
