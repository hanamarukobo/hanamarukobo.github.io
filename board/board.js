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
    settings: { unit: "yen", weekStart: 0, lowPower: false, display: C.display },
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
  // 時計・天気・よてい ごとに 設定（settings.words）で「ひらがな」「漢字」に かえられる
  //   auto: いちばん小さい子に あわせる / kana: ひらがな（小学3年〜 の子しか いなくても ひらがな） / kanji: 漢字
  function levelFor(sec) {
    var m = (B.settings.words || {})[sec] || "auto";
    if (m === "kanji") return "upper";
    if (m === "kana") return B.level === "upper" ? "lower" : B.level;
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
    var look = JSON.stringify([s.words || {}, s.clock || "", s.clothes || {}, s.showAdvice !== false]);
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
    var lv = window.Words.youngest(B.kids), pn = (ev.detail.settings || {}).parentName || "ママ・パパ";
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
})();
