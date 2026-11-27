# STRINGS（画面の文言の一覧。KJ-024）

作者が赤を入れる一覧。正本は `js/strings.js`（画面はそこから出す）。DECISION_LOG は R-056（D-041）。

英語にしたのは操作の8つのボタンの文字と、札の角の印だけ。ほかの画面の文言（はじめる前・山札・手札・ストック・台の行・はじかれた理由・終わり・しくみ）とログは日本語のまま。

## ボタン

| 日本語の元の文言 | 英語 | 決めた人 |
|---|---|---|
| 放つ | Play（画面の字は Play の上に点線の弧と矢。読み上げは Play） | 作者（「あとは提案通りで」。印は KJ-120 で作者が案C を選んだ） |
| 割る | Split（画面の字は Sp｜lit。間に札の割れ目と同じ点線。読み上げは Split） | 作者（ロゴは KJ-059） |
| くっつける | Join（画面の字は Jo｜in。継ぎ目の上に墨の放射3本。読み上げは Join） | 作者（ロゴは KJ-103） |
| 反転 | Flip（画面の字は Fl＋印＋p。読み上げは Flip） | 作者（同上。印は KJ-048 で作者が F2 を選んだ） |
| 巡り | Cycle（画面の字は 印＋ycle。読み上げは Cycle） | 作者（同上。印は KJ-048 で作者が C1 を選んだ） |
| 同音 | Same reading（画面の字は 印＋ame reading。読み上げは Same reading） | 作者（KJ-048。「SOUND conversion は 読み方変換 のような意味にできるかな」→ 候補 A に「aで！」→「あ だとわからないかもだ…」「Sで」→ 印を字に組み込む S1 を選んだ） |
| 戻す | Back（左向きの矢印＋Back。「あなた」の行の Redraw の左。KJ-078・KJ-090） | 作者（同上。置き場は KJ-078） |
| 引き直し | Redraw（卓の外の点の行の右端。長押しで引き直す。KJ-078） | 作者（同上。置き場と長押しは KJ-078） |

## ボタンの添え字

| 日本語の元の文言 | 英語 | 決めた人 |
|---|---|---|
| 引き直しの添え字（KJ-049） | 次の値段と残りの回数（Redraw 0pt あと5回・Redraw -10pt あと3回・使いきったら あと0回）。値段は 0・5・10・15・20 | 作者（値段と5回まで。2026-11-23）。「あと◯回」の言い方は係の仮置き |
| 引き直しを1回タップしたときの案内（KJ-078） | 「長押しで引き直し」（Redraw のすぐ上に小さく。1.8秒。ボタンではないので日本語。js/strings.js の `TEXT.redrawHold`） | 係の仮置き（作者の確認待ち） |
| 反転・巡り・同音の待ち 3s など | 出さない。ボタンの地のゲージで見せる | 相談チャットの仮決め（KJ-034。作者の確認待ち） |

## 札の角の印

| 日本語の元の文言 | アイコン | 決めた人 |
|---|---|---|
| 反 | Flip の印（点付きの両向き縦矢印。見本 F2） | 作者（KJ-048） |
| 巡 | Cycle の印（矢じり付きの C。見本 C1） | 作者（KJ-048） |
| 音 | 札の角には出さない（KJ-057。作者「そもそも、S表記なくそうかな…」）。ボタンの Same reading の S（見本 S1）はそのまま | 作者（KJ-048・KJ-057） |

- 印は ⇄・↻・♪ の文字をやめて SVG にした（KJ-048）。ボタンの文字の1字に組み込んだ形と、札の角の印は同じ形。色は文字と同じ。形は js/strings.js の ICON_SHAPES の1か所（線の太さ・大きさは仮）
- 札の角の並びは 反→巡 の順（KJ-057 で 音 を外した。例：上 → Flip の印だけ）
- しくみの説明の「（印：…）」は 反転・巡りだけ同じ SVG を出す（同音には出さない。KJ-057。説明の文は日本語のまま）

## ヒント（KJ-037。ボタンではないので日本語）

