// 天気の地域を えらぶ 2つの <select>（府県予報区 → 市区町村）。jma-areas.js の一覧を使う。
// 市区町村は 地域（一次細分区域）ごとに まとめて ならべ、えらんだ 市区町村から 地域も きまる。
// ボードの設定画面（settings.js）・はじめての設定（setup.js）・がんばり管理（admin.html）で共通
(function () {
  "use strict";

  var AREAS = window.JMA_AREAS || [];

  function office(code) { return AREAS.filter(function (o) { return o[0] === code; })[0]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // 以前の設定（地域だけで 市区町村が ない）は、えらびなおすまで その地域の まま つかう
  function fillCities(citySel, officeCode, value) {
    var o = office(officeCode), v = value || {};
    citySel.dataset.area = v.office === officeCode && !v.city && v.area ? v.area : "";
    if (!o) {
      citySel.innerHTML = '<option value="">—</option>';
      citySel.disabled = true;
      return;
    }
    var code = v.city && v.city.code;
    citySel.innerHTML = '<option value="">えらんでください</option>' + o[2].map(function (a) {
      var opts = a[2].map(function (c) {
        return '<option value="' + c[0] + '"' + (c[0] === code ? " selected" : "") + '>' + esc(c[1]) + '</option>';
      }).join("");
      return o[2].length > 1 ? '<optgroup label="' + esc(a[1]) + '">' + opts + '</optgroup>' : opts;
    }).join("");
    citySel.disabled = false;
  }

  function findCity(o, code) {
    for (var i = 0; i < o[2].length; i++) {
      for (var j = 0; j < o[2][i][2].length; j++) if (o[2][i][2][j][0] === code) return { area: o[2][i], city: o[2][i][2][j] };
    }
    return null;
  }

  window.AreaSelect = {
    // value: { office, area, city: { code, name, kana } } または null。府県を かえたら 市区町村の一覧も かえる
    fill: function (officeSel, citySel, value) {
      var v = value || {};
      officeSel.innerHTML = '<option value="">えらんでください</option>' + AREAS.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === v.office ? " selected" : "") + '>' + esc(o[1]) + '</option>';
      }).join("");
      fillCities(citySel, v.office, v);
      if (!officeSel.dataset.bound) {
        officeSel.dataset.bound = "1";
        officeSel.addEventListener("change", function () { fillCities(citySel, officeSel.value, null); });
      }
    },
    // えらばれた地域。えらんでいなければ null
    value: function (officeSel, citySel) {
      var o = office(officeSel.value);
      if (!o) return null;
      var hit = citySel.value && findCity(o, citySel.value);
      if (hit) {
        return { office: o[0], area: hit.area[0], name: hit.city[1],
          city: { code: hit.city[0], name: hit.city[1], kana: hit.city[2] } };
      }
      // 市区町村を えらんでいない 以前の設定は 地域の まま
      var old = citySel.dataset.area && o[2].filter(function (a) { return a[0] === citySel.dataset.area; })[0];
      return old ? { office: o[0], area: old[0], name: o[1] + (o[2].length > 1 ? "・" + old[1] : "") } : null;
    },
    // 市区町村の 都道府県名（位置を しらべるとき 先頭に つける）
    prefName: function (cityCode) { return (window.JMA_PREFS || [])[parseInt(String(cityCode).slice(0, 2), 10)] || ""; },
  };
})();
