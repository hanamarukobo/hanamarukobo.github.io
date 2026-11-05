// この端末で できる こと・できない こと（アプリ・ブラウザ・つないだ スマホ）を 1か所で きめる。
//   アプリ（Capacitor）は window.EchoBoard（Java の BoardWebView が 入れる）。ふるい アプリは 関数が たりない ことが あるので 1つずつ たしかめる。
//   データの 行き先（この端末・置いた端末・Web 版）は BoardApi（api.js）。この ファイルは api.js の あとに よむ
(function () {
  "use strict";

  function eb() { return window.EchoBoard; }
  function has(name) { var b = eb(); return !!(b && typeof b[name] === "function"); }
  function local() { return !!(window.BoardApi && window.BoardApi.local); }
  var infoCache = null;
  // アプリの 情報（版・機種・スマホか・ブラウザが あるか）。ブラウザ・ふるい アプリは {}
  function info() {
    if (infoCache) return infoCache;
    try { infoCache = JSON.parse(eb().getAppInfo()) || {}; } catch (e) { infoCache = {}; }
    return infoCache;
  }

  window.Device = {
    info: info,
    // アプリで ひらいて いるか
    app: function () { return !!eb(); },
    // ブラウザ（アプリでない）で、データが この端末の 中に ある とき（PC の 確かめ・Web 版）。QR で 置いた端末を ひらいた ときは ちがう
    browser: function () { return !eb() && local(); },
    // スマホか（アプリは 端末の 大きさと 電話の 有無。ブラウザは 画面の 小さい ほうの 辺）
    phone: function () {
      var i = info();
      return i.phone !== undefined ? !!i.phone : Math.min(screen.width, screen.height) < 600;
    },
    // 画面オフ（スリープ）・明るさ・決まった 時間に つける
    canSleep: function () { return has("setKeepScreenOn"); },
    canBrightness: function () { return has("setBrightness"); },
    // ボードを 前に 出す
    canFront: function () { return has("getFront"); },
    // 画面の 向き
    canOrient: function () { return has("setOrientation"); },
    // 置いた端末に なって、別の 端末から つないで もらう（2台連携の 置く がわ）
    canHost: function () { return has("startLan") && local(); },
    // 置いた端末を さがして つなぐ（2台連携の おうちの人の がわ）
    canJoin: function () { return has("findBoards") && local(); },
    // 声で やることを 足す
    canVoice: function () { return has("startVoice"); },
    // 毎日の お知らせ（通知。DailyNotice.java）。{ on, set（一度でも 決めたか）, minutes（0:00 から 何分。既定 420＝7:00）, permitted }
    canNotice: function () { return has("setNotice"); },
    notice: function () {
      try { return JSON.parse(eb().getNotice()); } catch (e) { return { on: false, set: false, minutes: 420, permitted: true }; }
    },
    // 入れる・止める。文は words.js（Words.adult の noticeTitle・noticeBody）。ON で 許可が なければ 端末が 聞く
    setNotice: function (on, minutes) {
      eb().setNotice(!!on, minutes, window.Words.adult("noticeTitle"), window.Words.adult("noticeBody"));
    },
    // リンクを ひらけるか（ブラウザ・ブラウザの ある 端末。ふるい アプリは スマホなら ある ものと する）
    canOpenLink: function () {
      if (!window.Capacitor) return true;
      var i = info();
      return i.browser !== undefined ? !!i.browser : !!i.phone;
    },
  };
})();
