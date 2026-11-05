// ボードの 起動。ボードの ファイルの なかで いちばん さいごに 読む（読む じゅんと Board の 中身は board.js の 先頭）。
// 画面の 倍率（fit）と 向きを 合わせて、時計・天気・予定・祝日を はじめる
(function () {
  "use strict";

  var B = window.Board, storageGet = B.storageGet;

  // 画面の CSS ピクセル数は端末の density で変わるので、盤面を拡大縮小して合わせる。
  //   横置き: 幅960。高さは画面の縦横比に合わせて 480（Echo Show 5 の 2:1）〜 720（4:3）
  //   縦置き: 幅600。高さは 880〜1300（みじかい 画面では 左右に 余白。1300 は 縦長の スマホ 19.5:9 まで 下に 余白が 出ない ように）
  // ソフトキーボードが出て 高さだけ ちぢんだときは 倍率を かえない（文字が小さくならないように）
  var fitWidth = 0, fitHeight = 0;
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w === fitWidth && h < fitHeight * 0.85) return;
    fitWidth = w;
    fitHeight = h;
    var portrait = h > w;
    var bw = portrait ? 600 : 960;
    // 縦は 880 より みじかいと がんばりカレンダーと よていが きゅうくつに なるので、そのときは 横に すこし 余白を つくる
    var bh = Math.round(Math.min(Math.max(bw * h / w, portrait ? 880 : 480), portrait ? 1300 : 720));
    var scale = Math.min(w / bw, h / bh);
    document.documentElement.style.setProperty("--bw", bw + "px");
    document.documentElement.style.setProperty("--bh", bh + "px");
    document.body.classList.toggle("portrait", portrait);
    [".board", ".settings .panel", ".kv-board", ".gv-board", ".grv-board", ".lk-board", ".su-board", ".tu-board", ".cn-board"].forEach(function (sel) {
      document.querySelector(sel).style.zoom = scale;
    });
    // 向きが かわると がんばりカレンダーの ボタンの はいりかたも かわる
    window.dispatchEvent(new Event("board:fit"));
  }

  // 画面の向き（アプリのときだけ）。端末ごとの設定なので この端末の中に おぼえる。既定は よこ（Echo Show など）、スマホは たて
  var ORIENT_KEY = "orientation";
  function defaultOrient() {
    if (Device.info().phone) return "portrait";
    return "landscape";
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
