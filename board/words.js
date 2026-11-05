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
    tallyMonth: { kinder: "こんげつ", lower: "こんげつ", upper: "今月" },
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
    lo: { kinder: "さむい ときで {t}ど", lower: "さいてい {t}ど", upper: "最低 {t}度" },
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
    calNone: { kinder: "カレンダーは まだだよ", lower: "カレンダーは せっていで つなげられるよ", upper: "カレンダーは 設定で つなげられるよ" },
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
    kvTitle: { kinder: "{name}の がんばり", lower: "{name}の がんばりカレンダー", upper: "{name}の がんばりカレンダー" },
    streak: { kinder: "{n}かい つづいてる！", lower: "{days:n} れんぞく！", upper: "{days:n} れんぞく！" },
    streakNext: { kinder: "", lower: " あと{days:k}で {days:m}", upper: " あと{days:k}で {days:m}" },
    streakStart: { kinder: "{i:sprout} きょうから はじめよう！", lower: "{i:sprout} きょうから れんぞく チャレンジ！", upper: "{i:sprout} 今日から れんぞくチャレンジ！" },
    // ---- できるようになったこと（「もう できる」に まとめた やること）。しるしは kids.js の STAIRS（img/title-stairs.svg） ----
    gradBtn: { kinder: "{n}", lower: "{n}", upper: "{n}" },
    gradTitle: { kinder: "{name}が できるように なったこと", lower: "{name}が できるように なったこと", upper: "{name}が できるようになったこと" },
    gradSteps: { kinder: "{n}だん のぼったよ！", lower: "{n}だん のぼったよ！", upper: "{n}だん のぼったよ！" },
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
    monthReward: { kinder: "{i:gift} こんげつ {x}", lower: "{i:gift} こんげつの ごほうび {x}", upper: "{i:gift} 今月の ごほうび {x}" },
    monthPoint: { kinder: "{i:point-star} こんげつ {x}", lower: "{i:point-star} こんげつ {x}", upper: "{i:point-star} 今月 {x}" },
    pastReward: { kinder: "{i:gift} {m}がつ {x}", lower: "{i:gift} {m}がつの ごほうび {x}", upper: "{i:gift} {m}月の ごほうび {x}" },
    pastPoint: { kinder: "{i:point-star} {m}がつ {x}", lower: "{i:point-star} {m}がつ {x}", upper: "{i:point-star} {m}月 {x}" },
    flowerCount: { kinder: "{i:hanamaru} {n}こ", lower: "{i:hanamaru} {n}こ", upper: "{i:hanamaru} {n}こ" },
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
    addOnce: { kinder: "＋ 1かいだけの やること", lower: "＋ 1かいだけの やること", upper: "＋ 1回だけの やること" },
    approveBtn: { kinder: "{i:eyes} {parent} みました", lower: "{i:eyes} {parent} みました", upper: "{i:eyes} {parent} 見ました" },
    approveUndo: { kinder: "とりけす", lower: "とりけす", upper: "取り消す" },
    stStart: { kinder: "きょうも がんばろう！", lower: "きょうも がんばろう！", upper: "今日も がんばろう！" },
    yen: { kinder: "{n}えん", lower: "{n}えん", upper: "{n}円" },
    point: { kinder: "{n}ポイント", lower: "{n}ポイント", upper: "{n}ポイント" },

    // ---- ごほうび・もくひょう ----
    saved: { kinder: "{i:gift} {x}", lower: "{i:gift} {x}", upper: "{i:gift} {x}" },
    savedTitle: { kinder: "{i:gift} ためた {x}", lower: "{i:gift} ためた {x}", upper: "{i:gift} ためた {x}" },
    toCalendar: { kinder: "{i:calendar} もどる", lower: "{i:calendar} カレンダー", upper: "{i:calendar} カレンダー" },
    canExchange: { kinder: "もらえるよ！ {parent}に いってね", lower: "こうかん できるよ！ {parent}に いってね", upper: "交かん できるよ！ {parent}に 言ってね" },
    needMore: { kinder: "あと {x}", lower: "あと {x}", upper: "あと {x}" },
    goalTitle: { kinder: "みんなで {title}", lower: "みんなで {title}", upper: "みんなで {title}" },
    goalLeft: { kinder: "あと {x}", lower: "あと {x}", upper: "あと {x}" },
    goalDone: { kinder: "{i:party} やったね！", lower: "{i:party} たっせい！ みんな よく がんばったね！", upper: "{i:party} 達成！ みんな よく がんばったね！" },
    goalDoneShort: { kinder: "やったね！{i:party}", lower: "たっせい！{i:party}", upper: "達成！{i:party}" },

    // ---- 無料の 上限（おうちの人向けの 画面だけ。だんかいで かえない） ----
    // ---- 予定の URL の まちがい（おうちの人向け。BoardApi.calUrlProblem が "share" の とき） ----
    privacyNote: { kinder: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。", lower: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。", upper: "記録や設定は、この端末の中だけに保存し、外部に送りません。くわしくは、スマホのカメラで QR コードを読み取るか、下の URL を開いてご覧ください。" },
    calShareLink: { kinder: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。", lower: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。", upper: "これは Google カレンダーの共有リンクで、予定は読めません。設定 → 予定を出したいカレンダー →「カレンダーの統合」の「iCal 形式の非公開 URL」（https://calendar.google.com/calendar/ical/ で始まり、basic.ics で終わる URL）を貼ってください。「一般公開」にする必要はありません。" },
    freeKids: { kinder: "無料版で表示できる子どもは{n}人までです。{next}人目からは Pro（準備中）の予定です。", lower: "無料版で表示できる子どもは{n}人までです。{next}人目からは Pro（準備中）の予定です。", upper: "無料版で表示できる子どもは{n}人までです。{next}人目からは Pro（準備中）の予定です。" },
  };

  function lv(level) { return LEVELS.indexOf(level) >= 0 ? level : "lower"; }

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
    // 使い方の カード（usage-cards.js）。ブラウザでは 2台の 使い方を 隠さず、理由・手順を 出す
    usageAppOnly: "ブラウザでは使えません。Android のアプリで使えます。",
    usageQrHowto: "置いてある端末の QR コードを読み取ってつなぎます。",
    usageQrGuide: "<b>ブラウザでつなぐ手順</b>① 置いてある端末（Android のアプリ）の設定の「使い方」で「この端末を置いて、別の端末からつなぐ」にすると、QR コードが出ます。<br>" +
      "② この端末のカメラで読み取ると、置いてある端末のページが開き、つながります（同じ Wi-Fi の中だけ）。",
  };

  // 自前の 絵（dashboard/img/。docs/design/chatgpt-requests.md で 作った もの）。字の 大きさに あわせる（style.css の .ico）
  function icon(name) {
    return '<img class="ico" src="img/' + name + (name === "hanamaru" ? ".svg" : ".png") + '" alt="" draggable="false">';
  }

  window.Words = {
    LEVELS: LEVELS,
    adult: function (key) { return ADULT.hasOwnProperty(key) ? ADULT[key] : key; },
    LABELS: { kinder: "幼稚園・保育園", lower: "小学1〜2年", upper: "小学3年〜" },
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
      var s = e[lv(level)];
      if (typeof s !== "string") return s;
      vars = vars || {};
      return s.replace(/\{(?:(date|days|i):)?([\w-]+)\}/g, function (m, as, k) {
        if (as === "i") return icon(k);
        if (!(k in vars)) return m;
        return as ? dayHtml(vars[k], level, as === "days") : vars[k];
      });
    },
    dayHtml: function (d, level, count) { return dayHtml(d, level, count); },
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
