// ボードの 起動。ボードの ファイルの なかで いちばん さいごに 読む（読む じゅんと Board の 中身は board.js の 先頭）。
// 画面の 倍率（fit）と 向きを 合わせて、時計・天気・予定・祝日を はじめる
(function () {
  "use strict";

  var B = window.Board, storageGet = B.storageGet, storageSet = B.storageSet;

  // 画面の CSS ピクセル数は端末の density で変わるので、盤面を拡大縮小して合わせる。
  //   横置き: 幅960。高さは画面の縦横比に合わせて 480（Echo Show 5 の 2:1）〜 720（4:3）
  //   縦置き: 幅600。高さは 880〜1300（みじかい 画面では 左右に 余白。1300 は 縦長の スマホ 19.5:9 まで 下に 余白が 出ない ように）
  // ソフトキーボードが出て 高さだけ ちぢんだときは 倍率を かえない（文字が小さくならないように）
  // カメラの 切り欠き（スマホの 上の 帯）。アプリは ページを 帯まで 広げるので、中身を 帯の 分 内側に 寄せる
  //   （MainActivity の getSafeInsets・"board:insets"。CSS の --sa-t など。前は 帯だけ 灰色で ページの 色と ちがった。11-18）
  var safe = { t: 0, r: 0, b: 0, l: 0 };
  function setSafe(v) {
    if (!v) return;
    ["t", "r", "b", "l"].forEach(function (k) {
      safe[k] = Math.max(0, Math.round(+v[k] || 0));
      document.documentElement.style.setProperty("--sa-" + k, safe[k] + "px");
    });
  }
  try { if (window.EchoBoard && window.EchoBoard.getSafeInsets) setSafe(JSON.parse(window.EchoBoard.getSafeInsets())); } catch (e) { /* ない 端末 */ }

  // ソフトキーボードで 高さが ちぢんだら、入力中の 欄を 見える ところまで スクロールする。
  //   倍率を かえないので 入れものの 高さは 前の まま で、ブラウザは 欄を 見せて くれない（2026-11-20 .9 で 設定の「呼び方」が キーボードの 下に かくれた）
  function revealFocus() {
    var e = document.activeElement;
    if (!e || !/^(INPUT|TEXTAREA)$/.test(e.tagName) || /^(checkbox|radio|button|range)$/.test(e.type)) return;
    setTimeout(function () { if (document.activeElement === e) e.scrollIntoView({ block: "center" }); }, 60);
  }
  var fitWidth = 0, fitHeight = 0;
  function fit(force) {
    var w = window.innerWidth, h = window.innerHeight;
    if (force !== true && w === fitWidth && h < fitHeight * 0.85) { revealFocus(); return; }
    fitWidth = w;
    fitHeight = h;
    w = Math.max(1, w - safe.l - safe.r);
    h = Math.max(1, h - safe.t - safe.b);
    var portrait = h > w;
    var bw = portrait ? 600 : 960;
    // 縦は 880 より みじかいと がんばりカレンダーと よていが きゅうくつに なるので、そのときは 横に すこし 余白を つくる
    var bh = Math.round(Math.min(Math.max(bw * h / w, portrait ? 880 : 480), portrait ? 1300 : 720));
    var scale = Math.min(w / bw, h / bh);
    document.documentElement.style.setProperty("--bw", bw + "px");
    document.documentElement.style.setProperty("--bh", bh + "px");
    document.body.classList.toggle("portrait", portrait);
    [".board", ".settings .panel", ".kv-board", ".grv-board", ".lk-board", ".su-board", ".tu-board", ".cn-board"].forEach(function (sel) {
      document.querySelector(sel).style.zoom = scale;
    });
    // 向きが かわると がんばりカレンダーの ボタンの はいりかたも かわる
    window.dispatchEvent(new Event("board:fit"));
  }

  // 画面の向き（アプリのときだけ）。端末ごとの設定なので この端末の中に おぼえる。スマホは たて。
  // ほかは 0.1.19（2026-11-18）から 自動（端末の 回転の 設定に したがう。回らない 端末は 横の まま）。
  //   前は 横に 固定で、タブレットを 回しても 回らず とまどった。もう 使って いる 端末は、更新した とたんに 向きが かわらない ように 横の まま
  var ORIENT_KEY = "orientation", ORIENT_DEFAULT_KEY = "orientationDefault";
  var orientDefault = storageGet(ORIENT_DEFAULT_KEY);
  if (!orientDefault) {
    orientDefault = window.BoardApi.needsSetup() ? "auto" : "landscape";
    storageSet(ORIENT_DEFAULT_KEY, orientDefault);
  }
  function defaultOrient() {
    if (Device.info().phone) return "portrait";
    return orientDefault;
  }
  function applyOrientation() {
    var o = storageGet(ORIENT_KEY) || defaultOrient();
    try {
      if (Device.canOrient()) window.EchoBoard.setOrientation(o);
    } catch (e) { /* できない環境では何もしない */ }
  }
  applyOrientation();

  B.ORIENT_KEY = ORIENT_KEY;
  B.defaultOrient = defaultOrient;
  B.applyOrientation = applyOrientation;

  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("board:insets", function (ev) { setSafe(ev.detail); fit(true); });
  B.tick();
  setInterval(B.tick, 1000);
  // きょう／あした の きりかえに あわせて 10ぷんごとに かきなおす
  setInterval(function () { B.renderWeather(); B.renderEvents(); }, 10 * 60 * 1000);
  B.renderEvents();
  B.fetchWeather();
  B.fetchRain();
  B.markStarted();
  B.fetchCalendar();
  B.fetchHolidays();
  setInterval(B.fetchHolidays, 24 * 60 * 60 * 1000);
})();
