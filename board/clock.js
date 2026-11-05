// ボードの 日付・時計（デジタル・アナログ）と 祝日。毎秒の tick（app.js が うごかす）で 画面オフの 判定（sleep.js）も よぶ
(function () {
  "use strict";

  var B = window.Board, C = window.CONFIG;
  var $ = B.$, W = B.W, levelFor = B.levelFor, setText = B.setText, setHtml = B.setHtml, pad = B.pad, ymd = B.ymd;
  var WEEKDAY_COLORS = B.WEEKDAY_COLORS;

  // ---- ひにち・とけい ----
  function renderDate(now) {
    B.curSec = "clock";
    var dow = now.getDay();
    setText("month", W("month", { m: now.getMonth() + 1 }));
    // 「日」に その日の 読みの ふりがな（1日 = ついたち）。かわった ときだけ かきかえる
    var unit = window.Words.dayUnit(now.getDate(), levelFor(B.curSec));
    if ($("day-unit").innerHTML !== unit) $("day-unit").innerHTML = unit;
    setText("day", now.getDate());
    setText("weekday", W("weekdays")[dow]);
    setText("wd-prev", W("weekdays")[(dow + 6) % 7]);
    setText("wd-next", W("weekdays")[(dow + 1) % 7]);
    var color = WEEKDAY_COLORS[B.holidays[ymd(now)] ? 0 : dow];
    if (document.body.style.getPropertyValue("--wd") !== color) document.body.style.setProperty("--wd", color);

    var h = now.getHours();
    setHtml("greeting", W(h >= 5 && h < 10 ? "morning" : h >= 10 && h < 17 ? "hello" : "night"));
    var night = C.night.from > C.night.to
      ? (h >= C.night.from || h < C.night.to)
      : (h >= C.night.from && h < C.night.to);
    if (document.body.classList.contains("night") !== night) document.body.classList.toggle("night", night);
  }

  function tick() {
    var now = new Date();
    renderDate(now);
    renderClock(now);
    B.updateSleep(now);
  }

  // ---- とけい: デジタル（24時間・12時間）／アナログ（settings.clock） ----
  // アナログは 分を 赤（長い針・まわりの 5,10,15… と 1分ごとの 線）、時を 青（短い針・1〜12）で わける
  function renderClock(now) {
    B.curSec = "clock";
    var mode = B.settings.clock || "d24", el = $("clock"), h = now.getHours(), m = now.getMinutes(), html;
    var key = mode + ":" + h + ":" + m + ":" + levelFor("clock");
    if (el.dataset.key === key) return; // 1分に 1回だけ かきなおす
    el.dataset.key = key;
    if (mode === "analog") html = analogClock(h, m);
    else if (mode === "d12") html = '<span class="ampm">' + W(h < 12 ? "am" : "pm") + '</span>' + (h % 12 || 12) + ":" + pad(m);
    else html = h + ":" + pad(m);
    el.className = "clock" + (mode === "analog" ? " analog" : "");
    el.innerHTML = html;
  }

  function analogClock(h, m) {
    var parts = ['<svg viewBox="0 0 200 200" aria-label="' + h + ":" + pad(m) + '"><circle class="face" cx="100" cy="100" r="97"/>'];
    function at(r, deg) { var a = (deg - 90) * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; }
    for (var i = 0; i < 60; i++) {
      var five = i % 5 === 0, p1 = at(five ? 85 : 89, i * 6), p2 = at(95, i * 6);
      parts.push('<line class="tick' + (five ? " five" : "") + '" x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '"/>');
      if (five) {
        var pm = at(75, i * 6), ph = at(54, i * 6);
        parts.push('<text class="min" x="' + pm[0].toFixed(1) + '" y="' + pm[1].toFixed(1) + '">' + i + '</text>');
        parts.push('<text class="hour" x="' + ph[0].toFixed(1) + '" y="' + ph[1].toFixed(1) + '">' + (i / 5 || 12) + '</text>');
      }
    }
    var hh = at(42, (h % 12 + m / 60) * 30), mm = at(82, m * 6);
    parts.push('<line class="hand-h" x1="100" y1="100" x2="' + hh[0].toFixed(1) + '" y2="' + hh[1].toFixed(1) + '"/>');
    parts.push('<line class="hand-m" x1="100" y1="100" x2="' + mm[0].toFixed(1) + '" y2="' + mm[1].toFixed(1) + '"/>');
    parts.push('<circle class="pin" cx="100" cy="100" r="6"/></svg>');
    return parts.join("");
  }

  // ---- しゅくじつ ----
  // 祝日は 端末の中で 計算する（holidays.js）。ことしと らいねん の ぶん
  function fetchHolidays() {
    var y = new Date().getFullYear();
    B.holidays = Object.assign(window.JapanHolidays(y), window.JapanHolidays(y + 1));
  }

  B.tick = tick;
  B.renderClock = renderClock;
  B.fetchHolidays = fetchHolidays;
})();
