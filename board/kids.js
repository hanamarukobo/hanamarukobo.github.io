// ホームの 子どもの ボタンと「がんばりカレンダー」（子どもの 画面）。データは BoardApi（api.js）。
// 子どもは やることを チェック（かいすうの やることは ＋−）する。きょうだけで なく 先月1日 からの すぎた日も なおせる
// ママ・パパが「みました」にすると、1つでも できた日は はなまると ごほうびが つく。
// 「みました」の あとに 子どもが かえたら とりけし（もういちど みてもらう まで たさない）。
(function () {
  "use strict";

  // 子どもごとの色は せっていで えらぶ（palette.js）
  var PALETTE = window.KID_PALETTE;
  var MILESTONES = [3, 7, 14, 30, 50, 100];
  var IDLE_CLOSE_MS = 2 * 60 * 1000;

  var state = null;      // /api/state のレスポンス
  var showRewards = false; // がんばりカレンダーの 左がわに ごほうびを だしているか
  var viewDate = null;     // カレンダーで えらんだ すぎた日（null なら きょう）
  var openKid = null;    // ひらいている子の id
  // カレンダーで 見ている 月（null なら こんげつ）。さかのぼれるのは FIRST_MONTH まで
  var viewMonth = null, FIRST_MONTH = { y: 2026, mo: 0 };
  var lastTouch = Date.now();

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function load() {
    return window.BoardApi.state()
      .then(function (s) {
        state = s;
        render();
        // board.js（表示時間・低消費電力モード）にも設定を知らせる
        window.dispatchEvent(new CustomEvent("board:state", { detail: s }));
      })
      .catch(function (e) {
        console.error(e);
        if (state) return;
        // QR で ひらいた ブラウザ（iPhone など）は、番号が かわったか 置いた端末の IP が かわった とき
        $("kids").innerHTML = '<div class="offline">' + (window.BoardApi.paired || e.status === 401
          ? "置いてある端末につながりませんでした。置いてある端末の設定「使い方」の QR コードを、もう一度読み取ってください。"
          : "がんばりカレンダーに つながらないよ") + '</div>';
      });
  }

  // その日に その子に 出る やること（毎日・曜日・1回だけ。api.js の tasksFor）
  function dayTasks(kid, date) { return window.BoardApi.tasksFor(state.tasks, kid, date); }
  function yenOf(t, kid) { return window.BoardApi.yenOf(t, kid); }
  // 小さい子（ようちえん・小学1〜2年）には ひらがなの なまえが あれば そちらを みせる
  function taskName(t, kid) { return t.kana && levelOf(kid) !== "upper" ? t.kana : t.name; }
  function timeSlots() { return !!(state.settings && state.settings.timeSlots); }
  // ごぜん・ごご に わけるときは その じゅんに ならべ、見出しを はさむ
  function slotted(tasks, render) {
    if (!timeSlots()) return tasks.map(render).join("");
    return [["am", "taskAm"], ["pm", "taskPm"], [null, "taskAny"]].map(function (g) {
      var list = tasks.filter(function (t) { return (t.slot || null) === g[0]; });
      return list.length ? '<li class="slot-head">' + W(g[1]) + '</li>' + list.map(render).join("") : "";
    }).join("");
  }
  function entry(date, kid) {
    var e = (state.days[date] || {})[kid] || { checks: [], approved: false };
    e.counts = e.counts || {};
    return e;
  }

  // そのやることを なんかい やったか（チェックは 0 か 1、かいすうは ＋− の数）
  function taskCount(t, e) {
    if (t.kind === "count") return e.counts[t.id] || 0;
    return e.checks.indexOf(t.id) >= 0 ? 1 : 0;
  }

  // その日の すすみぐあい。かいすうは 1かい いじょうで「やった」。
  // 週に何回は、やった 日だけ 数に 入れる（api.js の required）
  function progress(kid, e, date) {
    var tasks = dayTasks(kid, date).filter(function (t) { return window.BoardApi.required(t, e); });
    var done = tasks.filter(function (t) { return taskCount(t, e) > 0; }).length;
    return { done: done, total: tasks.length };
  }
  // ボタンの「きょう」「こんげつ」の 行。できた 数だけ はなまるを ならべる。
  // 1行に はいらない ときは fitDone が 数字（💮×4）に かえる（data-num）
  function tally(label, n) {
    var marks = "";
    for (var i = 0; i < n; i++) marks += '<i class="on">' + ICON("hanamaru") + '</i>';
    return '<span class="tally' + (label === "tallyMonth" ? " tally-month" : "") + '" data-num="' + n + '"><span class="tl">' + W(label) + '</span><span class="dots">' +
      (n ? marks : '<b class="num">0</b>') + '</span></span>';
  }
  // きょう: できた やること 1つに はなまる 1こ（「みました」の あとは その ときの けっか）
  function todayDone(kid, e, r, date) {
    if (!dayTasks(kid, date).length) return "";
    return tally("tallyToday", r ? r.done : progress(kid, e, date).done);
  }
  // 1行に はいらない しるしは 数字に（💮×4）、はみだす ときは 字を 小さく。
  // それでも ボタンに おさまらない ときは、みんなの ボタンを そろえて 行を 小さく → こんげつ → きょう の じゅんに けす
  function fitDone(box) {
    var btns = Array.prototype.slice.call(box.querySelectorAll(".kid-btn"));
    function over() {
      return box.scrollHeight > box.clientHeight + 1 || btns.some(function (b) { return b.scrollHeight > b.clientHeight + 1; });
    }
    function fitRows() {
      Array.prototype.forEach.call(box.querySelectorAll(".tally"), function (t) {
        var d = t.querySelector(".dots"), first = d.firstElementChild;
        if (first && first.tagName === "I" && d.offsetHeight > first.offsetHeight * 1.5) d.innerHTML = '<b class="num">' + ICON("hanamaru") + "×" + t.dataset.num + '</b>';
        if (t.scrollWidth > t.clientWidth + 1) t.classList.add("tight");
      });
    }
    fitRows();
    if (!over()) return;
    box.classList.add("tally-small");
    fitRows();
    [".tally.tally-month", ".tally"].forEach(function (sel) {
      if (over()) Array.prototype.forEach.call(box.querySelectorAll(sel), function (t) { t.remove(); });
    });
  }
  function findKid(id) {
    for (var i = 0; i < state.kids.length; i++) if (state.kids[i].id === id) return state.kids[i];
    return state.kids[0];
  }
  // 「表示しない」にした子は 記録だけ のこして ボタンを ださない
  function visibleKids() { return state.kids.filter(function (k) { return k.active !== false; }); }
  function colors(id) { return PALETTE[findKid(id).color] || PALETTE.purple; }

  // ごほうびの たんい（せっていで 円 / ポイント を えらぶ。なかの かずは おなじ）
  function isPoint() { return !!(state && state.settings && state.settings.unit === "point"); }
  function unit(n) { return W(isPoint() ? "point" : "yen", { n: n }); }

  // 子どもに見せる ことば（words.js）。L は いま かいている ところの だんかい
  //   トップの ボタン・がんばりカレンダー: その子 / みんなの もくひょう: いちばん小さい子
  var L = "lower";
  function W(key, vars) {
    var parent = (state && state.settings && state.settings.parentName) || "ママ・パパ";
    return window.Words.t(key, L, Object.assign({ parent: parent }, vars || {}));
  }
  function ICON(name) { return window.Words.icon(name); }
  function levelOf(id) { return findKid(id).level || "lower"; }
  function boardLevel() { return window.Words.youngest(state.kids); }
  function activeRewards() { return (state.rewards || []).filter(function (r) { return r.active; }); }

  // ママ・パパが みた日の ごほうびの ごうけい（since いこうの日だけ）
  function earned(kid, since) {
    var total = 0;
    Object.keys(state.days).forEach(function (d) {
      if (since && d < since) return;
      var r = result(d, kid);
      if (r) total += r.yen;
    });
    return total;
  }
  // ためた ポイント ＝ もらった ぶん − こうかんした ぶん
  function balance(kid) {
    return (state.exchanges || []).reduce(function (sum, x) {
      return x.kid === kid ? sum - x.points : sum;
    }, earned(kid));
  }

  // いま めざしている みんなの もくひょう（たっせい していない さいしょの もの）
  function currentGoal() {
    return (state.goals || []).filter(function (g) { return !g.done; })[0] || null;
  }
  function goalProgress(g) {
    var parts = state.kids.map(function (k) { return { kid: k, n: earned(k.id, g.start) }; });
    var sum = parts.reduce(function (a, p) { return a + p.n; }, 0);
    return { parts: parts, sum: sum, reached: sum >= g.target };
  }

  // 子どもが チェックを なおせる 日: きょうと、先月1日 からの すぎた日（api.js の kidDate と おなじ）。
  //   みました の あとに 直したら、みました は 取り消し（api.js の unapprove）
  function editFrom() { var n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)); }
  function kidEditable(kid, day, e) {
    return day >= editFrom() && day <= ymd(new Date());
  }

  // ママ・パパが みた日の けっか
  function result(date, kid) {
    var e = entry(date, kid);
    if (!e.approved || !e.result) return null;
    var r = e.result;
    return { done: r.done.length, total: r.total, yen: r.yen, flower: r.done.length > 0 };
  }

  function monthStats(kid, now) {
    // now は その月の どこかの日（カレンダーからは 1日）。かぞえるのは きょう までの 日
    var month = ymd(now).slice(0, 7), today = ymd(new Date()), yen = 0, flowers = 0, done = 0;
    Object.keys(state.days).forEach(function (d) {
      if (d.slice(0, 7) !== month || d > today) return;
      var r = result(d, kid);
      // できた 数: 「みました」の 日は その ときの けっか、まだの 日は いまの チェック
      done += r ? r.done : progress(kid, entry(d, kid), d).done;
      if (!r) return;
      yen += r.yen;
      if (r.flower) flowers++;
    });
    return { yen: yen, flowers: flowers, done: done };
  }

  // はなまるが つづいた日数。きょうが まだなら きのうまでで かぞえる
  function streak(kid, now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var r = result(ymd(d), kid);
    if (!r || !r.flower) d.setDate(d.getDate() - 1);
    var n = 0;
    for (;;) {
      r = result(ymd(d), kid);
      if (!r || !r.flower) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---- トップの ボタン ----
  // 人数と なまえの ながさで、はいる かたちを えらぶ
  //   big: 大きいボタン（2人まで） / row: よこならびの小さいボタン（4人まで） / icon: まるいアイコン（はいらなければ よこスワイプ）
  var FONT = { big: [30, 18], row: [24, 14], icon: [22, 12] };
  var lastHtml = "";

  function fitNames(box, mode) {
    var ok = true;
    Array.prototype.forEach.call(box.querySelectorAll(".name"), function (el) {
      var size = FONT[mode][0];
      el.style.fontSize = size + "px";
      while (el.scrollWidth > el.clientWidth && size > FONT[mode][1]) {
        size -= 2;
        el.style.fontSize = size + "px";
      }
      if (el.scrollWidth > el.clientWidth) ok = false;
    });
    return ok;
  }

  function layoutKids(box, n) {
    var modes = n <= 2 ? ["big", "row", "icon"] : n <= 4 ? ["row", "icon"] : ["icon"];
    box.style.setProperty("--n", n);
    for (var i = 0; i < modes.length; i++) {
      box.className = "kids mode-" + modes[i];
      if (fitNames(box, modes[i])) return;
    }
  }

  function render() {
    if (!state) return;
    var now = new Date(), today = ymd(now), kids = visibleKids();
    var html = kids.map(function (k) {
      L = levelOf(k.id);
      var c = colors(k.id), e = entry(today, k.id), r = result(today, k.id), m = monthStats(k.id, now);
      var p = progress(k.id, e, today);
      var nGrad = gradsOf(k.id).length, badge, text, cls = "kid-btn", tier = gradTier(nGrad);
      if (tier) cls += " grad-" + tier;
      if (r) {
        badge = r.flower ? ICON("hanamaru") : "⭕";
        // はなまるが つづいた 日数（きょうを ふくむ）で ことばを かえる
        var run = r.flower ? streak(k.id, now) : 0;
        text = !r.flower ? W("stDone", { n: r.done }) : W(run >= 7 ? "stFlowerDaily" : run >= 2 ? "stFlowerAgain" : "stFlower");
        cls += " done";
      } else if (p.total > 0 && p.done >= p.total) {
        badge = ICON("hourglass");
        text = W("stShow");
      } else {
        badge = ICON("bell");
        text = p.done ? W("stLeft", { n: p.total - p.done }) : W("stNotYet");
      }
      return '<button class="' + cls + '" data-kid="' + k.id + '" style="--kid:' + c.main + '">' +
        '<span class="badge">' + badge + '</span>' +
        (nGrad ? '<span class="title-badge">' + STAIRS + '<b>' + nGrad + '</b></span>' : "") +
        '<span class="name">' + esc(k.name) + (k.honor ? '<small class="honor">' + esc(k.honor) + '</small>' : "") + '</span>' +
        '<span class="state">' + text + '</span>' +
        todayDone(k.id, e, r, today) +
        tally("tallyMonth", m.done) +
        '</button>';
    }).join("");
    // 30びょうごとの よみなおしで かわっていなければ かきなおさない（でんきを へらす）
    if (html !== lastHtml) {
      lastHtml = html;
      $("kids").innerHTML = html;
      layoutKids($("kids"), kids.length);
      fitDone($("kids"));
    }
    renderGoalPill();
    if (openKid) renderKidView();
    if (!$("goal-view").hidden) renderGoalView();
  }

  // ---- できるようになったこと（「もう できる」に まとめた やること）----
  // まとめるのは おうちの人が がんばり管理で きめる（api.js の /api/parent/graduate）。ここは 見せるだけ。
  // やることに もどした もの（back）は 出さない
  var SEEN_KEY = "grad:seen", gradKid = null;
  // 称号の しるし: 緑の 3だんの かいだんの 上に はなまる（はなまるは アプリの アイコンと おなじ 形）。ホームの 名前の 横と 子どもの 画面に 出す
  //   img/title-stairs.svg は tools/dev/cut-icons.py が 作る（ChatGPT の 階段の 絵＋hanamaru.svg）
  var STAIRS = '<img class="stairs" src="img/title-stairs.svg" alt="" draggable="false">';
  function gradsOf(kid) {
    return ((state && state.graduations) || []).filter(function (g) { return g.kid === kid && !g.back && /^\d{4}-\d{2}-\d{2}$/.test(g.date); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  // ホームの ボタンの 枠: 1〜2こ / 3〜5こ / 6こ いじょう
  function gradTier(n) { return n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0; }
  function gradName(g) { return g.kana && levelOf(g.kid) !== "upper" ? g.kana : g.name; }
  function seenGrads() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch (e) { return []; }
  }
  function markSeen(ids) {
    var s = seenGrads().concat(ids.filter(function (id) { return seenGrads().indexOf(id) < 0; }));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-200))); } catch (e) { /* おぼえられなくても よい */ }
  }
  // Pro は 段の 地図（stairs.js）。無料は 段の 一覧（まとめた ときの おいわいだけ 出る）
  function isPro() { return window.BoardApi.isPro(); }
  var gradMap = null;
  function openGradView(kid, hello) {
    gradKid = kid;
    $("grad-view").style.setProperty("--kid", colors(kid).main);
    $("grad-view").style.setProperty("--kid-soft", colors(kid).soft);
    $("grad-view").classList.toggle("map", isPro());
    $("grad-view").hidden = false;
    if (isPro()) renderGradMap(hello);
    else renderGradView(hello);
    if (hello) confetti($("grv-confetti"));
  }
  function closeGradView() {
    if (gradMap) gradMap.stop();
    gradMap = null;
    gradKid = null;
    $("grad-view").hidden = true;
  }
  function renderGradMap(hello) {
    L = levelOf(gradKid);
    var k0 = findKid(gradKid), name = esc(k0.name) + (k0.honor ? '<small class="honor">' + esc(k0.honor) + '</small>' : "");
    var gs = gradsOf(gradKid);
    $("grv-hello").hidden = true;
    $("grv-title").innerHTML = W("gradTitle", { name: name });
    $("grv-count").textContent = gs.length ? W("gradSteps", { n: gs.length }) : "";   // 0こ のときは 地図の 空の カードに「できる ことを ふやそう！」
    var fresh = hello ? gs.map(function (g) { return g.id; }).indexOf(hello.id) : -1;
    if (gradMap) gradMap.stop();
    gradMap = null;
    // 枠の 大きさが きまってから かく（ひらいた すぐは 高さが ちがい、段が 下に 切れていた）
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (!gradKid || $("grad-view").hidden) return;
      drawGradMap(gs, fresh, true);
    }); });
  }
  function drawGradMap(gs, fresh, animate) {
    L = levelOf(gradKid);
    gradMap = window.StairsMap.render($("grv-map"), {
      items: gs.map(function (g) {
        // 本人の 感想（g.note）は 出さない（2026-11-05 に 感想の 欄を なくした。前の 感想は データに のこるだけ）
        return { date: W("gradDate", { m: +g.date.slice(5, 7), d: +g.date.slice(8, 10) }), name: gradName(g), comment: g.comment || "" };
      }),
      pick: fresh, fresh: fresh, animate: animate,
      text: { recent: W("gradRecent"), fresh: W("gradFresh"), from: W("gradFrom"), empty: W("gradEmpty") },
    });
  }
  // 階段: いちばん 新しい ものが 右上。古い ものほど 左下
  function renderGradView(hello) {
    L = levelOf(gradKid);
    var k0 = findKid(gradKid), name = esc(k0.name) + (k0.honor ? '<small class="honor">' + esc(k0.honor) + '</small>' : "");
    var gs = gradsOf(gradKid).reverse(), top = Math.min(gs.length - 1, 6);
    $("grv-hello").hidden = !hello;
    if (hello) $("grv-hello").innerHTML = '<b>' + W("gradCongrats") + '</b>' + W("gradNew", { task: esc(gradName(hello)) });
    $("grv-title").innerHTML = W("gradTitle", { name: name });
    $("grv-count").textContent = gs.length ? W("gradSteps", { n: gs.length }) : W("gradEmpty");
    $("grv-steps").innerHTML = gs.map(function (g, i) {
      return '<li style="--i:' + Math.max(0, top - i) + '"' + (hello && g.id === hello.id ? ' class="new"' : '') + '>' +
        '<span class="st-date">' + W("gradDate", { m: +g.date.slice(5, 7), d: +g.date.slice(8, 10) }) + '</span>' +
        '<span class="st-name">' + esc(gradName(g)) + '</span></li>';
    }).join("");
  }
  // 無料は 数を 見せる バッジ（押しても なにも おきない）。Pro は 段の 地図を ひらく
  $("kv-grad").addEventListener("click", function () { if (isPro()) openGradView(openKid, null); });
  $("grv-close").addEventListener("click", closeGradView);
  $("grad-view").addEventListener("click", function (ev) { if (ev.target === $("grad-view")) closeGradView(); });

  // ---- みんなの もくひょう ----
  function renderGoalPill() {
    var g = currentGoal(), pill = $("goal-pill");
    L = boardLevel();
    pill.hidden = !g;
    if (!g) return;
    var p = goalProgress(g), pct = Math.min(100, Math.round(p.sum / g.target * 100));
    var html = '<span class="gp-icon">' + ICON("family-goal") + '</span>' +
      (p.reached ? '<span class="gp-text">' + W("goalDoneShort") + '</span>'
        : '<span class="gp-bar"><span style="width:' + pct + '%"></span></span><span class="gp-text">' + pct + '%</span>');
    if (pill.innerHTML !== html) pill.innerHTML = html;
    pill.classList.toggle("reached", p.reached);
  }
  $("goal-pill").addEventListener("click", function () {
    $("goal-view").hidden = false;
    renderGoalView();
  });
  $("gv-close").addEventListener("click", function () { $("goal-view").hidden = true; });
  // まわりの くらい ところを タップしても とじる
  $("goal-view").addEventListener("click", function (ev) {
    if (ev.target === $("goal-view")) $("goal-view").hidden = true;
  });

  function renderGoalView() {
    var g = currentGoal();
    if (!g) { $("goal-view").hidden = true; return; }
    var p = goalProgress(g);
    L = boardLevel();
    $("gv-icon").innerHTML = ICON("family-goal");
    $("gv-title").textContent = W("goalTitle", { title: g.title });
    // バーは 子どもごとの いろで つみあげる
    $("gv-bar").innerHTML = p.parts.filter(function (x) { return x.n > 0; }).map(function (x) {
      return '<span style="width:' + Math.min(100, x.n / g.target * 100) + '%;background:' + colors(x.kid.id).main + '"></span>';
    }).join("");
    $("gv-left").innerHTML = p.reached
      ? W("goalDone")
      : unit(p.sum) + ' / ' + unit(g.target) + '<br><b>' + W("goalLeft", { x: unit(g.target - p.sum) }) + '</b>';
    $("gv-kids").innerHTML = p.parts.filter(function (x) { return x.kid.active !== false || x.n > 0; }).map(function (x) {
      return '<li style="--kid:' + colors(x.kid.id).main + '"><span class="dot"></span>' + esc(x.kid.name) +
        '<b>' + unit(x.n) + '</b></li>';
    }).join("");
  }

  $("kids").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".kid-btn");
    if (!btn) return;
    // 名前の 左上の 称号（かいだん）は「できるようになったこと」へ じかに とぶ
    if (ev.target.closest(".title-badge")) openGradView(btn.dataset.kid, freshGrad(btn.dataset.kid));
    else openKidView(btn.dataset.kid);
  });

  // ---- がんばりカレンダー ----
  function openKidView(kid) {
    openKid = kid;
    var c = colors(kid);
    var view = $("kid-view");
    view.style.setProperty("--kid", c.main);
    view.style.setProperty("--kid-soft", c.soft);
    view.hidden = false;
    renderKidView();
    // 「もう できる」に まとめた あと はじめて ひらいたら おいわい（この 端末で まだ 見せていない、7日 いないの もの）。読みなおした あとで きめる
    load().then(function () {
      if (openKid !== kid || gradKid) return;
      var hello = freshGrad(kid);
      if (hello) openGradView(kid, hello);
    });
  }
  // まだ この 端末で 見せていない、7日 いないの できるようになったこと（おいわいに だす。見せたら おぼえる）
  function freshGrad(kid) {
    var from = ymd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), seen = seenGrads();
    var fresh = gradsOf(kid).filter(function (g) { return g.date >= from && seen.indexOf(g.id) < 0; });
    if (!fresh.length) return null;
    markSeen(fresh.map(function (g) { return g.id; }));
    return fresh[fresh.length - 1];
  }

  function closeKidView() {
    closeBundle();
    openKid = null;
    showRewards = false;
    viewDate = null;
    viewMonth = null;
    $("kid-view").hidden = true;
  }
  $("kv-close").addEventListener("click", closeKidView);

  // ◀ ▶ で 月を かえる（FIRST_MONTH から らいげつ まで。らいげつは みるだけ）。月を かえたら えらんだ 日は もどす
  function moveMonth(step) {
    var now = new Date(), cur = viewMonth || { y: now.getFullYear(), mo: now.getMonth() };
    var n = cur.y * 12 + cur.mo + step, first = FIRST_MONTH.y * 12 + FIRST_MONTH.mo, thisMonth = now.getFullYear() * 12 + now.getMonth();
    if (n < first || n > thisMonth + 1) return;
    viewMonth = n === thisMonth ? null : { y: Math.floor(n / 12), mo: n % 12 };
    viewDate = null;
    renderKidView();
  }
  // 月が かわったら すべって 入ってくる（左へ スワイプ・▶ なら 右から）
  function slideMonth(step) {
    var g = $("kv-grid");
    g.classList.remove("slide-next", "slide-prev");
    void g.offsetWidth;
    g.classList.add(step > 0 ? "slide-next" : "slide-prev");
  }
  function canMoveMonth(step) { return !showRewards && !$(step > 0 ? "kv-next" : "kv-prev").disabled; }
  function stepMonth(step) {
    if (!canMoveMonth(step)) return;
    moveMonth(step);
    slideMonth(step);
  }
  $("kv-prev").addEventListener("click", function () { stepMonth(-1); });
  $("kv-next").addEventListener("click", function () { stepMonth(1); });
  // カレンダーを 左右に スワイプしても 月が かわる（swipe.js の BoardSwipe。うごかす あいだは 指に ついて くる）
  if (window.BoardSwipe) window.BoardSwipe(document.querySelector(".kv-cal"), stepMonth, function () { return [$("kv-grid")]; }, canMoveMonth);

  function renderKidView() {
    var kid = openKid, now = new Date(), today = ymd(now);
    var k0 = findKid(kid), name = esc(k0.name) + (k0.honor ? '<small class="honor">' + esc(k0.honor) + '</small>' : "");
    // ごほうびの こうかんは ポイントの ときだけ
    var hasRewards = isPoint() && activeRewards().length > 0;
    if (!hasRewards) showRewards = false;
    L = levelOf(kid);
    $("kv-title").innerHTML = W("kvTitle", { name: name });

    var s = streak(kid, now), next = MILESTONES.filter(function (m) { return m > s; })[0];
    $("kv-streak").innerHTML = s > 0
      ? '<span class="hot">' + W("streak", { n: s }) + '</span>' + (next ? W("streakNext", { k: next - s, m: next }) : '')
      : W("streakStart");
    var gs = gradsOf(kid);
    $("kv-grad").hidden = false;   // 0この ときも かいだんだけ 出す
    $("kv-grad").innerHTML = STAIRS + (gs.length ? W("gradBtn", { n: gs.length }) : "");
    $("kv-grad").classList.toggle("badge", !isPro());
    $("kv-grad").tabIndex = isPro() ? 0 : -1;

    // カレンダー
    var y = viewMonth ? viewMonth.y : now.getFullYear(), mo = viewMonth ? viewMonth.mo : now.getMonth();
    var past = !!viewMonth;
    $("kv-month").textContent = y !== now.getFullYear() ? W("yearMonth", { y: y, m: mo + 1 }) : W("month", { m: mo + 1 });
    $("kv-prev").disabled = y * 12 + mo <= FIRST_MONTH.y * 12 + FIRST_MONTH.mo;
    $("kv-next").disabled = y * 12 + mo > now.getFullYear() * 12 + now.getMonth();
    $("kv-add").hidden = past;
    // 週の始まり（0=日曜, 1=月曜）は ママ・パパの設定ページで かえられる
    var ws = (state.settings && state.settings.weekStart) === 1 ? 1 : 0;
    var html = "";
    for (var c = 0; c < 7; c++) {
      var dow = (c + ws) % 7;
      html += '<div class="wd' + (dow === 0 ? " sun" : dow === 6 ? " sat" : "") + '">' + W("weekdaysShort")[dow] + '</div>';
    }
    var first = (new Date(y, mo, 1).getDay() - ws + 7) % 7, days = new Date(y, mo + 1, 0).getDate();
    for (var b = 0; b < first; b++) html += '<div class="kv-cell blank"></div>';
    for (var d = 1; d <= days; d++) {
      var key = y + "-" + pad(mo + 1) + "-" + pad(d), r = result(key, kid), e = entry(key, kid);
      var cls = "kv-cell" + (key === today ? " is-today" : key > today ? " future" : "") + (key === viewDate ? " is-selected" : ""), mark = "";
      if (r && r.flower) mark = '<span class="flower">' + ICON("hanamaru") + '</span>';
      else if (!r && key <= today && progress(kid, e, key).done) mark = '<span class="wait">' + ICON("hourglass") + '</span>';
      // タップすると その日の やることが ひらく（すぎた日は チェックを なおせる。あしたから さきは みるだけ）
      html += '<div class="' + cls + '" data-date="' + key + '"><span class="d">' + d + '</span>' + mark + '</div>';
    }
    $("kv-grid").innerHTML = html;
    var m = monthStats(kid, new Date(y, mo, 1));
    $("kv-total").classList.toggle("point", isPoint());
    if (isPoint()) {
      $("kv-total").innerHTML = '<span class="yen">' + W(past ? "pastPoint" : "monthPoint", { m: mo + 1, x: unit(m.yen) }) + '</span>' +
        (hasRewards
          ? '<button class="kv-reward-btn" id="kv-reward-btn">' + (showRewards ? W("toCalendar") : W("saved", { x: unit(balance(kid)) })) + '</button>'
          : '<span class="count">' + W("flowerCount", { n: m.flowers }) + '</span>');
    } else {
      $("kv-total").innerHTML = '<span class="yen">' + W(past ? "pastReward" : "monthReward", { m: mo + 1, x: unit(m.yen) }) + '</span>' +
        '<span class="count">' + W("flowerCount", { n: m.flowers }) + '</span>';
    }
    if (showRewards) $("kv-month").innerHTML = W("savedTitle", { x: unit(balance(kid)) });
    $("kv-prev").hidden = $("kv-next").hidden = showRewards;
    $("kv-grid").hidden = showRewards;
    $("kv-rewards").hidden = !showRewards;
    if (showRewards) renderRewards(kid);

    $("kv-add").textContent = W("addOnce");
    // きょう、または カレンダーで えらんだ 日の やること（あしたから さきは みるだけ）
    var day = viewDate || today, isToday = day === today, future = day > today;
    var e0 = entry(day, kid), r0 = result(day, kid), tasks = dayTasks(kid, day), p0 = progress(kid, e0, day);
    var edit = kidEditable(kid, day, e0), lock = edit ? "" : " locked";
    var dt = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
    $("kv-todo-title").innerHTML = isToday ? W("todoTitle") : W(future ? "futureTitle" : "dayTitle", { m: dt.getMonth() + 1, d: dt.getDate() });
    if (!edit && r0) {
      // なおせない みた日は、みた ときに きろくした なかみ（その あと やることや ねだんを かえても そのまま）
      $("kv-progress").innerHTML = r0.total ? W("progress", { t: r0.total, d: r0.done }) : "";
      $("kv-list").innerHTML = e0.result.done.map(function (x) {
        var n = x.count || 1;
        return '<li class="done locked"><span class="box">' + ICON("hanamaru") + '</span>' +
          '<span class="name">' + esc(x.name) + (n > 1 ? ' <span class="per">×' + n + '</span>' : "") + '</span>' +
          '<span class="money">' + unit(x.yen * n) + '</span></li>';
      }).join("");
    } else {
      $("kv-progress").innerHTML = p0.total && !future ? W("progress", { t: p0.total, d: p0.done }) : "";
      $("kv-list").innerHTML = listHtml();
    }
    function listHtml() { return slotted(tasks, function (t) {
      var n = taskCount(t, e0), cls = (n > 0 ? "done" : "") + lock, yen = yenOf(t, kid);
      var name = esc(taskName(t, kid)) + (t.repeat.type === "once" ? '<span class="once">' + W("todayOnly") + '</span>' : "");
      if (t.repeat.type === "perweek") {
        // 週に何回: のこりの 回数。ほかの 日で とどいた 週は「こんしゅう できた」で おせない
        var other = window.BoardApi.weekDone(state, t, kid, day, day), left = t.repeat.n - other - n;
        if (!n && other >= t.repeat.n) {
          return '<li class="done locked weekdone" data-task="' + t.id + '"><span class="box">' + ICON("hanamaru") + '</span>' +
            '<span class="name">' + esc(taskName(t, kid)) + '<span class="once week">' + W("weekDone") + '</span></span>' +
            '<span class="money"></span></li>';
        }
        name += '<span class="once week">' + (left > 0 ? W("weekLeft", { n: left }) : W("weekDone")) + '</span>';
      }
      // 「もう できる」: 押すと 中身の 一覧（openBundle）。そこで「ぜんぶ できた！」を 押すと 1つと かぞえる
      if (t.bundle) {
        name = STAIRS + name + '<span class="bundle-peek">' + W("bundlePeek", { n: window.BoardApi.bundleItems(state.tasks, kid, day).length }) + ' ▸</span>';
        cls += " bundle";
      }
      if (t.kind === "count") {
        // かいすう: ＋− で かぞえる。ごほうびは きんがく × かいすう
        return '<li class="count ' + cls + '" data-task="' + t.id + '">' +
          '<span class="name">' + name + '<span class="per">' + unit(yen) + ' × ' + n + ' = ' + unit(yen * n) + '</span></span>' +
          '<span class="stepper">' +
          '<button class="minus" data-delta="-1"' + (!edit || n <= 0 ? " disabled" : "") + '>−</button>' +
          '<span class="num">' + n + '</span>' +
          '<button class="plus" data-delta="1"' + (!edit || n >= 99 ? " disabled" : "") + '>＋</button>' +
          '</span></li>';
      }
      // 「いまから やる」: きょうの まだ できて いない やることに。押したら そのやることに 火の しるし（できたら「じぶんから はじめた」）
      var started = (e0.starts || []).indexOf(t.id) >= 0;
      if (started) cls += " started";
      var go = isToday && edit && !n && !started ? '<button class="go" data-go="1">' + W("goBtn") + '</button>' : "";
      return '<li class="' + cls + '" data-task="' + t.id + '">' +
        '<span class="box">' + (n > 0 ? ICON("hanamaru") : started ? ICON("streak-fire") : "") + '</span>' +
        '<span class="name">' + name + (n > 0 && started ? '<span class="self">' + ICON("streak-fire") + '</span>' : "") + '</span>' +
        go + '<span class="money">' + unit(yen) + '</span>' +
        '</li>';
    }); }

    var st = $("kv-status"), left = p0.total - p0.done, msg;
    st.className = "kv-status" + (r0 ? " ok" : "");
    if (r0) msg = (r0.flower ? ICON("hanamaru") + " " : "⭕ ") + W("stOk", { x: unit(r0.yen) });
    else if (future) msg = W("futureLook");
    else if (!isToday) msg = W(p0.done ? "pastWaiting" : edit ? "pastNone" : "pastLocked");
    else if (p0.total && left <= 0) msg = W("stAll");
    else if (p0.done) msg = esc(W("stCheer", { n: left }));
    else msg = esc(W("stStart"));
    var act = "";
    // 1台で 使うときは、ここで おうちの人が「みました」を おす（鍵を たしかめてから）。1つも できていない ときは 出さない
    if (e0.approved || (p0.total && p0.done)) {
      act = e0.approved
        ? '<button class="kv-undo" id="kv-undo">' + W("approveUndo") + '</button>'
        : '<button class="kv-approve" id="kv-approve">' + W("approveBtn") + '</button>';
    }
    // すぎた日・すぎた月を 見ている ときは「きょうに もどる」
    var back = isToday && !viewMonth ? "" : '<button class="kv-back-today" id="kv-back-today">' + W("backToday") + '</button>';
    st.innerHTML = '<span>' + msg + '</span>' + back + act;
    moreArrows();
  }

  // やることの 一覧の 上・下に まだ ある ときは 矢印を 出す（スクロール できる ことを 子どもにも わかるように）
  function moreArrows() {
    var l = $("kv-list");
    $("kv-more-up").hidden = l.scrollTop <= 4;
    $("kv-more-down").hidden = l.scrollTop + l.clientHeight >= l.scrollHeight - 4;
  }
  $("kv-list").addEventListener("scroll", moreArrows);
  $("kv-more-up").addEventListener("click", function () { var l = $("kv-list"); l.scrollBy({ top: -l.clientHeight * 0.7, behavior: "smooth" }); });
  $("kv-more-down").addEventListener("click", function () { var l = $("kv-list"); l.scrollBy({ top: l.clientHeight * 0.7, behavior: "smooth" }); });

  // 「みました」を 子どもの 画面で おせる 端末。データが この端末に ある とき（置いた端末・スマホだけ。鍵を たしかめてから）と、
  // おうちの人の べつの 端末（つないだ スマホ・番号つきの ブラウザ。鍵は きかない）。
  // 2台で 置いた端末にも 出す（おうちの人の スマホが 手もとに ない ときの ため。鍵を すすめる）。どの 端末でも 押せる
  // date の 日の「みました」（on）／とりけし。すぎた 日の みわすれにも つかう
  function approve(on, date) {
    var kid = openKid, day = date || ymd(new Date());
    window.ParentLock.ask(function () {
      var e = entry(day, kid);
      window.BoardApi.post("/api/parent/day", { date: day, kid: kid, checks: e.checks, counts: e.counts || {}, approved: on })
        .then(function () { if (on) confetti(); return load(); })
        .catch(function (err) { console.error(err); });
    });
  }

  $("kv-grid").addEventListener("click", function (ev) {
    var cell = ev.target.closest("[data-date]");
    if (!cell || !openKid) return;
    var today = ymd(new Date());
    viewDate = cell.dataset.date === today || cell.dataset.date === viewDate ? null : cell.dataset.date;
    renderKidView();
  });
  $("kv-status").addEventListener("click", function (ev) {
    if (ev.target.closest("#kv-approve")) return approve(true, viewDate);
    if (ev.target.closest("#kv-undo")) return approve(false, viewDate);
    if (!ev.target.closest("#kv-back-today")) return;
    viewDate = null;
    viewMonth = null;
    renderKidView();
  });

  // ためた ポイントで こうかん できる ごほうび。こうかんは ママ・パパが きろくする。
  // 絵は どれも ごほうびの 箱（端末で 絵が かわる 絵文字は つかわない。前の データの icon は 出さない）
  function renderRewards(kid) {
    var bal = balance(kid);
    $("kv-rewards").innerHTML = activeRewards().map(function (r) {
      var ok = bal >= r.points, pct = Math.max(0, Math.min(100, Math.round(bal / r.points * 100)));
      return '<li class="' + (ok ? "ok" : "") + '">' +
        '<span class="icon">' + ICON("gift") + '</span>' +
        '<span class="body"><span class="name">' + esc(r.name) + '<small>' + unit(r.points) + '</small></span>' +
        '<span class="bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="hint">' + (ok ? W("canExchange") : W("needMore", { x: unit(r.points - bal) })) + '</span></span>' +
        '</li>';
    }).join("");
  }

  $("kv-total").addEventListener("click", function (ev) {
    if (!ev.target.closest("#kv-reward-btn")) return;
    showRewards = !showRewards;
    renderKidView();
  });

  // なおせない 日は 下の ひとことを ゆらして しらせる
  function nudgeStatus() {
    var st = $("kv-status");
    st.classList.remove("nudge");
    void st.offsetWidth;
    st.classList.add("nudge");
  }
  $("kv-list").addEventListener("click", function (ev) {
    var li = ev.target.closest("li[data-task]");
    if (!li || !openKid || li.classList.contains("weekdone")) return;
    // 「もう できる」は 中身の 一覧を ひらく（なおせない 日も 見るだけ できる）
    if (li.classList.contains("bundle")) return openBundle(li.dataset.task);
    var kid = openKid, today = viewDate || ymd(new Date()), e = entry(today, kid);
    if (!kidEditable(kid, today, e)) return nudgeStatus();
    var id = li.dataset.task;
    if (ev.target.closest("button.go")) return startTask(id);
    if (li.classList.contains("count")) {
      var btn = ev.target.closest("button");
      if (!btn || btn.disabled) return;
      changeTask(id, null, parseInt(btn.dataset.delta, 10));
    } else {
      changeTask(id, e.checks.indexOf(id) < 0, 0);
    }
  });
  // チェック（done）か かいすう（delta）を かえる。先に画面を かえてから サーバーに おくる
  function changeTask(id, done, delta) {
    var kid = openKid, today = viewDate || ymd(new Date()), e = entry(today, kid);
    var before = progress(kid, e, today).done, url, body;
    // 日付は すぎた日の ときだけ おくる（きょうの ぶんは まえの 版の 置いた端末とも つながる）
    var date = viewDate ? { date: today } : {};
    if (delta) {
      e.counts[id] = Math.max(0, Math.min(99, (e.counts[id] || 0) + delta));
      url = "/api/kid/count";
      body = Object.assign({ kid: kid, taskId: id, delta: delta }, date);
    } else {
      e.checks = e.checks.filter(function (x) { return x !== id; });
      if (done) e.checks.push(id);
      url = "/api/kid/check";
      body = Object.assign({ kid: kid, taskId: id, done: done }, date);
    }
    // 「みました」の あとに かえたら とりけす（かってに ふやせないように。もういちど みてもらう）
    e.approved = false;
    delete e.result;
    state.days[today] = state.days[today] || {};
    state.days[today][kid] = e;
    renderKidView();
    render();
    var p = progress(kid, e, today);
    if (p.total && p.done >= p.total && before < p.total) confetti();

    window.BoardApi.post(url, body).then(load, load);
  }

  // 「いまから やる」: 演出を 見せて、その やることに 火の しるしを つける（ポイントは かわらない。きょうだけ）
  //   演出は ことばを 出さず 絵と うごきで（近くの おうちの人に「いまから やるね」と 言う きっかけにも）
  function startTask(id) {
    var kid = openKid, day = ymd(new Date()), e = entry(day, kid);
    e.starts = (e.starts || []).filter(function (x) { return x !== id; }).concat([id]);
    state.days[day] = state.days[day] || {};
    state.days[day][kid] = e;
    renderKidView();
    goBurst();
    window.BoardApi.post("/api/kid/start", { kid: kid, taskId: id }).then(load, load);
  }
  function goBurst() {
    var box = $("kv-go");
    var low = document.body.classList.contains("lowpower"), html = '<div class="go-flash"></div>';
    if (!low) {
      for (var i = 0; i < 12; i++) html += '<span class="go-ray" style="--a:' + i * 30 + 'deg"></span>';
      for (i = 0; i < 10; i++) html += '<span class="go-star" style="--a:' + (i * 36 + 18) + 'deg;animation-delay:' + (0.15 + (i % 3) * 0.06) + 's">' + ICON("point-star") + '</span>';
    }
    html += '<span class="go-fire">' + ICON("streak-fire") + '</span>';
    box.innerHTML = html;
    box.hidden = false;
    clearTimeout(goBurst.t);
    goBurst.t = setTimeout(function () { box.hidden = true; box.innerHTML = ""; }, 1700);
  }

  // ---- 「もう できる」の 中身 ----
  // あたらしく 入って 7日の あいだは 大きく ほめて その やることに「あたらしい」。そのあとは ひとこと
  var bundleId = null;
  function openBundle(id) {
    bundleId = id;
    var v = $("bundle-view");
    v.style.setProperty("--kid", colors(openKid).main);
    v.style.setProperty("--kid-soft", colors(openKid).soft);
    v.hidden = false;
    renderBundle();
  }
  function closeBundle() { bundleId = null; $("bundle-view").hidden = true; }
  function renderBundle() {
    var kid = openKid, day = viewDate || ymd(new Date()), e = entry(day, kid);
    var b = (state.tasks || []).filter(function (t) { return t.id === bundleId; })[0];
    if (!b || !kid) return closeBundle();
    L = levelOf(kid);
    var k0 = findKid(kid), name = esc(k0.name) + (k0.honor ? '<small class="honor">' + esc(k0.honor) + '</small>' : "");
    var from = ymd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), since = {};
    gradsOf(kid).forEach(function (g) { since[g.taskId] = g.date; });
    var items = window.BoardApi.bundleItems(state.tasks, kid, day);
    var fresh = items.some(function (t) { return since[t.id] >= from; });
    $("bdv-title").innerHTML = STAIRS + esc(taskName(b, kid));
    $("bdv-cheer").className = "bdv-cheer" + (fresh ? " big" : "");
    $("bdv-cheer").innerHTML = fresh
      ? '<span class="bdv-ic">' + STAIRS + ICON("hanamaru") + '</span><span>' + W("bundleCheer", { name: name }) + '<br><b>' + W("bundleNext") + '</b></span>'
      : '<span>' + W("bundleSteady") + '</span>';
    $("bdv-items").innerHTML = items.map(function (t) {
      return '<li>' + ICON("hanamaru") + '<span>' + esc(taskName(t, kid)) + '</span>' +
        (since[t.id] >= from ? '<small class="bdv-new">' + W("bundleNew") + '</small>' : "") + '</li>';
    }).join("");
    var done = e.checks.indexOf(b.id) >= 0;
    $("bdv-act").innerHTML = !kidEditable(kid, day, e) ? ""
      : done ? '<button class="bdv-undo" id="bdv-undo">' + W("bundleUndo") + '</button>'
      : '<button class="bdv-go" id="bdv-go">✓ ' + W("bundleAll") + '</button>';
  }
  $("bdv-act").addEventListener("click", function (ev) {
    if (!bundleId) return;
    var id = bundleId;
    if (ev.target.closest("#bdv-go")) { closeBundle(); changeTask(id, true, 0); }
    else if (ev.target.closest("#bdv-undo")) { closeBundle(); changeTask(id, false, 0); }
  });
  $("bdv-close").addEventListener("click", closeBundle);
  $("bundle-view").addEventListener("click", function (ev) { if (ev.target === $("bundle-view")) closeBundle(); });

  // ---- 「1回だけ」の やることを その場で たす（おうちの人。親モードの鍵の あと） ----
  var quickKids = [], quickDate = "", quickEdit = null;   // quickEdit: なおしている 1回だけの id（たす ときは null）

  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function md(date) { return +date.slice(5, 7) + "/" + +date.slice(8, 10); }

  $("kv-add").addEventListener("click", function () {
    if (window.ParentLock) window.ParentLock.ask(openQuick);
  });

  function openQuick() {
    quickKids = openKid ? [openKid] : [];
    quickDate = addDays(0);
    // ごほうびは いちばん おおく つかっている 金額から はじめる
    var votes = {};
    state.tasks.forEach(function (t) { if (t.active) votes[t.yen] = (votes[t.yen] || 0) + 1; });
    var keys = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    $("qk-name").value = "";
    $("qk-yen").value = keys.length ? keys[0] : 0;
    $("qk-unit").textContent = isPoint() ? "ポイント" : "円";
    $("qk-error").textContent = "";
    setQuickEdit(null);
    // アプリでは 音声で 入れられる（端末に 音声認識が あるとき）
    $("qk-voice").hidden = !(Device.canVoice() && window.EchoBoard.canVoice && window.EchoBoard.canVoice());
    renderQuick();
    $("quick").hidden = false;
  }

  function renderQuick() {
    $("qk-kids").innerHTML = visibleKids().map(function (k) {
      return '<button data-kid="' + k.id + '" class="' + (quickKids.indexOf(k.id) >= 0 ? "on" : "") +
        '" style="--kid:' + colors(k.id).main + '">' + esc(k.name) + '</button>';
    }).join("");
    Array.prototype.forEach.call($("qk-when").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", addDays(+b.dataset.when) === quickDate);
    });
    $("qk-date").value = quickDate;
    var today = ymd(new Date());
    var list = state.tasks.filter(function (t) { return t.repeat.type === "once" && t.repeat.date >= today; })
      .sort(function (a, b) { return a.repeat.date < b.repeat.date ? -1 : 1; });
    $("qk-list").innerHTML = list.map(function (t) {
      var who = t.kids ? t.kids.map(function (id) { return findKid(id).name; }).join("・") : "みんな";
      // 押すと 左の 欄に よみこんで なおせる。✕ で けす
      return '<li' + (t.id === quickEdit ? ' class="editing"' : "") + '><span class="when" data-edit="' + t.id + '">' + md(t.repeat.date) +
        '</span><span class="what" data-edit="' + t.id + '">' + esc(t.name) +
        '<small>' + esc(who) + ' ・ ' + esc(unit(t.yen)) + '</small></span>' +
        '<button data-remove="' + t.id + '" aria-label="けす">✕</button></li>';
    }).join("");
    // これからの 1回だけが ない ときは 右の 欄ごと 出さない
    $("qk-side").hidden = !list.length;
  }

  $("qk-kids").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    var id = b.dataset.kid, i = quickKids.indexOf(id);
    if (i >= 0) quickKids.splice(i, 1); else quickKids.push(id);
    renderQuick();
  });
  $("qk-when").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    quickDate = addDays(+b.dataset.when);
    renderQuick();
  });
  $("qk-date").addEventListener("change", function () {
    if ($("qk-date").value) quickDate = $("qk-date").value;
    renderQuick();
  });
  // たす ⇔ なおす の きりかえ（見出し・ボタン・「あたらしく たす」）
  function setQuickEdit(id) {
    quickEdit = id;
    $("qk-title").textContent = id ? "1回だけの やることを なおす" : "1回だけの やることを たす";
    $("qk-ok").textContent = id ? "なおす" : "たす";
    $("qk-new").hidden = !id;
  }
  $("qk-list").addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-remove],[data-edit]");
    if (!el) return;
    if (el.dataset.remove) {
      var id = el.dataset.remove;
      if (id === quickEdit) setQuickEdit(null);
      window.BoardApi.post("/api/board/task", { remove: id }).then(load).then(renderQuick);
      return;
    }
    var t = state.tasks.filter(function (x) { return x.id === el.dataset.edit; })[0];
    if (!t) return;
    $("qk-name").value = t.name;
    $("qk-yen").value = t.yen;
    quickKids = t.kids ? t.kids.slice() : visibleKids().map(function (k) { return k.id; });
    quickDate = t.repeat.date;
    $("qk-error").textContent = "";
    setQuickEdit(t.id);
    renderQuick();
  });
  // なおすのを やめて、あたらしく たす（ひらいた ときと おなじ 初期値に もどす）
  $("qk-new").addEventListener("click", function () { openQuick(); });
  $("qk-voice").addEventListener("click", function () {
    $("qk-voice").classList.add("on");
    window.EchoBoard.startVoice("やることを はなしてください");
  });
  window.addEventListener("board:voice", function (ev) {
    $("qk-voice").classList.remove("on");
    var text = String(ev.detail || "").trim();
    if (text && !$("quick").hidden) $("qk-name").value = text.slice(0, 30);
  });
  $("qk-close").addEventListener("click", function () { $("quick").hidden = true; });
  $("qk-ok").addEventListener("click", function () {
    var name = $("qk-name").value.trim();
    if (!name) { $("qk-error").textContent = "なまえを いれてください"; return; }
    if (!quickKids.length) { $("qk-error").textContent = "だれが やるか えらんでください"; return; }
    if (quickDate < ymd(new Date())) { $("qk-error").textContent = "きょうより まえの 日には " + (quickEdit ? "できません" : "たせません"); return; }
    var body = { name: name, kids: quickKids, date: quickDate, yen: parseInt($("qk-yen").value, 10) || 0 };
    if (quickEdit) body.id = quickEdit;
    window.BoardApi.post("/api/board/task", quickEdit ? { edit: body } : { add: body }).then(function () {
      $("quick").hidden = true;
      return load();
    }).catch(function (e) { $("qk-error").textContent = (quickEdit ? "なおせませんでした" : "たせませんでした") + "（" + e.message + "）"; });
  });

  function confetti(target) {
    if (document.body.classList.contains("lowpower")) return;
    var box = target || $("kv-confetti"), items = [ICON("flower"), ICON("point-star"), ICON("hanamaru"), ICON("party")], html = "";
    for (var i = 0; i < 24; i++) {
      html += '<span style="left:' + Math.round(Math.random() * Math.max(100, box.clientWidth - 30)) + 'px;animation-delay:' +
        (Math.random() * 0.6).toFixed(2) + 's">' + items[i % items.length] + '</span>';
    }
    box.innerHTML = html;
    setTimeout(function () { box.innerHTML = ""; }, 3000);
  }

  // しばらく さわらなければ、または 黒い画面に なったら とじる
  document.addEventListener("pointerdown", function () { lastTouch = Date.now(); }, true);
  document.addEventListener("input", function () { lastTouch = Date.now(); }, true);
  setInterval(function () {
    var idle = Date.now() - lastTouch > IDLE_CLOSE_MS || !$("sleep").hidden;
    if (openKid && idle) closeKidView();
    if (!$("goal-view").hidden && idle) $("goal-view").hidden = true;
    if (gradKid && idle) closeGradView();
    if (!$("quick").hidden && idle) $("quick").hidden = true;
  }, 1000);

  // 設定画面で保存したら すぐ読み直す
  window.addEventListener("board:reload", load);
  // 画面の向き・大きさが かわったら ボタンの かたちを えらびなおす
  window.addEventListener("board:fit", function () { lastHtml = ""; render(); });
  // 画面の 向き・大きさが かわったら 段の 地図を かきなおす（のぼる うごきは もう 見せない）
  window.addEventListener("board:fit", function () {
    if (!gradMap || !gradKid || $("grad-view").hidden) return;
    gradMap.stop();
    drawGradMap(gradsOf(gradKid), -1, false);
  });

  load();
  setInterval(load, 30 * 1000);
  // 日づけが かわったら かきなおす
  setInterval(render, 60 * 1000);
})();