| 文言 | 出る所 | 決めた人 |
|---|---|---|
| ヒント | 人が放たずに90秒たったとき（KJ-086。続けてはじかれたときの出し方は止めた）、山札の上に小さな札で（10秒。ほかの手をしても残る。光らせた言葉を放つ・光らせた札が無くなる・引き直しを使うと消える。KJ-065） | 相談チャット（作者の言葉は DECISION_LOG R-063。小さな札だけ＝カード P-037） |
| 見逃した言葉：字（読み） 意味 | 試合の終わりの画面（ヒントで光って放たれなかった言葉があるときだけ。KJ-082） | 係の仮決め（作者が見て直す） |
| 読み：かな　意味：英語（2つまで） | 終わりの画面の言葉をタップすると開く欄（KJ-087。意味は語の表に en があるときだけ） | 係の仮決め（作者が見て直す） |
| コトバンクで引く | 同じ欄のリンク（新しいタブで kotobank.jp の検索を開く。KJ-087） | 作者の言葉をもとに係の仮決め |
| くっつく：禾＋火→秋（rules の join_note で 禾＋火／禾＋？ にも） | 台の行の1行目（部品の札を選び、くっつく相手が手札・ストックにあるときだけ。KJ-083） | 係の仮決め（作者が試して決める） |
| ヒントの行（しくみの説明） | 「しくみ」の中。ヒントが出る条件と、言葉は文字で出ないこと | 係の仮決め |

## 題・説明・ストックの見出し（KJ-042。ボタンではないので日本語。作者「文は仮」。正本は js/strings.js の TEXT）

| 文言 | 出る所 | 決めた人 |
|---|---|---|
| （消した）漢字版（仮） | 題（`#title`）。KJ-109 で消した。表紙の題字は下の「漢対普請瓦版」 | 作者（KJ-109） |
| 漢字を割ってくっつけて、放つ。／50点先取か10分経過時に、得点の多い方が勝ち。 | はじめる前の説明（2行。数はルールと選んだ時間から。KJ-110） | 作者（KJ-110） |
| Split kanji, join them, and play words. First to 50 points — or the higher score after 10 minutes — wins. | 説明の英訳（下に小さく。`TEXT.leadEn`。KJ-110） | 係の仮決め（チャットの訳。作者が直す。words は Play に合わせた） |
| ストック 0 / 8 | 自分の手札の下（「字も部品も置ける」は外した。しくみの説明には残っている） | 係の仮決め |

## チュートリアル（KJ-043。作者「文は仮」。正本は data/tutorial.json）

文・段の名前・ボタンの文字（チュートリアル／とばす／本番へ）は data/tutorial.json の1か所。文は日本語。遊びのボタン（Play・Split・Flip・Cycle・Same reading）は英語のままで、文の中でもその名前で呼ぶ。話し手・キャラクターは置いていない。段3 以降の放ったあと（自動で取るあいだ）の案内は `ui.autoTake`、ログのメモは `ui.autoNote`（KJ-055。仮）。決めた人は、文は全部「係の仮決め」（作者が直す）。


## 振動の入り切り（KJ-074。ボタンではないので日本語。仮）

| 文言 | 出る所 | 決めた人 |
|---|---|---|
| 振動 ／ 入 ・ 切 | はじめる前の画面の歯車を押すと開く設定の欄の中（`navigator.vibrate` がある端末だけ。index.html の `#grpVib`・`#setPanel`。KJ-123） | 係の仮決め |
| 合言葉の部屋（段の見出し）／ 部屋を作る ／ 部屋に入る | はじめる前の画面（友達と対戦のとき。作る／入るの選ぶ札 `#act`。KJ-123） | 係の仮決め（見出しは前の文言から括弧を取った） |

## 表紙と札の字（KJ-093。ボタンではないので日本語。仮）

| 文言 | 出る所 | 決めた人 |
|---|---|---|
| 漢対普請瓦版 | 表紙の題字（`js/strings.js` の `TEXT.masthead`。旧「バラバラ新報」） | 作者（KJ-109「漢対普請瓦版 / Split & Join — a Kanji Duel でいきます」） |
| かんたいふしんかわらばん | 題字の上のルビ（`TEXT.mastheadRuby`。9px） | 作者（KJ-109） |
| Split & Join — a Kanji Duel | 題字の下の英字の副題（`TEXT.mastheadSub`。11px） | 作者（KJ-109） |
| 第○號・二〇二六年十一月二十五日 | 表紙の題字の下の行（`K.issueLabel`・`K.kansujiDate`） | 作者「案入れてみよう」 |
| 札の字 ／ 大正風 ・ 明朝 | はじめる前の画面（`#grpFace`。`TEXT.faceLabel`・`faceTaisho`・`faceMincho`） | 作者「札の字、大正風と、切り替えられるように」 |
| 卓に並ぶ | 卓の左の縦書きの見出し（index.html の CSS `.table::before`） | 作者（KJ-118。前は見本「新聞21」の「卓　場と台」） |

