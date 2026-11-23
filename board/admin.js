// がんばり管理（おうちの人の ページ。admin.html）の 処理。ボードの 設定の タブ（?embed=1）や、置いた端末を 開いた ブラウザで 使う。
// 決まりと データは api.js（BoardApi）。ページの 形と 見た目は admin.html
(function () {
  "use strict";
  var state = null;
  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1600);
  }

  function load() {
    return window.BoardApi.state().then(function (s) {
      state = s;
      if (!$("date").value) $("date").value = s.today;
      renderDay();
      renderGrad();
      if (!$("pv-date").value) $("pv-date").value = s.today;
      renderPreview();
    });
  }

  function post(url, body) { return window.BoardApi.post(url, body); }

  // やることの 値は ポイント（2026-11-12 に 円を やめた）
  function u(n) { return n + "ポイント"; }

  // 「表示」を外した子は出さない
  function visibleKids() { return state.kids.filter(function (k) { return k.active !== false; }); }

  // その日に その子に出る やること（毎日・曜日・1回だけ）と、その子の ポイント
  function dayTasks(kid, date) { return window.BoardApi.tasksFor(state.tasks, kid, date); }
  function yenOf(t, kid) { return window.BoardApi.yenOf(t, kid); }
  // その日の 記録と、やった 回数（チェックは 0 か 1、かいすうは回数）。決まりは api.js
  function entry(date, kid) { return window.BoardApi.entry(state, date, kid); }
  function taskCount(t, e) { return window.BoardApi.taskCount(t, e); }

  // ---- がんばりチェック ----
  var bundleOpen = {};   // 中身を ひらいて いる 子（「もう できる」の ▸）
  function renderDay() {
    var date = $("date").value;
    $("day-kids").innerHTML = visibleKids().map(function (k) {
      var e = entry(date, k.id), list = dayTasks(k.id, date);
      var tasks = list.map(function (t) {
        var n = taskCount(t, e), yen = yenOf(t, k.id);
        if (t.kind === "count") {
          return '<div class="task"><span class="cnt">' +
            '<button class="icon-btn" data-kid="' + k.id + '" data-cnt="' + t.id + '" data-delta="-1">−</button>' +
            '<b>' + n + '</b>' +
            '<button class="icon-btn" data-kid="' + k.id + '" data-cnt="' + t.id + '" data-delta="1">＋</button></span>' +
            esc(t.name) + '<span class="yen">' + u(yen) + '×' + n + '</span></div>';
        }
        if (t.bundle) {
          // 中身を 見て、まだ 毎日は できて いない ものは その場で やることに 戻せる（がんばり項目の「やることに戻す」と おなじ）
          var items = window.BoardApi.bundleItems(state.tasks, k.id, date), open = !!bundleOpen[k.id];
          return '<div class="task bundle-row"><label><input type="checkbox" data-kid="' + k.id + '" data-task="' + t.id + '"' +
            (n ? " checked" : "") + '>' + esc(t.name) + '</label>' +
            '<button class="b-open" data-b-open="' + k.id + '">' + (open ? "▾ 中身" : "▸ 中身") + ' ' + items.length + '</button>' +
            '<span class="yen">' + u(yen) + '</span>' +
            (open ? '<ul class="b-items">' + items.map(function (m) {
              return '<li>' + esc(m.name) + (window.BoardApi.graduatedNow(m, k.id)
                ? '<button data-b-back="' + k.id + ":" + m.id + '" data-b-name="' + esc(m.name) + '">やることに戻す</button>' : '') + '</li>';
            }).join("") + '</ul>' : '') + '</div>';
        }
        return '<label class="task"><input type="checkbox" data-kid="' + k.id + '" data-task="' + t.id + '"' +
          (n ? " checked" : "") + '>' + esc(t.name) +
          // 「いまから やる」を 押した やること（子どもが 自分から はじめた）
          ((e.starts || []).indexOf(t.id) >= 0 ? ' <small class="self">自分から始めた</small>' : "") +
          (t.repeat.type === "perweek" ? ' <small class="muted">週に' + t.repeat.n + '回・今週' + window.BoardApi.weekDone(state, t, k.id, date) + '回</small>' : "") +
          '<span class="yen">' + u(yen) + '</span></label>';
      }).join("") || '<p class="muted">この日のやることはありません</p>';
      var need = list.filter(function (t) { return window.BoardApi.required(t, e); });
      var done = need.filter(function (t) { return taskCount(t, e) > 0; }).length;
      var info = e.approved && e.result
        ? e.result.done.length + "/" + e.result.total + "個・" + u(e.result.yen)
        : done + "/" + need.length + "個できた";
      return '<div class="kid"><div class="row spread"><h3>' + esc(k.name) + '</h3><span class="muted">' + info + '</span></div>' +
        tasks +
        '<button class="approve' + (e.approved ? " on" : "") + '" data-approve="' + k.id + '">' +
        (e.approved ? "✓ ママ・パパ みました" : "ママ・パパ みました") + '</button></div>';
    }).join("");
  }

  $("day-kids").addEventListener("change", function (ev) {
    var cb = ev.target;
    if (!cb.dataset.task) return;
    var date = $("date").value, kid = cb.dataset.kid, e = entry(date, kid);
    var checks = Array.prototype.map.call(
      document.querySelectorAll('input[data-kid="' + kid + '"]:checked'),
      function (x) { return x.dataset.task; });
    post("/api/parent/day", { date: date, kid: kid, checks: checks, counts: e.counts, approved: e.approved })
      .then(load).catch(function (err) { toast("保存できませんでした: " + err.message); load(); });
  });

  $("day-kids").addEventListener("click", function (ev) {
    var d = ev.target.dataset || {}, date = $("date").value;
    if (d.bOpen) { bundleOpen[d.bOpen] = !bundleOpen[d.bOpen]; renderDay(); return; }
    if (d.bBack) {
      if (!confirm("「" + d.bName + "」を、今日から1つずつのやることに戻します。できるようになったことの記録は残り、子どもの画面には出なくなります（あとでまたまとめられます）。")) return;
      var q = d.bBack.split(":");
      post("/api/parent/ungraduate", { kid: q[0], taskId: q[1] })
        .then(function () { toast("やることに戻しました"); return load(); })
        .catch(function (err) { toast("保存できませんでした: " + err.message); });
      return;
    }
    if (d.cnt) {
      var ce = entry(date, d.kid), counts = Object.assign({}, ce.counts);
      counts[d.cnt] = Math.max(0, (counts[d.cnt] || 0) + parseInt(d.delta, 10));
      post("/api/parent/day", { date: date, kid: d.kid, checks: ce.checks, counts: counts, approved: ce.approved })
        .then(load).catch(function (err) { toast("保存できませんでした: " + err.message); load(); });
      return;
    }
    var kid = d.approve;
    if (!kid) return;
    var e = entry(date, kid);
    post("/api/parent/day", { date: date, kid: kid, checks: e.checks, counts: e.counts, approved: !e.approved })
      .then(function () { toast(e.approved ? "取り消しました" : "みました！"); return load(); })
      .catch(function (err) { toast("保存できませんでした: " + err.message); });
  });

  function shiftDate(n) {
    var d = new Date($("date").value + "T00:00:00");
    d.setDate(d.getDate() + n);
    $("date").value = ymd(d);
    renderDay();
  }
  $("prev").addEventListener("click", function () { shiftDate(-1); });
  $("next").addEventListener("click", function () { shiftDate(1); });
  $("today-btn").addEventListener("click", function () { $("date").value = state.today; renderDay(); });
  $("date").addEventListener("change", renderDay);

  // ---- できるようになったこと（「もう できる」に まとめる） ----
  //   めやすの 計算と 決まりは api.js（gradStats・graduatedNow・bundleItems）。きめるのは おうちの人
  //   ここでは 日数や 割合は 出さず「もう できるかも／まだ練習中」だけ（2026-11-05。数字と グラフは Pro の ふりかえり）
  var gradOpen = null; // ひらいている まとめる 入力（kid + ":" + taskId）
  function graduations(kid) {
    return (state.graduations || []).filter(function (g) { return g.kid === kid && !g.back; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function fmtDate(d) { return +d.slice(5, 7) + "/" + +d.slice(8, 10); }
  function taskById(id) { return state.tasks.filter(function (t) { return t.id === id; })[0]; }
  function rate(st) { return st.days ? st.done / st.days : 0; }
  function renderGrad() {
    var api = window.BoardApi;
    $("grad").innerHTML = visibleKids().map(function (k) {
      var rows = state.tasks.filter(function (t) {
        return !t.bundle && t.active && t.repeat.type !== "once" && (!t.kids || t.kids.indexOf(k.id) >= 0) && !api.graduatedNow(t, k.id);
      }).map(function (t) { return { t: t, st: api.gradStats(state, t, k.id, state.today) }; })
        .sort(function (a, b) { return (b.st.ready - a.st.ready) || (rate(b.st) - rate(a.st)); });
      var list = rows.map(function (x) {
        var key = k.id + ":" + x.t.id;
        // 本人の 感想は 聞かない・出さない（2026-11-05 から。小さい子は おうちの人が 書く ことに なるので。前の 感想は データに のこるだけ）
        var form = gradOpen === key
          ? '<div class="g-form"><b>まとめる前に、お子さんと「できるようになったね」と話してみてください。</b>' +
            '<div class="row"><button data-g-cancel="1">やめる</button><button class="primary" data-g-go="' + key + '">「もう できる」にまとめる</button></div></div>'
          : "";
        return '<div class="g-row' + (x.st.ready ? " ready" : "") + '"><div class="g-sum">' +
          '<span class="g-name">' + esc(x.t.name) + '</span>' +
          '<span class="g-tag">' + (x.st.ready ? "もう できるかも" : "まだ練習中") + '</span>' +
          (gradOpen === key ? "" : '<button data-g-open="' + key + '">まとめる</button>') +
          '</div>' + form + '</div>';
      }).join("") || '<p class="muted">毎日・曜日のやることがありません</p>';
      var done = graduations(k.id).map(function (g) {
        return '<div class="g-item"><span class="g-name">' + fmtDate(g.date) + ' ' + esc(g.name) +
          '</span>' +
          '<span class="g-btns">' +
          (taskById(g.taskId) ? '<button data-g-back="' + k.id + ":" + g.taskId + '">やることに戻す</button>' : '') + '</span></div>';
      }).join("");
      return '<div class="kid"><h3>' + esc(k.name) + '</h3>' + list +
        (done ? '<div class="g-done"><h4>「もう できる」にまとめたこと</h4>' + done + '</div>' : "") + '</div>';
    }).join("");
  }
  $("grad").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    var d = b.dataset;
    if (d.gOpen) { gradOpen = d.gOpen; renderGrad(); return; }
    if (d.gCancel) { gradOpen = null; renderGrad(); return; }
    if (d.gGo) {
      var p = d.gGo.split(":");
      post("/api/parent/graduate", { kid: p[0], taskId: p[1] })
        .then(function () { gradOpen = null; toast("「もう できる」にまとめました。おめでとう！"); return load(); })
        .catch(function (err) { toast("保存できませんでした: " + err.message); });
      return;
    }
    if (d.gBack) {
      if (!confirm("やることに戻しますか？ 今日から、また1つずつのやることに出ます（「もう できる」のポイントからは、その分を引きます）。")) return;
      var q = d.gBack.split(":");
      post("/api/parent/ungraduate", { kid: q[0], taskId: q[1] })
        .then(function () { toast("やることに戻しました"); return load(); })
        .catch(function (err) { toast("保存できませんでした: " + err.message); });
      return;
    }
  });

  // ---- やることの設定（家族で1つのリスト。1件ごとに だれが・いつ） ----
  //   ふだんは「毎日・みんな」。曜日・1回だけ・子どもごとの ポイント・ごぜん/ごご は 行をひらいたときだけ出す
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var editing = [], dirty = false, filterKid = null, openKey = null, seq = 0;
  var PALETTE = window.KID_PALETTE;

  function keyOf(t) { return t.id || t._k; }
  function kidName(id) { var k = state.kids.filter(function (k) { return k.id === id; })[0]; return k ? k.name : "?"; }
  function kidColor(id) {
    var k = state.kids.filter(function (k) { return k.id === id; })[0];
    return (PALETTE[k && k.color] || PALETTE.purple).main;
  }
  function slotsOn() { return !!state.settings.timeSlots; }
  function commonYen() {
    var votes = {};
    state.tasks.forEach(function (t) { if (t.active) votes[t.yen] = (votes[t.yen] || 0) + 1; });
    var keys = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    return keys.length ? +keys[0] : 5;
  }
  // 「もう できる」に まとめた 子の しるし（やることの 一覧）。「もう できる」自身には 中身を 出す
  function bundleNames(t) {
    return window.BoardApi.bundleItems(state.tasks, t.kids[0], state.today).map(function (m) { return m.name; }).join("・");
  }
  function gradMark(t) {
    if (t.bundle) return '<small>' + esc(kidName(t.kids[0])) + 'の中身: ' + (esc(bundleNames(t)) || "（まだありません）") + '</small>';
    var names = state.kids.filter(function (k) { return window.BoardApi.graduatedNow(t, k.id); }).map(function (k) { return k.name; });
    return names.length ? '<small>「もう できる」にまとめた: ' + esc(names.join("・")) + '</small>' : "";
  }
  function whenText(t) {
    var r = t.repeat;
    if (r.type === "once") return "1回だけ " + +r.date.slice(5, 7) + "/" + +r.date.slice(8, 10);
    if (r.type === "weekly") {
      var d = r.days.join(",");
      if (d === "1,2,3,4,5") return "平日";
      if (d === "0,6") return "土日";
      return r.days.map(function (x) { return WD[x]; }).join("・");
    }
    if (r.type === "perweek") return "週に" + r.n + "回";
    return "毎日";
  }

  function startEdit() {
    editing = JSON.parse(JSON.stringify(state.tasks));
    dirty = false;
    openKey = null;
    renderFilter();
    renderTaskEdit();
  }

  function renderFilter() {
    var kids = visibleKids();
    if (filterKid && !kids.some(function (k) { return k.id === filterKid; })) filterKid = null;
    $("task-filter").innerHTML = '<button data-filter=""' + (!filterKid ? ' class="on"' : "") + '>みんな</button>' +
      kids.map(function (k) {
        return '<button data-filter="' + k.id + '"' + (k.id === filterKid ? ' class="on"' : "") + '>' + esc(k.name) + '</button>';
      }).join("");
    $("s-slots").checked = slotsOn();
  }
  $("task-filter").addEventListener("click", function (ev) {
    var f = ev.target.dataset.filter;
    if (f === undefined) return;
    filterKid = f || null;
    renderFilter();
    renderTaskEdit();
    renderOnceKids();
  });
  $("s-slots").addEventListener("change", function () {
    post("/api/board/settings", { timeSlots: $("s-slots").checked })
      .then(function () { toast("保存しました"); return window.BoardApi.state(); })
      .then(function (s) { state.settings = s.settings; renderTaskEdit(); })
      .catch(function (err) { toast("保存できませんでした: " + err.message); });
  });

  // 見えている グループごとに ならべる。↑↓ は おなじ グループの となりと いれかえる。
  //   「もう できる」は 子どもの 画面と おなじく いちばん 上（↑↓ は 出さない）
  function groups() {
    var today = state.today, shown = editing.filter(function (t) {
      return !filterKid || !t.kids || t.kids.indexOf(filterKid) >= 0;
    });
    shown = shown.filter(function (t) { return t.bundle; }).concat(shown.filter(function (t) { return !t.bundle; }));
    function pick(fn) { return shown.filter(fn); }
    var normal = function (t) { return t.active && t.repeat.type !== "once"; };
    var list = [];
    if (slotsOn()) {
      list.push({ title: window.Words.icon("sunny") + " ごぜん", items: pick(function (t) { return normal(t) && t.slot === "am"; }) });
      list.push({ title: window.Words.icon("house") + " ごご", items: pick(function (t) { return normal(t) && t.slot === "pm"; }) });
      list.push({ title: window.Words.icon("point-star") + " いつでも", items: pick(function (t) { return normal(t) && !t.slot; }) });
    } else {
      list.push({ title: "ふだんのやること", items: pick(normal) });
    }
    list.push({ title: "1回だけ", items: pick(function (t) { return t.active && t.repeat.type === "once" && t.repeat.date >= today; }) });
    list.push({ title: "すぎた 1回だけ", fold: true, items: pick(function (t) { return t.repeat.type === "once" && t.repeat.date < today; }) });
    list.push({ title: "使っていない", fold: true, items: pick(function (t) { return !t.active && !(t.repeat.type === "once" && t.repeat.date < today); }) });
    return list;
  }

  function renderTaskEdit() {
    $("task-list").innerHTML = groups().map(function (g) {
      if (!g.items.length) return g.fold ? "" : '<div class="t-group">' + g.title + '</div><p class="muted">ありません</p>';
      var rows = g.items.map(taskRow).join("");
      if (g.fold) {
        var open = g.items.some(function (t) { return keyOf(t) === openKey; });
        return '<details class="t-group"' + (open ? " open" : "") + '><summary>' + g.title + '（' + g.items.length + '）</summary>' + rows + '</details>';
      }
      return '<div class="t-group">' + g.title + '</div>' + rows;
    }).join("");
    $("save-tasks").disabled = !dirty;
  }

  function taskRow(t) {
    var i = editing.indexOf(t), key = keyOf(t), open = key === openKey, count = t.kind === "count";
    var who = t.kids
      ? '<span class="dots">' + t.kids.map(function (id) { return '<span class="dot" style="background:' + kidColor(id) + '"></span>'; }).join("") + '</span>'
      : '<span class="everyone">みんな</span>';
    var yenText = t.yenByKid ? "子どもごと" : u(t.yen) + (count ? "×回" : "");
    var html = '<div class="t-row' + (t.active ? "" : " off") + '">' +
      '<div class="t-sum" data-open="' + i + '">' +
      '<span class="t-name">' + (esc(t.name) || '<span class="muted">（名前）</span>') + (t.important && !t.bundle ? ' <span class="t-imp">だいじ</span>' : "") +
        (t.kana ? '<small>' + esc(t.kana) + '</small>' : "") + gradMark(t) + '</span>' +
      '<span class="t-when">' + whenText(t) + '</span>' + who + '<span class="t-yen">' + yenText + '</span></div>';
    if (open) html += taskEditor(t, i);
    return html + '</div>';
  }

  function chip(label, on, data, color, soft) {
    return '<button class="' + (on ? "on" : "") + (soft ? " soft" : "") + '" ' + data + (color ? ' style="--chip:' + color + '"' : "") + '>' + label + '</button>';
  }

  function taskEditor(t, i) {
    if (t.bundle) return bundleEditor(t, i);
    var r = t.repeat, kids = visibleKids(), count = t.kind === "count";
    var who = chip("みんな", !t.kids, 'data-i="' + i + '" data-kids=""') + kids.map(function (k) {
      return chip(esc(k.name), !t.kids || t.kids.indexOf(k.id) >= 0, 'data-i="' + i + '" data-kids="' + k.id + '"', kidColor(k.id), !t.kids);
    }).join("");
    var when = chip("毎日", r.type === "daily", 'data-i="' + i + '" data-repeat="daily"') +
      chip("曜日", r.type === "weekly", 'data-i="' + i + '" data-repeat="weekly"') +
      chip("週に何回", r.type === "perweek", 'data-i="' + i + '" data-repeat="perweek"') +
      chip("1回だけ", r.type === "once", 'data-i="' + i + '" data-repeat="once"');
    if (r.type === "weekly") {
      when += '<br>' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
        return chip(WD[d], r.days.indexOf(d) >= 0, 'data-i="' + i + '" data-day="' + d + '"');
      }).join("") + ' ' + chip("平日", false, 'data-i="' + i + '" data-days="1,2,3,4,5"') + chip("土日", false, 'data-i="' + i + '" data-days="0,6"');
    } else if (r.type === "perweek") {
      // 週の どこかで n 回（毎日 出して、とどいたら その週は「こんしゅう できた」）
      when += '<br>' + [1, 2, 3, 4, 5, 6].map(function (n) {
        return chip(n + "回", r.n === n, 'data-i="' + i + '" data-pern="' + n + '"');
      }).join("") + ' <span class="muted">週のどこかでできればよい</span>';
    } else if (r.type === "once") {
      when += ' <input type="date" data-i="' + i + '" data-f="date" value="' + (r.date || state.today) + '">';
    }
    var assigned = kids.filter(function (k) { return !t.kids || t.kids.indexOf(k.id) >= 0; });
    var yen = '<input type="number" min="0" data-i="' + i + '" data-f="yen" value="' + t.yen + '">' + (count ? " × 回数" : "") +
      ' <label class="muted"><input type="checkbox" data-i="' + i + '" data-f="byKid"' + (t.yenByKid ? " checked" : "") + '> 子どもごとに変える</label>';
    if (t.yenByKid) {
      yen += '<div class="by-kid">' + assigned.map(function (k) {
        var v = t.yenByKid.hasOwnProperty(k.id) ? t.yenByKid[k.id] : t.yen;
        return '<label>' + esc(k.name) + ' <input type="number" min="0" data-i="' + i + '" data-yenkid="' + k.id + '" value="' + v + '"></label>';
      }).join("") + '</div>';
    }
    return '<div class="t-edit">' +
      '<span>名前</span><input type="text" maxlength="30" data-i="' + i + '" data-f="name" value="' + esc(t.name) + '">' +
      '<span>ひらがな</span><input type="text" maxlength="30" data-i="' + i + '" data-f="kana" value="' + esc(t.kana || "") + '" placeholder="小さい子に見せる書き方（なくてもよい）">' +
      '<span>だれが</span><span class="chips">' + who + '</span>' +
      '<span>いつ</span><span class="chips">' + when + '</span>' +
      (slotsOn() ? '<span>時間帯</span><span class="chips">' +
        chip("ごぜん", t.slot === "am", 'data-i="' + i + '" data-slot="am"') +
        chip("ごご", t.slot === "pm", 'data-i="' + i + '" data-slot="pm"') +
        chip("いつでも", !t.slot, 'data-i="' + i + '" data-slot=""') + '</span>' : "") +
      // だいじ（2026-11-23）: 子どもの 画面で 上の 箱に まとめる。説明は 欄の 上に 1か所（admin.html の task-note）
      '<span>だいじ</span><span><label class="muted"><input type="checkbox" data-i="' + i + '" data-f="important"' + (t.important ? " checked" : "") + '> 子どもの画面で上にまとめる</label></span>' +
      '<span>種類</span><span class="chips">' +
        chip("✓ チェック", !count, 'data-i="' + i + '" data-kind="check"') +
        (r.type === "perweek" ? "" : chip("＋ 回数", count, 'data-i="' + i + '" data-kind="count"')) + '</span>' +
      '<span>ポイント</span><span>' + yen + '</span>' +
      '<div class="t-actions"><label class="muted"><input type="checkbox" data-i="' + i + '" data-f="active"' + (t.active ? " checked" : "") + '> 使う</label>' +
      (r.type === "once" ? '<button class="icon-btn" data-del="' + i + '">消す</button>' : "") +
      '<span class="moves"><button class="icon-btn" data-up="' + i + '">↑</button><button class="icon-btn" data-down="' + i + '">↓</button></span></div>' +
      '</div>';
  }
  // 「もう できる」: その子だけ・毎日・チェック で きまり。かえられるのは 名前・ポイント・ごぜん/ごご・使う だけ
  //   （中身は「できるようになったこと」の 欄で まとめる・やることに戻す）
  function bundleEditor(t, i) {
    return '<div class="t-edit">' +
      '<span>名前</span><input type="text" maxlength="30" data-i="' + i + '" data-f="name" value="' + esc(t.name) + '">' +
      '<span>ひらがな</span><input type="text" maxlength="30" data-i="' + i + '" data-f="kana" value="' + esc(t.kana || "") + '" placeholder="小さい子に見せる書き方（なくてもよい）">' +
      '<span>中身</span><span class="muted">' + (esc(bundleNames(t)) || "（まだありません）") + '。子どもは開いて「ぜんぶ できた！」を押し、1つと数えます。中身は「できるようになったこと」の欄で変えます。</span>' +
      (slotsOn() ? '<span>時間帯</span><span class="chips">' +
        chip("ごぜん", t.slot === "am", 'data-i="' + i + '" data-slot="am"') +
        chip("ごご", t.slot === "pm", 'data-i="' + i + '" data-slot="pm"') +
        chip("いつでも", !t.slot, 'data-i="' + i + '" data-slot=""') + '</span>' : "") +
      '<span>ポイント</span><span><input type="number" min="0" data-i="' + i + '" data-f="yen" value="' + t.yen + '">' +
      ' <span class="muted">（まとめたやることの合計から始まります）</span></span>' +
      '<div class="t-actions"><label class="muted"><input type="checkbox" data-i="' + i + '" data-f="active"' + (t.active ? " checked" : "") + '> 使う</label></div>' +
      '</div>';
  }

  function changed() { dirty = true; renderTaskEdit(); }

  $("task-list").addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-open],[data-kids],[data-repeat],[data-day],[data-days],[data-pern],[data-slot],[data-kind],[data-up],[data-down],[data-del]");
    if (!el) return;
    var d = el.dataset;
    if (d.open !== undefined) {
      var k = keyOf(editing[+d.open]);
      openKey = openKey === k ? null : k;
      return renderTaskEdit();
    }
    var t = editing[+(d.i !== undefined ? d.i : d.up !== undefined ? d.up : d.down !== undefined ? d.down : d.del)];
    if (d.kids !== undefined) {
      var all = visibleKids().map(function (k) { return k.id; });
      if (!d.kids) t.kids = null;
      else {
        var list = t.kids ? t.kids.slice() : all.slice(), at = list.indexOf(d.kids);
        if (at >= 0) list.splice(at, 1); else list.push(d.kids);
        // だれも いない・みんな と おなじ ときは「みんな」
        t.kids = !list.length || all.every(function (id) { return list.indexOf(id) >= 0; }) ? null : list;
      }
    } else if (d.repeat) {
      if (d.repeat === "weekly") t.repeat = { type: "weekly", days: t.repeat.days || [1, 2, 3, 4, 5] };
      else if (d.repeat === "once") t.repeat = { type: "once", date: t.repeat.date || state.today };
      else if (d.repeat === "perweek") { t.repeat = { type: "perweek", n: t.repeat.n || 1 }; t.kind = "check"; }
      else t.repeat = { type: "daily" };
    } else if (d.pern) {
      t.repeat = { type: "perweek", n: +d.pern };
    } else if (d.day !== undefined) {
      var days = t.repeat.days.slice(), n = +d.day, j = days.indexOf(n);
      if (j >= 0) days.splice(j, 1); else days.push(n);
      if (!days.length) return; // 曜日は 1つ以上
      t.repeat = { type: "weekly", days: days.sort() };
    } else if (d.days) {
      t.repeat = { type: "weekly", days: d.days.split(",").map(Number) };
    } else if (d.slot !== undefined) {
      t.slot = d.slot || null;
    } else if (d.kind) {
      t.kind = d.kind;
    } else if (d.del !== undefined) {
      if (!confirm("「" + t.name + "」を消しますか？")) return;
      editing.splice(editing.indexOf(t), 1);
    } else {
      // ↑↓: 見えている おなじ グループの となりと いれかえる
      var g = groups().filter(function (g) { return g.items.indexOf(t) >= 0; })[0];
      var other = g && g.items[g.items.indexOf(t) + (d.up !== undefined ? -1 : 1)];
      if (!other || other.bundle) return;   // 「もう できる」は いちばん 上の まま
      var a = editing.indexOf(t), b = editing.indexOf(other);
      editing[a] = other;
      editing[b] = t;
    }
    changed();
  });

  $("task-list").addEventListener("input", function (ev) {
    var el = ev.target, d = el.dataset;
    if (d.i === undefined) return;
    var t = editing[+d.i];
    if (d.yenkid) {
      t.yenByKid[d.yenkid] = parseInt(el.value, 10) || 0;
    } else if (d.f === "yen") {
      t.yen = parseInt(el.value, 10) || 0;
    } else if (d.f === "name" || d.f === "kana") {
      t[d.f] = el.value;
    } else if (d.f === "date") {
      if (el.value) t.repeat = { type: "once", date: el.value };
    } else if (d.f === "active") {
      t.active = el.checked;
      return changed();
    } else if (d.f === "important") {
      if (el.checked) t.important = true; else delete t.important;
      return changed();
    } else if (d.f === "byKid") {
      t.yenByKid = el.checked ? {} : undefined;
      if (!el.checked) delete t.yenByKid;
      return changed();
    } else return;
    dirty = true;
    $("save-tasks").disabled = false;
  });
  // なまえ・ポイントは 入れおわったら 一覧の 表示に 反映する
  $("task-list").addEventListener("change", function (ev) {
    if (ev.target.type === "text" || ev.target.type === "number" || ev.target.type === "date") renderTaskEdit();
  });

  $("add-task").addEventListener("click", function () {
    var t = { id: "", _k: "new" + (++seq), name: "", kind: "check", yen: commonYen(), kids: filterKid ? [filterKid] : null,
      repeat: { type: "daily" }, slot: null, active: true };
    editing.push(t);
    openKey = t._k;
    changed();
    var inputs = document.querySelectorAll('#task-list input[data-f="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  function saveTasks(message) {
    return post("/api/parent/tasks", { tasks: editing })
      .then(function () { toast(message || "保存しました"); return load(); })
      .then(startEdit)
      .catch(function (err) { toast("保存できませんでした: " + err.message); });
  }
  $("save-tasks").addEventListener("click", function () { saveTasks(); });

  // ---- 1回だけ（名前・日にち・だれ だけで たす。すぐ保存する） ----
  var onceKids = [];
  function renderOnceKids() {
    onceKids = filterKid ? [filterKid] : visibleKids().map(function (k) { return k.id; });
    drawOnceKids();
  }
  function drawOnceKids() {
    $("once-kids").innerHTML = visibleKids().map(function (k) {
      return chip(esc(k.name), onceKids.indexOf(k.id) >= 0, 'data-once="' + k.id + '"', kidColor(k.id));
    }).join("");
  }
  $("once-kids").addEventListener("click", function (ev) {
    var id = ev.target.dataset.once;
    if (!id) return;
    var j = onceKids.indexOf(id);
    if (j >= 0) onceKids.splice(j, 1); else onceKids.push(id);
    drawOnceKids();
  });
  $("once-ok").addEventListener("click", function () {
    var name = $("once-name").value.trim();
    if (!name) return toast("やることが未入力です");
    if (!onceKids.length) return toast("だれがやるか選んでください");
    if (dirty && !confirm("保存していない変更も一緒に保存します。よろしいですか？")) return;
    var all = visibleKids().map(function (k) { return k.id; });
    editing.push({ id: "", name: name, kind: "check", yen: parseInt($("once-yen").value, 10) || 0,
      kids: all.every(function (id) { return onceKids.indexOf(id) >= 0; }) ? null : onceKids.slice(),
      repeat: { type: "once", date: $("once-date").value || state.today }, slot: null, active: true });
    saveTasks("たしました").then(function () { $("once-name").value = ""; });
  });
  function resetOnce() {
    $("once-date").value = state.today;
    $("once-yen").value = commonYen();
    renderOnceKids();
  }

  // ---- この日に出るもの（保存した内容で 見る） ----
  function renderPreview() {
    var date = $("pv-date").value || state.today;
    $("pv").innerHTML = visibleKids().map(function (k) {
      var list = dayTasks(k.id, date);
      return '<div class="pv-kid"><b style="color:' + kidColor(k.id) + '">' + esc(k.name) + '</b>' + list.length + 'こ' +
        '<br><span class="muted">' + (list.map(function (t) { return esc(t.name); }).join("、") || "なし") + '</span></div>';
    }).join("");
  }
  $("pv-date").addEventListener("change", renderPreview);

  // ---- データの書き出し・読み込み（datafile.js。ボードの 設定の「おうちの人」と おなじ 処理） ----
  $("export").addEventListener("click", function () {
    window.DataFile.save().then(function (msg) { $("export-result").textContent = msg; },
      function (err) { $("export-result").textContent = "保存できませんでした（" + err.message + "）"; });
  });

  $("import").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    window.DataFile.load(file).then(function (done) {
      if (!done) return;
      toast("戻しました");
      return load().then(function () {
        startEdit();
        resetOnce();
      });
    }).catch(function (err) { toast(err.message); });
  });

  // 項目が ふえたので、見出しを タップして ひらく・とじる。ひらいている ものは この端末で おぼえる
  (function () {
    var KEY = "admin:open", open = null;
    try { open = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* よめなくても よい */ }
    if (!Array.isArray(open)) open = ["day"];
    // 「がんばりチェック」タブでは いつも ひらく
    if (document.body.classList.contains("only-day") && open.indexOf("day") < 0) open.push("day");
    // 「やること」タブで 2つとも とじて いたら、やることの設定を ひらいて おく
    if (document.body.classList.contains("only-tasks") && open.indexOf("tasks") < 0 && open.indexOf("grad") < 0) open.push("tasks");
    Array.prototype.forEach.call(document.querySelectorAll("main > section[data-sec]"), function (sec) {
      var id = sec.dataset.sec;
      sec.classList.toggle("closed", open.indexOf(id) < 0);
      sec.querySelector("h2").addEventListener("click", function () {
        var closed = sec.classList.toggle("closed"), i = open.indexOf(id);
        if (closed && i >= 0) open.splice(i, 1);
        if (!closed && i < 0) open.push(id);
        try { localStorage.setItem(KEY, JSON.stringify(open)); } catch (e) { /* おぼえられなくても よい */ }
      });
    });
  })();

  // アプリに同梱したとき（ローカル版）は、ボードと同じ端末で開くので もどる道を つける
  if (window.BoardApi.local) {
    $("back-board").hidden = false;
    $("back-board").href = window.BoardApi.boardUrl;
  }
  // ボードの 設定画面の タブの 中（?embed=1）。子ども・予定・天気・表示の時間などは 設定画面の ほうで 変える
  //   （前は /admin を じかに 開いた ときだけ 見える 古い 設定の 欄が あった。2026-11-20 に なくした）
  if (/[?&]embed=1/.test(location.search)) {
    document.body.classList.toggle("embed", true);
    document.body.classList.toggle("only-day", /[?&]only=day/.test(location.search));
    document.body.classList.toggle("only-tasks", /[?&]only=tasks/.test(location.search));
  }
  // 設定画面の 色（昼・夜）を もらう
  if (document.body.classList.contains("embed")) {
    try {
      var pcs = getComputedStyle(window.parent.document.body), rs = document.documentElement.style;
      [["--text", "--text"], ["--muted", "--muted"], ["--orange", "--orange"], ["--pink", "--pink"], ["--card", "--card"]].forEach(function (v) {
        var val = pcs.getPropertyValue(v[0]).trim();
        if (val) rs.setProperty(v[1], val);
      });
      rs.setProperty("--line", window.parent.document.body.classList.contains("night") ? "#4a4560" : "#f0dcd4");
      rs.colorScheme = window.parent.document.body.classList.contains("night") ? "dark" : "light";
    } catch (e) { /* べつの 場所から ひらいた */ }
  }

  // 保存して いない 欄（ボードの 設定画面が 閉じる 前に きく。settings.js の confirmClose）。
  //   保存の いる 欄は やることの 設定だけ（dirty で みる。ほかは 押した ときに すぐ 保存する）
  window.unsavedSections = function () {
    return Array.prototype.filter.call(document.querySelectorAll("section[data-sec]"), function (sec) {
      if (sec.offsetParent === null && getComputedStyle(sec).display === "none") return false;   // 隠して いる 欄
      return sec.dataset.sec === "tasks" && dirty;
    }).map(function (sec) { return sec.querySelector("h2").textContent.trim(); });
  };

  load().then(function () {
    startEdit();
    resetOnce();
    if (window.showEmbed) window.showEmbed();
  }).catch(function (err) {
    // 読めない ときは 空の ままに しない（つないだ スマホで 空だった。11-18）。理由を 出す
    console.error(err);
    var box = document.createElement("p");
    box.className = "load-error";
    var why = window.BoardApi.connWhy(err);
    box.textContent = why ? "置いてある端末のデータを読めませんでした。" + why + "。"
      : "置いてある端末のデータを読めませんでした（" + (err && err.message || "つながりません") + "）。画面を閉じて、もう一度開いてください。";
    document.body.insertBefore(box, document.body.firstChild);
    if (window.showEmbed) window.showEmbed();
  });
})();
