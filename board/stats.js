// 使っている 端末の 数（2026-11-26。ブラウザ版だけ）。GoatCounter（tools/build-web.ps1 が index.html に 入れる）に
//   「印」だけを 送る。家族の 記録・名前・設定は 送らない。Android の アプリには GoatCounter が ないので 何も しない。
//   board-first … この ブラウザで はじめて 開いた（これまでの 台数。GoatCounter で 期間を 長く して 見る）
//   board-day   … その日 はじめて 開いた（1日の 台数。期間を 1日に して 見る）
//   board-7days … 7日（ちがう 日） 使った（つづけて いる 台数）
//   どの 印を 送ったかは この ブラウザの localStorage（stats:*）で 覚えて、2度は 送らない。
//   つなぐための 番号（pair=）の ある アドレスで 開いた ときは 送らない（GoatCounter は ? から 後ろも 送るため）
(function () {
  "use strict";

  if (/[?&]pair=/.test(location.search)) return;
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;   // Android の アプリは 数えない

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 覚えられない ときは 毎回 送らない ように 下で 止める */ } }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  // 端末の 種類（GoatCounter の 一覧で 見分ける ため。細かい 機種は 送らない）
  function kind() {
    var ua = navigator.userAgent;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
    if (/iPhone|iPod/.test(ua)) return "iPhone";
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android スマホ" : "Android タブレット";
    return "PC";
  }

  function send(path, title) {
    var tries = 0;
    (function go() {
      var gc = window.goatcounter;
      if (gc && typeof gc.count === "function") { gc.count({ path: path, title: title + "（" + kind() + "）", event: true }); return; }
      if (++tries < 30) setTimeout(go, 2000);   // count.js は async で 読む。1分 待って なければ あきらめる（Android の アプリ など）
    })();
  }

  // localStorage が 使えない ブラウザ（プライベート など）は 毎回 はじめてに なるので 送らない
  put("stats:probe", "1");
  if (get("stats:probe") !== "1") return;

  // 開いた ときと、開いた ままの 端末（置いた タブレット）は 日が かわった ときにも
  function tick() {
    var day = today();
    if (!get("stats:first")) { put("stats:first", day); send("board-first", "はじめて開いた端末"); }
    if (get("stats:day") === day) return;
    put("stats:day", day);
    send("board-day", "その日に開いた端末");
    var n = (parseInt(get("stats:days"), 10) || 0) + 1;
    put("stats:days", String(n));
    if (n >= 7 && !get("stats:7days")) { put("stats:7days", day); send("board-7days", "7日使った端末"); }
  }
  tick();
  setInterval(tick, 30 * 60 * 1000);
})();
