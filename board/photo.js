// 撮影用に 一部の 文字を かくす（2026-11-26。window.Photo）。設定の「ヘルプ」の いちばん下で オン・オフ。
//   この 端末だけ（localStorage の "photo"）。保存の データは かえず、画面に 出す 直前の 写しだけ かえる
//   （かくした まま 押しても 本物の 名前は 消えない。なおす 欄は 本物を 出す: kids.js の raw・wallet.js）。
//   かくす: 子どもの 名前・天気の 地域・予定・やること・ごほうび・ほしいもの・おさいふの 記録・できるようになったことの コメント。
//   見せて よいもの（allow）は オンの ときに えらんだ 文字だけ（あとから 足した ものは かくれる。社長 11-26）。
//   気温は 日ごとに -3〜+3 ど ずらす（0 は なし。季節が かわるほどは ずらさない）。ずらし方は オンに した ときの たねで きまる
(function () {
  "use strict";

  var KEY = "photo", MASK = "****";
  // 名前で なく 決まった ことば（かくさない）
  var KEEP = ["もう できる", "ちょきん"];

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  var conf = read();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch (e) { /* 覚えられなくても その場は うごく */ }
    window.dispatchEvent(new Event("board:photo"));
  }

  function on() { return !!conf.on; }
  function allowed(s) { return KEEP.indexOf(s) >= 0 || (conf.allow || []).indexOf(s) >= 0; }
  function text(s) { return !on() || !s || allowed(s) ? s : MASK; }

  // 画面に 出す 写し（on でなければ そのまま 返す）
  function state(s) {
    if (!on() || !s) return s;
    var c = JSON.parse(JSON.stringify(s));
    (c.kids || []).forEach(function (k) {
      k.name = MASK;
      delete k.kana;
      ((k.goal || {}).menu || []).forEach(function (m) { if (m.name) m.name = text(m.name); });
    });
    (c.tasks || []).forEach(function (t) {
      if (t.bundle || allowed(t.name)) return;
      t.name = MASK;
      delete t.kana;
    });
    (c.graduations || []).forEach(function (g) {
      if (!allowed(g.name)) { g.name = MASK; delete g.kana; }
      delete g.note;
      delete g.comment;
    });
    Object.keys(c.wallets || {}).forEach(function (id) {
      var w = c.wallets[id] || {};
      (w.wants || []).forEach(function (x) { x.name = text(x.name); });
      (w.log || []).forEach(function (r) { if (r.what) r.what = text(r.what); });
    });
    return c;
  }

  // 気温: その日の ずれ（-3〜-1・1〜3）
  function shift(day) {
    var h = conf.seed || 1, s = String(day);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
    var n = h % 6;
    return n < 3 ? n - 3 : n - 2;
  }
  function temp(day, t) { return on() && typeof t === "number" ? t + shift(day) : t; }

  // 見せて よいものの 候補（設定の「ヘルプ」）。グループごとに 重ならない 文字の 一覧
  function candidates(s, events) {
    var g = { tasks: [], goals: [], wallet: [], events: [] };
    function add(list, v) { if (v && KEEP.indexOf(v) < 0 && list.indexOf(v) < 0) list.push(v); }
    (s.tasks || []).forEach(function (t) { if (t.active && !t.bundle) add(g.tasks, t.name); });
    (s.graduations || []).forEach(function (x) { if (!x.back) add(g.tasks, x.name); });
    (s.kids || []).forEach(function (k) { ((k.goal || {}).menu || []).forEach(function (m) { add(g.goals, m.name); }); });
    Object.keys(s.wallets || {}).forEach(function (id) {
      var w = s.wallets[id] || {};
      (w.wants || []).forEach(function (x) { add(g.wallet, x.name); });
      (w.log || []).forEach(function (r) { add(g.wallet, r.what); });
    });
    (events || []).forEach(function (e) { add(g.events, e); });
    return g;
  }

  window.Photo = {
    on: on,
    mask: MASK,
    text: text,
    state: state,
    temp: temp,
    candidates: candidates,
    allowList: function () { return (conf.allow || []).slice(); },
    set: function (v) {
      conf.on = !!v;
      // オンに する たびに 気温の ずらし方を かえる（前の 写真と 見くらべても わからない ように）
      if (v) conf.seed = 1 + Math.floor(Math.random() * 1000000);
      save();
    },
    allow: function (s, v) {
      var a = (conf.allow || []).filter(function (x) { return x !== s; });
      if (v) a.push(s);
      conf.allow = a;
      save();
    }
  };
})();
