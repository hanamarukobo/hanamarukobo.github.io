// 設定の「Pro」タブ（おうちの人向け）。Pro で できる ことの 一覧・ふりかえり（毎週・毎月）・できるようになったことへの コメント。
//   無料版は 一覧を 鍵の 見た目で 出すだけ（子どもの 画面には Pro の 案内を 出さない）。Pro かは BoardApi.isPro()
//   ふりかえりは できなかった ことを 言わない（よかった ことと、つづけやすく する こつ だけ）
(function () {
  "use strict";

  var Api = window.BoardApi;
  var state = null, period = "lastWeek";
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function md(s) { return +s.slice(5, 7) + "/" + +s.slice(8, 10); }

  // 1つめが いちばんの 目玉（子どもが 自分で 見返せる こと。山の 段は その 見せ方）
  function features(parent) {
    return [
      ["できるようになったことを見返す", "子どもの名前の横の階段のしるしを押すと、できるようになったことが山の段になって並びます。いつ、何ができるようになったかを、子どもが自分でいつでも見返せます。"],
      [parent + "からのコメント", "できるようになったことに、ひとことを添えられます。子どもが見返すたびに目に入ります（あとから書き直せます）。"],
      ["ふりかえり", "子どもごとに、毎週・毎月のふりかえりを見られます。"],
      ["子ども3人から", "3人以上の子どもを表示できます。"],
    ];
  }
  function parentName() { return ((state && state.settings) || {}).parentName || "ママ・パパ"; }
  // つづけやすく する こつ（だれにでも あてはまる 一般の 助言。週ごとに かわる）
  var TIPS = [
    "できたら、その場で「見たよ」と声をかけると、次の日も続きやすくなります。",
    "やることは少なめから。毎日「できた！」がそろう数のほうが、習慣になりやすいです。",
    "はじめのうちは、いっしょに押すところまで付き合うと、自分で押せるようになっていきます。",
    "「みました」は、できれば毎日同じ時間に。寝る前など、決まった時間にすると忘れにくくなります。",
    "続いた日数より、続けようとしたことをほめると、休んだ日のあとも戻ってきやすくなります。",
    "できるようになったことは「もう できる」にまとめると、新しいことに目を向けやすくなります。",
  ];

  // 期間: 今週・先週・今月・先月（週の はじまりは 設定の とおり）。きょうより あとの 日は かぞえない
  function range(p) {
    var now = new Date(), today = ymd(now), ws = (state.settings || {}).weekStart === 1 ? 1 : 0;
    if (p === "thisWeek" || p === "lastWeek") {
      var w = Api.weekDates(today, ws);
      if (p === "thisWeek") return { from: w[0], to: today, label: "今週（" + md(w[0]) + "〜）" };
      var d = new Date(+w[0].slice(0, 4), +w[0].slice(5, 7) - 1, +w[0].slice(8, 10) - 7), lw = Api.weekDates(ymd(d), ws);
      return { from: lw[0], to: lw[6], label: "先週（" + md(lw[0]) + "〜" + md(lw[6]) + "）" };
    }
    if (p === "thisMonth") return { from: today.slice(0, 8) + "01", to: today, label: (now.getMonth() + 1) + "月（今日まで）" };
    var pm = new Date(now.getFullYear(), now.getMonth() - 1, 1), last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(pm), to: ymd(last), label: (pm.getMonth() + 1) + "月" };
  }
  function datesIn(r) {
    var out = [], d = new Date(+r.from.slice(0, 4), +r.from.slice(5, 7) - 1, +r.from.slice(8, 10));
    for (var s = ymd(d); s <= r.to; d.setDate(d.getDate() + 1), s = ymd(d)) out.push(s);
    return out;
  }
  function kidName(k) { return esc(k.name) + (k.honor ? "<small>" + esc(k.honor) + "</small>" : ""); }
  function visibleKids() { return (state.kids || []).filter(function (k) { return k.visible !== false; }); }

  // 子ども ひとりの ふりかえり（「みました」の 日の 記録で かぞえる）
  function report(k, r) {
    var flowers = 0, done = 0, best = 0, run = 0, byTask = {}, selfStart = 0;
    datesIn(r).forEach(function (d) {
      var e = (state.days[d] || {})[k.id], res = e && e.approved && e.result;
      if (res && res.done.length) {
        flowers++;
        run++;
        best = Math.max(best, run);
        res.done.forEach(function (x) {
          if ((e.starts || []).indexOf(x.id) >= 0) selfStart++;   // 「いまから やる」を 押してから できた
          done += x.count || 1;
          byTask[x.name] = (byTask[x.name] || 0) + (x.count || 1);
        });
      } else run = 0;
    });
    var grads = (state.graduations || []).filter(function (g) { return g.kid === k.id && !g.back && g.date >= r.from && g.date <= r.to; });
    var top = Object.keys(byTask).sort(function (a, b) { return byTask[b] - byTask[a]; }).slice(0, 3);
    // 2週間 よく できて いて、まだ まとめて いない やること（「もう できる」への おすすめ）
    var ready = state.tasks.filter(function (t) {
      return !t.bundle && t.active && t.repeat.type !== "once" && (!t.kids || t.kids.indexOf(k.id) >= 0) && !Api.graduatedNow(t, k.id) &&
        Api.gradStats(state, t, k.id, state.today).ready;
    });
    var lines = [];
    if (flowers) {
      // 期間の 日が ぜんぶ はなまるなら「7日」ではなく「毎日」
      lines.push(flowers === datesIn(r).length ? "<li>はなまるの日: <b>毎日できました</b></li>"
        : "<li>はなまるの日: <b>" + flowers + "日</b>" + (best >= 2 ? "（いちばん長く続いたのは " + best + "日）" : "") + "</li>");
      lines.push("<li>できたやること: <b>" + done + "個</b>" + (top.length ? "（よくできたのは" + top.map(function (n) { return "「" + esc(n) + "」"; }).join("") + "）" : "") + "</li>");
    }
    if (selfStart) lines.push("<li>自分から始めた: <b>" + selfStart + "回</b></li>");
    if (grads.length) lines.push("<li>新しく「もう できる」になったこと: " + grads.map(function (g) { return "「" + esc(g.name) + "」"; }).join("") + "</li>");
    if (ready.length) lines.push('<li class="pro-suggest">' + ready.map(function (t) { return "「" + esc(t.name) + "」"; }).join("") +
      "は、もう できるかも。「がんばり項目」の「できるようになったこと」でまとめられます。</li>");
    return '<div class="pro-kid"><div class="pro-kid-name">' + kidName(k) + "</div>" +
      (lines.length ? "<ul>" + lines.join("") + "</ul>" : '<p class="note">この期間のふりかえりは、「みました」の記録がたまると出ます。</p>') +
      (lines.length ? calendar(k, r) + taskBars(k, r) : "") + trend(k) + "</div>";
  }

  // ---- グラフ（2026-11-05。まとめる 画面から 数字を 外し、ここで 見える化する）。色は オレンジ 1色、数字は 横に じかに 書く ----
  function flowerDay(k, d) {
    var e = (state.days[d] || {})[k.id];
    return !!(e && e.approved && e.result && e.result.done.length);
  }
  function weekStart() { return (state.settings || {}).weekStart === 1 ? 1 : 0; }
  // はなまるの 日の カレンダー（週は 1行、月は 曜日の 列に そろえる）
  function calendar(k, r) {
    var ws = weekStart(), names = ws ? "月火水木金土日" : "日月火水木金土", days = datesIn(r);
    var lead = (new Date(+r.from.slice(0, 4), +r.from.slice(5, 7) - 1, +r.from.slice(8, 10)).getDay() - ws + 7) % 7;
    var html = names.split("").map(function (n) { return '<span class="h">' + n + "</span>"; }).join("");
    for (var i = 0; i < lead; i++) html += "<span></span>";
    html += days.map(function (d) {
      var on = flowerDay(k, d);
      return '<span class="c' + (on ? " on" : "") + '" title="' + md(d) + (on ? " はなまる" : "") + '"><small>' + +d.slice(8, 10) + "</small>" +
        (on ? '<img src="img/hanamaru.svg" alt="はなまる">' : "") + "</span>";
    }).join("");
    return '<h4 class="pro-h">はなまるの日</h4><div class="pro-cal">' + html + "</div>";
  }
  // やることごとの できた 割合（「みました」の 日で かぞえる）。週に何回は 回数と 目安の 回数
  function taskBars(k, r) {
    var days = datesIn(r), rows = state.tasks.filter(function (t) {
      return t.active && t.repeat.type !== "once" && (t.bundle ? t.kids && t.kids[0] === k.id : !t.kids || t.kids.indexOf(k.id) >= 0);
    }).map(function (t) {
      var sched = 0, done = 0, per = t.repeat.type === "perweek";
      days.forEach(function (d) {
        if (!Api.tasksFor([t].concat(t.bundle ? state.tasks : []), k.id, d).some(function (x) { return x.id === t.id; })) return;
        sched++;
        var e = (state.days[d] || {})[k.id];
        if (e && e.approved && e.result && e.result.done.some(function (x) { return x.id === t.id; })) done++;
      });
      if (per) sched = Math.max(1, Math.round(t.repeat.n * days.length / 7));
      var ready = !t.bundle && !Api.graduatedNow(t, k.id) && Api.gradStats(state, t, k.id, state.today).ready;
      return { t: t, sched: sched, done: Math.min(done, sched), per: per, ready: ready };
    }).filter(function (x) { return x.sched > 0; })
      .sort(function (a, b) { return b.done / b.sched - a.done / a.sched; });
    if (!rows.length) return "";
    return '<h4 class="pro-h">やることごとのできた割合</h4><div class="pro-bars">' + rows.map(function (x) {
      return '<div class="pro-bar' + (x.ready ? " ready" : "") + '"><span class="nm">' + esc(x.t.name) + "</span>" +
        '<span class="bar"><i style="width:' + Math.round(x.done / x.sched * 100) + '%"></i></span>' +
        '<span class="v">' + x.done + "/" + x.sched + (x.per ? "回" : "日") + "</span>" +
        (x.ready ? '<span class="tag">もう できるかも</span>' : "") + "</div>";
    }).join("") + "</div>";
  }
  // 週ごとの はなまるの 日（さいきんの 8週。期間に かかわらず 同じ）
  function trend(k) {
    var ws = weekStart(), w = Api.weekDates(state.today, ws), cols = [];
    for (var i = 7; i >= 0; i--) {
      var d = new Date(+w[0].slice(0, 4), +w[0].slice(5, 7) - 1, +w[0].slice(8, 10) - 7 * i), wk = Api.weekDates(ymd(d), ws);
      cols.push({ from: wk[0], n: wk.filter(function (x) { return x <= state.today && flowerDay(k, x); }).length });
    }
    if (!cols.some(function (c) { return c.n; })) return "";
    return '<h4 class="pro-h">週ごとのはなまるの日（8週）</h4><div class="pro-trend">' + cols.map(function (c) {
      return '<div class="col" title="' + md(c.from) + "〜 " + c.n + '日"><b>' + c.n + '</b><span class="bar"><i style="height:' + Math.round(c.n / 7 * 100) + '%"></i></span>' +
        "<small>" + md(c.from) + "</small></div>";
    }).join("") + "</div>";
  }

  function renderReport() {
    var r = range(period), week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    $("pro-report").innerHTML = '<p class="pro-range">' + r.label + "</p>" + visibleKids().map(function (k) { return report(k, r); }).join("") +
      '<p class="pro-tip"><b>続けるこつ</b>' + TIPS[week % TIPS.length] + "</p>";
  }

  // できるようになったことへの おうちの人の コメント（子どもが 見返す 山の 段に 出る）。書きかえたら すぐ 保存する
  function renderComments() {
    var html = visibleKids().map(function (k) {
      var gs = (state.graduations || []).filter(function (g) { return g.kid === k.id && !g.back; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (!gs.length) return "";
      return '<div class="pro-kid"><div class="pro-kid-name">' + kidName(k) + "</div>" + gs.map(function (g) {
        return '<div class="pro-cmt"><div class="pro-cmt-head"><span class="pro-cmt-date">' + md(g.date) + "</span><b>" + esc(g.name) + "</b>" +
          "</div>" +
          '<textarea maxlength="100" rows="2" data-g="' + esc(g.id) + '" placeholder="例: 毎朝自分で起きられて、すごいね">' + esc(g.comment || "") + "</textarea>" +
          '<span class="pro-cmt-saved" data-saved="' + esc(g.id) + '"></span></div>';
      }).join("") + "</div>";
    }).join("");
    $("pro-comments").innerHTML = html || '<p class="note">「もう できる」にまとめたやることができると、ここにコメントを書けます。</p>';
  }
  $("pro-comments").addEventListener("change", function (ev) {
    var ta = ev.target.closest("textarea[data-g]");
    if (!ta) return;
    var note = document.querySelector('[data-saved="' + ta.dataset.g + '"]');
    Api.post("/api/parent/graduation-comment", { id: ta.dataset.g, comment: ta.value })
      .then(function () {
        note.textContent = "✓ 保存しました";
        window.dispatchEvent(new Event("board:reload"));
      })
      .catch(function (err) { note.textContent = "保存できませんでした: " + err.message; });
  });

  $("pro-period").addEventListener("change", function (ev) {
    if (ev.target.name !== "pro-period") return;
    period = ev.target.value;
    if (state) renderReport();
  });

  function renderFeatures(pro) {
    $("pro-features").innerHTML = features(esc(parentName())).map(function (f) {
      return '<li class="' + (pro ? "on" : "off") + '"><span class="pro-mark">' + (pro ? "✓" : "🔒") + "</span><div><b>" + f[0] + "</b><small>" + f[1] + "</small></div></li>";
    }).join("");
  }

  function render() {
    var pro = Api.isPro();
    $("pro-status").innerHTML = pro
      ? "<b>Pro の機能をお使いいただけます。</b>テストにご協力いただいている方は、正式に公開したあとも Pro のままお使いいただけます。"
      : "<b>Pro は準備中です。</b>いまお使いの機能は、これからも無料のままお使いいただけます。";
    $("pro-status").classList.toggle("on", pro);
    renderFeatures(pro);
    $("pro-report-group").hidden = !pro;
    $("pro-comment-group").hidden = !pro;
    Api.state().then(function (s) {
      state = s;
      renderFeatures(pro);   // おうちの人の よびかた（ママ・パパ など）
      if (!pro) return;
      $("pro-comment-title").textContent = parentName() + "からのコメント";
      var pick = document.querySelector('input[name="pro-period"][value="' + period + '"]');
      if (pick) pick.checked = true;
      renderReport();
      renderComments();
    });
  }

  window.ProPage = { render: render };
})();
