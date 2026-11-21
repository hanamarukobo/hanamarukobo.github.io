// 子どもに見せる ことば。年齢のめやすごとに 3つ用意する。
//   kinder: ようちえん・ほいくえん … ひらがな。みじかく、絵（{i:名前}）を おおめに
//   lower : 小学1〜2年             … ひらがな中心（ことばの区切りに スペース）
//   upper : 小学3年〜              … ならった 漢字を つかう
// 子どもごとに えらべる（kids[].level）。みんなで見る ところ（天気・予定など）は いちばん小さい子に あわせる。
// {name} のような ところは あとから 入れる。{parent} は「おうちの人の よびかた」（設定。ふつうは ママ・パパ）
// {i:gift} は 絵（img/gift.png）。絵文字は 端末で 絵が かわるので、子どもが 毎日 見る しるしは 自前の 絵に する（Words.icon）
(function () {
  "use strict";

  var LEVELS = ["kinder", "lower", "upper"];

  var T = {
    // ---- ひにち・とけい ----
    month: { kinder: "{m}がつ", lower: "{m}がつ", upper: "{m}月" },
    tallyToday: { kinder: "きょう", lower: "きょう", upper: "今日" },
    yearMonth: { kinder: "{y}ねん {m}がつ", lower: "{y}ねん {m}がつ", upper: "{y}年{m}月" },
    // ホームの 大きな 日にちの よこ。ようちえん・小学1〜2年は「日」に ふりがな（Words.dayUnit）
    dayUnit: { kinder: "日", lower: "日", upper: "日" },
    weekdays: {
      kinder: ["にちようび", "げつようび", "かようび", "すいようび", "もくようび", "きんようび", "どようび"],
      lower: ["にちようび", "げつようび", "かようび", "すいようび", "もくようび", "きんようび", "どようび"],
      upper: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    },
    weekdaysShort: {
      kinder: ["にち", "げつ", "か", "すい", "もく", "きん", "ど"],
      lower: ["にち", "げつ", "か", "すい", "もく", "きん", "ど"],
      upper: ["日", "月", "火", "水", "木", "金", "土"],
    },
    am: { kinder: "ごぜん", lower: "ごぜん", upper: "午前" },
    pm: { kinder: "ごご", lower: "ごご", upper: "午後" },
    morning: { kinder: "おはよう！{i:sunny}", lower: "おはよう！", upper: "おはよう！" },
    hello: { kinder: "こんにちは！", lower: "こんにちは！", upper: "こんにちは！" },
    night: { kinder: "こんばんは {i:moon}", lower: "こんばんは", upper: "こんばんは" },

    // ---- てんき ----
    today: { kinder: "きょう", lower: "きょう", upper: "今日" },
    tomorrow: { kinder: "あした", lower: "あした", upper: "明日" },
    dayAfter: { kinder: "あさって", lower: "あさって", upper: "あさって" },
    nthDay: { kinder: "{date:d}", lower: "{date:d}", upper: "{date:d}" },
    weatherTitle: { kinder: "{day}の おてんき", lower: "{day}の てんき", upper: "{day}の天気" },
    slotMorning: { kinder: "あさ", lower: "あさ", upper: "朝" },
    slotNoon: { kinder: "ひる", lower: "ひる", upper: "昼" },
    slotEvening: { kinder: "ゆうがた", lower: "ゆうがた", upper: "夕方" },
    deg: { kinder: "{t}ど", lower: "{t}ど", upper: "{t}度" },
    hiShort: { kinder: "{i:hot}{t}ど", lower: "さいこう {t}ど", upper: "最高 {t}度" },
    loShort: { kinder: "{i:cold}{t}ど", lower: "さいてい {t}ど", upper: "最低 {t}度" },
    noArea: { kinder: "せっていで ばしょを えらんでね", lower: "せっていで てんきの ちいきを えらんでね", upper: "設定で 天気の地域を えらんでね" },
    wxError: { kinder: "てんきが わからないよ", lower: "てんきが よめませんでした", upper: "天気を 読みこめませんでした" },
    loading: { kinder: "まってね…", lower: "よみこみちゅう…", upper: "読みこみ中…" },
    // あさって から さきの 日（週間予報）。服・かさの 目安の かわりに 出す
    wxLater: { kinder: "さきの ひの よほうは かわるかも", lower: "さきの ひの よほうは かわる ことも", upper: "先の日の予報は かわることも" },
    wxLaterSub: { kinder: "ふくと かさは まえの ひに みてね", lower: "ふくそうと かさは まえの ひに みてね", upper: "服そうと かさは 前の日に 見てね" },

    // ---- ふくそう・かさ ----
    shortSleeve: { kinder: "はんそで", lower: "はんそで", upper: "半そで" },
    longSleeve: { kinder: "ながそで", lower: "ながそで", upper: "長そで" },
    jacket: { kinder: "うわぎも きてね", lower: "ながそで＋うわぎ", upper: "長そで＋上着" },
    coat: { kinder: "コートを きてね", lower: "あつい コート", upper: "あついコート" },
    shortJacket: { kinder: "うわぎも もってね", lower: "はんそで＋うわぎ", upper: "半そで＋上着" },
    maxAt: { kinder: "ひるまは {t}どまで", lower: "ひるまは {t}どまで", upper: "日中は{t}度まで" },
    coolAt: { kinder: "あさと ゆうがたは さむいよ", lower: "あさ・ゆうがた {t}ど", upper: "朝・夕方 {t}度" },
    hot: { kinder: "ぼうしと おみず！", lower: "ぼうし・すいとうも！", upper: "ぼうし・水とうも！" },
    cold: { kinder: "てぶくろも！", lower: "てぶくろ・マフラーも！", upper: "手ぶくろ・マフラーも！" },
    rainPct: { kinder: "あめ {p}%", lower: "あめ {p}%", upper: "雨 {p}%" },
    // 家の あたりは ふらない よほうでも、地域の 降水確率が 高い とき（おりたたみを すすめる わけ）
    rainArea: { kinder: "ふるかも あめ {p}%", lower: "ちいきは あめ {p}%", upper: "地域は 雨 {p}%" },
    boots: { kinder: "かさと ながぐつ", lower: "かさ＋ながぐつ", upper: "かさ＋長ぐつ" },
    umbrella: { kinder: "かさを もってね", lower: "かさ いるよ", upper: "かさが ひつよう" },
    folding: { kinder: "かさが あると あんしん", lower: "おりたたみがさ", upper: "おりたたみがさ" },
    noUmbrella: { kinder: "かさ いらないよ", lower: "かさ いらない", upper: "かさは いらない" },
    // 家の あたり（1km四方）の 雨の 時刻（rain.js）。{h} は 時。カードが せまいので みじかく（8もじ くらい）
    rainFrom: { kinder: "{h}じから あめ", lower: "{h}じごろから あめ", upper: "{h}時ごろから 雨" },
    rainSoon: { kinder: "もうすぐ ふるよ", lower: "もうすぐ ふるよ", upper: "もうすぐ 雨" },
    rainFromTomorrow: { kinder: "あした {h}じから", lower: "あした {h}じごろから", upper: "明日 {h}時ごろから" },
    rainNow: { kinder: "いま ふってるよ", lower: "いま ふってる", upper: "いま 雨が ふっている" },
    rainStop: { kinder: "{h}じごろ やむよ", lower: "{h}じごろ やむ よほう", upper: "{h}時ごろ やむ予報" },
    rainLong: { kinder: "しばらく ふるよ", lower: "しばらく やまない", upper: "しばらく やまない" },
    takeUmbrella: { kinder: "かさを もってね", lower: "かさを もっていこう", upper: "かさを もっていこう" },
    noRainToday: { kinder: "きょうは ふらないよ", lower: "きょうは ふらない", upper: "今日は ふらない予報" },
    noRainUntil: { kinder: "{h}じまで ふらないよ", lower: "{h}じまで ふらない", upper: "{h}時まで ふらない予報" },

    // ---- よてい ----
    schedule: { kinder: "{i:calendar} よてい", lower: "{i:calendar} よてい", upper: "{i:calendar} 予定" },
    noEvents: { kinder: "なにも ないよ", lower: "よていは ないよ", upper: "予定は ないよ" },
    calError: { kinder: "よていが わからないよ", lower: "よていが よめませんでした", upper: "予定を 読みこめませんでした" },

    // ---- トップの ボタン ----
    stNotYet: { kinder: "まだ だよ", lower: "まだ だよ", upper: "まだだよ" },
    stLeft: { kinder: "あと {n}こ！", lower: "あと {n}こ！", upper: "あと {n}こ！" },
    stShow: { kinder: "{parent}に みせてね", lower: "{parent}に みせてね", upper: "{parent}に 見せてね" },
    // はなまるの日。つづいた日数（れんぞく）で かえる: 1日 / 2〜6日 / 7日 いじょう。どの だんかいも おなじ ことば（小学3年〜だけ 漢字）
    stFlower: { kinder: "きょうは はなまる！", lower: "きょうは はなまる！", upper: "今日は はなまる！" },
    stFlowerAgain: { kinder: "きょうも はなまる！", lower: "きょうも はなまる！", upper: "今日も はなまる！" },
    stFlowerDaily: { kinder: "まいにち はなまる！", lower: "まいにち はなまる！", upper: "毎日 はなまる！" },
    stDone: { kinder: "{n}こ できた！", lower: "{n}こ できたね", upper: "{n}こ できたね" },

    // ---- がんばりカレンダー ----
    // 見出しの きりかえ［がんばり｜おさいふ］の 左（2026-11-19。見出しは 名前だけ、れんぞくの 札は なくした）
    //   2026-11-20: 「がんばり」だけだと ホームの「がんばりカレンダー」と つながらないので 名前を まるごと（「カレンダー」だけは 予定と まざる）。
    //   おさいふを 使わない 子は これ 1つで 題に なる。名前が 入らない ときは kids.js の fitTabs が 字を 小さく する
    kvTabCal: { kinder: "{i:hanamaru} がんばりカレンダー", lower: "{i:hanamaru} がんばりカレンダー", upper: "{i:hanamaru} がんばりカレンダー" },
    // ---- できるようになったこと（「もう できる」に まとめた やること）。しるしは kids.js の STAIRS（img/title-stairs.svg） ----
    gradBtn: { kinder: "{n}", lower: "{n}", upper: "{n}" },
    gradTitle: { kinder: "{name}が できるように なったこと", lower: "{name}が できるように なったこと", upper: "{name}が できるようになったこと" },
    gradSteps: { kinder: "{n}だん のぼったよ！", lower: "{n}だん のぼったよ！", upper: "{n}だん のぼったよ！" },
    // まだ 0この とき（ホームと 子どもの 画面に かいだんの しるしだけ 出して、押すと これ）
    gradEmpty: { kinder: "できる ことを ふやそう！", lower: "できる ことを ふやそう！", upper: "できることを ふやそう！" },
    gradCongrats: { kinder: "もう だいじょうぶ！", lower: "もう だいじょうぶ！", upper: "もう だいじょうぶ！" },
    gradNew: { kinder: "{task}が じぶんで できるように なったね", lower: "{task}が じぶんで できるように なったね", upper: "{task}が 自分で できるようになったね" },
    gradDate: { kinder: "{m}がつ{date:d}", lower: "{m}がつ{date:d}", upper: "{m}月{date:d}" },
    // 段の 地図（Pro。stairs.js）の 空の カード
    gradRecent: { kinder: "さいきん できるように なったこと", lower: "さいきん できるように なったこと", upper: "さいきん できるようになったこと" },
    gradFresh: { kinder: "あたらしく できるように なったよ！", lower: "あたらしく できるように なったよ！", upper: "新しく できるようになったよ！" },
    gradFrom: { kinder: "{parent}から", lower: "{parent}から", upper: "{parent}から" },
    // 「もう できる」を 押すと 出る 中身の 一覧（kids.js の openBundle）。あたらしく 入って 7日の あいだは 大きく ほめ、そのあとは ひとこと
    bundlePeek: { kinder: "なかみ {n}こ", lower: "なかみ {n}こ", upper: "中身 {n}こ" },
    bundleCheer: { kinder: "{name}は、ここに ある ことが<br>いつも できるように なったよ！", lower: "{name}は、ここに ある ことが<br>いつも できるように なったよ！", upper: "{name}は、ここに あることが<br>いつも できるようになったよ！" },
    bundleNext: { kinder: "つぎは なにが できるように なるかな？", lower: "つぎは なにが できるように なるかな？", upper: "つぎは 何が できるようになるかな？" },
    bundleSteady: { kinder: "いつも できてるね！", lower: "いつも できてるね！", upper: "いつも できてるね！" },
    bundleNew: { kinder: "あたらしい", lower: "あたらしい", upper: "新しい" },
    bundleAll: { kinder: "ぜんぶ できた！", lower: "ぜんぶ できた！", upper: "ぜんぶ できた！" },
    bundleUndo: { kinder: "まだ だった", lower: "まだ だった", upper: "まだ だった" },
    dayTitle: { kinder: "{m}がつ{date:d}の きろく", lower: "{m}がつ{date:d}の きろく", upper: "{m}月{date:d}の きろく" },
    backToday: { kinder: "きょうに もどる", lower: "きょうに もどる", upper: "今日に もどる" },
    pastWaiting: { kinder: "{i:hourglass} {parent}に みてもらって ないよ", lower: "{i:hourglass} {parent}に まだ みてもらって ないよ", upper: "{i:hourglass} {parent}に まだ 見てもらって いないよ" },
    pastNone: { kinder: "この日は きろくが ないよ", lower: "この日は きろくが ないよ", upper: "この日は 記録が ないよ" },
    pastLocked: { kinder: "この日は みるだけ だよ", lower: "この日は みるだけ だよ", upper: "この日は 見るだけ だよ" },
    // あしたから さきの 日（やることを みるだけ。チェックは その日に なってから）
    futureTitle: { kinder: "{m}がつ{date:d}の やること", lower: "{m}がつ{date:d}の やること", upper: "{m}月{date:d}の やること" },
    futureLook: { kinder: "まだ さきの 日だよ。その日に なったら おしてね", lower: "まだ さきの 日だよ。その日に なったら おしてね", upper: "まだ先の日だよ。その日に なったら おしてね" },
    // ごぜん・ごご に わけるとき（せっていで オン）の 見出し。ようちえん・小学校は 14時ごろ かえるので「よる」ではなく「ごご」
    taskAm: { kinder: "{i:sunny} ごぜん", lower: "{i:sunny} ごぜん", upper: "{i:sunny} 午前" },
    taskPm: { kinder: "{i:house} ごご", lower: "{i:house} ごご", upper: "{i:house} 午後" },
    taskAny: { kinder: "{i:point-star} いつでも", lower: "{i:point-star} いつでも", upper: "{i:point-star} いつでも" },
    todayOnly: { kinder: "きょうだけ", lower: "きょうだけ", upper: "今日だけ" },
    // 「いまから やる」（自分から はじめる きっかけ。押すと 演出だけ。ポイントは かわらない）
    goBtn: { kinder: "いまから やる", lower: "いまから やる", upper: "今から やる" },
    // 週に何回の やること（週の どこかで やれば よい）
    weekLeft: { kinder: "こんしゅう あと {n}かい", lower: "こんしゅう あと {n}かい", upper: "今週 あと {n}回" },
    weekDone: { kinder: "こんしゅう できた", lower: "こんしゅう できた", upper: "今週 できた" },
    todoTitle: { kinder: "きょう やること", lower: "きょうの やること", upper: "今日の やること" },
    progress: { kinder: "{d} / {t} {i:point-star}", lower: "{t}こ のうち {d}こ やったよ", upper: "{t}こ中 {d}こ できた" },
    stOk: { kinder: "{parent} みたよ！ +{x}", lower: "{parent} みたよ！ +{x}", upper: "{parent} 見たよ！ +{x}" },
    stAll: { kinder: "ぜんぶ できた！{i:party}<br>{parent}に おしえてね", lower: "ぜんぶ できたね！{i:party}<br>ねるまえに {parent}に おはなし しよう", upper: "全部できたね！{i:party}<br>ねる前に {parent}に 話そう" },
    stCheer: { kinder: "あと {n}こ！", lower: "あと {n}こ！ がんばれ〜", upper: "あと {n}こ！ がんばれ" },
    // 1回だけの やることを 足す（「きょうの やること」の 見出しの 右。見ている 日に あわせる。11-18 に 入口を 1つに した）
    addToday: { kinder: "＋ きょうだけ", lower: "＋ きょうだけ", upper: "＋ 今日だけ" },
    addThisDay: { kinder: "＋ このひだけ", lower: "＋ このひだけ", upper: "＋ この日だけ" },
    approveBtn: { kinder: "{i:eyes} {parent} みました", lower: "{i:eyes} {parent} みました", upper: "{i:eyes} {parent} 見ました" },
    approveUndo: { kinder: "とりけす", lower: "とりけす", upper: "取り消す" },
    stStart: { kinder: "きょうも がんばろう！", lower: "きょうも がんばろう！", upper: "今日も がんばろう！" },
    point: { kinder: "{n}ポイント", lower: "{n}ポイント", upper: "{n}ポイント" },

    // ---- もくひょう（子どもごと。ポイントが たまったら たっせい。50・100・150…と くりかえす） ----
    // ホームの ゲージには 数字を 出さない（💮の 数と ポイントの 数が まざらないように）。数字は がんばりカレンダーの 中だけ
    goalNear: { kinder: "もうすこし！", lower: "もうすこし！", upper: "もう少し！" },
    goalReached: { kinder: "たっせい！", lower: "たっせい！", upper: "達成！" },
    goalBox: { kinder: "もくひょう", lower: "もくひょう", upper: "目標" },
    // おさいふ（wallet.js。2026-11-18）。お金は ようちえん・小1〜2 は「えん」、小3〜 は「円」
    wlOpen: { kinder: "{i:wallet} おさいふ", lower: "{i:wallet} おさいふ", upper: "{i:wallet} おさいふ" },
    wlYen: { kinder: "{x}えん", lower: "{x}えん", upper: "{x}円" },
    wlWants: { kinder: "ほしいもの", lower: "ほしいもの", upper: "ほしいもの" },
    wlWantAdd: { kinder: "＋ たす", lower: "＋ たす", upper: "＋ 足す" },
    wlWantNone: { kinder: "ほしいものが あったら「＋ たす」で かいてね", lower: "ほしいものが あったら「＋ たす」で かいてね", upper: "ほしいものが あったら「＋ 足す」で 書いてね" },
    wlLeft: { kinder: "あと {x}", lower: "あと {x}", upper: "あと {x}" },
    wlCan: { kinder: "いまの おかねで かえるよ！", lower: "いまの おかねで かえるよ！", upper: "いまの お金で 買えるよ！" },
    wlWallet: { kinder: "{i:wallet} おさいふ", lower: "{i:wallet} おさいふ", upper: "{i:wallet} おさいふ" },
    wlWalletNote: { kinder: "いま つかえる おかね", lower: "いま つかえる おかね", upper: "いま 使える お金" },
    // ちょきん（2026-11-18 に「あずけてる」から 名前を かえた。とっておく お金。データは pocket: "kept" の まま）
    wlKept: { kinder: "{i:piggy} ちょきん", lower: "{i:piggy} ちょきん", upper: "{i:piggy} ちょきん" },
    wlKeptNote: { kinder: "とっておく おかね", lower: "とっておく おかね", upper: "とっておく お金" },
    wlSaveBtn: { kinder: "＋ ちょきんする", lower: "＋ ちょきんする", upper: "＋ ちょきんする" },
    wlSaveTitle: { kinder: "ちょきんする", lower: "ちょきんする", upper: "ちょきんする" },
    wlSaveNote: { kinder: "おさいふから ちょきんに うつすよ", lower: "おさいふから ちょきんに うつすよ", upper: "おさいふから ちょきんに うつすよ" },
    wlSaveOver: { kinder: "おさいふの おかねより おおいよ", lower: "おさいふの おかねより おおいよ", upper: "おさいふの お金より 多いよ" },
    wlLog: { kinder: "おかねの きろく", lower: "おかねの きろく", upper: "お金の きろく" },
    wlLogNone: { kinder: "まだ なにも ないよ", lower: "まだ なにも ないよ", upper: "まだ 何も ないよ" },
    wlFromKept: { kinder: "ちょきんから", lower: "ちょきんから", upper: "ちょきんから" },
    wlToSave: { kinder: "ちょきんに", lower: "ちょきんに", upper: "ちょきんに" },
    wlToKept: { kinder: "ちょきん", lower: "ちょきん", upper: "ちょきん" },
    wlUse: { kinder: "− つかった", lower: "− つかった", upper: "− 使った" },
    wlIn: { kinder: "{parent} いれる", lower: "{parent} いれる", upper: "{parent} 入れる" },
    wlUseTitle: { kinder: "つかった おかね", lower: "つかった おかね", upper: "使った お金" },
    wlHowMuch: { kinder: "いくら", lower: "いくら", upper: "いくら" },
    wlWhat: { kinder: "なにに", lower: "なにに", upper: "何に" },
    wlWhatHint: { kinder: "れい：シール", lower: "れい：シール", upper: "れい：シール" },
    wlWhats: { kinder: ["おかし", "ゲームセンター", "まんが・ほん", "おもちゃ", "ゲーム"], lower: ["おかし", "ゲームセンター", "まんが・ほん", "おもちゃ", "ゲーム"], upper: ["おかし", "ゲームセンター", "まんが・本", "おもちゃ", "ゲーム"] },
    wlSave: { kinder: "かく", lower: "かく", upper: "書く" },
    wlWantTitle: { kinder: "ほしいもの", lower: "ほしいもの", upper: "ほしいもの" },
    wlWantName: { kinder: "なに", lower: "なに", upper: "何" },
    wlWantHint: { kinder: "れい：ゲームソフト", lower: "れい：ゲームソフト", upper: "れい：ゲームソフト" },
    wlPrice: { kinder: "ねだん", lower: "ねだん", upper: "ねだん" },
    wlBought: { kinder: "かえた！", lower: "かえた！", upper: "買えた！" },
    wlBoughtAsk: { kinder: "おさいふから {x} つかった ことに するよ", lower: "おさいふから {x} つかった ことに するよ", upper: "おさいふから {x} 使った ことに するよ" },
    wlRemove: { kinder: "けす", lower: "けす", upper: "消す" },
    wlNeedYen: { kinder: "いくらか まだ はいっていません", lower: "いくらか まだ はいっていません", upper: "いくらか まだ 入っていません" },
    wlNeedWant: { kinder: "ほしいものが まだ はいっていません", lower: "ほしいものが まだ はいっていません", upper: "ほしいものが まだ 入っていません" },
    wlFail: { kinder: "かけませんでした", lower: "かけませんでした", upper: "書けませんでした" },
    goalLeft: { kinder: "あと {x}", lower: "あと {x}", upper: "あと {x}" },
    // できたけど まだ「みました」して いない ポイント（がんばりカレンダーの もくひょうの はこ。低い 画面は 数だけ）
    goalWaitNum: { kinder: "{i:hourglass} +{x}", lower: "{i:hourglass} +{x}", upper: "{i:hourglass} +{x}" },
    goalWaitText: { kinder: "は {parent}が みたら たまるよ", lower: "は {parent}が みたら たまるよ", upper: "は {parent}が 見たら たまるよ" },
    goalTotal: { kinder: "{i:point-star} これまで {x}", lower: "{i:point-star} これまで {x}", upper: "{i:point-star} これまで {x}" },
    goalExchange: { kinder: "{i:gift} {parent} こうかんした", lower: "{i:gift} {parent} こうかんした", upper: "{i:gift} {parent} 交かんした" },
    monthFlowers: { kinder: "{i:hanamaru} {m}がつ {n}こ", lower: "{i:hanamaru} {m}がつ {n}こ", upper: "{i:hanamaru} {m}月 {n}こ" },

    // ---- 予定の URL の まちがい（おうちの人向け。BoardApi.calUrlProblem が "share" の とき） ----
    privacyNote: { kinder: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。", lower: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。", upper: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。" },
    calShareLink: { kinder: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。", lower: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。", upper: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。" },
    // ---- 表示できる 子どもの 数（おうちの人向けの 画面だけ。無料も Pro も おなじ。2026-11-19 に 無料の 2人の 上限を なくした） ----
    maxKids: { kinder: "表示できる子どもは{n}人までです。", lower: "表示できる子どもは{n}人までです。", upper: "表示できる子どもは{n}人までです。" },
    // ---- 押して 覚える ガイド（guide.js。2026-11-20）。子どもと いっしょに 見る。いちばん 小さい 子に あわせる ----
    gdWeatherT: { kinder: "てんきを みよう", lower: "てんきを みよう", upper: "天気を 見よう" },
    gdWeather: { kinder: "きょうは なにを きる？ かさは いる？", lower: "きょうは なにを きる？ かさは いる？", upper: "今日は 何を 着る？ かさは いる？" },
    gdEventsT: { kinder: "かぞくの よていを みよう", lower: "かぞくの よていを みよう", upper: "家族の 予定を 見よう" },
    gdEvents: { kinder: "きょうは だれが なにを する ひかな？", lower: "きょう {parent}は おしごと？ だれが おくって くれる？", upper: "今日 {parent}は 仕事？ だれが 送って くれる？" },
    gdNameT: { kinder: "じぶんの なまえを おそう", lower: "じぶんの なまえを おそう", upper: "自分の 名前を おそう" },
    gdName: { kinder: "きょうの やることが でてくるよ", lower: "きょうの やることが でてくるよ", upper: "今日の やることが 出てくるよ" },
    gdTaskT: { kinder: "できたら おそう", lower: "できたら おそう", upper: "できたら おそう" },
    gdTask: { kinder: "まちがえたら もういちど おすと もどるよ", lower: "まちがえたら もういちど おすと もどせるよ", upper: "まちがえたら もう一度 おすと もどせるよ" },
    gdShowT: { kinder: "ねるまえに {parent}に みせよう", lower: "ねるまえに {parent}に みせよう", upper: "ねる前に {parent}に 見せよう" },
    gdShow: { kinder: "「みました」で はなまるに なるよ", lower: "「みました」で はなまる。ポイントが たまって、もくひょうに とどくと たっせい！", upper: "「みました」で はなまる。ポイントが たまって、もくひょうに とどくと たっせい！" },
    gdWalletT: { kinder: "おさいふも あるよ", lower: "おさいふも みられるよ", upper: "おさいふも 見られるよ" },
    gdWallet: { kinder: "ここを おすと おさいふに かわるよ", lower: "ここを おすと おさいふに かわるよ", upper: "ここを おすと おさいふに かわるよ" },
    gdGradT: { kinder: "できるように なったこと", lower: "できるように なったこと", upper: "できるように なったこと" },
    gdGrad: { kinder: "まいにち つづけて、いわれなくても できるように なると、ここが ふえるよ", lower: "まいにち つづけて、いわれなくても できるように なったら、ここに ふえて いくよ", upper: "毎日 続けて、言われなくても できるように なったら、ここに ふえて いくよ" },
    gdCloseT: { kinder: "おわったら ✕ で もどろう", lower: "おわったら ✕ で もどろう", upper: "終わったら ✕ で もどろう" },
    gdClose: { kinder: "あさ これを みて、じぶんで できるかな？", lower: "あさ これを みて、じぶんで うごけるかな？", upper: "朝 これを 見て、自分で 動けるかな？" },
    gdTap: { kinder: "ひかって いる ところを おしてね", lower: "ひかって いる ところを おしてね", upper: "光って いる ところを おしてね" },
    gdNext: { kinder: "つぎへ", lower: "つぎへ", upper: "つぎへ" },
    gdSkip: { kinder: "とばす", lower: "とばす", upper: "とばす" },
  };

  // 文の だんかいには もう1つ "ruby"（漢字に ふりがな。子どもごとの kid.ruby。2026-11-18 テスターの 要望「漢字を 学べるように」）。
  //   文は 小学3年〜（upper）の 漢字で、読みは 小学1〜2年（lower）の 文と つきあわせて 自動で つける（autoRuby）。
  //   つきあわせ られない 文は RUBY に 手で 書く（[漢字|よみ]）。どちらも ない ときは ひらがな（lower）。年齢の めやすは かえない
  function lv(level) { return level === "ruby" || LEVELS.indexOf(level) >= 0 ? level : "lower"; }

  // 自動で つきあわせ られない 文の ふりがな（upper の 文に [漢字|よみ]）。upper を かえたら ここも 直す
  var RUBY = {
    dayUnit: "[日|にち]",
    wxError: "[天気|てんき]を [読|よ]みこめませんでした",
    rainNow: "いま [雨|あめ]が ふっている",
    noRainToday: "[今日|きょう]は ふらない[予報|よほう]",
    noRainUntil: "{h}[時|じ]まで ふらない[予報|よほう]",
    calError: "[予定|よてい]を [読|よ]みこめませんでした",
    pastWaiting: "{i:hourglass} {parent}に まだ [見|み]てもらって いないよ",
    pastNone: "この[日|ひ]は [記録|きろく]が ないよ",
    pastLocked: "この[日|ひ]は [見|み]るだけ だよ",
    futureLook: "まだ[先|さき]の[日|ひ]だよ。その[日|ひ]に なったら おしてね",
    progress: "{t}こ[中|ちゅう] {d}こ できた",
    stAll: "[全部|ぜんぶ]できたね！{i:party}<br>ねる[前|まえ]に {parent}に [話|はな]そう",
    // 自動では まちがう もの（言いかえて いる 文）
    rainSoon: "もうすぐ [雨|あめ]",
    maxAt: "[日中|にっちゅう]は{t}[度|ど]まで",
  };
  var KANJI = /[一-鿿々]/;
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // upper の 文の 漢字に lower の 文から 読みを つける → "[天気|てんき]の…"（つきあわせ られなければ null）。
  //   スペースの あるなしは 見ない（ひらがなの 文は ことばの 区切りに スペースが ある）。{name}・<img> は そのまま
  function autoRuby(upper, lower) {
    if (typeof upper !== "string" || typeof lower !== "string" || !KANJI.test(upper)) return typeof upper === "string" ? upper : null;
    var segs = upper.match(/\{[^}]*\}|<[^>]*>|[一-鿿々]+|[\s\S]/g) || [];
    var kanji = [];
    var re = "^\\s*" + segs.map(function (s) {
      if (/^\s$/.test(s)) return "";
      if (KANJI.test(s) && s.charAt(0) !== "{" && s.charAt(0) !== "<") { kanji.push(s); return "([\\u3041-\\u309f\\u30fc]+?)\\s*"; }
      return escRe(s) + "\\s*";
    }).join("") + "$";
    var m = new RegExp(re).exec(lower);
    if (!m) return null;
    var i = 0;
    return segs.map(function (s) {
      return KANJI.test(s) && s.charAt(0) !== "{" && s.charAt(0) !== "<" ? "[" + s + "|" + m[++i] + "]" : s;
    }).join("");
  }
  // ふりがなの ある 文は 1つの span に つつむ（flex の 箱の 中で 漢字と かなが ばらばらに ならんで すきまが できた）
  function wrapRuby(html) { return html.indexOf("<ruby>") >= 0 ? '<span class="rb">' + html + '</span>' : html; }
  function rubyHtml(markup) {
    return markup.replace(/\[([^|\]]+)\|([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>');
  }
  var rubyCache = {};
  function rubyEntry(key) {
    if (rubyCache.hasOwnProperty(key)) return rubyCache[key];
    var e = T[key], v;
    if (RUBY.hasOwnProperty(key)) v = RUBY[key];
    else if (Array.isArray(e.upper)) v = e.upper.map(function (u, i) { var r = autoRuby(u, e.lower[i]); return r === null ? e.lower[i] : r; });
    else { v = autoRuby(e.upper, e.lower); if (v === null) v = e.lower; }
    v = Array.isArray(v) ? v.map(function (x) { return wrapRuby(rubyHtml(x)); }) : rubyHtml(v);
    rubyCache[key] = v;
    return v;
  }
  // ふりがなが 入れられない ところ（入力欄の 見本・ボタンの 値）用に タグを はずす
  function plain(s) { return String(s).replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<[^>]*>/g, ""); }

  // 日にち: 「1にち」「2にち」は 読みと あわないので、数字＋「日」に ふりがなを つける（カレンダーや 教科書と おなじ）。
  //   読みが かわる 日（ついたち・ふつか…とおか・じゅうよっか・はつか・にじゅうよっか）は 数字と 日の 上に まとめて、
  //   ほかは「日」の 上に にち。小学3年からは ふりがな なしの「28日」。日数（count）の 1日は いちにち
  var DAY_READ = { 1: "ついたち", 2: "ふつか", 3: "みっか", 4: "よっか", 5: "いつか", 6: "むいか", 7: "なのか", 8: "ようか",
    9: "ここのか", 10: "とおか", 14: "じゅうよっか", 20: "はつか", 24: "にじゅうよっか" };
  function dayHtml(d, level, count) {
    d = +d;
    if (lv(level) === "upper") return d + "日";
    var r = count && d === 1 ? "いちにち" : DAY_READ[d];
    return r ? '<ruby class="dr">' + d + '日<rt>' + r + '</rt></ruby>' : d + '<ruby class="dr">日<rt>にち</rt></ruby>';
  }

  // おうちの人 向けの 文（設定・かんたん設定・がんばり管理）。ふつうの 漢字かなで、だんかいは ない。Words.adult(key) で よむ
  //   2か所 いじょうで 使う 文から ここに 寄せる（1か所だけの 文は その ファイルに あってよい）
  var ADULT = {
    // 毎日の お知らせ（通知。device.js の setNotice が アプリに わたす）
    noticeTitle: "はなまるボード",
    noticeBody: "今日の予定とやること、いっしょに見てみませんか",
    // 新しい版の知らせ（update.js。設定の いちばん上）。つないだ スマホ・ブラウザには 本体で 更新して もらう
    updateSelf: "新しい版があります",
    updateBoard: "置いてある端末（本体）に新しい版があります。本体で更新してください",
    // つないだ スマホの アプリと 置いた端末の 版の ずれ（update.js。設定の いちばん上）
    verBoardOld: "置いてある端末のアプリ（{board}）が、このスマホ（{me}）より古い版です。置いてある端末を更新してください",
    verMeOld: "このスマホのアプリ（{me}）が、置いてある端末（{board}）より古い版です。このスマホのアプリを更新してください",
    verOld: "0.1.19 以前",
    // 歯車の 横の 札（update.js。おうちの人に して ほしい ことが ある とき）
    gearUpdate: "更新",
    gearAddress: "アドレス",
    // つないだ スマホで 置いた端末に つながらない 理由（api.js の connWhy。ホーム・がんばりチェック・設定の 保存）
    connPair: "つなぐための番号が合いません。置いてある端末で番号が変わったようです。「つなぎ直す」で番号を入れ直してください",
    connMissing: "置いてある端末が見つかりません。置いてある端末でアプリが開いているか、同じ Wi-Fi につながっているかを確かめてください",
    connNoReply: "置いてある端末から返事がありません。置いてある端末でアプリが開いているかを確かめてください",
    connWait: "つなぐための番号を何回もまちがえました。30秒ほど待ってから、もう一度ためしてください",
    // 招待コード（settings.js の renderPro。設定の「ヘルプ」の いちばん 下。2026-11-20）。FAQ には 書かない
    proCodeTitle: "招待コード",
    proCodeOpen: "開く",
    proCodeEmpty: "招待コードを入れてください",
    proCodeWrong: "招待コードが違うようです。もう一度確かめてください",
    proCodeFail: "開けませんでした",
    proCodeDone: "Pro が使えるようになりました",
    proCodeOn: "Pro をお使いいただけます",
    // おさいふ（wallet.js。鍵の あとの 入力は 大人向け）
    wlInTitle: "お金の記録",
    wlModeIn: "おさいふに入れる",
    wlModeKeep: "貯金に入れる",
    wlModeGive: "貯金からおさいふへ",
    wlAmount: "金額",
    wlWhatAdult: "内容",
    wlWhatsAdult: ["おこづかい", "お年玉", "ポイントの交換", "お祝い"],
    wlWhatHintAdult: "例：おじいちゃんから",
    wlGiveWhat: "貯金から",
    wlSaveAdult: "記録する",
    wlRowTitle: "この記録",
    wlRowRemove: "消す",
    wlKeptNow: "いまの貯金：{x}円",
    // もくひょうの「こうかんした」の あと（wallet.js の openExchange。2026-11-18）
    wlExTitle: "おさいふに入れますか？",
    wlExNote: "{p}ポイント × {r}円です。金額は変えられます。",
    wlExYes: "入れる",
    wlExNo: "入れない",
    wlExFail: "交換できませんでした",
    // 新しい版の更新（update.js。{when} は「明日 4:00〜5:00」）
    updAsk: "新しい版があります。{when} に更新します",
    updWait: "{when} に新しい版に更新します",
    updDownloading: "新しい版をダウンロードしています",
    updReady: "新しい版の準備ができました",
    updToday: "今日",
    updTomorrow: "明日",
    updOpenSettings: "設定を開く",
    updClose: "閉じる",
    updChecking: "確認しています…",
    updCheckFail: "確認できませんでした。Wi-Fi を確かめてください",
    updNoPlay: "Google Play から入れたアプリで確認できます",
    updLatest: "最新の版です",
    // 使い方の カード（usage-cards.js）。ブラウザでは 2台の 使い方を 隠さず、理由・手順を 出す
    usageAppOnly: "ブラウザでは使えません。Android のアプリで使えます。",
    usageQrHowto: "置いてある端末の QR コードを読み取ってつなぎます。",
    // Google ドライブの 控え（Web 版だけ。drive.js・settings.js の「おうちの人」。2026-11-20）
    driveTitle: "Google ドライブの控え",
    driveSave: "Google ドライブに控える",
    driveRestore: "ドライブから戻す",
    driveSaving: "控えています…",
    driveSaved: "控えました",
    driveFinding: "控えを探しています…",
    driveRestored: "戻しました",
    driveNone: "ドライブに控えが見つかりませんでした",
    driveLast: "最後に控えた日：{d}",
    driveNever: "まだ控えていません",
    driveStale: "前に控えてから1週間たちました。ときどき控えておくと安心です",
    driveFrom: "{d} に控えた、",
    driveReplace: "ドライブに {d} の控えがあります。この端末の内容で上書きしますか？（前の記録を戻すときは「キャンセル」を押し、「ドライブから戻す」を押してください）",
    driveNote: "記録と設定を、お使いの Google ドライブに1つのファイルで控えます。はなまる工房には送りません。ブラウザが記録を消してしまったときも、ここから戻せます。",
    driveErrCancel: "Google の画面が閉じられました。もう一度お試しください",
    driveErrPopup: "Google の画面を開けませんでした。ポップアップを許可して、もう一度お試しください",
    driveErrDenied: "ドライブへの保存が許可されませんでした。もう一度押して、許可してください",
    driveErrLoad: "Google につながりませんでした。インターネットを確かめて、もう一度お試しください",
    driveErrOffline: "つながりませんでした。インターネットを確かめて、もう一度お試しください",
    driveErrFull: "ドライブの空きが足りないようです。空きを作ってから、もう一度お試しください",
    driveErrBusy: "混み合っているようです。少し待ってから、もう一度お試しください",
    driveErrBroken: "控えのファイルを読めませんでした",
    driveErr: "うまくいきませんでした。少し待ってから、もう一度お試しください",
    // つないで 自動で 控える（Web 版だけ。2026-11-21）。「ログイン」「同期」と 言わない
    driveLinked: "Google ドライブとつないでいます。記録が変わると自動で控えます",
    driveStopped: "控えが止まっています",
    driveReconnect: "つなぎ直す",
    driveUnlink: "つなぐのをやめる",
    driveUnlinkAsk: "Google ドライブとつなぐのをやめますか？（ドライブの控えは残ります）",
    driveUnlinked: "つなぐのをやめました",
    driveConnect: "Google ドライブとつなぐ",
    driveHeldAsk: "ドライブに {d} の控えがあるため、自動の控えを止めています",
    driveHeldOther: "ほかの端末が {d} に控えたため、自動の控えを止めています",
    driveHeldFull: "ドライブの空きが足りないため、自動の控えを止めています",
    driveOverwrite: "この内容で上書き",
    driveOverwriteAsk: "ドライブの控えを、この端末の内容で上書きしますか？",
    driveStartTitle: "Google ドライブとつなぎますか？",
    driveStartLink: "つないではじめる（おすすめ）",
    driveStartLinkNote: "記録が変わるたびに、お使いの Google ドライブへ自動で控えます",
    driveStartLocal: "つながずに使う",
    driveStartLocalNote: "このブラウザの中だけに保存します。あとから設定でつなげます",
    driveStartRestore: "前のデータを戻す",
    driveStartNote: "控えはお使いの Google ドライブだけに置き、はなまる工房には送りません。ブラウザは、しばらく開かないと記録を消すことがあります。",
    driveStartFound: "{d} の控えがあります（子ども {k}人・記録 {n}日ぶん）",
    driveStartUse: "この控えを戻す",
    driveStartNew: "新しく始める",
    driveStartNewNote: "前の控えは消さずに残します",
    driveStartFromDrive: "Google ドライブから",
    driveStartFromFile: "ファイルから",
    driveStartBack: "もどる",
    driveStartWait: "Google ドライブにつないでいます…",
    usageQrGuide: "<b>ブラウザでつなぐ手順</b>① 置いてある端末（Android のアプリ）の設定の「この端末」で「この端末を置いて、別の端末からつなぐ」にすると、QR コードが出ます。<br>" +
      "② この端末のカメラで読み取ると、置いてある端末のページが開き、つながります（同じ Wi-Fi の中だけ）。",
  };

  // 自前の 絵（dashboard/img/。docs/design/chatgpt-requests.md で 作った もの）。字の 大きさに あわせる（style.css の .ico）
  function icon(name) {
    return '<img class="ico" src="img/' + name + (name === "hanamaru" || name === "goal-flag" ? ".svg" : ".png") + '" alt="" draggable="false">';
  }

  window.Words = {
    LEVELS: LEVELS,
    adult: function (key) { return ADULT.hasOwnProperty(key) ? ADULT[key] : key; },
    LABELS: { kinder: "幼稚園・保育園", lower: "小学1〜2年", upper: "小学3年〜" },
    // 設定・かんたん設定の「年齢の目安」の 選択肢。「＋ふりがな」は 漢字に ふりがな（kid.ruby）。値は "lower" / "lower+ruby"
    levelOptions: function (kid) {
      var cur = lv(kid && kid.level) + (kid && kid.ruby ? "+ruby" : ""), L = this.LABELS;
      return LEVELS.map(function (l) {
        return [l, L[l]];
      }).concat(LEVELS.map(function (l) { return [l + "+ruby", L[l] + "＋ふりがな"]; })).map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + '>' + o[1] + '</option>';
      }).join("");
    },
    parseLevel: function (v) { var p = String(v || "").split("+"); return { level: lv(p[0]) === "ruby" ? "lower" : lv(p[0]), ruby: p[1] === "ruby" }; },
    // いちばん小さい子の だんかい（みんなで見る ところ用）
    youngest: function (kids) {
      var i = Math.min.apply(null, (kids || []).filter(function (k) { return k.active !== false; })
        .map(function (k) { return LEVELS.indexOf(lv(k.level)); }).concat([LEVELS.length - 1]));
      return LEVELS[i];
    },
    // ことばを とりだす。vars の {name} を いれかえる。配列は そのまま かえす。
    //   {date:d} は vars.d を 日づけ（1日 = ついたち）、{days:n} は 日数（1日 = いちにち）の HTML に する（dayHtml）。{i:name} は 絵（icon）
    t: function (key, level, vars) {
      var e = T[key];
      if (!e) return key;
      var s = lv(level) === "ruby" ? rubyEntry(key) : e[lv(level)];
      if (typeof s !== "string") return s;
      vars = vars || {};
      var out = s.replace(/\{(?:(date|days|i):)?([\w-]+)\}/g, function (m, as, k) {
        if (as === "i") return icon(k);
        if (!(k in vars)) return m;
        return as ? dayHtml(vars[k], level, as === "days") : vars[k];
      });
      return lv(level) === "ruby" ? wrapRuby(out) : out;
    },
    dayHtml: function (d, level, count) { return dayHtml(d, level, count); },
    // タグの ない 文（入力欄の 見本など）。ふりがなの 子には ひらがなの 文
    text: function (key, level, vars) { return plain(this.t(key, lv(level) === "ruby" ? "lower" : level, vars)); },
    plain: plain,
    // その 子の 文の だんかい（ふりがなを えらんだ 子は "ruby"）
    textLevel: function (kid) { return kid && kid.ruby ? "ruby" : lv(kid && kid.level); },
    // みんなで 見る ところ: いちばん 小さい 子に あわせる。その だんかいの 子に ふりがなの 子が いれば ふりがな
    youngestText: function (kids) {
      var y = this.youngest(kids);
      return (kids || []).some(function (k) { return k.active !== false && lv(k.level) === y && k.ruby; }) ? "ruby" : y;
    },
    // 名前（やること・地域）と よみがなから ふりがなの HTML（html を エスケープ して から つける）。つきあわせ られなければ 全体の 上に
    rubyName: function (name, kana, esc) {
      var n = esc ? esc(name) : name;
      if (!kana || !KANJI.test(name)) return n;
      var m = autoRuby(name, kana);
      if (m !== null && !/[<>&"']/.test(name)) return rubyHtml(m);
      return '<ruby>' + n + '<rt>' + (esc ? esc(kana) : kana) + '</rt></ruby>';
    },
    autoRuby: autoRuby,
    icon: icon,
    // ホームの 大きな 日にちの よこの「日」（ふりがなは その日の 読み）。ふりがなは 幅に かぞえない（ほかの 文字を おしださない。
    //   ながい 読みは「日」の 左はしから 右へ のばして 2行に おる）
    dayUnit: function (d, level) {
      if (lv(level) === "upper") return "日";
      var r = DAY_READ[d] || "にち";
      return '<span class="du">日<span class="du-rt' + (r.length > 2 ? " long" : "") + '">' + r + '</span></span>';
    },
  };
})();
