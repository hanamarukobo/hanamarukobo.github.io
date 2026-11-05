// 家の あたり（1km四方）の 雨。気象庁の 降水ナウキャスト（1時間先まで・5分ごと）と
// 降水短時間予報（15時間先まで・1時間ごと）の 地図の 画像から、その地点の 色を よんで 雨の量に なおす。
//   Rain.load(lat, lon) → { now: いまの強さ(mm/h), soon: [{ t, mm }]（5分ごと）, hours: [{ t, mm }]（1時間ごと） }
//   t は その時刻（ミリ秒）。時刻の 区切りは 気象庁の データの まま（UTC で 書かれている）
// 公式の API ではなく 気象庁の ホームページの データなので、形が かわることが ある
(function () {
  "use strict";

  var BASE = "https://www.jma.go.jp/bosai/jmatile/data/";
  var ZOOM = 10; // 1ピクセルが およそ 120m（1km四方の データには じゅうぶん）

  // 地図の 色 → 雨の量（mm/h）。気象庁の 凡例の 色（範囲の 下の値を つかう）
  var LEGEND = [
    [[242, 242, 255], 0.5],
    [[160, 210, 255], 1],
    [[33, 140, 255], 5],
    [[0, 65, 255], 10],
    [[250, 245, 0], 20],
    [[255, 153, 0], 30],
    [[255, 40, 0], 50],
    [[180, 0, 104], 80],
  ];

  function mmOf(rgba) {
    if (rgba[3] < 128) return 0; // すきとおっている ところは 雨なし
    var best = null, dist = 1e9;
    LEGEND.forEach(function (l) {
      var d = 0;
      for (var i = 0; i < 3; i++) d += (l[0][i] - rgba[i]) * (l[0][i] - rgba[i]);
      if (d < dist) { dist = d; best = l[1]; }
    });
    return best;
  }

  // 緯度・経度 → タイルの 番号と その中の ピクセル（ふつうの Web メルカトル）
  function tileOf(lat, lon) {
    var n = Math.pow(2, ZOOM) * 256, r = lat * Math.PI / 180;
    var x = (lon + 180) / 360 * n;
    var y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    return { x: Math.floor(x / 256), y: Math.floor(y / 256), px: Math.floor(x) % 256, py: Math.floor(y) % 256 };
  }

  // "20261014005000"（UTC）→ ミリ秒
  function utc(s) {
    return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
  }

  function json(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // 画像の 1ピクセルを よむ（気象庁の 画像は CORS が ゆるされているので canvas で よめる）
  var canvas = null;
  function pixel(url, px, py) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        canvas = canvas || document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 1, 1);
        ctx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1);
        resolve(Array.prototype.slice.call(ctx.getImageData(0, 0, 1, 1).data));
      };
      // 雨の ない ところは 画像が ない（404）ことが ある
      img.onerror = function () { resolve([0, 0, 0, 0]); };
      img.src = url;
    });
  }

  function sample(kind, element, basetime, validtime, t) {
    return pixel(BASE + kind + "/" + basetime + "/none/" + validtime + "/surf/" + element + "/" + ZOOM + "/" + t.x + "/" + t.y + ".png", t.px, t.py)
      .then(mmOf);
  }

  function load(lat, lon) {
    var t = tileOf(lat, lon);
    return Promise.all([
      json(BASE + "nowc/targetTimes_N1.json"),
      json(BASE + "nowc/targetTimes_N2.json"),
      json(BASE + "rasrf/targetTimes.json"),
    ]).then(function (r) {
      var obs = r[0][0];
      // ナウキャストの 予報は 10分ごとに よむ（6まい）
      var soon = r[1].filter(function (x) { return x.basetime === obs.basetime; })
        .sort(function (a, b) { return a.validtime < b.validtime ? -1 : 1; })
        .filter(function (x, i) { return i % 2 === 1; });
      // 降水短時間予報: 10分ごとの 発表は 6時間先まで、毎正時の 発表は 15時間先まで ある。
      // あたらしい 発表から じゅんに、まだ ない 時刻の ぶんだけ つかう（解析だけの 発表は のぞく）
      var bases = {};
      r[2].forEach(function (x) { if (x.validtime > x.basetime) (bases[x.basetime] = bases[x.basetime] || []).push(x); });
      var hours = [], until = "";
      Object.keys(bases).sort().reverse().forEach(function (b) {
        bases[b].sort(function (a, c) { return a.validtime < c.validtime ? -1 : 1; }).forEach(function (x) {
          if (x.validtime > until) { hours.push(x); }
        });
        hours.forEach(function (x) { if (x.validtime > until) until = x.validtime; });
      });
      return Promise.all([
        sample("nowc", "hrpns", obs.basetime, obs.validtime, t),
        Promise.all(soon.map(function (x) { return sample("nowc", "hrpns", x.basetime, x.validtime, t); })),
        Promise.all(hours.map(function (x) { return sample("rasrf", "rasrf", x.basetime, x.validtime, t); })),
      ]).then(function (v) {
        return {
          at: utc(obs.validtime),
          now: v[0],
          soon: soon.map(function (x, i) { return { t: utc(x.validtime), mm: v[1][i] }; }),
          // 降水短時間予報の 値は その時刻 までの 1時間の 雨の量。t は 1時間の はじめに なおす
          hours: hours.map(function (x, i) { return { t: utc(x.validtime) - 60 * 60 * 1000, mm: v[2][i] }; }),
        };
      });
    });
  }

  window.Rain = { load: load, mmOf: mmOf, tileOf: tileOf };
})();