## 戦況の欄・背景の記事（KJ-094。ボタンではないので日本語。文の型と記事の文は仮）

| 文言 | 出る所 | 決めた人 |
|---|---|---|
| 戦況 | 欄の左の縦書きの見出し（`js/strings.js` の `SENKYO.head`。前の「放った言葉」〔二人とも二度と使えない〕に替えた） | 作者「戦況は読まないけど賑やかしにいいので好きです」 |
| アナタ、空白（クウハク）ヲ放ツ。二字ニテ三点。山札ヨリ新・話ヲ取ル。 | 戦況の1行（型は `SENKYO.release`・`yomi`・`score`・`take`・`sep`。仮。組むのは `K.senkyoLines`。あなた→アナタ・CPU はそのまま。放った言葉は漢字のまま。読みはカタカナ） | 作者「戦況で使われるひらがなに相当する箇所はカタカナにしたい。読めたらすごいよってことで」。型は係の仮決め |
| 明朝体！札ノ字ガ明朝ニ | 「明朝体」を放ったとき戦況に出る1行（`SENKYO.face`。KJ-131。仮。出すのは `K.senkyoLines` が試合のログの手 `札の字` の行から） | 作者の言葉に文は無い。係の仮決め（カードの例のとおり） |
| 本紙特報。漢字ヲ割リ、回シ、裏返シ、…（約160字） | 背景の記事（`js/strings.js` の `NEWS`。仮。見本「新聞21」の文。画面いっぱいに繰り返す） | 作者「背景にうすく新聞ぽい長文を羅列する」。文は見本どおり |
| 背景の記事の入／切 | （KJ-123 で消した。`TEXT.newsLabel`・`newsOn`・`newsOff` は無い） | 作者（「背景文字はありにするので選ぶ部分は失くして」） |
| CPU戦 ／ 友達と対戦 | 遊び方の札（`K.PLAY_MODES`） | 作者（KJ-123） |
| 設定（歯車の読み上げ） | はじめる前の見出しの行（`TEXT.settings`） | 作者（KJ-123 カード） |
| （消した）ボタン ／ 白抜き ・ 下線 | KJ-102 で設定ごと消した。卓の操作5つは下線の1つだけ（`TEXT.btnLabel`・`btnWhite`・`btnLine` も消した） | 作者（KJ-102「ボタンは下線がよい」） |

## 合言葉の共有（KJ-107）

| 文言 | 置き場 | 決めた人 |
|---|---|---|
| 共有 | 合言葉の横のボタン（`TEXT.shareButton`） | 作者（「合言葉の共有」）。文字は仮 |
| 漢対普請瓦版 Split & Join — a Kanji Duel／漢字を組み合わせて、言葉づくり対戦しよう。合言葉 ○○ リンク | 共有の文（`TEXT.shareText`。題は `TEXT.masthead`・副題は `TEXT.mastheadSub`。KJ-122） | 作者の文 |
| コピーした | 共有が使えない端末で、文とリンクを写したとき（`TEXT.shareCopied`） | 仮 |
| 共有できなかった。合言葉を口で伝えてください | 共有もコピーもできなかったとき（`TEXT.shareFailed`） | 仮 |

## 戦果の共有（KJ-108）

| 文言 | 置き場 | 決めた人 |
|---|---|---|
| 共有 | 終わったあとの上の帯のボタン（`#bShareEnd`。字は `TEXT.shareButton` と同じ） | 作者（「戦果の共有」）。文字は仮 |
| 題 号数／相手ニ勝ツ 五十一対四十五／決メ手ハ『大問題』九点／（N4）（カードの例は決め手とレベルが続き。レベルは別の行にした） | 共有の文の型（`js/strings.js` の `SHARE_RESULT`。題は `TEXT.masthead`。負け＝敗ル／引き分け＝ト引キ分ケ／ひとり＝一人デ○点） | 仮（作者が直す。例の元は作者のカードの案） |
| 負（点がマイナスのとき漢数字の前に。負五） | 文の中の点（`SHARE_RESULT.minus`。引き直しの払いすぎ） | 仮（作者が直す） |
| CPU（トテモヨワイ／フツウ／ツヨイ）・友ダチ | 文の中の相手の呼び名（`SHARE_RESULT.whoCpu`・`whoRoom`） | 仮 |
| 共有できなかった | 共有もコピーもできなかったとき、ボタンの字を一時これにする（`TEXT.shareEndFailed`） | 仮 |


