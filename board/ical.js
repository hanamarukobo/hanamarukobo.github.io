// iCal（.ics）の予定を読む。Google カレンダーの「iCal 形式の非公開 URL」などで使う。
//   ICal.events(text, from, to) → [{ title, start: ISO, end: ISO, allDay }]（from〜to に かかるもの）
// 繰り返し（RRULE）は よく使う形に対応する: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL,
// BYDAY（毎週の曜日・毎月の第n曜日）, BYMONTHDAY。EXDATE（除く日）と RECURRENCE-ID（1回だけ変更）も見る。
// TZID つきの時刻は端末の時刻（日本時間）として扱う。
(function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var MAX_ITER = 2000;

  // 75文字で折り返された行を つなぐ
  function unfold(text) { return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n"); }

  function unescape(v) {
    return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
  }

  // "20261013" / "20261013T093000" / "20261013T003000Z" → { date: Date, allDay }
  function parseTime(value, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    if (!m[4] || /VALUE=DATE(;|$)/.test(params)) {
      return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
    }
    var d = m[7]
      ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
      : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return { date: d, allDay: false };
  }

  function parse(text) {
    var events = [], ev = null;
    unfold(text).forEach(function (line) {
      if (line === "BEGIN:VEVENT") { ev = { exdates: [] }; return; }
      if (line === "END:VEVENT") { if (ev && ev.start) events.push(ev); ev = null; return; }
      if (!ev) return;
      var i = line.indexOf(":");
      if (i < 0) return;
      var head = line.slice(0, i), value = line.slice(i + 1);
      var name = head.split(";")[0].toUpperCase(), params = head.slice(name.length);
      if (name === "SUMMARY") ev.title = unescape(value);
      else if (name === "DTSTART") { var s = parseTime(value, params); if (s) { ev.start = s.date; ev.allDay = s.allDay; } }
      else if (name === "DTEND") { var e = parseTime(value, params); if (e) ev.end = e.date; }
      else if (name === "DURATION") ev.duration = duration(value);
      else if (name === "RRULE") ev.rrule = rule(value);
      else if (name === "EXDATE") value.split(",").forEach(function (v) { var x = parseTime(v, params); if (x) ev.exdates.push(x.date.getTime()); });
      else if (name === "RECURRENCE-ID") { var r = parseTime(value, params); if (r) ev.recurrenceId = r.date.getTime(); }
      else if (name === "UID") ev.uid = value;
      else if (name === "STATUS") ev.cancelled = value === "CANCELLED";
    });
    events.forEach(function (ev) {
      if (!ev.end) ev.end = new Date(ev.start.getTime() + (ev.duration || (ev.allDay ? DAY : 0)));
    });
    return events;
  }

  function duration(v) {
    var m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
    if (!m) return 0;
    return ((+m[1] || 0) * 7 * DAY) + ((+m[2] || 0) * DAY) + ((+m[3] || 0) * 3600000) + ((+m[4] || 0) * 60000) + ((+m[5] || 0) * 1000);
  }

  function rule(v) {
    var r = {};
    v.split(";").forEach(function (part) {
      var kv = part.split("=");
      r[kv[0].toUpperCase()] = kv[1];
    });
    return {
      freq: r.FREQ,
      interval: Math.max(1, parseInt(r.INTERVAL, 10) || 1),
      count: r.COUNT ? parseInt(r.COUNT, 10) : null,
      until: r.UNTIL ? (parseTime(r.UNTIL, "") || {}).date : null,
      byday: r.BYDAY ? r.BYDAY.split(",").map(function (d) {
        var m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d);
        return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD[m[2]] } : null;
      }).filter(Boolean) : null,
      bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : null,
    };
  }

  function sameTime(base, y, mo, d) {
    return new Date(y, mo, d, base.getHours(), base.getMinutes(), base.getSeconds());
  }

  // その月の 第n曜日（n<0 は うしろから）
  function nthWeekday(y, mo, wd, n) {
    if (n > 0) {
      var first = new Date(y, mo, 1).getDay();
      var d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
      return d <= new Date(y, mo + 1, 0).getDate() ? d : null;
    }
    var last = new Date(y, mo + 1, 0), back = (last.getDay() - wd + 7) % 7;
    var dd = last.getDate() - back + (n + 1) * 7;
    return dd >= 1 ? dd : null;
  }

  // くりかえしの 開始時刻を 順に 出す（to をこえたら やめる）
  function occurrences(ev, to) {
    var r = ev.rrule, start = ev.start, out = [], n = 0;
    function push(d) {
      if (d < start) return true;
      if (r.until && d > r.until) return false;
      if (r.count !== null && n >= r.count) return false;
      n++;
      if (d > to) return false;
      out.push(d);
      return true;
    }
    var y = start.getFullYear(), mo = start.getMonth(), i, k;
    for (i = 0; i < MAX_ITER; i++) {
      var batch = [];
      if (r.freq === "DAILY") {
        batch.push(sameTime(start, y, mo, start.getDate() + i * r.interval));
      } else if (r.freq === "WEEKLY") {
        var weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay() + i * 7 * r.interval);
        var days = r.byday ? r.byday.map(function (b) { return b.wd; }).sort() : [start.getDay()];
        days.forEach(function (wd) {
          batch.push(sameTime(start, weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + wd));
        });
      } else if (r.freq === "MONTHLY") {
        var m = new Date(y, mo + i * r.interval, 1), yy = m.getFullYear(), mm = m.getMonth();
        if (r.byday) {
          r.byday.forEach(function (b) { var d = nthWeekday(yy, mm, b.wd, b.n || 1); if (d) batch.push(sameTime(start, yy, mm, d)); });
        } else {
          (r.bymonthday || [start.getDate()]).forEach(function (d) {
            var last = new Date(yy, mm + 1, 0).getDate(), dd = d < 0 ? last + d + 1 : d;
            if (dd >= 1 && dd <= last) batch.push(sameTime(start, yy, mm, dd));
          });
        }
      } else if (r.freq === "YEARLY") {
        var yr = y + i * r.interval;
        if (new Date(yr, mo, start.getDate()).getMonth() === mo) batch.push(sameTime(start, yr, mo, start.getDate()));
      } else {
        return [start];
      }
      batch.sort(function (a, b) { return a - b; });
      for (k = 0; k < batch.length; k++) if (!push(batch[k])) return out;
    }
    return out;
  }

  window.ICal = {
    events: function (text, from, to) {
      var all = parse(text), result = [];
      // 1回だけ 変更された予定（RECURRENCE-ID）は、もとの くりかえしから その回を はずす
      var moved = {};
      all.forEach(function (ev) { if (ev.recurrenceId && ev.uid) (moved[ev.uid] = moved[ev.uid] || []).push(ev.recurrenceId); });
      all.forEach(function (ev) {
        if (ev.cancelled) return;
        var len = ev.end - ev.start;
        var starts = ev.rrule && !ev.recurrenceId ? occurrences(ev, to) : [ev.start];
        starts.forEach(function (s) {
          var t = s.getTime();
          if (ev.exdates.indexOf(t) >= 0) return;
          if (ev.rrule && !ev.recurrenceId && moved[ev.uid] && moved[ev.uid].indexOf(t) >= 0) return;
          var e = new Date(t + len);
          if (s < to && e > from) {
            result.push({ title: ev.title || "", start: s.toISOString(), end: e.toISOString(), allDay: ev.allDay });
          }
        });
      });
      return result;
    },
  };
})();
