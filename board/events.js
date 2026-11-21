// ボードの 予定（カレンダー）。iCal（ical.js）か Apps Script から よんで、きょうから 7日ぶんを 左右に うごかして 見る
(function () {
  "use strict";

  var B = window.Board, C = window.CONFIG;
  var $ = B.$, W = B.W, setHtml = B.setHtml, ymd = B.ymd, storageGet = B.storageGet, storageSet = B.storageSet;
  var escapeHtml = B.escapeHtml, targetDay = B.targetDay, swipe = window.BoardSwipe, WEEKDAY_COLORS = B.WEEKDAY_COLORS;

  var CAL_KEY = "calendar";
  var CAL_DAYS = 7; // きょうから何日分の予定を見られるか（calendar-proxy.gs の上限も7日）

  var calendar = storageGet(CAL_KEY);  // { events: [{ title, start, end, allDay }] }

  // ---- よてい（カレンダー） ----
  // よみこみ先は 設定の calendar。なければ config.js の Apps Script（ふつうは なし）
  //   ical: iCal 形式の URL（Google カレンダーの「iCal 形式の非公開 URL」など）。ical.js で よむ
  //   gas : tools/calendar-proxy.gs の URL（JSON を返す）
  var calTimer = null, calError = false, calSeq = 0, calLoading = false;

  function calSource() {
    if (window.BoardApi.web) return null;
    var c = B.settings.calendar;
    if (c && c.type === "none") return null;
    // この端末の カレンダー（アプリ。2026-11-21）。url は 読みこみ先が かわったかを くらべる ための しるし（board.js）
    if (c && c.type === "device") return c.ids && c.ids.length ? { type: "device", ids: c.ids, url: "device:" + c.ids.join(",") } : null;
    // iCal か Apps Script かは URL で きめる（前の 版で 取りちがえて 保存した ものも 読める。api.js の gasUrl）
    if (c && c.url && (c.type === "ical" || c.type === "gas")) return { type: window.BoardApi.gasUrl(c.url) ? "gas" : "ical", url: c.url };
    if (C.calendar && C.calendar.url) return { type: "gas", url: C.calendar.url };
    return null;
  }

  // iCal は CORS で ブラウザから よめないことが多いので、アプリでは アプリの通信（CapacitorHttp）、
  // QR で置いた端末を開いた ブラウザでは 置いた端末の中継（LanServer の /api/ical）を つかう
  function fetchText(url) {
    var http = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (http) {
      return http.get({ url: url, responseType: "text" }).then(function (r) {
        if (r.status !== 200) throw new Error("HTTP " + r.status);
        return typeof r.data === "string" ? r.data : String(r.data);
      });
    }
    var target = window.BoardApi.local ? url : "/api/ical?url=" + encodeURIComponent(url);
    return fetch(target, { headers: window.BoardApi.authHeaders() }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  function fetchCalendar() {
    clearTimeout(calTimer);
    var src = calSource(), seq = ++calSeq;
    if (!src) { calendar = null; renderEvents(); return; }
    // よみこみ先が かわったら、まえの よていは だしておかない
    var key = src.type + src.url;
    if (calendar && calendar.key !== key) { calendar = null; renderEvents(); }
    calLoading = true;
    $("cal-reload").classList.add("spin");
    var job;
    if (src.type === "device") {
      // 置いた端末・スマホの アプリは 自分で、つないだ スマホ・QR の ブラウザは 置いた端末に 読んで もらう（api.js）
      job = window.BoardApi.calendarEvents(src.ids, CAL_DAYS).then(function (events) { return { events: events }; });
    } else if (src.type === "ical") {
      job = fetchText(src.url.replace(/^webcal:/i, "https:")).then(function (text) {
        var now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { events: window.ICal.events(text, from, new Date(from.getTime() + CAL_DAYS * 24 * 60 * 60 * 1000)) };
      });
    } else {
      job = fetch(src.url + (src.url.indexOf("?") < 0 ? "?" : "&") + "days=" + CAL_DAYS)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    }
    function done() { calLoading = false; $("cal-reload").classList.remove("spin"); }
    job.then(function (json) {
      if (seq !== calSeq) return; // あとから はじめた よみこみが ある
      done();
      json.key = key;
      calendar = json;
      calError = false;
      storageSet(CAL_KEY, json);
      renderEvents();
      // この端末の カレンダーは 端末の 中を 読むだけで 軽いので 5分ごと（Google との 同期は 端末が する）
      calTimer = setTimeout(fetchCalendar, (src.type === "device" ? 5 : 15) * 60 * 1000);
    }).catch(function (e) {
      if (seq !== calSeq) return;
      done();
      console.error(e);
      calError = true;
      renderEvents();
      calTimer = setTimeout(fetchCalendar, 5 * 60 * 1000);
    });
  }

  // 見出しの よこの ↻ で すぐ よみなおす（Google の iCal は Google の がわで おくれる ことも ある）。よんでいる あいだは まわす
  $("cal-reload").addEventListener("click", function () { if (!calLoading) fetchCalendar(); });

  // ◀ ▶ で見ている日（きょうからの日数）。null なら targetDay() に従う
  var navOffset = null;
  var navTimer = null;

  function shownOffset() {
    return navOffset !== null ? navOffset : (targetDay().word === "あした" ? 1 : 0);
  }

  function moveDay(delta) {
    var before = shownOffset();
    navOffset = Math.max(0, Math.min(CAL_DAYS - 1, before + delta));
    // しばらく触らなければ いつもの日に もどす
    clearTimeout(navTimer);
    navTimer = setTimeout(function () { navOffset = null; renderEvents(); }, 60 * 1000);
    renderEvents();
    if (navOffset === before) return;
    // すべって 入ってくる（左へ スワイプ・▶ なら 右から）
    var el = $("events");
    el.classList.remove("slide-next", "slide-prev");
    void el.offsetWidth;
    el.classList.add(delta > 0 ? "slide-next" : "slide-prev");
  }

  $("prev-day").addEventListener("click", function () { moveDay(-1); });
  $("next-day").addEventListener("click", function () { moveDay(1); });
  swipe(document.querySelector(".schedule"), moveDay, function () { return [$("events")]; }, function (d) {
    var o = shownOffset() + d;
    return o >= 0 && o <= CAL_DAYS - 1;
  });

  // いつもの 日（さわって いない とき）に 予定が ない: 縦の タブレットは 予定の 欄を ちぢめて がんばりカレンダーへ（style.css の ev-none）。
  //   スワイプで ほかの 日を 見て いる 間は かえない（カードが 上下に うごかない ように）
  function markNone(none) {
    if (navOffset !== null || document.body.classList.contains("ev-none") === none) return;
    document.body.classList.toggle("ev-none", none);
    window.dispatchEvent(new Event("board:fit"));
  }

  function renderEvents() {
    B.curSec = "schedule";
    var now = new Date();
    var offset = shownOffset();
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    $("nav-day").innerHTML = offset < 3 ? W(["today", "tomorrow", "dayAfter"][offset]) : W("nthDay", { d: day.getDate() });
    $("nav-wd").innerHTML = W("weekdays")[day.getDay()];
    setHtml("schedule-title", W("schedule"));
    $("nav-wd").style.color = WEEKDAY_COLORS[B.holidays[ymd(day)] ? 0 : day.getDay()];
    $("prev-day").disabled = offset <= 0;
    $("next-day").disabled = offset >= CAL_DAYS - 1;
    var dots = "";
    for (var i = 0; i < CAL_DAYS; i++) dots += i === offset ? '<i class="on"></i>' : "<i></i>";
    if ($("nav-dots").innerHTML !== dots) $("nav-dots").innerHTML = dots;

    var el = $("events");
    // カレンダーを つかわない ときは よていの カードごと なくして、まんなかを ひろげる
    var noCal = !calSource();
    if (document.body.classList.contains("no-cal") !== noCal) {
      document.body.classList.toggle("no-cal", noCal);
      window.dispatchEvent(new Event("board:fit")); // こどもの ボタンの かたちを えらびなおす
    }
    if (noCal) { el.innerHTML = ""; return; }
    if (!calendar) { if (calError) markNone(true); el.innerHTML = '<li class="empty">' + W(calError ? "calError" : "loading") + '</li>'; return; }

    var dayStart = day.getTime(), dayEnd = dayStart + 24 * 60 * 60 * 1000;
    // 並び順だけに使う時刻。カレンダー上の時刻が正確でない予定があるので、予定名に「10:30」などがあればそちらを優先する
    var list = calendar.events.map(function (e) {
      var ev = { title: e.title, start: new Date(e.start), end: new Date(e.end), allDay: e.allDay };
      var m = /(\d{1,2})[:：](\d{2})/.exec(e.title);
      ev.minutes = m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : ev.start.getHours() * 60 + ev.start.getMinutes();
      return ev;
    }).filter(function (e) {
      return e.start.getTime() < dayEnd && e.end.getTime() > dayStart;
    }).sort(function (a, b) {
      return (b.allDay - a.allDay) || (a.minutes - b.minutes);
    });

    markNone(!list.length);
    if (!list.length) { el.innerHTML = '<li class="empty">' + W("noEvents") + '</li>'; return; }
    // 時刻を出す設定なら、終日でない予定は 印の かわりに「10:30〜11:30」。日を またぐ ぶんは かたほうだけ
    var showTime = !!B.settings.eventTime;
    function hm(d) { return d.getHours() + ":" + B.pad(d.getMinutes()); }
    function timeText(e) {
      var from = e.start.getTime() >= dayStart ? hm(e.start) : "", to = e.end.getTime() <= dayEnd && e.end > e.start ? hm(e.end) : "";
      if (to === "0:00" && e.end.getTime() === dayEnd) to = "24:00";
      return from && to ? (from === to ? from : from + "〜" + to) : from ? from + "〜" : "〜" + to;
    }
    el.innerHTML = list.map(function (e) {
      return '<li>' +
        (showTime && !e.allDay ? '<span class="time">' + timeText(e) + '</span>'
          : '<span class="mark">' + window.Words.icon("event") + '</span>') +
        '<span class="title">' + escapeHtml(e.title) + '</span>' +
        '</li>';
    }).join("");
  }

  B.calSource = calSource;
  // 予定を 読めて いるか（guide.js。つないで いても 読めて いなければ「家族の 予定を 見よう」は 出さない）
  B.calReady = function () { return !!calSource() && !!calendar && !calError; };
  B.fetchCalendar = fetchCalendar;
  B.renderEvents = renderEvents;
})();