## 煽り文句（KJ-126）

話し手は記者（スポーツ新聞の見出し）。文は全部仮。話し手も仮。作者が直す。置き場は `js/strings.js` の `AORI`（終わりの画面）・`AORI_SHARE`（戦果の共有）・`TEXT.hashtag`。選ぶのは `js/core.js` の `K.aoriLine`・`K.aoriShareLine`（上から順に最初に合ったもの）。

| 文言 | いつ | 置き場 | 決めた人 |
|---|---|---|---|
| 沈黙の一戦、語らずして幕 | 終わりの画面：言葉を1つも放っていない | `AORI.silent` | 仮 |
| ○○、ここに極まれり！ | 勝ち・特別な語を放った | `AORI.winSpecial` | 仮 |
| ○字の大技、炸裂！ | 勝ち・一番長い語が4字以上（○は漢数字） | `AORI.winLong` | 仮 |
| 電光石火の快勝！ | 勝ち・時間切れの前に50点に届いた | `AORI.winFast` | 仮 |
| 手に汗握る大接戦！ | 勝ち・点差10点以下 | `AORI.winClose` | 仮 |
| 堂々の一番勝ち！ | 勝ち（ほか） | `AORI.win` | 仮 |
| 互角の名勝負、決着は次号へ！ | 引き分け | `AORI.draw` | 仮 |
| 惜敗！雪辱は次の一番で | 負け・点差10点以下 | `AORI.loseClose` | 仮 |
| 涙の敗走、されど再起を誓う | 負け（ほか） | `AORI.lose` | 仮 |
| 號外！『○○』現る | 共有：特別な語を放った | `AORI_SHARE.special` | 仮 |
| 號外！○字の大技『○○』 | 共有：一番長い語が4字以上 | `AORI_SHARE.long` | 仮 |
| 互角！決着は次号へ | 共有：引き分け | `AORI_SHARE.draw` | 仮 |
| ○○対○○、手に汗握る大接戦！ | 共有：点差10点以下（点は漢数字） | `AORI_SHARE.close` | 仮 |
| 快勝！決め手は『○○』 | 共有：勝ち（○○＝一番点の高い語） | `AORI_SHARE.win` | 仮 |
| 無念。されど『○○』を放つ | 共有：負け（同上） | `AORI_SHARE.lose` | 仮 |
| #漢対普請瓦版 | 戦果の共有の最後の行（URL の次）。合言葉の共有には付けない | `TEXT.hashtag` | 作者（「ハッシュタグもつけようぜ」）。タグの字は仮 |


## 言語（KJ-127。段1）

言語は 日本語・English の2つ。正本は `js/strings.js` の `U`（ja・en の表。`STR.t(鍵)`）・`CORE_EN`（core.js が日本語で返す文の言い換え。`STR.tr(文)`）・`HOWTO`（遊び方の説明。`STR.howto`）・`SHARE_RESULT_EN`（English の戦果の共有の型）。選んだ言語は localStorage `kj-lang`。**訳は全部仮**（係が作った。英語に強い人が見るまで）。漢字・語・読み（かな）は訳さない。
日本語のまま残す（段2は P-128）：題字・ルビ・號数・日付・説明の2行・戦況・背景の記事・煽り文句・ログ・操作のボタン（Split など）・チュートリアル・部品の札の意味・くっつく相手・台の行の注・クレジット。`CORE_EN` に無いはじかれた理由・部屋のエラーは English でも日本語。

### 文の表（`U`。例の引数で組んだ形）

