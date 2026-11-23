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
    // スマホの 形（2026-11-21。docs/handover/phone-home.md）: 縦に 長い（tall）・横に 長い（wide）ときは ホームの 並びを かえる。
    //   タブレット・.8（960×480 は 2.0）・.9 は 入らない。ブラウザの 帯で 縦横比が かわるので、スマホと わかって いれば それでも 入れる
    var phone = Device.phone();
    var tall = portrait && (h / w > 1.7 || phone), wide = !portrait && (w / h > 2.1 || phone);
    var bw = portrait ? 600 : 960;
    // 縦は 880 より みじかいと がんばりカレンダーと よていが きゅうくつに なるので、そのときは 横に すこし 余白を つくる
    var bh = Math.round(Math.min(Math.max(bw * h / w, portrait ? 880 : 480), portrait ? 1300 : 720));
    // 横に 長い ときは、高さで 倍率を きめて 幅を 画面いっぱいまで ひろげる（2026-11-23。前は 幅 960 の まま で 両わきが あいた。
    //   字の 大きさは かわらない。ブラウザの 横で 高さが 320〜370px しか ない ときも、Redmi の アプリの 横でも 空いて いた）
    if (wide) bw = Math.max(bw, Math.round(w * bh / h));
    var scale = Math.min(w / bw, h / bh);
    document.documentElement.style.setProperty("--bw", bw + "px");
    document.documentElement.style.setProperty("--bh", bh + "px");
    document.documentElement.style.setProperty("--fit", String(scale));
    document.body.classList.toggle("portrait", portrait);
    document.body.classList.toggle("tall", tall);
    document.body.classList.toggle("wide", wide);
    // 同じ 形の 画面が 2つ ある（かんたん設定と ブラウザ版の 入口の .su-board）ので、ぜんぶに かける
    [".board", ".kv-board", ".grv-board", ".tu-board", ".cn-board"].forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.style.zoom = scale; });
    });
    // おうちの人の 画面（設定・かんたん設定・鍵）: スマホの 縦は 幅 420 で 組んで 縮め方を 小さく する（2026-11-23 案 A。
    //   幅 600 を 0.6倍に して いて、iPhone SE の ブラウザで 本文が 9.3px（2.4mm）と 小さかった。テスターの 声）。
    //   入れものの 中だけ --bw・--bh・--fit を 上書きする（CSS の calc は その値で 大きさを きめる）
    var adult = tall ? 420 : 0, ah = adult ? Math.max(Math.round(adult * h / w), 560) : 0, aScale = adult ? Math.min(w / adult, h / ah) : scale;
    [".settings .panel", ".su-board", ".lk-board"].forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        el.style.zoom = aScale;
        if (adult) {
          el.style.setProperty("--bw", adult + "px");
          el.style.setProperty("--bh", ah + "px");
          el.style.setProperty("--fit", String(aScale));
        } else ["--bw", "--bh", "--fit"].forEach(function (k) { el.style.removeProperty(k); });
      });
    });
    document.body.classList.toggle("adult-narrow", !!adult);
    document.documentElement.classList.remove("unfit");
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
