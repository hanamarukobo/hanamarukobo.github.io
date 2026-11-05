// 日本の祝日を計算する（外部の API に頼らない）。2020年以降の「国民の祝日に関する法律」にもとづく。
//   JapanHolidays(2026) → { "2026-01-01": "元日", ... }
// 春分・秋分は 1980〜2099年に使える近似式（国立天文台の発表と ずれる年が出たら ここで直す）。
// 振替休日（祝日が日曜なら、つぎの祝日でない日）と 国民の休日（祝日に はさまれた日）も ふくむ。
(function () {
  "use strict";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function key(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }

  // その月の 第n月曜日
  function nthMonday(y, m, n) {
    var first = new Date(y, m - 1, 1).getDay();
    return 1 + ((8 - first) % 7) + (n - 1) * 7;
  }

  function vernal(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function autumnal(y) { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }

  window.JapanHolidays = function (y) {
    var h = {};
    h[key(y, 1, 1)] = "元日";
    h[key(y, 1, nthMonday(y, 1, 2))] = "成人の日";
    h[key(y, 2, 11)] = "建国記念の日";
    h[key(y, 2, 23)] = "天皇誕生日";
    h[key(y, 3, vernal(y))] = "春分の日";
    h[key(y, 4, 29)] = "昭和の日";
    h[key(y, 5, 3)] = "憲法記念日";
    h[key(y, 5, 4)] = "みどりの日";
    h[key(y, 5, 5)] = "こどもの日";
    h[key(y, 7, nthMonday(y, 7, 3))] = "海の日";
    h[key(y, 8, 11)] = "山の日";
    h[key(y, 9, nthMonday(y, 9, 3))] = "敬老の日";
    h[key(y, 9, autumnal(y))] = "秋分の日";
    h[key(y, 10, nthMonday(y, 10, 2))] = "スポーツの日";
    h[key(y, 11, 3)] = "文化の日";
    h[key(y, 11, 23)] = "勤労感謝の日";

    var base = Object.keys(h).sort();
    // 国民の休日: 前の日と次の日が祝日で、その日が祝日でも日曜でもない
    base.forEach(function (k) {
      var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + 2);
      var mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      var k2 = key(d.getFullYear(), d.getMonth() + 1, d.getDate()), km = key(mid.getFullYear(), mid.getMonth() + 1, mid.getDate());
      if (h[k2] && !h[km] && mid.getDay() !== 0) h[km] = "国民の休日";
    });
    // 振替休日: 祝日が日曜なら、その後の いちばん近い 祝日でない日
    base.forEach(function (k) {
      var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
      if (d.getDay() !== 0) return;
      do { d.setDate(d.getDate() + 1); } while (h[key(d.getFullYear(), d.getMonth() + 1, d.getDate())]);
      h[key(d.getFullYear(), d.getMonth() + 1, d.getDate())] = "振替休日";
    });
    return h;
  };
})();
