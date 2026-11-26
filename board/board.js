// ボードの 土台。ボードの ファイルが 共通で 使う 入れもの（window.Board）と、表示の 設定を 当てる ところ（applySettings）。
// ボードの ファイルの なかで いちばん さきに 読む（読む じゅんは この下）
(function () {
  "use strict";

  var C = window.CONFIG;
  // 曜日ごとの色（日月火水木金土）。祝日は日曜の色
  var WEEKDAY_COLORS = ["#ff6f91", "#f5b82e", "#ff8a5c", "#4fb0f0", "#5cc48a", "#e0a020", "#6f8cff"];

  // 読む じゅん: board.js → clock.js → sleep.js → settings.js → swipe.js → weather.js → events.js → app.js（起動）。
  //   board:state（ここ → settings.js の「#settings で ひらく」）・visibilitychange（sleep.js → settings.js）・
  //   resize（settings.js の タブ → app.js の fit）が、わける 前と おなじ じゅんに 登録される ように して ある。かえない
  // Board に 入る もの:
  //   board.js   : $・W・levelFor・setText・setHtml・pad・ymd・storageGet・storageSet・escapeHtml・targetDay・WEEKDAY_COLORS・
  //                applySettings・markStarted
  //   clock.js   : tick・renderClock・fetchHolidays      sleep.js  : updateSleep・powerMode・POWER_KEY
  //   settings.js: updateLan                             weather.js: place・placeKey・fetchWeather・fetchRain・renderWeather・CLOTHES
  //   events.js  : calSource・fetchCalendar・renderEvents  app.js    : ORIENT_KEY・defaultOrient・applyOrientation
  // ほかの ファイルの ものは、つかう ときに Board.xxx で よむ（あとから 読む ファイルの ものも あるので、さきに とって おかない）。
  // あとから 入れかわる 状態（下の settings〜curSec）も かならず Board.settings の ように よむ
  // （var settings = Board.settings と とって おくと、入れかわった あとも 古い ほうを 見て しまう）
  var B = window.Board = {
    // 表示の設定はデータの中（ママ・パパのページと共通）。届くまでは config.js の既定値
    settings: { weekStart: 0, lowPower: false, display: C.display },
    display: C.display,
    kids: [],          // 子どもの一覧（設定画面で へんしゅうする）
    holidays: {},      // { "YYYY-MM-DD": "祝日名" }
    lastTouch: Date.now(),
    sleeping: null,    // 初回の判定で必ず切り替わるように null から始める
    // ことばの だんかい（いちばん小さい子）・おうちの人の よびかた・いま かいている ところ（下の levelFor・W を 見る）
    level: "lower", parentName: "ママ・パパ", curSec: "clock",
    WEEKDAY_COLORS: WEEKDAY_COLORS,
  };

  function $(id) { return document.getElementById(id); }

  // 子どもに見せる ことば（words.js）。みんなで見る ところは いちばん小さい子の だんかいに あわせる。
  // 設定（settings.words。時計・天気・よていに 同じ 値。2026-11-18 から 1か所で 選ぶ）で「ひらがな」「漢字」に かえられる
  //   auto: いちばん小さい子に あわせる（その子が ふりがななら ふりがな） / kana: ひらがな（小学3年〜 の子しか いなくても ひらがな） / kanji: 漢字 / ruby: 漢字に ふりがな
  function levelFor(sec) {
    var m = (B.settings.words || {})[sec] || "auto";
    if (m === "kanji") return "upper";
    if (m === "ruby") return "ruby";
    if (m === "kana") return B.level === "upper" || B.level === "ruby" ? "lower" : B.level;
    return B.level;
  }
  // curSec は いま かいている ところ（renderDate / renderWeather / renderEvents が きりかえる）
  function W(key, vars) {
    var v = Object.assign({ parent: B.parentName }, vars || {});
    return window.Words.t(key, levelFor(B.curSec), v);
  }

  // 中身が変わったときだけ書きかえる（毎秒の描き直しを減らして、熱と電池を抑える）
  function setText(id, text) {
    var el = $(id);
    if (el.textContent !== String(text)) el.textContent = text;
  }
  // 絵（Words.icon）が 入る ことばは こちら
  function setHtml(id, html) {
    var el = $(id);
    if (el.getAttribute("data-html") !== html) { el.setAttribute("data-html", html); el.innerHTML = html; }
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 保存できなくても表示は続ける */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 夕方からは「あした」を表示する（天気 weather.js・予定 events.js で つかう）
  function targetDay() {
    var now = new Date();
    var tomorrow = now.getHours() >= C.tomorrowFromHour;
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (tomorrow ? 1 : 0));
    return { date: d, key: ymd(d), word: tomorrow ? "あした" : "きょう" };
  }

  // ---- ひょうじの せってい（ママ・パパの ページと 共通） ----
  // kids.js が /api/state を読むたびに "board:state" で知らせてくる
  function applySettings(s) {
    if (!s) return;
    B.settings = s;
    // つないだ スマホで、置いた 端末から 1度でも 読めたか（weather.js。読めるまで 天気の ところは 空ける）
    if (!B.gotState) { B.gotState = true; if (started && B.renderWeather) B.renderWeather(); }
    B.display = s.display || C.display;
    // 地域・カレンダーが かわったら すぐ よみなおす
    var key = B.placeKey();
    if (key !== lastArea) {
      lastArea = key;
      if (started) { B.fetchWeather(); B.fetchRain(); }
    }
    var c = B.calSource(), ckey = c ? c.type + c.url : "";
    if (ckey !== lastCal) {
      lastCal = ckey;
      if (started) B.fetchCalendar();
    }
    document.body.classList.toggle("lowpower", !!s.lowPower);
    $("lock-chip").hidden = !(s.parentLock && s.parentLock.type === "pin" && typeof s.parentLock.resetAt === "number");
    B.updateLan();
    var look = JSON.stringify([s.words || {}, s.clock || "", s.clothes || {}, s.showAdvice !== false, !!s.eventTime]);
    if (look !== lastLook) {
      lastLook = look;
      if (started) { B.renderWeather(); B.renderEvents(); B.renderClock(new Date()); }
    }
  }
  var lastLook = null;
  var lastArea = null, lastCal = null, started = false;
  window.addEventListener("board:state", function (ev) {
    applySettings(ev.detail.settings);
    B.kids = ev.detail.kids || [];
    // ことばの だんかい・おうちの人の よびかたが かわったら かきなおす
    var lv = window.Words.youngestText(B.kids), pn = (ev.detail.settings || {}).parentName || "ママ・パパ";
    if (lv !== B.level || pn !== B.parentName) {
      B.level = lv;
      B.parentName = pn;
      B.tick();
      B.renderWeather();
      B.renderEvents();
    }
  });

  // 起動（app.js）の さいごに よぶ。ここから あとは 地域・カレンダーが かわったら すぐ よみなおす
  function markStarted() {
    started = true;
    lastArea = B.placeKey();
    lastCal = B.calSource() ? B.calSource().type + B.calSource().url : "";
  }

  // 見出しを 1行に おさめる（入りきらない ときだけ 字を すこし 小さく。min px まで）。
  //   幅の せまい スマホ（360 前後）で「1回だけの やることを／たす」と 折れて いた（11-18 テスターの 声）。出した あとに 呼ぶ
  B.fitLine = function (el, min) {
    if (!el) return;
    el.style.fontSize = "";
    // 字の 幅は Range で はかる（はみ出しは scrollWidth に 出ない ことが ある）
    var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize), ws = el.style.whiteSpace;
    var room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), range = document.createRange();
    el.style.whiteSpace = "nowrap";
    range.selectNodeContents(el);
    while (range.getBoundingClientRect().width > room + 1 && fs > (min || 14)) {
      fs -= 0.5;
      el.style.fontSize = fs + "px";
    }
    el.style.whiteSpace = ws;
  };
  B.$ = $;
  B.W = W;
  B.levelFor = levelFor;
  B.setText = setText;
  B.setHtml = setHtml;
  B.pad = pad;
  B.ymd = ymd;
  B.storageGet = storageGet;
  B.storageSet = storageSet;
  B.escapeHtml = escapeHtml;
  B.targetDay = targetDay;
  B.applySettings = applySettings;
  B.markStarted = markStarted;

  // 戻る（ボタン・端から 戻る ジェスチャー。MainActivity の backToPage から 呼ぶ）。いちばん 上に 出て いる 画面を 1つ 閉じる。
  //   なにも 出て いなければ「アプリを とじますか？」。ホームアプリの とき（home）は 何も しない（置きっぱなし）。
  //   前は アプリが そのまま 終わった（2026-11-18 テスターの 声）。かえす 文字は MainActivity が 見る（"none" は ページが ない とき だけ）
  function shown(id) { var e = $(id); return !!e && !e.hidden; }
  function press(id) { $(id).click(); return "closed"; }
  function askExit(home) {
    if (home) return "stay";
    $("exit-ask").hidden = false;
    return "asked";
  }
  B.back = function (home) {
    B.lastTouch = Date.now();
    if (shown("exit-ask")) { $("exit-ask").hidden = true; return "closed"; }
    if (window.Guide && window.Guide.active()) { window.Guide.back(); return "closed"; }
    if (shown("lock")) return press("lk-close");
    if (shown("upd")) return press("upd-close");
    if (shown("connect")) return press("cn-cancel");
    if (shown("setup")) {
      if (shown("su-back")) return press("su-back");
      if (shown("su-close")) return press("su-close");
      return askExit(home);   // はじめての かんたん設定の 1つめ
    }
    if (shown("wl-ask")) return press("wl-ask-no");
    if (shown("wl-pop")) return press("wl-pop-close");
    if (shown("quick")) return press("qk-close");
    if (shown("tutorial")) return press("tu-skip");
    if (shown("settings")) return press("s-cancel");
    if (shown("bundle-view")) return press("bdv-close");
    if (shown("grad-view")) return press("grv-close");
    if (shown("kid-view")) return press($("kid-view").classList.contains("wallet-mode") ? "kv-tab-cal" : "kv-close");
    if (shown("sleep")) { if (B.updateSleep) B.updateSleep(new Date()); return "closed"; }
    return askExit(home);
  };
  $("exit-no").addEventListener("click", function () { $("exit-ask").hidden = true; });
  $("exit-ask").addEventListener("click", function (ev) { if (ev.target === $("exit-ask")) $("exit-ask").hidden = true; });
  $("exit-yes").addEventListener("click", function () {
    $("exit-ask").hidden = true;
    if (window.EchoBoard && window.EchoBoard.exitApp) window.EchoBoard.exitApp();
  });
})();
