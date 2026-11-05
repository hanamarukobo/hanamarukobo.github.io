// ボードの 天気（気象庁）・家の あたりの 雨（rain.js）・服装と 持ち物の 目安
(function () {
  "use strict";

  var B = window.Board, C = window.CONFIG;
  var $ = B.$, W = B.W, levelFor = B.levelFor, pad = B.pad, ymd = B.ymd, storageGet = B.storageGet, storageSet = B.storageSet;
  var escapeHtml = B.escapeHtml, targetDay = B.targetDay, swipe = window.BoardSwipe;

  var SLOTS = [
    { key: "slotMorning", hour: 7 },
    { key: "slotNoon", hour: 12 },
    { key: "slotEvening", hour: 17 },
  ];
  var WX_KEY = "wx";

  // ---- てんき（気象庁） ----
  // 3時間ごとの天気と気温は「天気分布予報」（一次細分区域ごと）、降水確率は府県予報（6時間ごと）から取る。
  // 雨の時刻だけは 市区町村の 役所あたり（1km四方）の 降水ナウキャスト・降水短時間予報（rain.js）で みる。
  // 発表のたびに過ぎた時間の分は消えるので、取れた値を日付ごとに保存して使い続ける
  //   wx = { area: "130010", days: { "YYYY-MM-DD": { w: { "06": "晴れ" }, t: { "06": 17 }, max, min, pops: { "06": 10 } } },
  //          week: { "YYYY-MM-DD": { code: "201", pop: 30, max, min } } }（week は 週間予報。あさって から さきを 見る ため）
  var wx = storageGet(WX_KEY) || { area: null, days: {} };
  var wxTimer = null, wxError = false, wxSeq = 0;

  // 天気の地域。設定になければ config.js の値（ふつうは なし）
  function place() {
    var l = B.settings.location;
    if (l && l.area && l.office) return l;
    if (C.jma && C.jma.area) {
      var p = { office: C.jma.office, area: C.jma.area, name: C.place && C.place.name, city: C.jma.city };
      if (C.place && C.place.latitude) { p.lat = C.place.latitude; p.lon = C.place.longitude; }
      return p;
    }
    return null;
  }
  // 地域・市区町村が かわったかを くらべる ための 文字
  function placeKey() {
    var p = place();
    return p ? p.area + ":" + (p.city ? p.city.code : p.lat ? p.lat + "," + p.lon : "") : "";
  }
  // 天気の 見出しの 横に だす 場所（小さい子には よみがな）
  function placeLabel() {
    var p = place(), c = p && p.city;
    if (!c) return "";
    return levelFor("weather") !== "upper" && c.kana ? c.kana : c.name;
  }

  // ---- あめ（家の あたり 1km四方。rain.js） ----
  // 1時間に 1mm 未満の よわい雨は「ふる」に かぞえない（かぞえると ほぼ毎日「ふる」に なる）
  var RAIN_MM = 1;
  var rain = null, rainSeq = 0;

  // 位置。設定に なければ 国土地理院の住所検索で 市区町村の 役所あたりを しらべて、この端末に おぼえる
  function geo(p) {
    if (p.lat) return Promise.resolve({ lat: p.lat, lon: p.lon });
    if (!p.city) return Promise.resolve(null);
    var key = "geo:" + p.city.code, hit = storageGet(key);
    if (hit) return Promise.resolve(hit);
    var q = window.AreaSelect.prefName(p.city.code) + p.city.name;
    return fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(q)).then(json).then(function (a) {
      var c = a && a[0] && a[0].geometry && a[0].geometry.coordinates;
      if (!c) return null;
      var g = { lat: c[1], lon: c[0] };
      storageSet(key, g);
      return g;
    });
  }

  function fetchRain() {
    var p = place(), key = placeKey(), seq = ++rainSeq;
    if (!p || !window.Rain) { rain = null; return; }
    geo(p).then(function (g) {
      if (!g) throw new Error("市区町村の位置が分かりません");
      return window.Rain.load(g.lat, g.lon);
    }).then(function (r) {
      if (seq !== rainSeq) return;
      r.key = key;
      r.fetched = Date.now();
      rain = r;
      renderWeather();
    }).catch(function (e) {
      if (seq !== rainSeq) return;
      console.error(e);
      if (rain) rain.fetched = Date.now() - 5 * 60 * 1000; // 5分後に もういちど
    });
  }
  // おきている ときは 10分ごと、黒い画面の ときは 30分ごとに よみなおす
  setInterval(function () {
    var age = rain ? Date.now() - rain.fetched : Infinity;
    if (age > (B.sleeping ? 30 : 10) * 60 * 1000) fetchRain();
  }, 60 * 1000);

  // 雨の よてい。null は わからない（いままでどおり 降水確率だけで きめる）
  //   { type: "now", until: 時 | null } いま ふっている / { type: "from", hour, soon } これから ふる /
  //   { type: "none", until: 時 | null } わかる 時間の なかでは ふらない（null は 夜まで）
  function rainPlan(dayKey) {
    if (!rain || rain.key !== placeKey() || Date.now() - rain.at > 2 * 60 * 60 * 1000) return null;
    // いま → 10分ごと（1時間先まで）→ 1時間ごと（15時間先まで）
    var series = [{ t: rain.at, mm: rain.now, len: 10 }].concat(rain.soon.map(function (x) { return { t: x.t, mm: x.mm, len: 10 }; }));
    var last = series[series.length - 1].t;
    rain.hours.forEach(function (x) { if (x.t + 30 * 60 * 1000 > last) series.push({ t: x.t, mm: x.mm, len: 60 }); });
    var end = series[series.length - 1], endAt = end.t + end.len * 60 * 1000;
    function hourOf(t) { return new Date(t + 30 * 60 * 1000).getHours(); } // ちかい 時に まるめる
    function dayOf(t) { return ymd(new Date(t + 30 * 60 * 1000)); }
    var today = ymd(new Date());
    if (dayKey === today) {
      if (rain.now >= RAIN_MM) {
        var stop = series.filter(function (x) { return x.t > rain.at && x.mm < RAIN_MM; })[0];
        return { type: "now", until: stop && dayOf(stop.t) === today ? hourOf(stop.t) : null };
      }
      var start = series.filter(function (x) { return x.mm >= RAIN_MM; })[0];
      if (start && dayOf(start.t) === today) return { type: "from", hour: hourOf(start.t), soon: start.t - Date.now() < 60 * 60 * 1000 };
      var e = new Date(endAt);
      return { type: "none", until: ymd(e) > today || e.getHours() >= 21 ? null : e.getHours() };
    }
    // あした: わかる 時間（よるに みると あしたの あさ まで）の なかで ふりはじめが あれば
    var s2 = series.filter(function (x) { return dayOf(x.t) === dayKey && x.mm >= RAIN_MM; })[0];
    return s2 ? { type: "from", hour: hourOf(s2.t), tomorrow: true } : null;
  }

  // [絵, ことば]。絵は 自前の 絵（img/）
  function weatherIcon(w) {
    var ic = window.Words.icon;
    if (!w) return [ic("unknown"), ""];
    if (/雪/.test(w) && /雨/.test(w)) return [ic("sleet"), "あめか ゆき"];
    if (/雪/.test(w)) return [ic("snow"), "ゆき"];
    if (/雷/.test(w)) return [ic("thunder"), "かみなり"];
    if (/雨/.test(w)) return [ic("rain"), "あめ"];
    if (/晴/.test(w) && /(くもり|曇)/.test(w)) return [ic("partly"), "はれ ときどき くもり"];
    if (/(くもり|曇)/.test(w)) return [ic("cloudy"), "くもり"];
    if (/晴/.test(w)) return [ic("sunny"), "はれ"];
    return [ic("unknown"), w];
  }

  function json(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function fetchWeather() {
    clearTimeout(wxTimer);
    var p = place(), seq = ++wxSeq;
    if (!p) { renderWeather(); return; }
    if (wx.area !== p.area) { wx = { area: p.area, days: {} }; renderWeather(); }
    var base = "https://www.jma.go.jp/bosai/";
    Promise.all([
      fetch(base + "jmatile/data/wdist/VPFD/" + p.area + ".json").then(json),
      fetch(base + "forecast/data/forecast/" + p.office + ".json").then(json),
    ]).then(function (r) {
      if (seq !== wxSeq) return; // あとから はじめた よみこみが ある（地域を かえた など）
      mergeVpfd(r[0]);
      mergePops(r[1][0].timeSeries, p.area);
      if (r[1][1]) mergeWeek(r[1][1].timeSeries, p.area);
      var today = ymd(new Date());
      Object.keys(wx.days).forEach(function (d) { if (d < today) delete wx.days[d]; });
      Object.keys(wx.week || {}).forEach(function (d) { if (d < today) delete wx.week[d]; });
      storageSet(WX_KEY, wx);
      wxError = false;
      renderWeather();
      wxTimer = setTimeout(fetchWeather, 30 * 60 * 1000);
    }).catch(function (e) {
      if (seq !== wxSeq) return;
      console.error(e);
      wxError = true;
      renderWeather();
      wxTimer = setTimeout(fetchWeather, 5 * 60 * 1000);
    });
  }

  function wxDay(d) { return wx.days[d] || (wx.days[d] = { w: {}, t: {}, pops: {} }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? undefined : n; }

  function mergeVpfd(v) {
    var a = v.areaTimeSeries, p = v.pointTimeSeries;
    a.timeDefines.forEach(function (t, i) {
      wxDay(t.dateTime.slice(0, 10)).w[t.dateTime.slice(11, 13)] = a.weather[i];
    });
    if (!p) return;
    p.timeDefines.forEach(function (t, i) {
      var day = wxDay(t.dateTime.slice(0, 10)), h = t.dateTime.slice(11, 13);
      var temp = num(p.temperature[i]), max = num((p.maxTemperature || [])[i]), min = num((p.minTemperature || [])[i]);
      if (temp !== undefined) day.t[h] = temp;
      if (max !== undefined) day.max = max;
      if (min !== undefined) day.min = min;
    });
  }

  function mergePops(series, area) {
    series.forEach(function (s) {
      s.areas.forEach(function (a) {
        if (!a.pops || a.area.code !== area) return;
        s.timeDefines.forEach(function (t, i) {
          if (a.pops[i] !== "") wxDay(t.slice(0, 10)).pops[t.slice(11, 13)] = parseInt(a.pops[i], 10);
        });
      });
    });
  }

  // 週間予報（あさって から さきの 日を スワイプで 見る ため）。天気の コード・降水確率・最高・最低。
  //   地域は 週間予報の 区切り（ふつうは 短期と おなじ コード。なければ 府県の 最初の 地域）、気温は 府県の 代表の 地点
  function mergeWeek(series, area) {
    var ws = series[0], ts = series[1];
    if (!ws || !ws.areas || !ws.areas.length) return;
    var a = ws.areas.filter(function (x) { return x.area.code === area; })[0] || ws.areas[0];
    var t = ts && ts.areas && ts.areas[0];
    var week = {};
    ws.timeDefines.forEach(function (td, i) {
      var d = td.slice(0, 10), pop = num((a.pops || [])[i]);
      week[d] = { code: a.weatherCodes[i], pop: pop };
    });
    if (t) {
      ts.timeDefines.forEach(function (td, i) {
        var w = week[td.slice(0, 10)];
        if (!w) return;
        var max = num((t.tempsMax || [])[i]), min = num((t.tempsMin || [])[i]);
        if (max !== undefined) w.max = max;
        if (min !== undefined) w.min = min;
      });
    }
    wx.week = week;
  }

  // 気象庁の 天気の コード（100 晴 / 200 曇 / 300 雨 / 400 雪 と その組み合わせ）を weatherIcon() が よめる 文に する
  var SNOW_CODES = [104, 105, 115, 116, 117, 160, 170, 181, 204, 205, 215, 216, 217, 228, 229, 230, 231, 250, 260, 270, 281,
    303, 304, 309, 314, 315, 316, 317, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 340, 371];
  var RAIN_IN_SNOW = [403, 409, 414, 422, 423, 425, 426, 427];
  function codeText(code) {
    var c = parseInt(code, 10), h = Math.floor(c / 100);
    if (h === 1) {
      if (SNOW_CODES.indexOf(c) >= 0) return "晴一時雪";
      if (c === 100 || c === 130 || c === 131) return "晴";
      if (c === 101 || c === 110 || c === 111 || c === 132) return "晴時々曇";
      return "晴一時雨";
    }
    if (h === 2) {
      if (SNOW_CODES.indexOf(c) >= 0) return "曇一時雪";
      if (c === 200 || c === 209 || c === 231) return "曇";
      if (c === 201 || c === 210 || c === 211 || c === 223) return "曇時々晴";
      return "曇一時雨";
    }
    if (h === 3) return SNOW_CODES.indexOf(c) >= 0 ? "雨か雪" : c === 350 ? "雷雨" : "雨";
    if (h === 4) return RAIN_IN_SNOW.indexOf(c) >= 0 ? "雪か雨" : "雪";
    return "";
  }

  // hour 時の気温。3時間ごとの値の あいだは まっすぐ つなぐ
  function tempAt(day, hour) {
    var t = (wx.days[day] || {}).t;
    if (!t) return null;
    var h0 = Math.floor(hour / 3) * 3, a = t[pad(h0)], b = t[pad(h0 + 3)];
    if (a === undefined) return b === undefined ? null : b;
    if (b === undefined) return a;
    return a + (b - a) * (hour - h0) / 3;
  }
  function weatherAt(day, hour) { return ((wx.days[day] || {}).w || {})[pad(Math.floor(hour / 3) * 3)]; }
  function popAt(day, hour) { return ((wx.days[day] || {}).pops || {})[pad(Math.floor(hour / 6) * 6)]; }

  // 7時〜18時（そとに いる じかん）のまとめ。最高・最低は気象庁の予報（テレビと同じ数字）
  function daySummary(day) {
    var s = { max: -99, min: 99, rainMax: 0, rainyHours: 0, snow: false, morning: null };
    for (var hr = 7; hr <= 18; hr++) {
      var temp = tempAt(day, hr), w = weatherAt(day, hr) || "";
      if (temp === null) continue;
      if (s.morning === null) s.morning = temp;
      s.max = Math.max(s.max, temp);
      s.min = Math.min(s.min, temp);
      if (/雪/.test(w)) s.snow = true;
      if (/雨/.test(w)) s.rainyHours++;
    }
    if (s.morning === null) return null;
    // 朝（7時）・夕方（17時）の 寒いほう。わからなければ 最低で かわりに する
    var cool = [tempAt(day, 7), tempAt(day, 17)].filter(function (t) { return t !== null; });
    s.cool = cool.length ? Math.min.apply(null, cool) : s.min;
    var j = wx.days[day];
    if (j.max !== undefined) s.max = j.max;
    if (j.min !== undefined) s.min = j.min;
    var pops = ["06", "12"].map(function (h) { return j.pops[h]; })
      .filter(function (p) { return p !== undefined; });
    if (pops.length) s.rainMax = Math.max.apply(null, pops);
    // 雨の時間が長く 降水確率も高い日は ながぐつ
    s.heavy = s.rainMax >= 70 && s.rainyHours >= 6;
    return s;
  }

  // 天気も 左右の スワイプで さきの 日を 見られる（きょうから 週間予報の ある 日まで）。null なら targetDay() に従う。
  //   きょう・あしたは 時間ごとの 予報（あさ・ひる・ゆうがた）、それより さきは 週間予報の 1日ぶんの まとめ
  var wxOffset = null, wxNavTimer = null, slotsHeight = 0;
  function wxDefault() { return targetDay().word === "あした" ? 1 : 0; }
  function wxMax() {
    var now = new Date(), last = 1;
    for (var i = 2; i < 7; i++) {
      if ((wx.week || {})[ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i))]) last = i;
    }
    return last;
  }
  function wxShown() { return Math.min(wxOffset != null ? wxOffset : wxDefault(), wxMax()); } // ここより 前に 描くと undefined
  function moveWx(delta) {
    var before = wxShown();
    wxOffset = Math.max(0, Math.min(wxMax(), before + delta));
    clearTimeout(wxNavTimer);
    wxNavTimer = setTimeout(function () { wxOffset = null; renderWeather(); }, 60 * 1000);
    renderWeather();
    if (wxOffset === before) return;
    wxBody().forEach(function (el) {
      el.classList.remove("slide-next", "slide-prev");
      void el.offsetWidth;
      el.classList.add(delta > 0 ? "slide-next" : "slide-prev");
    });
  }
  // うごかすのは 時間ごとの 枠と 服・かさの 目安（見出しは そのまま）
  function wxBody() { return [$("slots"), $("advice")]; }
  swipe(document.querySelector(".weather"), moveWx, wxBody, function (d) {
    var o = wxShown() + d;
    return o >= 0 && o <= wxMax();
  });

  function renderWeather() {
    B.curSec = "weather";
    var p = place(), now = new Date(), offset = wxShown();
    var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset), day = ymd(date);
    // 見出しの 横に 場所（練馬区 など）
    var word = offset < 3 ? W(["today", "tomorrow", "dayAfter"][offset]) : W("nthDay", { d: date.getDate() });
    var title = W("weatherTitle", { day: word }), pl = placeLabel();
    if (pl) title += '<span class="place">（' + escapeHtml(pl) + '）</span>';
    if ($("weather-title").innerHTML !== title) $("weather-title").innerHTML = title;
    var dots = "", max = wxMax();
    for (var i = 0; i <= max; i++) dots += i === offset ? '<i class="on"></i>' : "<i></i>";
    if ($("wx-dots").innerHTML !== dots) $("wx-dots").innerHTML = dots;
    var sum = p && offset < 2 ? daySummary(day) : null;
    if (!sum && p && (wx.week || {})[day]) { renderWeekDay(wx.week[day]); return; }
    if (!sum) {
      $("slots").innerHTML = '<div class="muted">' +
        W(!p ? "noArea" : wxError ? "wxError" : "loading") + '</div>';
      $("summary").innerHTML = "";
      $("advice").innerHTML = "";
      return;
    }
    var html = "";
    SLOTS.forEach(function (s) {
      var temp = tempAt(day, s.hour);
      if (temp === null) return;
      var ic = weatherIcon(weatherAt(day, s.hour)), pop = popAt(day, s.hour);
      html += '<div class="slot">' +
        '<div class="label">' + W(s.key) + '</div>' +
        '<div class="icon" title="' + ic[1] + '">' + ic[0] + '</div>' +
        '<div class="temp">' + W("deg", { t: Math.round(temp) }) + '</div>' +
        '<div class="rain">' + (pop === undefined ? "" : "☂ " + pop + "%") + '</div>' +
        '</div>';
    });
    $("slots").style.minHeight = "";
    $("slots").innerHTML = html;
    slotsHeight = $("slots").offsetHeight;
    $("summary").innerHTML = '<span class="pill hi">' + W("hiShort", { t: Math.round(sum.max) }) + '</span>' +
      '<span class="pill lo">' + W("loShort", { t: Math.round(sum.min) }) + '</span>';
    renderAdvice(sum, rainPlan(day));
  }

  // あさって から さきの 日（週間予報）。服・かさの 目安は 出さず、同じ 高さの 枠に ひとこと（カードの 高さを かえない）
  function renderWeekDay(w) {
    var ic = weatherIcon(codeText(w.code));
    // きょう・あしたの 3つの 枠と 同じ 高さに する（ほかの カードが うごかない ように）
    if (slotsHeight) $("slots").style.minHeight = slotsHeight + "px";
    $("slots").innerHTML = '<div class="slot wx-day">' +
      '<div class="icon" title="' + ic[1] + '">' + ic[0] + '</div>' +
      '<div><div class="label">' + ic[1] + '</div>' +
      '<div class="rain">' + (w.pop === undefined ? "" : "☂ " + w.pop + "%") + '</div></div>' +
      '</div>';
    $("summary").innerHTML = (w.max === undefined ? "" : '<span class="pill hi">' + W("hiShort", { t: Math.round(w.max) }) + '</span>') +
      (w.min === undefined ? "" : '<span class="pill lo">' + W("loShort", { t: Math.round(w.min) }) + '</span>');
    $("advice").innerHTML = B.settings.showAdvice === false ? "" :
      '<div class="tile wx-note"><span class="icon">' + ic[0] + '</span>' +
      '<div><div class="main">' + W("wxLater") + '</div><div class="sub">' + W("wxLaterSub") + '</div></div></div>';
  }

  // ---- ふくそう・もちもの ----
  // 左: ふくそう、右: かさ（ながぐつ）の2枚。ぼうし・てぶくろ などは ふくそうの下の行に まとめる
  //   半そで・長そでは 日中の 最高気温（12時が すずしくても 午後に あつく なる 日は 半そで）、
  //   上着・コートは 朝か夕方の 寒いほうで きめる（目安の気温は 設定で かえられる）
  // ふくそう・かさ の 絵。絵文字は 端末で 絵が かわり（👚 は どこでも 半そで、👢 は ヒールの ブーツ）、
  // 文字と あわない ので 自前の 絵（img/）に する。かさ＋雨つぶ・だめの しるしだけ 絵の 上に SVG を かさねる
  var ADVICE_ICONS = (function () {
    var sv = function (b) { return '<svg viewBox="0 0 48 48" aria-hidden="true">' + b + '</svg>'; };
    var img = function (name) { return window.Words.icon(name); };
    var drop = function (x, y) { return '<path d="M' + x + ' ' + y + ' q-2.6 4 0 5.2 q2.6 -1.2 0 -5.2 Z" fill="#5aaee8"/>'; };
    return {
      shortSleeve: img("short-sleeve"),
      longSleeve: img("long-sleeve"),
      jacket: img("jacket"),
      coat: img("coat"),
      umbrella: img("umbrella"),
      rainNow: '<span class="ico-stack">' + img("umbrella") + sv(drop(8, 3) + drop(40, 3) + drop(24, -1)) + '</span>',
      folding: img("folding-umbrella"),
      noUmbrella: '<span class="ico-stack no">' + img("folding-umbrella") + sv('<circle cx="24" cy="24" r="21" fill="none" stroke="#e8544e" stroke-width="3.5"/>' +
        '<path d="M9.2 38.8 L38.8 9.2" stroke="#e8544e" stroke-width="3.5" stroke-linecap="round"/>') + '</span>',
      boots: img("boots")
    };
  })();

  function adviceTiles(s, plan) {
    var cl = clothesRule();
    var short = s.max >= cl.short;
    var clothes;
    if (s.cool <= cl.coat) clothes = { icon: ADVICE_ICONS.coat, main: W("coat"), need: true };
    else if (s.cool <= cl.jacket) clothes = { icon: ADVICE_ICONS.jacket, main: W(short ? "shortJacket" : "jacket"), need: true };
    else clothes = short ? { icon: ADVICE_ICONS.shortSleeve, main: W("shortSleeve") } : { icon: ADVICE_ICONS.longSleeve, main: W("longSleeve") };
    clothes.sub = clothes.need ? W("coolAt", { t: Math.round(s.cool) }) : W("maxAt", { t: Math.round(s.max) });
    if (s.max >= 28) { clothes.sub = W("hot"); clothes.need = true; }
    if (s.min <= 5) { clothes.sub = W("cold"); clothes.need = true; }

    var rain = { sub: W("rainPct", { p: s.rainMax }) };
    if (s.snow || s.heavy) { rain.icon = ADVICE_ICONS.boots; rain.main = W("boots"); rain.need = true; }
    else if (s.rainMax >= 50) { rain.icon = ADVICE_ICONS.umbrella; rain.main = W("umbrella"); rain.need = true; }
    else if (s.rainMax >= 30) { rain.icon = ADVICE_ICONS.folding; rain.main = W("folding"); }
    else { rain.icon = ADVICE_ICONS.noUmbrella; rain.main = W("noUmbrella"); }

    // 家の あたりの 雨の 時刻が わかれば そちらを 優先する（「あめは 14じごろから」）
    if (plan && plan.type === "now") {
      rain = { icon: ADVICE_ICONS.rainNow, main: W("rainNow"), sub: plan.until !== null ? W("rainStop", { h: plan.until }) : W("rainLong"), need: true };
    } else if (plan && plan.type === "from") {
      rain = { icon: ADVICE_ICONS.umbrella, need: true, sub: W("takeUmbrella"),
        main: plan.tomorrow ? W("rainFromTomorrow", { h: plan.hour }) : plan.soon ? W("rainSoon") : W("rainFrom", { h: plan.hour }) };
      if (s.snow || s.heavy) rain.icon = ADVICE_ICONS.boots;
    } else if (plan && plan.type === "none") {
      // 家の あたりで ふらない よほうの とき。大きい字と 小さい字が おなじ ことを いうように する
      //   地域の 降水確率が 50% いじょう: 外れて ぬれない ように おりたたみ。小さい字は その わけ（地域の 確率）
      //   50% より ひくい: 家の あたりの よほうに まかせて「いらない」と いいきる
      if (s.rainMax >= 50) {
        rain = { icon: ADVICE_ICONS.folding, main: W("folding"), sub: W("rainArea", { p: s.rainMax }) };
      } else {
        rain = { icon: ADVICE_ICONS.noUmbrella, main: W("noUmbrella"),
          sub: plan.until !== null ? W("noRainUntil", { h: plan.until }) : W("noRainToday") };
      }
    }
    return [clothes, rain];
  }

  // 服装の 目安の 気温（設定の clothes）。short 以上で 半そで、jacket 以下で 上着、coat 以下で コート
  var CLOTHES = { short: 25, jacket: 15, coat: 8 };
  function clothesRule() {
    var c = B.settings.clothes || {};
    return { short: num(c.short) === undefined ? CLOTHES.short : c.short,
             jacket: num(c.jacket) === undefined ? CLOTHES.jacket : c.jacket,
             coat: num(c.coat) === undefined ? CLOTHES.coat : c.coat };
  }

  function renderAdvice(s, plan) {
    // 目安を 出さない 設定の ときは 天気の 時間ごとの 表示だけ
    var show = B.settings.showAdvice !== false;
    $("advice").hidden = !show;
    if (!show) { $("advice").innerHTML = ""; return; }
    $("advice").innerHTML = adviceTiles(s, plan).map(function (a) {
      return '<div class="tile' + (a.need ? ' need' : '') + '">' +
        '<span class="icon">' + a.icon + '</span>' +
        '<div><div class="main' + (a.main.length > 9 ? " longer" : a.main.length > 7 ? " long" : "") + '">' + a.main + '</div><div class="sub">' + a.sub + '</div></div>' +
        '</div>';
    }).join("");
  }

  B.place = place;
  B.placeKey = placeKey;
  B.fetchWeather = fetchWeather;
  B.fetchRain = fetchRain;
  B.renderWeather = renderWeather;
  B.CLOTHES = CLOTHES;
})();
