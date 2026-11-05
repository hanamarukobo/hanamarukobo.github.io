// データの読み書きの窓口。ボード（board.js・kids.js など）と ママ・パパのページ（admin.html）が使う。
// - この端末の中（LOCAL）: アプリ（http://localhost）・Web 版・PC で直接開いたとき（file://）。決まり（routes）をここで動かし、
//   データは端末の中（localStorage）に保存する
// - 置いた端末につないだ スマホのアプリ（REMOTE）: 置いた端末の アプリの中の サーバー（LanServer）へ /api/... を送る
// - QR で置いた端末を開いた ブラウザ（paired）: 開いた ページの 置いた端末へ /api/... を送る（番号は X-Board-Token）
//   どちらも 決まりは 置いた端末の この ファイルが 動かす（LanServer が この ファイルの routes を 呼ぶ）
(function () {
  "use strict";

  // PC で index.html を直接開いたとき（file://）も この端末の中（動作確認用）。
  // Web 版（config.js の web。build-web.ps1 が つける）も、データは この端末（ブラウザ）の中
  var WEB = !!(window.CONFIG && window.CONFIG.web);
  var LOCAL = WEB || location.hostname === "localhost" || location.protocol === "file:";
  // 2台連携: おうちの人の スマホ（アプリ）が 置いた端末に つないで いるとき。データは 置いた端末に ある
  var REMOTE_KEY = "remote:board";
  var REMOTE = LOCAL && !!remoteConf();
  // ブラウザで 置いた端末を ひらくとき（…/?pair=番号）の つなぐための番号。
  // アドレスにも のこす（履歴・ブックマーク・開きなおし・ブラウザの保存が きえる ときでも つながるように）。
  // がんばり管理（iframe）は 親の ページの アドレスから よむ
  var TOKEN_KEY = "lan:token";
  function urlToken() {
    var wins = [window];
    try { if (window.parent !== window) wins.push(window.parent); } catch (e) { /* べつの 場所 */ }
    for (var i = 0; i < wins.length; i++) {
      try {
        var m = /[?&]pair=(\d{4,8})/.exec(wins[i].location.search);
        if (m) return m[1];
      } catch (e) { /* よめない */ }
    }
    return "";
  }
  (function () {
    var t = urlToken();
    if (t) storageSet(TOKEN_KEY, t);
  })();
  var KEY = "ganbari:data";
  // 使い方。board1: リビングなどに置いて この端末だけ / board2: 置いて おうちの人のスマホからも / phone: おうちの人のスマホだけ
  var USAGES = ["board1", "board2", "phone"];
  var BACKUP_PREFIX = "ganbari:backup:";
  var BACKUP_DAYS = 7;

  // 色の 並びは palette.js と同じ
  var COLORS = ["purple", "pink", "blue", "green", "orange", "yellow", "mint"];
  var MAX_KIDS = 8, MAX_NAME = 12, MAX_COUNT = 99;
  // ことばの だんかい（words.js と同じ）
  var LEVELS = ["kinder", "lower", "upper"];
  var HONORS = ["", "ちゃん", "くん"];   // 名前の あとに 小さく つける
  // やることは 家族で1つの リスト。1件ごとに「だれが」「いつ」を もつ（id・name・kana・yen・kind・kids（null は みんな）・repeat・slot・active）
  var INITIAL_TASKS = [
    { id: "t1", name: "帰ったら手をあらう", kana: "かえったら てを あらう", yen: 1, active: true, kind: "check", kids: null, repeat: { type: "daily" }, slot: null },
    { id: "t2", name: "くつをそろえる", kana: "くつを そろえる", yen: 1, active: true, kind: "check", kids: null, repeat: { type: "daily" }, slot: null },
    { id: "t3", name: "あしたのじゅんび", kana: "あしたの じゅんび", yen: 1, active: true, kind: "check", kids: null, repeat: { type: "daily" }, slot: null },
  ];
  var MAX_TASK_NAME = 30;
  // 無料の 上限。子どもは 2人まで（やることの 数は かぎらない）。
  // こえる ときは ふやす ことだけ とめる（いまの 子は けさない）。ファイルからの よみこみは とめない（自分の データ）。
  // 3人目からは Pro（準備中）。PRO は 開発用の 印（config.js の pro）で、ふつうは false
  var FREE = { kids: 2 };
  var PRO = !!(window.CONFIG && window.CONFIG.pro);
  // まとめ（「もう できる」）の はじめの 名前。おうちの人が あとで かえられる
  var BUNDLE_NAME = "もう できる", OLD_BUNDLE_NAME = "いつもの";
  var DEFAULT_DATA = {
    kids: [],
    tasks: INITIAL_TASKS,
    days: {},
    paid: {},
    goals: [],
    rewards: [],
    exchanges: [],
    // できるようになったこと（「もう できる」に まとめた やること）の きろく [{id, kid, taskId, name, kana, date, note, back}]。
    // やることを けしても のこる。back は やることに もどした日（子どもの 画面には 出さない）。データの 名前は 卒業の ころの まま
    graduations: [],
    settings: {
      unit: "yen",
      weekStart: 0,
      lowPower: false,
      timeSlots: false,
      parentLock: { type: "none" },
      display: {
        weekday: { from: "07:00", to: "09:00" },
        holiday: { from: "07:00", to: "09:00" },
        idleMinutes: 1,
      },
    },
  };

  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function uid(prefix) { return prefix + Math.random().toString(16).slice(2, 10); }
  function isDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  function int(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }

  // ---- ローカル版の保存 ----
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function load() {
    var raw = storageGet(KEY), data = raw ? JSON.parse(raw) : copy(DEFAULT_DATA);
    Object.keys(DEFAULT_DATA).forEach(function (k) { if (!(k in data)) data[k] = copy(DEFAULT_DATA[k]); });
    Object.keys(DEFAULT_DATA.settings).forEach(function (k) { if (!(k in data.settings)) data.settings[k] = copy(DEFAULT_DATA.settings[k]); });
    data.kids.forEach(function (k, i) {
      if (!k.color) k.color = COLORS[i % COLORS.length];
      if (k.active === undefined) k.active = true;
    });
    // うつしかえたら すぐ 保存する（つけなおした id が 読むたびに かわらないように）
    var moved = migrateTasks(data);
    if (migrateBundles(data)) moved = true;
    if (moved && raw) storageSet(KEY, JSON.stringify(data));
    return data;
  }

  // 卒業の ころの データ: まとめた やること（grad）が あるのに 「もう できる」が ない 子には、「もう できる」を つくる
  //   （ないと まとめた やることが どこにも 出ない）。ポイントは いま まとめている やることの 合計
  //   2026-11-04 に 名前を「いつもの」から かえた。おうちの人が 名前を かえて いなければ 新しい 名前に する
  function migrateBundles(data) {
    var changed = false;
    data.tasks.forEach(function (t) {
      if (t.bundle && t.name === OLD_BUNDLE_NAME) { t.name = BUNDLE_NAME; changed = true; }
    });
    data.kids.forEach(function (k) {
      if (bundleOf(data.tasks, k.id)) return;
      var inside = data.tasks.filter(function (t) { return !t.bundle && graduatedNow(t, k.id); });
      if (!inside.length) return;
      data.tasks.push({ id: uid("t"), name: BUNDLE_NAME, kind: "check", kids: [k.id], repeat: { type: "daily" }, slot: null, active: true, bundle: true,
        yen: inside.reduce(function (a, t) { return a + yenOf(t, k.id); }, 0) });
      changed = true;
    });
    return changed;
  }

  // 以前は やることを 子どもごとに 持っていた（{ kidId: [...] }）。家族で1つの リストに うつす
  //   名前・種類・使う/使わない が おなじ ものは 1件に まとめる。金額が ちがう子は yenByKid に のこす
  //   id が ほかと ぶつかる ものは つけなおし、記録（days）の id も あわせて かきかえる
  function migrateTasks(data) {
    if (Array.isArray(data.tasks)) {
      data.tasks.forEach(function (t) {
        if (!t.repeat) t.repeat = { type: "daily" };
        if (!("kids" in t)) t.kids = null;
        if (!("slot" in t)) t.slot = null;
        if (!t.kind) t.kind = "check";
      });
      return false;
    }
    var old = data.tasks || {}, groups = [], rename = {}, used = {}, list = [];
    if (!Object.keys(old).length) { data.tasks = copy(INITIAL_TASKS); return true; }
    Object.keys(old).forEach(function (kid) {
      (old[kid] || []).forEach(function (t) {
        var kind = t.kind === "count" ? "count" : "check", active = t.active !== false;
        var g = groups.filter(function (g) {
          return g.name === t.name && g.kind === kind && g.active === active && g.kids.indexOf(kid) < 0;
        })[0];
        if (!g) groups.push(g = { name: t.name, kind: kind, active: active, kids: [], items: [] });
        g.kids.push(kid);
        g.items.push({ kid: kid, id: t.id, yen: int(t.yen, 0) });
      });
    });
    var allKids = data.kids.map(function (k) { return k.id; });
    groups.forEach(function (g) {
      var id = g.items[0].id;
      if (!id || used[id]) id = uid("t");
      used[id] = true;
      // いちばん おおい 金額を ふつうの 金額に する
      var votes = {};
      g.items.forEach(function (x) { votes[x.yen] = (votes[x.yen] || 0) + 1; });
      var yen = +Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0], byKid = {};
      g.items.forEach(function (x) {
        if (x.yen !== yen) byKid[x.kid] = x.yen;
        if (x.id !== id) (rename[x.kid] = rename[x.kid] || {})[x.id] = id;
      });
      var everyone = allKids.length > 0 && allKids.every(function (k) { return g.kids.indexOf(k) >= 0; });
      var task = { id: id, name: g.name, kind: g.kind, yen: yen, kids: everyone ? null : g.kids,
        repeat: { type: "daily" }, slot: null, active: g.active };
      if (Object.keys(byKid).length) task.yenByKid = byKid;
      list.push(task);
    });
    Object.keys(rename).forEach(function (kid) {
      var m = rename[kid];
      function to(id) { return m.hasOwnProperty(id) ? m[id] : id; }
      Object.keys(data.days).forEach(function (d) {
        var e = data.days[d][kid];
        if (!e) return;
        e.checks = (e.checks || []).map(to);
        if (e.counts) {
          var c = {};
          Object.keys(e.counts).forEach(function (id) { c[to(id)] = e.counts[id]; });
          e.counts = c;
        }
        if (e.result) e.result.done.forEach(function (x) { x.id = to(x.id); });
      });
    });
    data.tasks = list;
    return true;
  }

  function save(data) {
    // 1日1回、その日はじめて書く前の状態を のこす（7日ぶん）
    var backup = BACKUP_PREFIX + today(), old = storageGet(KEY);
    if (old && !storageGet(backup)) {
      storageSet(backup, old);
      try {
        Object.keys(localStorage).filter(function (k) { return k.indexOf(BACKUP_PREFIX) === 0; })
          .sort().reverse().slice(BACKUP_DAYS).forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* のこせなくても 本体の保存は つづける */ }
    }
    if (!storageSet(KEY, JSON.stringify(data))) throw httpError(507, "保存できませんでした（容量がいっぱいです）");
  }

  function httpError(status, message) {
    var e = new Error(message);
    e.status = status;
    return e;
  }

  // ---- 決まり（だれに・いつ 出るか・数え方）----
  // その日に その子に 出る やること（ボード・管理ページも これを つかう）
  function weekday(date) { return new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)).getDay(); }
  function taskOn(t, kid, date) {
    if (!t.active || (t.kids && t.kids.indexOf(kid) < 0) || graduatedOn(t, kid, date)) return false;
    var r = t.repeat || { type: "daily" };
    if (r.type === "once") return r.date === date;
    if (r.type === "weekly") return (r.days || []).indexOf(weekday(date)) >= 0;
    return true;   // 毎日・週に何回（perweek は 毎日 出して、週の 回数に とどいたら「こんしゅう できた」）
  }
  // 週に何回（repeat: { type: "perweek", n: 1〜6 }）。週の どこかで n 回 できれば よい（塾の宿題など）。
  // - その日に やらなくても よいので、その日の 数（total）には やった 日だけ 入れる（「ぜんぶ できた」を じゃましない）
  // - 週の はじまりは 設定の weekStart（0: 日曜 / 1: 月曜）。ほかの 日で n 回に とどいたら、その週の のこりの 日は チェックできない
  // - できた 日は ふつうの やることと 同じに かぞえる（はなまる・ごほうび）
  function perWeek(t) { return !!t.repeat && t.repeat.type === "perweek"; }
  function required(t, e) { return !perWeek(t) || taskCount(t, e) > 0; }
  function weekDates(date, weekStart) {
    var d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)), out = [];
    d.setDate(d.getDate() - ((d.getDay() - (weekStart === 1 ? 1 : 0) + 7) % 7));
    for (var i = 0; i < 7; i++) {
      out.push(d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  // その週に（skip の 日を のぞいて）チェックした 日の 数
  function weekDone(data, t, kid, date, skip) {
    var ws = (data.settings || {}).weekStart === 1 ? 1 : 0;
    return weekDates(date, ws).filter(function (d) {
      var e = (data.days[d] || {})[kid];
      return d !== skip && e && (e.checks || []).indexOf(t.id) >= 0;
    }).length;
  }
  // 「もう できる」に まとめた やること（t.grad = { kidId: [{from, back}] }）は、まとめた 日から もどした 日の まえの日まで
  // ひとつずつ には 出さず、その子の 「もう できる」（bundle）の 中に 出す。まとめた 日より まえの きろくは そのまま
  function graduatedOn(t, kid, date) {
    return ((t.grad || {})[kid] || []).some(function (p) { return date >= p.from && (!p.back || date < p.back); });
  }
  function graduatedNow(t, kid) {
    return ((t.grad || {})[kid] || []).some(function (p) { return !p.back; });
  }
  // 「もう できる」は いちばん 上（なれた ことを さきに 1回 おして、のこりの チャレンジへ）
  function tasksFor(tasks, kid, date) {
    var list = (tasks || []).filter(function (t) { return t.bundle ? bundleOn(tasks, t, kid, date) : taskOn(t, kid, date); });
    return list.filter(function (t) { return t.bundle; }).concat(list.filter(function (t) { return !t.bundle; }));
  }
  // まとめ（「もう できる」）: 子どもごとに 1つの やること（bundle: true、kids: [その子]）。1タップで 1つと かぞえ、ポイントは
  //   まとめた ときの 合計（おうちの人が あとで かえられる）。中身が ある 日だけ 出す
  function bundleOf(tasks, kid) {
    return (tasks || []).filter(function (t) { return t.bundle && t.kids && t.kids[0] === kid; })[0];
  }
  function bundleItems(tasks, kid, date) {
    return (tasks || []).filter(function (t) {
      return !t.bundle && t.active && (!t.kids || t.kids.indexOf(kid) >= 0) && graduatedOn(t, kid, date);
    });
  }
  function bundleOn(tasks, b, kid, date) {
    return b.active && !!b.kids && b.kids[0] === kid && bundleItems(tasks, kid, date).length > 0;
  }
  // まとめる めやす（2026-11-05 から）: 直近2週間で、その子に その やることが あった 日の 8割に「みました」で できた（毎日なら 14日で 12回）。
  //   回数の すくない もの（曜日だけ）は 最低4回 みられる よう、ある 日が 5回に なるまで 1週ずつ さかのぼる（6週まで）
  var GRAD_DAYS = 14, GRAD_MAX_DAYS = 42, GRAD_MIN = 4, GRAD_SCHED = 5, GRAD_RATE = 0.8;
  // 週に何回は 週で かぞえる: 今週を のぞく 直近2週（1週に 1回なら 4回 みられる よう 4週）のうち 8割の 週で n 回に とどいた
  function gradWeeks(data, t, kid, day) {
    var ws = (data.settings || {}).weekStart === 1 ? 1 : 0, start = weekDates(day, ws)[0], ok = 0, weeks = 0;
    var need = Math.max(2, Math.ceil(GRAD_MIN / t.repeat.n));
    for (var i = 1; i <= need; i++) {
      var d = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10) - 7 * i);
      var dates = weekDates(d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), ws);
      if (!dates.some(function (x) { return taskOn(t, kid, x); })) continue;
      weeks++;
      var n = dates.filter(function (x) {
        var e = (data.days[x] || {})[kid];
        return e && e.approved && e.result && e.result.done.some(function (r) { return r.id === t.id; });
      }).length;
      if (n >= t.repeat.n) ok++;
    }
    return { done: ok, days: weeks, weeks: true, ready: weeks >= need && ok >= Math.round(need * GRAD_RATE) };
  }
  function gradStats(data, t, kid, day) {
    if (perWeek(t)) return gradWeeks(data, t, kid, day);
    var d = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)), done = 0, sched = 0;
    for (var i = 0; i < GRAD_MAX_DAYS; i++) {
      if (i >= GRAD_DAYS && i % 7 === 0 && sched >= GRAD_SCHED) break;   // 2週間 みて、たりなければ 1週ずつ
      var key = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      d.setDate(d.getDate() - 1);
      if (!taskOn(t, kid, key)) continue;
      sched++;
      var e = (data.days[key] || {})[kid];
      if (e && e.approved && e.result && e.result.done.some(function (x) { return x.id === t.id; })) done++;
    }
    return { done: done, days: sched, ready: sched >= GRAD_SCHED && done >= Math.max(GRAD_MIN, Math.ceil(sched * GRAD_RATE - 1e-9)) };
  }
  function yenOf(t, kid) { return t.yenByKid && t.yenByKid.hasOwnProperty(kid) ? t.yenByKid[kid] : t.yen; }
  function kidTasks(data, kid, date) { return tasksFor(data.tasks, kid, date); }

  // 管理ページ・ボードから おくられた やることを ととのえる。名前が からの ものは null
  function normTask(t, kidIds) {
    var name = String(t.name || "").trim().slice(0, MAX_TASK_NAME);
    if (!name) return null;
    var r = t.repeat || {}, repeat = { type: "daily" };
    if (r.type === "weekly") {
      var days = (r.days || []).map(function (d) { return int(d, -1); })
        .filter(function (d, i, a) { return d >= 0 && d <= 6 && a.indexOf(d) === i; }).sort();
      if (days.length) repeat = { type: "weekly", days: days };
    } else if (r.type === "perweek") {
      repeat = { type: "perweek", n: Math.max(1, Math.min(6, int(r.n, 1))) };
    } else if (r.type === "once" && isDate(r.date)) {
      repeat = { type: "once", date: r.date };
    }
    var kids = Array.isArray(t.kids) ? t.kids.filter(function (k) { return kidIds.indexOf(k) >= 0; }) : [];
    var task = {
      id: t.id || uid("t"),
      name: name,
      kind: t.kind === "count" && repeat.type !== "perweek" ? "count" : "check",   // 週に何回は チェックだけ
      yen: Math.max(0, int(t.yen, 0)),
      kids: kids.length ? kids : null, // null は「みんな」（あとから ふえた子も ふくむ）
      repeat: repeat,
      slot: t.slot === "am" || t.slot === "pm" ? t.slot : null,
      active: t.active !== false,
    };
    var kana = String(t.kana || "").trim().slice(0, MAX_TASK_NAME);
    if (kana && kana !== name) task.kana = kana;
    var byKid = {};
    Object.keys(t.yenByKid || {}).forEach(function (k) {
      if (kidIds.indexOf(k) >= 0) byKid[k] = Math.max(0, int(t.yenByKid[k], 0));
    });
    if (Object.keys(byKid).length) task.yenByKid = byKid;
    var grad = {};
    Object.keys(t.grad || {}).forEach(function (k) {
      if (kidIds.indexOf(k) < 0 || !Array.isArray(t.grad[k])) return;
      var list = t.grad[k].filter(function (p) { return p && isDate(p.from); }).map(function (p) {
        return isDate(p.back) ? { from: p.from, back: p.back } : { from: p.from };
      });
      if (list.length) grad[k] = list;
    });
    if (Object.keys(grad).length) task.grad = grad;
    return task;
  }
  function knownKid(data, kid) { return data.kids.some(function (k) { return k.id === kid; }); }
  function dayEntry(data, date, kid) {
    data.days[date] = data.days[date] || {};
    var e = data.days[date][kid] = data.days[date][kid] || { checks: [], approved: false };
    e.counts = e.counts || {};
    return e;
  }
  // 子どもが チェックする 日: きょう か、先月1日 からの すぎた日（kids.js の kidEditable と おなじ）。
  // 前の 版の「渡した」（data.paid）は 読みこみの ために のこすが、もう 使わない（2026-11-05 から）
  function kidDate(data, req) {
    var n = new Date(), from = n.getFullYear() * 12 + n.getMonth() - 1;
    from = Math.floor(from / 12) + "-" + pad(from % 12 + 1) + "-01";
    var date = req.date == null ? today() : req.date;
    if (!isDate(date) || date > today() || date < from) throw httpError(400, "bad date");
    return date;
  }
  // 「みました」の あとに 子どもが かえたら とりけす。もういちど みてもらう まで ごほうびに たさない
  function unapprove(e) {
    e.approved = false;
    delete e.result;
    return e;
  }
  function taskCount(t, e) {
    return t.kind === "count" ? int(e.counts[t.id], 0) : (e.checks.indexOf(t.id) >= 0 ? 1 : 0);
  }
  function snapshot(data, kid, e, date) {
    var active = kidTasks(data, kid, date), done = [];
    active.forEach(function (t) {
      var n = taskCount(t, e);
      if (n > 0) done.push({ id: t.id, name: t.name, yen: yenOf(t, kid), count: n });
    });
    e.result = { done: done, total: active.filter(function (t) { return required(t, e); }).length, yen: done.reduce(function (a, d) { return a + d.yen * d.count; }, 0) };
  }
  function earned(data, kid) {
    var total = 0;
    Object.keys(data.days).forEach(function (d) {
      var e = data.days[d][kid];
      if (e && e.approved && e.result) total += e.result.yen;
    });
    return total;
  }
  function balance(data, kid) {
    return data.exchanges.reduce(function (a, x) { return x.kid === kid ? a - x.points : a; }, earned(data, kid));
  }

  var routes = {
    "/api/kid/check": function (data, req) {
      if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
      var date = kidDate(data, req), active = kidTasks(data, req.kid, date).map(function (t) { return t.id; });
      if (active.indexOf(req.taskId) < 0) throw httpError(400, "unknown task");
      var task = data.tasks.filter(function (t) { return t.id === req.taskId; })[0];
      if (req.done && perWeek(task) && weekDone(data, task, req.kid, date, date) >= task.repeat.n) throw httpError(409, "week done");
      var e = unapprove(dayEntry(data, date, req.kid));
      var checks = e.checks.filter(function (id) { return id !== req.taskId; });
      if (req.done) checks.push(req.taskId);
      e.checks = active.filter(function (id) { return checks.indexOf(id) >= 0; });
    },
    // 「いまから やる」: その日に 自分から はじめた やること（e.starts）。きょうだけ。ポイントは かわらない・「みました」も とりけさない
    //   できたら「じぶんから はじめた」に なる（starts と result.done の 両方に ある もの）
    "/api/kid/start": function (data, req) {
      if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
      if (req.date != null && req.date !== today()) throw httpError(400, "bad date");
      var active = kidTasks(data, req.kid, today()).map(function (t) { return t.id; });
      if (active.indexOf(req.taskId) < 0) throw httpError(400, "unknown task");
      var e = dayEntry(data, today(), req.kid);
      e.starts = (e.starts || []).filter(function (id) { return id !== req.taskId; }).concat([req.taskId]);
    },
    "/api/kid/count": function (data, req) {
      if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
      var date = kidDate(data, req);
      var task = kidTasks(data, req.kid, date).filter(function (t) { return t.id === req.taskId; })[0];
      if (!task || task.kind !== "count") throw httpError(400, "not a count task");
      var e = unapprove(dayEntry(data, date, req.kid));
      var n = int(e.counts[task.id], 0) + (int(req.delta, 0) > 0 ? 1 : -1);
      e.counts[task.id] = Math.max(0, Math.min(MAX_COUNT, n));
    },
    "/api/board/settings": function (data, req) {
      var s = data.settings;
      function hhmm(v, d) { return typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d; }
      if ("unit" in req) s.unit = req.unit === "point" ? "point" : "yen";
      if ("weekStart" in req) s.weekStart = req.weekStart === 1 ? 1 : 0;
      if ("lowPower" in req) s.lowPower = !!req.lowPower;
      // 時計の表示（デジタル24時間・12時間・アナログ）と、時計・天気・よてい ごとの 文字（自動・ひらがな・漢字）
      if ("clock" in req) s.clock = ["d24", "d12", "analog"].indexOf(req.clock) >= 0 ? req.clock : "d24";
      if (req.words && typeof req.words === "object") {
        s.words = {};
        ["clock", "weather", "schedule"].forEach(function (k) {
          s.words[k] = ["auto", "kana", "kanji"].indexOf(req.words[k]) >= 0 ? req.words[k] : "auto";
        });
      }
      // 服装の 目安の 気温（半そで・上着・コート）。コートは 上着より 寒い ときに する
      if (req.clothes && typeof req.clothes === "object") {
        var t = function (v, d) { return Math.max(-10, Math.min(40, int(v, d))); };
        s.clothes = { short: t(req.clothes.short, 25), jacket: t(req.clothes.jacket, 15), coat: t(req.clothes.coat, 8) };
        s.clothes.coat = Math.min(s.clothes.coat, s.clothes.jacket);
      }
      if ("timeSlots" in req) s.timeSlots = !!req.timeSlots;
      if ("showAdvice" in req) s.showAdvice = req.showAdvice !== false;
      if ("usage" in req) s.usage = USAGES.indexOf(req.usage) >= 0 ? req.usage : "board1";
      if (req.parentLock) s.parentLock = parentLock(req.parentLock);
      if ("location" in req) s.location = place(req.location);
      if ("calendar" in req) s.calendar = calendar(req.calendar);
      if ("parentName" in req) s.parentName = String(req.parentName || "").trim().slice(0, 10);
      if (req.display) {
        ["weekday", "holiday"].forEach(function (k) {
          if (req.display[k]) {
            s.display[k] = { from: hhmm(req.display[k].from, s.display[k].from), to: hhmm(req.display[k].to, s.display[k].to) };
          }
        });
        // 30秒（0.5）〜60分。設定の 一覧は 30分まで だが、前に えらんだ 長い 値も そのまま 受ける
        if ("idleMinutes" in req.display) s.display.idleMinutes = Math.max(0.5, Math.min(60, parseFloat(req.display.idleMinutes) || 1));
      }
    },
    "/api/board/kids": function (data, req) {
      var known = {}, kids = [];
      data.kids.forEach(function (k) { known[k.id] = k; });
      (req.kids || []).forEach(function (k) {
        var name = String(k.name || "").trim().slice(0, MAX_NAME);
        if (!name) return;
        kids.push({
          id: known[k.id] ? k.id : uid("k"),
          name: name,
          color: COLORS.indexOf(k.color) >= 0 ? k.color : COLORS[kids.length % COLORS.length],
          active: k.active !== false,
          level: LEVELS.indexOf(k.level) >= 0 ? k.level : "lower",
          honor: HONORS.indexOf(k.honor) >= 0 ? k.honor : "",
        });
      });
      Object.keys(known).forEach(function (id) {
        if (!kids.some(function (k) { return k.id === id; })) kids.push(Object.assign({}, known[id], { active: false }));
      });
      var shown = kids.filter(function (k) { return k.active; }).length;
      var before = data.kids.filter(function (k) { return k.active !== false; }).length;
      if (!shown) throw httpError(400, "表示する子どもが1人もいません");
      if (!PRO && shown > FREE.kids && shown > before) {
        throw httpError(403, "無料版で表示できる子どもは" + FREE.kids + "人までです。" + (FREE.kids + 1) + "人目からは Pro（準備中）で使えるようにする予定です");
      }
      if (shown > MAX_KIDS) throw httpError(400, "表示できるのは " + MAX_KIDS + " 人までです");
      data.kids = kids;
    },
    // ボードの 親モードから「1回だけ」の やることを たす・なおす・けす（ふだんの やることは 管理ページで かえる）
    "/api/board/task": function (data, req) {
      if (req.remove) {
        data.tasks = data.tasks.filter(function (t) { return !(t.id === req.remove && t.repeat.type === "once"); });
        return;
      }
      // なおす: 名前・だれが・日にち・ごほうび だけ。id は そのまま（その日の チェックは のこる）
      if (req.edit) {
        var e = req.edit, cur = data.tasks.filter(function (t) { return t.id === e.id && t.repeat.type === "once"; })[0];
        if (!cur) throw httpError(404, "みつかりません");
        if (!isDate(e.date)) throw httpError(400, "bad date");
        var n = normTask({ name: e.name, kids: e.kids, yen: e.yen, kind: "check", repeat: { type: "once", date: e.date } },
          data.kids.map(function (k) { return k.id; }));
        if (!n) throw httpError(400, "なまえを いれてください");
        if (n.name !== cur.name) delete cur.kana;          // ひらがなは 前の 名前の もの
        if (cur.yenByKid && n.yen !== cur.yen) delete cur.yenByKid; // ごほうびを かえたら 子どもごとの 金額は やめる
        cur.name = n.name; cur.kids = n.kids; cur.yen = n.yen; cur.repeat = n.repeat;
        return;
      }
      var a = req.add || {};
      if (!isDate(a.date)) throw httpError(400, "bad date");
      var t = normTask({ name: a.name, kids: a.kids, yen: a.yen, kind: "check", repeat: { type: "once", date: a.date } },
        data.kids.map(function (k) { return k.id; }));
      if (!t) throw httpError(400, "なまえを いれてください");
      data.tasks.push(t);
    },
    "/api/parent/day": function (data, req) {
      if (!isDate(req.date)) throw httpError(400, "bad date");
      if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
      var e = dayEntry(data, req.date, req.kid);
      if (req.checks) e.checks = req.checks.slice();
      if (req.counts) {
        e.counts = {};
        Object.keys(req.counts).forEach(function (k) { e.counts[k] = Math.max(0, Math.min(MAX_COUNT, int(req.counts[k], 0))); });
      }
      e.approved = !!req.approved;
      if (e.approved) snapshot(data, req.kid, e, req.date); else delete e.result;
    },
    // 家族の やることを まるごと おきかえる
    // まとめた しるし（grad）と 「もう できる」（bundle）は おくられた ものを つかわず、おなじ id の いまの やることから 引きつぐ
    //   （まとめる・もどすは 専用の ルートだけで かえる）。「もう できる」で かえられるのは 名前・ポイント・ごぜん/ごご・使う/使わない だけ。
    //   中身が のこって いる 「もう できる」は けさない（けすと まとめた やることが どこにも 出なく なる）
    "/api/parent/tasks": function (data, req) {
      var ids = data.kids.map(function (k) { return k.id; }), grads = {}, bundles = {};
      data.tasks.forEach(function (t) {
        if (t.grad) grads[t.id] = t.grad;
        if (t.bundle) bundles[t.id] = t;
      });
      var next = (req.tasks || []).map(function (t) {
        var n = normTask(t, ids);
        if (!n) return null;
        delete n.grad;
        if (grads[n.id]) n.grad = grads[n.id];
        if (bundles[n.id]) {
          Object.assign(n, { bundle: true, kids: bundles[n.id].kids, kind: "check", repeat: { type: "daily" } });
          delete n.yenByKid;
        }
        return n;
      }).filter(Boolean);
      Object.keys(bundles).forEach(function (id) {
        var b = bundles[id];
        if (next.some(function (t) { return t.id === id; })) return;
        if (data.tasks.some(function (t) { return !t.bundle && graduatedNow(t, b.kids[0]); })) next.push(b);
      });
      data.tasks = next;
    },
    "/api/parent/goals": function (data, req) {
      data.goals = (req.goals || []).filter(function (g) { return String(g.title || "").trim(); }).map(function (g) {
        return {
          id: g.id || uid("g"),
          icon: String(g.icon || "🎯").slice(0, 4),
          title: String(g.title).trim().slice(0, 30),
          target: Math.max(1, int(g.target, 1)),
          start: isDate(g.start) ? g.start : today(),
          done: isDate(g.done) ? g.done : null,
        };
      });
    },
    "/api/parent/rewards": function (data, req) {
      data.rewards = (req.rewards || []).filter(function (r) { return String(r.name || "").trim(); }).map(function (r) {
        return {
          id: r.id || uid("r"),
          icon: String(r.icon || "🎁").slice(0, 4),
          name: String(r.name).trim().slice(0, 30),
          points: Math.max(1, int(r.points, 1)),
          active: r.active !== false,
        };
      });
    },
    "/api/parent/exchange": function (data, req) {
      if (req.undo) {
        data.exchanges = data.exchanges.filter(function (x) { return x.id !== req.undo; });
        return;
      }
      if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
      var r = data.rewards.filter(function (x) { return x.id === req.rewardId; })[0];
      if (!r) throw httpError(400, "unknown reward");
      if (balance(data, req.kid) < r.points) throw httpError(409, "ポイントが たりません");
      data.exchanges.push({ id: uid("x"), date: today(), kid: req.kid, rewardId: r.id, name: r.name, icon: r.icon, points: r.points });
    },
  };
  // まとめる: ひとつずつの やることから はずして その子の 「もう できる」に 入れ、「できるようになったこと」に のこす（きめるのは おうちの人）。
  //   「もう できる」の ポイントは、まとめた やることの ぶんを たす（おうちの人が あとで かえられる）
  var MAX_NOTE = 100;
  function gradTask(data, req) {
    if (!knownKid(data, req.kid)) throw httpError(400, "unknown kid");
    var t = data.tasks.filter(function (x) { return x.id === req.taskId; })[0];
    if (!t) throw httpError(400, "unknown task");
    return t;
  }
  routes["/api/parent/graduate"] = function (data, req) {
    var t = gradTask(data, req);
    if (t.bundle || !t.active || t.repeat.type === "once" || (t.kids && t.kids.indexOf(req.kid) < 0)) throw httpError(400, "まとめられない やることです");
    if (graduatedNow(t, req.kid)) throw httpError(409, "もう まとめています");
    var day = today();
    t.grad = t.grad || {};
    (t.grad[req.kid] = t.grad[req.kid] || []).push({ from: day });
    var b = bundleOf(data.tasks, req.kid);
    if (!b) {
      b = { id: uid("t"), name: BUNDLE_NAME, kind: "check", yen: 0, kids: [req.kid], repeat: { type: "daily" }, slot: null, active: true, bundle: true };
      data.tasks.push(b);
    }
    b.active = true;
    b.yen += yenOf(t, req.kid);
    // きょう もう チェック して いたら、「もう できる」を チェック した ことに する（みました の あとの きろく（result）は そのまま）
    var e = (data.days[day] || {})[req.kid];
    if (e && ((e.checks || []).indexOf(t.id) >= 0 || int((e.counts || {})[t.id], 0) > 0)) {
      e.checks = e.checks.filter(function (id) { return id !== t.id && id !== b.id; }).concat([b.id]);
    }
    var g = { id: uid("gr"), kid: req.kid, taskId: t.id, name: t.name, date: day, note: String(req.note || "").trim().slice(0, MAX_NOTE) };
    if (t.kana) g.kana = t.kana;
    data.graduations.push(g);
  };
  // できなくなったら、やることに もどす（せめない。きろくは のこして 子どもの 画面には 出さない）
  routes["/api/parent/ungraduate"] = function (data, req) {
    var t = gradTask(data, req), day = today();
    var open = ((t.grad || {})[req.kid] || []).filter(function (p) { return !p.back; });
    if (!open.length) throw httpError(409, "まとめていません");
    open.forEach(function (p) { p.back = day; });
    var b = bundleOf(data.tasks, req.kid);
    if (b) b.yen = Math.max(0, b.yen - yenOf(t, req.kid));
    data.graduations.forEach(function (g) { if (g.kid === req.kid && g.taskId === t.id && !g.back) g.back = day; });
  };
  routes["/api/parent/graduation-note"] = function (data, req) {
    var g = data.graduations.filter(function (x) { return x.id === req.id; })[0];
    if (!g) throw httpError(400, "unknown graduation");
    g.note = String(req.note || "").trim().slice(0, MAX_NOTE);
  };
  // おうちの人の コメント（Pro。あとから いつでも かえられる。子どもの 段の 地図に 出る）。note は 子どもの 感想
  routes["/api/parent/graduation-comment"] = function (data, req) {
    var g = data.graduations.filter(function (x) { return x.id === req.id; })[0];
    if (!g) throw httpError(400, "unknown graduation");
    var c = String(req.comment || "").trim().slice(0, MAX_NOTE);
    if (c) g.comment = c;
    else delete g.comment;
  };
  // 書き出したファイルから まるごと戻す。戻す前の状態は バックアップに のこす
  routes["/api/parent/import"] = function (data, req) {
    var d = req.data;
    if (!d || !Array.isArray(d.kids) || !d.days || typeof d.days !== "object") {
      throw httpError(400, "はなまるボードのファイルではありません");
    }
    var old = storageGet(KEY);
    if (old) storageSet(BACKUP_PREFIX + today() + "-import", old);
    Object.keys(data).forEach(function (k) { delete data[k]; });
    Object.keys(d).forEach(function (k) { if (k !== "exportedAt" && k !== "today") data[k] = d[k]; });
  };
  routes["/api/parent/settings"] = routes["/api/board/settings"];
  routes["/api/parent/kids"] = routes["/api/board/kids"];

  // 天気の地域（気象庁の府県予報区と一次細分区域のコード）。null は「えらんでいない」
  function place(req) {
    if (!req || !/^\d{6}$/.test(req.office) || !/^\d{6}$/.test(req.area)) return null;
    var p = { office: req.office, area: req.area, name: String(req.name || "").slice(0, 20) };
    // 市区町村（雨の時刻を その あたりで みる）。位置は ボードが 国土地理院の住所検索で しらべる
    if (req.city && /^\d{7}$/.test(req.city.code)) {
      p.city = { code: req.city.code, name: String(req.city.name || "").slice(0, 20), kana: String(req.city.kana || "").slice(0, 30) };
    }
    return p;
  }

  // カレンダーの よみこみ先。type: "none"（つかわない）/ "ical"（iCal の URL）/ "gas"（Apps Script の URL）
  // null は「えらんでいない」（config.js の値を使う）
  function calendar(req) {
    if (!req || ["none", "ical", "gas"].indexOf(req.type) < 0) return null;
    var url = String(req.url || "").trim();
    // 「使わない」でも URL は のこす（また 使うときに 入れなおさなくて よいように）
    if (req.type === "none") return { type: "none", url: /^(https|webcal):\/\/\S+$/i.test(url) && url.length <= 2000 ? url : "" };
    if (!/^(https|webcal):\/\/\S+$/i.test(url) || url.length > 2000) throw httpError(400, "カレンダーの URL は https:// で始まるものを入れてください");
    return { type: req.type, url: url };
  }

  // 親モードの鍵。"none"（なし）/ "easy"（計算問題）/ "pin"（4桁の番号）。
  // resetAt: 番号を わすれて 入れなおしを はじめた 時刻（ミリ秒）。24時間 たつと 計算問題で ひらける（setup.js の ParentLock）。
  // 送られて こなければ 消す（番号で ひらけた・設定を 保存した）。番号の ない "pin"（前の データ）は 計算問題に する
  function parentLock(req) {
    if (req.type === "pin") {
      if (!/^\d{4}$/.test(String(req.pin || ""))) throw httpError(400, "鍵の4桁の番号を入れてください");
      var lock = { type: "pin", pin: String(req.pin) };
      if (typeof req.resetAt === "number" && isFinite(req.resetAt)) lock.resetAt = req.resetAt;
      return lock;
    }
    return { type: req.type === "easy" ? "easy" : "none" };
  }

  // ---- 2台連携 ----
  function remoteConf() {
    try { return JSON.parse(storageGet(REMOTE_KEY) || "null"); } catch (e) { return null; }
  }
  // がんばり項目（admin.html）は 設定画面の iframe の 中で うごくので、アプリの 窓口は 親の 画面の ものを つかう
  function hostWin() {
    try { if (!window.EchoBoard && window.parent !== window && window.parent.EchoBoard) return window.parent; } catch (e) { /* べつの 場所 */ }
    return window;
  }
  function nativeHttp() {
    var c = hostWin().Capacitor;
    return c && c.Plugins && c.Plugins.CapacitorHttp;
  }
  function request(base, method, path, body, token) {
    var http = nativeHttp();
    if (!http) return Promise.reject(httpError(500, "アプリの中でだけ つなげます"));
    return http.request({
      url: base + path, method: method, data: body,
      headers: { "Content-Type": "application/json", "X-Board-Token": token || "" },
      connectTimeout: 4000, readTimeout: 10000,
    }).then(function (r) {
      var d = r.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = {}; } }
      if (r.status >= 400) throw httpError(r.status, (d && d.error) || "HTTP " + r.status);
      return d;
    });
  }
  // 同じ Wi-Fi の 置いた端末を さがす（NSD。MainActivity.findBoards）→ [{name, host, port}]
  function findBoards(ms) {
    return new Promise(function (resolve) {
      var w = hostWin(), eb = w.EchoBoard;
      if (!eb || !eb.findBoards) return resolve([]);
      function done(ev) { w.removeEventListener("board:found-done", done); resolve(ev.detail || []); }
      w.addEventListener("board:found-done", done);
      eb.findBoards(ms || 6000);
    });
  }
  // つなぐ先。まえの 場所に つながらなければ（IP アドレスが かわった など）名前で さがしなおす
  var remoteBase = null, resolving = null;
  function resolveRemote() {
    if (remoteBase) return Promise.resolve(remoteBase);
    if (resolving) return resolving;
    var c = remoteConf(), base = "http://" + c.host + ":" + c.port;
    resolving = request(base, "GET", "/ping").then(function () { return base; }, function () {
      return findBoards(8000).then(function (list) {
        var hit = list.filter(function (b) { return b.name === c.name; })[0] || (list.length === 1 ? list[0] : null);
        if (!hit) throw httpError(503, "置いてある端末が見つかりません");
        c.host = hit.host;
        c.port = hit.port;
        c.name = hit.name;
        storageSet(REMOTE_KEY, JSON.stringify(c));
        return "http://" + hit.host + ":" + hit.port;
      });
    }).then(function (b) { remoteBase = b; resolving = null; return b; }, function (e) { resolving = null; throw e; });
    return resolving;
  }
  function remoteCall(method, path, body) {
    var c = remoteConf();
    return resolveRemote().then(function (base) { return request(base, method, path, body, c.token); })
      .catch(function (e) {
        if (!e.status || e.status >= 500) remoteBase = null; // つぎは さがしなおす
        throw e;
      });
  }
  // ブラウザで 置いた端末に つながらない（番号が ない・ちがう）とき
  var PAIR_AGAIN = "置いてある端末の設定「使い方」の QR コードを、もう一度読み取ってください（つなぐための番号が合いません）";
  // 置いた端末に おくる ときの ヘッダー（QR の 番号）
  function authHeaders(extra) {
    var h = extra || {}, t = urlToken() || storageGet(TOKEN_KEY);
    if (t) h["X-Board-Token"] = t;
    return h;
  }

  // ---- 外から使う窓口 ----
  window.BoardApi = {
    // データが この端末の 中に あるか（置いた端末・スマホだけ）。つないで いる スマホは false
    local: LOCAL && !REMOTE,
    // Web 版。予定は まだ よめない（ブラウザからは CORS で よめず、中継は クラウド版で 作る）
    web: WEB,
    remote: REMOTE,
    remoteName: function () { var c = remoteConf(); return c ? c.name : ""; },
    // ブラウザから 置いた端末の 番号つきで ひらいて いるか（おうちの人）
    paired: !LOCAL && !!(urlToken() || storageGet(TOKEN_KEY)),
    authHeaders: authHeaders,
    findBoards: findBoards,
    // つなぐ。置いた端末の 番号で ためして、よければ おぼえる
    connect: function (board, token) {
      var base = "http://" + board.host + ":" + board.port;
      return request(base, "GET", "/api/state", undefined, token).then(function () {
        storageSet(REMOTE_KEY, JSON.stringify({ name: board.name, host: board.host, port: board.port, token: token }));
      });
    },
    disconnect: function () { try { localStorage.removeItem(REMOTE_KEY); } catch (e) { /* のこっても よい */ } },
    // 置いた端末: LanServer（MainActivity）から たのまれた /api/... を ここで 処理して かえす
    lanServe: function (id, method, path, bodyText) {
      var eb = window.EchoBoard;
      function reply(status, body) { try { eb.lanReply(id, status, JSON.stringify(body)); } catch (e) { /* アプリでない */ } }
      try {
        if (!LOCAL || REMOTE) return reply(503, { error: "この端末には データが ありません" });
        if (method === "GET" && path === "/api/state") {
          var d = load();
          d.today = today();
          return reply(200, d);
        }
        if (method !== "POST" || !routes[path]) return reply(404, { error: "not found" });
        var data = load();
        routes[path](data, JSON.parse(bodyText || "{}"));
        save(data);
        reply(200, { ok: true });
        window.dispatchEvent(new Event("board:reload")); // スマホで かえた ものを ボードにも
      } catch (e) {
        reply(e.status || 500, { error: e.message || "error" });
      }
    },
    // ママ・パパのページと ボード（どちらも dashboard/ の 中。置いた端末の LanServer も 同じ 名前で 配る）
    adminUrl: "admin.html",
    boardUrl: "index.html",
    // ローカル版で まだ はじめの せっていを していないか
    needsSetup: function () { return LOCAL && !REMOTE && !storageGet(KEY); },
    // この端末の 中に 子ども・記録が あるか（置いた端末に つなぐ まえに「消えません」と しらせる）
    hasRecords: function () {
      if (!LOCAL || REMOTE) return false;
      try { var d = JSON.parse(storageGet(KEY) || "null"); return !!d && ((d.kids || []).length > 0 || Object.keys(d.days || {}).length > 0); } catch (e) { return false; }
    },
    // その日に その子に 出る やること・その子の 金額
    tasksFor: tasksFor,
    // 週に何回: その週に（skip の 日を のぞいて）チェックした 日の 数 / その日の 数に 入れるか
    weekDone: weekDone,
    required: required,
    graduatedNow: graduatedNow,
    // 無料の 上限（Pro なら null）。画面で「あと いくつ」を 出すのに つかう
    limits: function () { return PRO ? null : FREE; },
    // Pro か（段の 地図・コメント・ふりかえり・3人目から）
    isPro: function () { return !window.BoardApi.limits(); },
    bundleItems: bundleItems,
    gradStats: gradStats,
    weekDates: weekDates,
    // 予定の URL の よくある まちがい。Google カレンダーの 共有リンク（…/calendar/u/0?cid=…）や 画面の URL は
    //   iCal では ないので 読めない（「予定が わからないよ」に なる）。"share" なら Words の calShareLink を 出す
    calUrlProblem: function (url) {
      url = String(url || "").trim();
      return /^https?:\/\/calendar\.google\.com\//i.test(url) && !/\/calendar\/ical\//i.test(url) ? "share" : "";
    },
    // 使い方（settings.usage）。決めていないときは、この端末の中なら board1、置いた端末を開いた ブラウザなら board2
    usage: function (s) {
      var u = s && s.usage;
      return USAGES.indexOf(u) >= 0 ? u : LOCAL ? "board1" : "board2";
    },
    yenOf: yenOf,

    state: function () {
      if (REMOTE) return remoteCall("GET", "/api/state");
      if (!LOCAL) {
        return fetch("/api/state", { cache: "no-store", headers: authHeaders() }).then(function (r) {
          if (r.status === 401) throw httpError(401, PAIR_AGAIN);
          if (!r.ok) throw httpError(r.status, "HTTP " + r.status);
          return r.json();
        });
      }
      return new Promise(function (resolve) {
        var data = load();
        data.today = today();
        resolve(data);
      });
    },

    post: function (path, body) {
      if (REMOTE) return remoteCall("POST", path, body || {}).then(function () { return undefined; });
      if (!LOCAL) {
        return fetch(path, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        }).then(function (r) {
          if (r.ok) return;
          if (r.status === 401) throw httpError(401, PAIR_AGAIN);
          return r.json().catch(function () { return {}; }).then(function (e) {
            throw httpError(r.status, e.error || "HTTP " + r.status);
          });
        });
      }
      return new Promise(function (resolve) {
        var route = routes[path];
        if (!route) throw httpError(404, "not found");
        var data = load();
        route(data, copy(body || {}));
        save(data);
        resolve();
      });
    },
  };
})();
