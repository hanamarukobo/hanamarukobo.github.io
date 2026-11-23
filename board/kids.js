// ホームの 子どもの ボタンと「がんばりカレンダー」（子どもの 画面）。データは BoardApi（api.js）。
// 子どもは やることを チェック（かいすうの やることは ＋−）する。きょうだけで なく 先月1日 からの すぎた日も なおせる
// ママ・パパが「みました」にすると、1つでも できた日は はなまると ポイントが つく。
// 「みました」の あとに 子どもが かえたら とりけし（もういちど みてもらう まで たさない）。
(function () {
  "use strict";

  // 子どもごとの色は せっていで えらぶ（palette.js）
  var PALETTE = window.KID_PALETTE;
  var IDLE_CLOSE_MS = 2 * 60 * 1000;

  var state = null;      // /api/state のレスポンス
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
        // つないだ スマホの アプリは「つなぎ直す」を 出す（番号が かわった・置いた 端末が 見つからない。11-18）
        $("kids").innerHTML = '<div class="offline">' + (window.BoardApi.remote
          ? esc(window.BoardApi.connWhy(e) || "置いてある端末につながりませんでした。") + "<br><button class=\"ghost small reconnect\">つなぎ直す</button>"
          : e.status === 429 ? esc(e.message)
          : window.BoardApi.paired || e.status === 401
          ? "置いてある端末につながりませんでした。置いてある端末の設定「この端末」の QR コードを、もう一度読み取ってください。"
          : "がんばりカレンダーに つながらないよ") + '</div>';
      });
  }

  // その日に その子に 出る やること（毎日・曜日・1回だけ。api.js の tasksFor）
  function dayTasks(kid, date) { return window.BoardApi.tasksFor(state.tasks, kid, date); }
  function yenOf(t, kid) { return window.BoardApi.yenOf(t, kid); }
  // 小さい子（ようちえん・小学1〜2年）には ひらがなの なまえが あれば そちらを みせる
  function taskName(t, kid) { return t.kana && levelOf(kid) !== "upper" ? t.kana : t.name; }
  // 画面に 出す 名前（エスケープ 済みの HTML）。ふりがなの 子は 漢字の 名前に よみがなを ふる
  function taskHtml(t, kid) { return levelOf(kid) === "ruby" ? window.Words.rubyName(t.name, t.kana, esc) : esc(taskName(t, kid)); }
  function timeSlots() { return !!(state.settings && state.settings.timeSlots); }
  // ごぜん・ごご に わけるときは その じゅんに ならべ、見出しを はさむ
  function slotted(tasks, render) {
    if (!timeSlots()) return tasks.map(render).join("");
    return [["am", "taskAm"], ["pm", "taskPm"], [null, "taskAny"]].map(function (g) {
      var list = tasks.filter(function (t) { return (t.slot || null) === g[0]; });
      return list.length ? '<li class="slot-head">' + W(g[1]) + '</li>' + list.map(render).join("") : "";
    }).join("");
  }
  // だいじ／できたら（2026-11-23）: おうちの人が 設定の「やること」で だいじ を 付けた やることは、子どもの 色の 箱に まとめて いちばん 上
  //   （ごぜん・ごご に わけて いても 箱は 1つ。社長）。その 下に 見出し「できたら」と のこりを いつもの ならびで。
  //   その日の やることに だいじ が 1つも なければ いまの まま（2段は 出さない）。ぜんぶ できても 箱は ちぢめない（やった ことを 見たい）
  function isDaiji(t) { return !!t.important && !t.bundle; }
  function grouped(tasks, render) {
    var top = tasks.filter(isDaiji);
    if (!top.length) return slotted(tasks, render);
    var rest = tasks.filter(function (t) { return !isDaiji(t); });
    return '<li class="daiji"><span class="daiji-head">' + W("daijiHead") + '</span><ul class="daiji-list">' + top.map(render).join("") + '</ul></li>' +
      (rest.length ? '<li class="slot-head dekitara">' + W("dekitaraHead") + '</li>' + slotted(rest, render) : "");
  }
  // その日の 記録と、そのやることを なんかい やったか（チェックは 0 か 1、かいすうは ＋− の数）。決まりは api.js
  function entry(date, kid) { return window.BoardApi.entry(state, date, kid); }
  function taskCount(t, e) { return window.BoardApi.taskCount(t, e); }

  // その日の すすみぐあい。かいすうは 1かい いじょうで「やった」。
  // 週に何回は、やった 日だけ 数に 入れる（api.js の required）
  function progress(kid, e, date) {
    var tasks = dayTasks(kid, date).filter(function (t) { return window.BoardApi.required(t, e); });
    var done = tasks.filter(function (t) { return taskCount(t, e) > 0; }).length;
    return { done: done, total: tasks.length };
  }
  // ボタンの「きょう」の 行。できた 数だけ はなまるを ならべる。
  // 1行に はいらない ときは fitDone が 数字（💮×4）に かえる（data-num）
  function tally(label, n) {
    var marks = "";
    for (var i = 0; i < n; i++) marks += '<i class="on">' + ICON("hanamaru") + '</i>';
    return '<span class="tally" data-num="' + n + '"><span class="tl">' + W(label) + '</span><span class="dots">' +
      (n ? marks : '<b class="num">0</b>') + '</span></span>';
  }
  // きょう: できた やること 1つに はなまる 1こ（「みました」の あとは その ときの けっか）
  function todayDone(kid, e, r, date) {
    if (!dayTasks(kid, date).length) return "";
    return tally("tallyToday", r ? r.done : progress(kid, e, date).done);
  }
  // 1行に はいらない しるしは 数字に（💮×4）、はみだす ときは 字を 小さく。
  // それでも ボタンに おさまらない ときは、みんなの ボタンを そろえて 行を 小さく → もくひょう → きょう の じゅんに けす
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
    [".kid-goal", ".tally"].forEach(function (sel) {
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

  // やることの 値の たんいは ポイント（2026-11-12 に 円を やめた。前の「円」の 数は そのまま ポイントとして よむ）
  function unit(n) { return W("point", { n: n }); }

  // 子どもに見せる ことば（words.js）。L は いま かいている ところの だんかい
  //   トップの ボタン・がんばりカレンダー: その子 / みんなの もくひょう: いちばん小さい子
  var L = "lower";
  function W(key, vars) {
    var parent = (state && state.settings && state.settings.parentName) || "ママ・パパ";
    return window.Words.t(key, L, Object.assign({ parent: parent }, vars || {}));
  }
  function ICON(name) { return window.Words.icon(name); }
  // 文の だんかい（ふりがなを えらんだ 子は "ruby"。words.js の textLevel）。年齢の めやすは findKid(id).level
  function levelOf(id) { return window.Words.textLevel(findKid(id)); }
  function boardLevel() { return window.Words.youngestText(state.kids); }

  // もくひょう（api.js の goalInfo。子どもごとに ポイントが たまったら たっせい。おうちの人が「こうかんした」を 押すと 1回分 へる）
  //   ホームの ゲージは 数字なし（💮の 数と まざらないように）。8割で「もうすこし！」、とどいて いる 間は カードが 金色で「たっせい！」
  //   （こうかん するまで 金色の まま。まだ こうかん して もらって いないと わかる）
  function goalOf(kid) { return window.BoardApi.goalInfo(state, kid, ymd(new Date())); }
  function goalGauge(g, cls) {
    var pct = Math.min(100, Math.floor(g.progress / g.size * 100));
    var word = g.reached ? W("goalReached") : pct >= 80 ? W("goalNear") : "";
    // 「みました」を まって いる ぶんは うすい しまで（数には 入れない。2026-11-20 テスターの 声）
    var wait = g.waiting && !g.reached ? Math.min(100, Math.ceil((g.progress + g.waiting) / g.size * 100)) : 0;
    return '<span class="' + cls + '"><span class="kg-star">' + ICON("point-star") + '</span>' +
      '<span class="kg-track">' + (wait > pct ? '<span class="kg-wait" style="width:' + wait + '%"></span>' : "") +
      '<span class="kg-fill" style="width:' + pct + '%"></span>' + (word ? '<span class="kg-word">' + word + '</span>' : "") + '</span>' +
      '<span class="kg-flag">' + ICON("goal-flag") + '</span></span>';
  }

  // 子どもが チェックを なおせる 日: きょうと、先月1日 からの すぎた日（決まりは api.js の kidEditable）。
  //   みました の あとに 直したら、みました は 取り消し（api.js の unapprove）
  function kidEditable(kid, day, e) {
    return window.BoardApi.kidEditable(day, ymd(new Date()));
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

  // カードの 中の 白い 楕円（毎日 はなまる！ など）が カードの 幅を こえる ときは 字を 小さく する（2026-11-21。スマホの 形で 2列・横 1列の とき）。
  //   10px まで 小さく しても 入らなければ CSS の「…」に まかせる
  function fitStates(box) {
    Array.prototype.forEach.call(box.querySelectorAll(".kid-btn .state"), function (el) {
      el.style.fontSize = "";
      if (!el.offsetWidth) return;
      var size = parseFloat(getComputedStyle(el).fontSize) || 16;
      while (el.scrollWidth > el.clientWidth + 1 && size > 10) {
        size -= 1;
        el.style.fontSize = size + "px";
      }
    });
  }

  function layoutKids(box, n) {
    var modes = n <= 2 ? ["big", "row", "icon"] : n <= 4 ? ["row", "icon"] : ["icon"];
    box.style.setProperty("--n", n);
    for (var i = 0; i < modes.length; i++) {
      box.className = "kids mode-" + modes[i];
      if (fitNames(box, modes[i])) return;
    }
  }

  // カードに くらべて 中身が 小さい ときは、名前・ことば・きょう・もくひょうを まとめて 大きく する（2026-11-22。
  //   子ども1人・予定なし や、横で 3〜4人の ときに カードの 上下が 大きく あいて 中身が 小さく 見えた）。
  //   入る 大きさ（高さの 8割・幅の 9割）まで、1.3倍まで。スマホの 形（tall・wide）は 並びを 詰めて あるので かけない。
  //   上限は 2026-11-23 に 2 → 1.3（子ども1人で 名前が 時刻に 近い 大きさに なり、人数で 大きさが 2倍 ちがった。tools/dev/sizer.html で はかった）
  //   大きさは style.css の .kid-btn の --grow（zoom）。カードの 大きさが かわったら（天気・予定を 読んだ あと など）はかりなおす
  var GROW_MAX = 1.3;
  function growKids(box) {
    box.style.removeProperty("--grow");
    var body = document.body.classList;
    if (body.contains("tall") || body.contains("wide") || !box.classList.contains("mode-big") && !box.classList.contains("mode-row")) return;
    var btns = box.querySelectorAll(".kid-btn"), g = GROW_MAX;
    if (!btns.length) return;
    Array.prototype.forEach.call(btns, function (b) {
      var r = b.getBoundingClientRect(), top = Infinity, bottom = -Infinity, wide = 0;
      Array.prototype.forEach.call(b.querySelectorAll(":scope > .name, :scope > .state, :scope > .tally, :scope > .kid-goal"), function (el) {
        var e = el.getBoundingClientRect();
        if (!e.height) return;
        top = Math.min(top, e.top);
        bottom = Math.max(bottom, e.bottom);
        // もくひょうの ゲージは カードの 幅に あわせて のびるので、幅は ほかの もので はかる
        //   名前は「…」で 切れて いれば 入りきらない 幅（scrollWidth）で はかる
        if (el.classList.contains("kid-goal")) return;
        wide = Math.max(wide, el.clientWidth ? e.width * el.scrollWidth / el.clientWidth : e.width);
      });
      if (!r.height || bottom <= top || !wide) { g = 1; return; }
      g = Math.min(g, r.height * 0.8 / (bottom - top), r.width * 0.9 / wide);
    });
    // 大きく した あとで はみ出す もの（「今日：💮×4」の 帯・もくひょうの「もうすこし！」・名前）が あれば、すこしずつ 小さく する
    function over(el) { return el.scrollWidth > el.clientWidth + 1; }
    function bad() {
      return Array.prototype.some.call(btns, function (b) {
        if (b.scrollHeight > b.clientHeight + 1) return true;   // 横は 右上の しるしが はみ出して いるので はからない
        var t = b.querySelector(":scope > .tally"), n = b.querySelector(":scope > .name"), k = b.querySelector(":scope > .kid-goal");
        if (t && over(t) || n && over(n)) return true;
        if (!k) return false;
        var w = k.querySelector(".kg-word"), tr = k.querySelector(".kg-track");
        return w && over(w) || tr && tr.clientWidth < k.clientWidth * 0.45;
      });
    }
    while (g >= 1.1) {
      box.style.setProperty("--grow", String(Math.round(g * 100) / 100));
      if (!bad()) return;
      g *= 0.92;
    }
    box.style.removeProperty("--grow");
  }
  if (window.ResizeObserver) {
    var growSize = "";
    new ResizeObserver(function (en) {
      var c = en[0].contentRect, k = Math.round(c.width) + "x" + Math.round(c.height);
      if (k === growSize) return;
      growSize = k;
      growKids($("kids"));
    }).observe($("kids"));
  }

  function render() {
    if (!state) return;
    var now = new Date(), today = ymd(now), kids = visibleKids();
    var html = kids.map(function (k) {
      L = levelOf(k.id);
      var c = colors(k.id), e = entry(today, k.id), r = result(today, k.id), goal = goalOf(k.id);
      var p = progress(k.id, e, today);
      var nGrad = gradsOf(k.id).length, badge, text, cls = "kid-btn", tier = gradTier(nGrad);
      if (tier) cls += " grad-" + tier;
      if (goal.reached) cls += " goal-reached";
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
        goalGauge(goal, "kid-goal") +
        '</button>';
    }).join("");
    // 30びょうごとの よみなおしで かわっていなければ かきなおさない（でんきを へらす）
    if (html !== lastHtml) {
      lastHtml = html;
      $("kids").innerHTML = html;
      layoutKids($("kids"), kids.length);
      fitStates($("kids"));
      fitDone($("kids"));
      growKids($("kids"));
    }
    if (openKid) renderKidView();
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
  function gradHtml(g) { return levelOf(g.kid) === "ruby" ? window.Words.rubyName(g.name, g.kana, esc) : esc(gradName(g)); }
  function seenGrads() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch (e) { return []; }
  }
  function markSeen(ids) {
    var s = seenGrads().concat(ids.filter(function (id) { return seenGrads().indexOf(id) < 0; }));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-200))); } catch (e) { /* おぼえられなくても よい */ }
  }
  // Pro は 段の 地図（stairs.js）。無料は 段の 一覧（まとめた ときの おいわいだけ 出る）
  function isPro() { return window.BoardApi.isPro(state); }
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
    $("grv-count").innerHTML = gs.length ? W("gradSteps", { n: gs.length }) : "";   // 0こ のときは 地図の 空の カードに「できる ことを ふやそう！」
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
    if (hello) $("grv-hello").innerHTML = '<b>' + W("gradCongrats") + '</b>' + W("gradNew", { task: gradHtml(hello) });
    $("grv-title").innerHTML = W("gradTitle", { name: name });
    $("grv-count").innerHTML = gs.length ? W("gradSteps", { n: gs.length }) : W("gradEmpty");
    $("grv-steps").innerHTML = gs.map(function (g, i) {
      return '<li style="--i:' + Math.max(0, top - i) + '"' + (hello && g.id === hello.id ? ' class="new"' : '') + '>' +
        '<span class="st-date">' + W("gradDate", { m: +g.date.slice(5, 7), d: +g.date.slice(8, 10) }) + '</span>' +
        '<span class="st-name">' + gradHtml(g) + '</span></li>';
    }).join("");
  }
  // 無料は 数を 見せる バッジ（押すと 階段が はねるだけ。Pro の 案内は 出さない）。Pro は 段の 地図を ひらく
  $("kv-grad").addEventListener("click", function () {
    if (isPro()) return openGradView(openKid, null);
    var b = $("kv-grad");
    b.classList.remove("hop");
    void b.offsetWidth;   // 続けて 押しても もう一度 はねる
    b.classList.add("hop");
  });
  $("grv-close").addEventListener("click", closeGradView);
  $("grad-view").addEventListener("click", function (ev) { if (ev.target === $("grad-view")) closeGradView(); });

  $("kids").addEventListener("click", function (ev) {
    if (ev.target.closest(".reconnect")) { window.Remote.open(); return; }
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
    if (window.Wallet) window.Wallet.exit();
    openKid = null;
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
  function canMoveMonth(step) { return !$(step > 0 ? "kv-next" : "kv-prev").disabled; }
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
    L = levelOf(kid);
    // 見出しは 名前と［がんばり｜おさいふ］だけ（れんぞくの 札は 2026-11-19 に なくした。カレンダーの 💮 で 見える）
    $("kv-title").innerHTML = name;
    var gs = gradsOf(kid);
    $("kv-grad").hidden = false;   // 0この ときも かいだんだけ 出す
    $("kv-grad").innerHTML = STAIRS + (gs.length ? W("gradBtn", { n: gs.length }) : "");
    $("kv-grad").classList.toggle("badge", !isPro());
    $("kv-grad").tabIndex = isPro() ? 0 : -1;
    // がんばり｜おさいふ（おさいふは 設定で 使うと きめた 子だけ。中身と きりかえは wallet.js）
    $("kv-tab-cal").innerHTML = W("kvTabCal");
    $("kv-wallet").hidden = !k0.wallet;
    $("kv-wallet").innerHTML = W("wlOpen");
    fitTabs();
    if (window.Wallet) window.Wallet.render();

    // カレンダー
    var y = viewMonth ? viewMonth.y : now.getFullYear(), mo = viewMonth ? viewMonth.mo : now.getMonth();
    var past = !!viewMonth;
    $("kv-month").innerHTML = y !== now.getFullYear() ? W("yearMonth", { y: y, m: mo + 1 }) : W("month", { m: mo + 1 });
    $("kv-prev").disabled = y * 12 + mo <= FIRST_MONTH.y * 12 + FIRST_MONTH.mo;
    $("kv-next").disabled = y * 12 + mo > now.getFullYear() * 12 + now.getMonth();
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
    // 左の 下: もくひょうの はこ（数字は ここだけ）と、これまでの 合計・その月の はなまる（こうかんの 回数は 出さない。ふりかえりは Pro の レポート）
    var m = monthStats(kid, new Date(y, mo, 1)), g = goalOf(kid);
    $("kv-total").innerHTML =
      '<div class="kv-goal"><div class="kv-goal-head"><span>' + W("goalBox") + ' ' + ICON("point-star") + ' ' + g.progress + ' / ' + g.size + '</span>' +
      '<span>' + (g.reached
        // とどいたら おうちの人が「こうかんした」（鍵を たしかめてから）。取り消しは ない（2026-11-18。ずれたら おうちで おさいふの 記録などで 合わせる）
        ? '<button class="kv-exchange" id="kv-exchange">' + W("goalExchange") + '</button>'
        : W("goalLeft", { x: g.size - g.progress })) +
      '</span></div>' + goalGauge(g, "kv-gauge") +
      // できたけど まだ みて もらって いない ポイント（ふえる しくみを 子どもにも わかるように）
      (g.waiting ? '<div class="kv-wait"><b>' + W("goalWaitNum", { x: g.waiting }) + '</b><span>' + W("goalWaitText") + '</span></div>' : "") +
      '</div>' +
      '<div class="kv-sums"><span class="yen">' + W("goalTotal", { x: unit(g.total) }) + '</span>' +
      '<span class="count">' + W("monthFlowers", { m: mo + 1, n: m.flowers }) + '</span></div>';

    // きょう、または カレンダーで えらんだ 日の やること（あしたから さきは みるだけ）
    var day = viewDate || today, isToday = day === today, future = day > today;
    // 1回だけの やることを 足す: 今日は「＋ きょうだけ」、さきの 日は「＋ このひだけ」、すぎた 日は 出さない
    $("kv-add2").hidden = day < today;
    $("kv-add2").innerHTML = W(isToday ? "addToday" : "addThisDay");
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
    function listHtml() { return grouped(tasks, function (t) {
      var n = taskCount(t, e0), cls = (n > 0 ? "done" : "") + lock, yen = yenOf(t, kid);
      var name = taskHtml(t, kid) + (t.repeat.type === "once" ? '<span class="once">' + W("todayOnly") + '</span>' : "");
      if (t.repeat.type === "perweek") {
        // 週に何回: のこりの 回数。ほかの 日で とどいた 週は「こんしゅう できた」で おせない
        var other = window.BoardApi.weekDone(state, t, kid, day, day), left = t.repeat.n - other - n;
        if (!n && other >= t.repeat.n) {
          return '<li class="done locked weekdone" data-task="' + t.id + '"><span class="box">' + ICON("hanamaru") + '</span>' +
            '<span class="name">' + taskHtml(t, kid) + '<span class="once week">' + W("weekDone") + '</span></span>' +
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
        // かいすう: ＋− で かぞえる。ポイントは 1回の ポイント × かいすう
        return '<li class="count ' + cls + '" data-task="' + t.id + '">' +
          '<span class="name">' + name + '<span class="per">' + unit(yen) + ' × ' + n + ' = ' + unit(yen * n) + '</span></span>' +
          '<span class="stepper">' +
          '<button class="minus" data-delta="-1"' + (!edit || n <= 0 ? " disabled" : "") + '>−</button>' +
          '<span class="num">' + n + '</span>' +
          '<button class="plus" data-delta="1"' + (!edit || n >= 99 ? " disabled" : "") + '>＋</button>' +
          '</span></li>';
      }
      // 「いまから やる」: きょうの まだ できて いない やることに。押したら そのやることに 火の しるし（できたら「じぶんから はじめた」）
      //   2026-11-23: 字の ボタンが ならぶと うるさいので 火の 絵だけの 丸に（白い 丸＋子どもの 色の ふち。意味は 押して 覚える ガイドと 押したときの 吹き出しで）
      var started = (e0.starts || []).indexOf(t.id) >= 0;
      if (started) cls += " started";
      var go = isToday && edit && !n && !started ? '<button class="go" data-go="1" aria-label="' + esc(window.Words.plain(W("goBtn"))) + '">' + ICON("streak-fire") + '</button>' : "";
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
    else if (p0.done) msg = W("stCheer", { n: left });
    else msg = W("stStart");
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
  //   2026-11-20: 前は 一覧の 上に うかべて いて、行の まんなかの「いまから やる」に かさなった（ユーザー）。
  //   はみだす ときだけ 上と 下に 帯の 場所を とり（.scrolls）、矢印は そこに 出す。帯の 場所は 一覧の 高さで きめ、スクロールでは かえない（がたつかない）
  function moreArrows() {
    var l = $("kv-list"), wrap = l.parentNode;
    wrap.classList.toggle("scrolls", l.scrollHeight > wrap.clientHeight + 4);
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
      // Web 版で ドライブに つないで いて 通行証が 切れて いたら、「みました」の ついでに 取りなおす（鍵の あと・押した 処理の 中で 同期で。
      //   drive.js の nudge。子どもの 操作では 呼ばない）
      if (on && window.Drive && window.Drive.on()) window.Drive.auto().nudge();
      var e = entry(day, kid);
      window.BoardApi.post("/api/parent/day", { date: day, kid: kid, checks: e.checks, counts: e.counts || {}, approved: on })
        .then(function () { if (on) confetti(); return load(); })
        .catch(function (err) { console.error(err); });
    });
  }

  // もくひょうの「こうかんした」（おうちの人。鍵を たしかめてから）
  $("kv-total").addEventListener("click", function (ev) {
    if (!ev.target.closest("#kv-exchange")) return;
    var kid = openKid;
    window.ParentLock.ask(function () {
      // おさいふを 使い、1ポイント＝○円を 決めて いる 子は「おさいふに 入れますか？」を 聞く（入れない・金額を 直すも できる。wallet.js）
      var k = state.kids.filter(function (x) { return x.id === kid; })[0];
      if (k && k.wallet && k.walletRate > 0 && window.Wallet) {
        return window.Wallet.askExchange(window.BoardApi.goalInfo(state, kid, ymd(new Date())).size, k.walletRate);
      }
      window.BoardApi.post("/api/parent/goal-exchange", { kid: kid })
        .then(function () { confetti(); return load(); })
        .catch(function (err) { console.error(err); });
    });
  });

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
  //   演出は 火の 上に 本人の セリフの 吹き出し（やることの 名前と「いまから やるよ！」）。2026-11-23 に「ことばを 出さない」から かえた:
  //   押せば 意味が わかり（ガイドを おえた 家も）、声に 出して 言う きっかけに なる。「いってから やってみよう」は ガイドで 言う
  function startTask(id) {
    var kid = openKid, day = ymd(new Date()), e = entry(day, kid);
    var t = state.tasks.filter(function (x) { return x.id === id; })[0];
    e.starts = (e.starts || []).filter(function (x) { return x !== id; }).concat([id]);
    state.days[day] = state.days[day] || {};
    state.days[day][kid] = e;
    renderKidView();
    goBurst(t ? taskHtml(t, kid) : "");
    window.BoardApi.post("/api/kid/start", { kid: kid, taskId: id }).then(load, load);
  }
  function goBurst(name) {
    var box = $("kv-go");
    var low = document.body.classList.contains("lowpower"), html = '<div class="go-flash"></div>';
    if (!low) {
      for (var i = 0; i < 12; i++) html += '<span class="go-ray" style="--a:' + i * 30 + 'deg"></span>';
      for (i = 0; i < 10; i++) html += '<span class="go-star" style="--a:' + (i * 36 + 18) + 'deg;animation-delay:' + (0.15 + (i % 3) * 0.06) + 's">' + ICON("point-star") + '</span>';
    }
    html += '<span class="go-fire">' + ICON("streak-fire") + '</span>';
    html += '<div class="go-say">' + (name ? '<span class="go-say-name">' + name + '</span>' : "") + '<span class="go-say-main">' + W("goSay") + '</span></div>';
    box.innerHTML = html;
    box.hidden = false;
    clearTimeout(goBurst.t);
    // 吹き出しを 読める 長さ（前は 1.7秒で ことばなし）
    goBurst.t = setTimeout(function () { box.hidden = true; box.innerHTML = ""; }, 2600);
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
    $("bdv-title").innerHTML = STAIRS + taskHtml(b, kid);
    $("bdv-cheer").className = "bdv-cheer" + (fresh ? " big" : "");
    $("bdv-cheer").innerHTML = fresh
      ? '<span class="bdv-ic">' + STAIRS + ICON("hanamaru") + '</span><span>' + W("bundleCheer", { name: name }) + '<br><b>' + W("bundleNext") + '</b></span>'
      : '<span>' + W("bundleSteady") + '</span>';
    $("bdv-items").innerHTML = items.map(function (t) {
      return '<li>' + ICON("hanamaru") + '<span>' + taskHtml(t, kid) + '</span>' +
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

  // 「＋ きょうだけ」「＋ このひだけ」（きょうの やることの 見出しの 右。11-18 テスターの 声で ここに 1つに した。
  // 前は カレンダーの 見出しの「＋ 1回だけの やること」）
  $("kv-add2").addEventListener("click", function () {
    if (window.ParentLock) window.ParentLock.ask(openQuick);
  });
  $("qk-name").addEventListener("input", function () {
    if ($("qk-name").value.trim()) { $("qk-name").classList.remove("need"); $("qk-error").textContent = ""; }
  });

  function openQuick() {
    quickKids = openKid ? [openKid] : [];
    // 見て いる 日（さきの 日を えらんで いれば その 日）
    quickDate = viewDate && viewDate > addDays(0) ? viewDate : addDays(0);
    // ポイントは いちばん おおく つかっている 数から はじめる
    var votes = {};
    state.tasks.forEach(function (t) { if (t.active) votes[t.yen] = (votes[t.yen] || 0) + 1; });
    var keys = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    $("qk-name").value = "";
    $("qk-yen").value = keys.length ? keys[0] : 0;
    $("qk-error").textContent = "";
    $("qk-name").classList.remove("need");
    setQuickEdit(null);
    // アプリでは 音声で 入れられる（端末に 音声認識が あるとき）
    $("qk-voice").hidden = !(Device.canVoice() && window.EchoBoard.canVoice && window.EchoBoard.canVoice());
    renderQuick();
    $("quick").hidden = false;
    window.Board.fitLine($("qk-title"));
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
    window.Board.fitLine($("qk-title"));
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
    if ($("quick").hidden) return;
    // 聞きとれなかった・とちゅうで やめた ときも だまらずに しらせる（11-18。前は 何も おきず「すすまない」に 見えた）
    if (!text) { $("qk-error").textContent = "きこえませんでした。もういちど おすか、もじで いれてください"; return; }
    $("qk-name").value = text.slice(0, 30);
    $("qk-name").classList.remove("need");
    $("qk-error").textContent = "";
  });
  $("qk-close").addEventListener("click", function () { $("quick").hidden = true; });
  $("qk-ok").addEventListener("click", function () {
    var name = $("qk-name").value.trim();
    if (!name) {
      $("qk-error").textContent = "やることが まだ はいっていません";
      $("qk-name").classList.add("need");
      $("qk-name").focus();
      return;
    }
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

  // 見出しの 名前が 入らない ときは、名前を「…」に する 前に［がんばりカレンダー｜おさいふ］の 字を 小さく する（12px まで）
  function fitTabs() {
    var title = $("kv-title"), tabs = Array.prototype.slice.call(document.querySelectorAll(".kv-tab"));
    tabs.forEach(function (t) { t.style.fontSize = ""; t.style.paddingLeft = t.style.paddingRight = ""; });
    if (!title.clientWidth) return;
    var size = parseFloat(getComputedStyle(tabs[0]).fontSize);
    while (title.scrollWidth > title.clientWidth + 1 && size > 12) {
      size -= 1;
      tabs.forEach(function (t) { t.style.fontSize = size + "px"; t.style.paddingLeft = t.style.paddingRight = Math.round(size * 0.55) + "px"; });
    }
  }

  // おさいふ（wallet.js）が 使う
  window.KidView = {
    kid: function () { return openKid; },
    state: function () { return state; },
    reload: load,
    // その子の だんかいの ことば
    W: function (key, vars) { if (openKid) L = levelOf(openKid); return W(key, vars); },
    level: function () { return openKid ? levelOf(openKid) : "lower"; },
    confetti: function () { confetti(); },
  };

  load();
  setInterval(load, 30 * 1000);
  // 日づけが かわったら かきなおす
  setInterval(render, 60 * 1000);
})();