| 鍵 | 日本語 | English |
|---|---|---|
| `setHead` | はじめる前に選ぶ | Choose before you start |
| `lblPlay` | 遊び方 | Mode |
| `lblPower` | 強さ | CPU level |
| `lblRoom` | 合言葉の部屋 | Room |
| `lblLevel` | レベル | Level |
| `lblTime` | 時間 | Time |
| `lblVib` | 振動 | Vibration |
| `lblFace` | 札の字 | Card font |
| `faceTaisho` | 大正風 | Taisho style |
| `faceMincho` | 明朝 | Mincho |
| `on` | 入 | On |
| `off` | 切 | Off |
| `actHost` | 部屋を作る | Create a room |
| `actEnter` | 部屋に入る | Join a room |
| `codePh` | 数字4けた | 4 digits |
| `codeAria` | 合言葉 | Room code |
| `enterBtn` | 合言葉で入る | Join with code |
| `enterNote` | 入る側は、作った人のレベル・時間で遊ぶ | If you join, you play at the host's level and time |
| `cancel` | やめる | Cancel |
| `start` | はじめる | Start |
| `langBtn` | 言語 | Language |
| `settings` | 設定 | Settings |
| `counts` | 字 284・語 11036（レベル N4） | 284 kanji, 11036 words; level N4 |
| `dataFail` | データを読めませんでした（file:// では開けません。Pages かローカルのサーバーで開いてください） | Couldn't load the data (it won't open from file://. Use Pages or a local server) |
| `roomMaking` | 部屋を作っている… | Creating the room... |
| `roomHosted` | 合言葉を相手に伝えてください（レベル N5・5分）。相手を待っています | Tell your friend the room code (level N5, 5分). Waiting for them... |
| `roomFinding` | 部屋を探している… | Looking for the room... |
| `roomVersion` | 相手と版がちがう（二人とも読み込み直してから、もう一度） | Version mismatch (both of you reload the page, then try again) |
| `roomTheirs` | 相手の設定：レベル N5・5分 | Host's settings: level N5, 5分 |
| `roomJoining` | （相手の設定）。入っている… | （相手の設定）. Joining... |
| `roomWaiting` | （相手の設定）。始まるのを待っています | （相手の設定）. Waiting for the game to start |
| `roomCancelled` | やめた | Cancelled |
| `roomHostSet` | 作った人の設定：レベル N5・5分 | Host's settings: level N5, 5分 |
| `howtoSum` | しくみ | How it works |
| `again` | もう一度 | Play again |
| `setupBtn` | 設定を変える | Change settings |
| `logBtn` | ログ | Log |
| `copyBtn` | コピー | Copy |
| `copyLog` | ログをコピー | Copy log |
| `copied` | コピーした | Copied |
| `copyFail` | 選んである文字を手でコピーしてください | Please copy the selected text by hand |
| `shareButton` | 共有 | Share |
| `shareCopied` | コピーした | Copied |
| `shareFailed` | 共有できなかった。合言葉を口で伝えてください | Couldn't share. Tell your friend the room code another way |
| `shareEndFailed` | 共有できなかった | Couldn't share |
| `shareText` | 漢対普請瓦版 Split & Join — a Kanji Duel⏎漢字を組み合わせて、言葉づくり対戦しよう。合言葉 2901 https://…/?room=2901 | 漢対普請瓦版 Split & Join — a Kanji Duel⏎Combine kanji and make words — a word duel! Room code 2901 https://…/?room=2901 |
| `hashtag` | #漢対普請瓦版 | #漢対普請瓦版 #KanjiDuel |
| `msgWin` | 勝ち（48 対 30） | You win (48-30) |
| `msgLose` | 負け（30 対 48） | You lose (30-48) |
| `msgDraw` | 引き分け（30 対 30） | Draw (30-30) |
| `msgSolo` | ひとりで 48 点 | Solo: 48 pts |
| `esPts` | 点 | pts |
| `esVs` | 対 | vs |
| `esPlus` | +9点 | +9 pts |
| `esMissed` | 見逃した言葉： | Missed word:  |
| `esReading` | 読み： | Reading:  |
| `esMeaning` | 意味： | Meaning:  |
| `esSep` | 　 |    |
| `esKotoban` | コトバンクで引く | Look up on Kotobank |

### core.js の文の言い換え（`CORE_EN`）

