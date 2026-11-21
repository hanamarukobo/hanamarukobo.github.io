// 予定の「この端末のカレンダー」を えらぶ 一覧（設定の「ボードの表示」・かんたん設定の「カレンダー連携」。2026-11-21）。
//   アプリ（置いた端末・スマホ）は 端末の カレンダー（Google アカウントの カレンダーなど）を 読む。つないだ スマホ・QR の ブラウザは
//   置いた端末の 一覧を 見せる（許可は 置いた端末で しか 聞けない）。読むのは api.js の BoardApi.calendarList・requestCalendar。
//   CalPick.available() → Promise(bool) … この 画面で「この端末のカレンダー」を 出せるか
//   CalPick.show(box, ids, ask)         … box に 一覧を 出す（ids は えらんで いる もの。空なら いつもの カレンダーに 印。
//                                         ask: 許可が なければ すぐ 聞く。人が「この端末のカレンダー」を えらんだ ときだけ）
//   CalPick.picked(box)                 → えらんだ id の 配列
//   許可の 窓から もどったら（"board:calendar"）、出して いる 一覧を 読みなおす
(function () {
  "use strict";

  var W = function (k) { return window.Words.adult(k); };
  var shown = [];     // 出して いる box
  var asked = false;  // この 画面で 許可を 聞いた（聞いても だめ → 端末の 設定で 許可して もらう）

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function available() {
    var Api = window.BoardApi;
    if (!Api || Api.web) return Promise.resolve(false);
    return Api.calendarList().then(function (r) { return !!(r && r.provider); }, function () { return false; });
  }

  // いま 画面で 付いて いる 印（まだ 一覧が なければ 前に わたされた ids）
  function picked(box) {
    var boxes = box.querySelectorAll("input[type=checkbox][data-id]");
    if (!boxes.length) return (box._calIds || []).slice();
    return Array.prototype.filter.call(boxes, function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-id"); });
  }

  function render(box, r) {
    var Api = window.BoardApi, here = Api.local;
    if (!r.permitted) {
      var msg = !here ? W("calAskBoard") : asked ? W("calDenied") : W("calAsk");
      box.innerHTML = '<p class="note cal-msg">' + esc(msg) + "</p>" +
        (here ? '<button class="small cal-allow" type="button">' + esc(W("calAllow")) + "</button>" : "");
      var b = box.querySelector(".cal-allow");
      if (b) b.addEventListener("click", function () { asked = true; Api.requestCalendar(); });
      return;
    }
    // Google の カレンダーを 上に（端末だけの カレンダー（iPlay の「PC Sync」など）は 下に）
    var google = function (c) { return c.type === undefined || c.type === "com.google"; };
    var list = (r.list || []).filter(google).concat((r.list || []).filter(function (c) { return !google(c); }));
    if (!list.length) { box.innerHTML = '<p class="note cal-msg">' + esc(W("calNone")) + "</p>" + '<p class="note cal-share">' + esc(W("calShare")) + "</p>"; return; }
    var ids = (box._calIds || []).filter(function (id) { return list.some(function (c) { return c.id === id; }); });
    // まだ えらんで いない ときは、Google の アカウントの 主の カレンダーに 印（主の 印が ない 端末は 名前が アカウントと 同じ もの）。
    //   なければ Google の 1つめ、それも なければ 端末の 主の カレンダー → 1つめ。
    //   （iPlay では 端末だけの「PC Sync」が 主に なって いて、空の カレンダーに 印が 付いた。11-21）
    if (!ids.length) {
      var first = function (f) { var c = list.filter(f)[0]; return c ? [c.id] : []; };
      ids = first(function (c) { return google(c) && c.primary; });
      if (!ids.length) ids = first(function (c) { return google(c) && c.account && c.name === c.account; });
      if (!ids.length) ids = first(google);
      if (!ids.length) ids = first(function (c) { return c.primary; });
      if (!ids.length) ids = [list[0].id];
    }
    // Google カレンダーの アプリの「他のアプリと共有」が オフだと 一覧に 出ない（11-21 iPlay）。分からないので いつも 一覧の 上に 出す（11-21 社長）
    box.innerHTML = '<p class="note cal-share">' + esc(W("calShare")) + "</p>" + '<ul class="cal-list">' + list.map(function (c) {
      return '<li><label><input type="checkbox" data-id="' + esc(c.id) + '"' + (ids.indexOf(c.id) >= 0 ? " checked" : "") + ">" +
        '<i class="cal-dot" style="background:' + (/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#9aa") + '"></i>' +
        '<span class="cal-name">' + esc(c.name || c.account) + "</span>" +
        (c.account && c.account !== c.name ? '<small class="cal-acc">' + esc(c.account) + "</small>" : "") +
        "</label></li>";
    }).join("") + "</ul>" + '<p class="note">' + esc(W("calPickNote")) + "</p>";
  }

  function show(box, ids, ask) {
    if (ids) box._calIds = ids.slice();
    else box._calIds = picked(box);
    if (shown.indexOf(box) < 0) shown.push(box);
    box.hidden = false;
    var seq = (box._calSeq || 0) + 1;
    box._calSeq = seq;
    return window.BoardApi.calendarList().then(function (r) {
      if (box._calSeq !== seq) return r;
      render(box, r || {});
      // 許可が なく、この 画面で まだ 聞いて いなければ、すぐ 聞く（えらんだ とたんに 窓が 出る ほうが 手間が すくない）
      if (ask && r && r.provider && !r.permitted && window.BoardApi.local && !asked) {
        asked = true;
        window.BoardApi.requestCalendar();
      }
      return r;
    }, function () {
      if (box._calSeq === seq) box.innerHTML = '<p class="note cal-msg">' + esc(W("calLoadFail")) + "</p>";
      return null;
    });
  }

  function refresh() {
    shown.forEach(function (box) { if (!box.hidden && box.offsetParent !== null) show(box); });
  }
  window.addEventListener("board:calendar", refresh);
  // ほかの アプリ（Google カレンダーの「他のアプリと共有」・端末の 設定）から もどったら 読みなおす
  //   （前は 設定を 閉じて 開きなおすまで 一覧が かわらなかった。11-21 社長）
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  window.CalPick = { available: available, show: show, picked: picked };
})();