| 日本語（core.js が返す文） | English |
|---|---|
| 小1（小学1年の漢字80字） | Grade 1 (the 80 kanji of elementary grade 1) |
| 小1 | Grade 1 |
| N4（N5＋N4 の字） | N4 (N5 + N4 kanji) |
| CPU戦 | vs CPU |
| 友達と対戦 | vs a friend |
| とても弱い | Very weak |
| ふつう | Normal |
| つよい | Strong |
| 勝ち！ | You win! |
| 負け… | You lose... |
| 引き分け | Draw |
| おわり | Done |
| 2字から！ | 2+ characters! |
| 漢字の札が要る！ | Needs a kanji card! |
| もう放った言葉！ | Already played! |
| 順番が逆！ | Wrong order! |
| 山札から取りきるまで動けない！ | Take from the deck first! |
| 山札にない！ | Not in the deck! |
| 辞書にない！ | Not in the dictionary! |
| 手札もストックもいっぱい！ | Hand and stock are full! |
| 手札がいっぱい！ | Hand is full! |
| ストックがいっぱい！ | Stock is full! |
| くっつかない！ | Doesn't join! |
| 割れない！ | Can't split! |
| できない字！ | Not a valid kanji! |
| 待ち時間！ | Cooling down! |
| 同じ読みの字がない！ | No kanji with the same reading! |
| 取れる枚数がない！ | Nothing left to take! |
| 相手が先に放った！ | Opponent played it first! |
| 相手が先に取った！ | Opponent took it first! |
| 引き直しは5回まで！ | Redraw limit: 5! |
| 合言葉は数字4けた | The room code is 4 digits |
| つながらない | Can't connect |
| その合言葉の部屋がない | No room with that code |
| 合言葉を作れなかった（もう一度） | Couldn't make a room code (try again) |
| その部屋はもう始まっている | That room has already started |
| 1枚だけ！ | Select exactly 1 card! |
| 2枚だけ！ | Select exactly 2 cards! |
| その字にはならない！ | That isn't the result! |
| その面ではくっつかない！ | Doesn't join on that side! |
| 同じ読みではない！ | Not the same reading! |
| 札がない！ | No such card! |
| 通信中！ | Please wait! |
| 終わった！ | The game is over! |
| 〇円は一度きり！（円は使った助数詞。人・本・日… も同じ） | Only one 円 per match! |

遊び方の説明（しくみ）17行の English は `js/strings.js` の `HOWTO.en`。戦果の共有の English の型は `SHARE_RESULT_EN`（例：`漢対普請瓦版 第壱號 / （煽り文句。日本語のまま） / Beat CPU (very weak) 48-30 / Best word: '十円' 9 pts / (N5)⏎URL⏎#漢対普請瓦版 #KanjiDuel`）。

## 言語（KJ-128。段2）

English にした範囲（段1のあとの続き）。訳は全部仮（係が作った）。English のとき画面に出る文は、日本語と同じ場所に置いてある。

- チュートリアル：`data/tutorial.json` の `ui_en`（ボタン・文の型）・`steps[].title_en`（段の名前：Play・Take・Split・Join・Flip・Cycle・Same reading・Done）・`actions[].line_en`（案内の1行）。画面は `TUT.uiText(k)`・`TUT.title()`・`TUT.line()`・`TUT.say(why)`。ログに残る文（`autoNote`・段のメモ・はじいた理由）は日本語のまま
- 部品の札の意味：`data/radical_meanings.json` の `name_en`・`mean_en`（`parts` と `forms`）。`K.radicalNote(D,T,c,"en")`・`K.radicalFormNote(D,base,"en")`。形：`艹 (grass): grass; plants`／`儿 (legs) = 人`／`ナ = 手`／`亍: the right side of 行 (walking)`／`亻 (person radical) = 人`
- くっつく相手の行：`K.joinNote(D,T,cards,sel,"en")` → `Joins: 禾+火→秋`（3組まで・あとは `+N more`）
- 台の行の注：`js/strings.js` の `notePts`（点／ ` pts`）・`noteYoji`・`pn_地名`（place）・`pn_名字`（surname）・`pnSep`・`noteCounter`・`noteJoins`（`Joins to make 古 or 田`）・`noteRev`（Wrong order）・`noteParen`。はじかれた理由は段1の `CORE_EN`（`STR.tr(K.rejectText(...))`）
- 見逃した言葉・終わりの言葉の欄：段1の `esMissed`・`esReading`・`esMeaning`（意味は `ens`）のまま

## 読みのローマ字（KJ-130）

English のときだけ出る（日本語のときは出さない）。長音は音のとおり重ねる（画面の字体に ō・ū が無いため）。文の型は `js/core.js`（`K.charReadingLine`・`K.wordReadingLine`）に置いてあり、区切りは ` · `。

| 場所 | 形 |
| --- | --- |
| 台の行（字の札を1枚選んだとき） | `日 · nichi, jitsu / hi, bi · day, sun` |
| 台の行（語を放ったあと、台が空のあいだ） | `日本 · nihon · Japan` |
| 終わりの画面の語・タップの欄の Reading・見逃した言葉 | `にほん · nihon` |
| English のチュートリアルの読みの段（`data/tutorial.json` の `en_steps`。仮） | `Each character has readings. 大 (dai / oo) + 雨 (u / ame) → 大雨 (ooame)`。ボタンは `Next`（`ui_en.next`） |

