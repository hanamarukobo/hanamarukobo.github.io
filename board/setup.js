// 親モードの鍵と、かんたん設定（置いた端末と、つないだ スマホ・ブラウザ）。
// - ParentLock.ask(ok): 設定画面・「みました」の 前に、鍵が あれば おとなかを 確かめる。鍵は 設定の「おうちの人」で えらぶ
//     easy（計算問題）: いちばん 年上の 子の 年齢の めやすで かえる（その 学年では まだ 習わない もの）:
//       幼稚園・保育園／小学1〜2年: 2けた×1けたの かけ算（小学3年で 習う）
//       小学3年〜: x の 方程式（両がわに x が ある 一次方程式。中学1年で 習う）
//     pin（4桁の番号）: わすれたら「番号を忘れた」→ 24時間 たつと 計算問題で ひらけて、番号は 消える（計算問題に もどる）。
//       まって いる あいだは ボードに「鍵の入れなおし中」と 出す（子どもが おしても おうちの人が 気づく）。
//       わすれたら もどせない 仕組みに しない（データも 書き出しも 設定の 中に ある）
// - かんたん設定: 使い方 → 画面オフ → 天気の場所 → 子ども → やること → おさいふ → 鍵 → 予定（EasySetup.open）
(function () {
  "use strict";

  var Api = window.BoardApi;
  var pending = null;   // 鍵が あいたら よぶ
  var answer = "";      // 計算問題の 答え・4桁の番号
  var typed = "";
  var mode = "easy";    // easy: 計算問題 / pin: 4桁の番号 / reset: 番号を わすれて 24時間 たった あとの 計算問題
  var RESET_MS = 24 * 60 * 60 * 1000;

  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ---- 親モードの鍵 ----
  function ask(ok) {
    if (Api.remote || Api.paired) return ok();
    // よめない ときは まえに よんだ 鍵で
    Api.state().then(function (s) {
      last = { lock: (s.settings && s.settings.parentLock) || { type: "none" }, level: oldestLevel(s.kids || []) };
      check(ok);
    }, function () { check(ok); });
  }
  var last = { lock: { type: "none" }, level: "kinder" };
  function check(ok) {
    if (last.lock.type === "none") return ok();
    showLock(ok, last.level, last.lock);
  }
  // 4桁の番号が ちゃんと ある ときだけ 番号で（前の データの 番号なしの "pin" は 計算問題）
  function hasPin(lock) { return lock.type === "pin" && /^\d{4}$/.test(lock.pin || ""); }
  function hoursLeft(lock) { return Math.max(1, Math.ceil((lock.resetAt + RESET_MS - Date.now()) / 3600000)); }

  var LEVEL_ORDER = ["kinder", "lower", "upper"];
  function oldestLevel(kids) {
    return kids.filter(function (k) { return k.active !== false; }).reduce(function (top, k) {
      return LEVEL_ORDER.indexOf(k.level) > LEVEL_ORDER.indexOf(top) ? k.level : top;
    }, "kinder");
  }

  function showLock(ok, level, lock) {
    pending = ok;
    typed = "";
    var pin = hasPin(lock || {}), waiting = pin && typeof lock.resetAt === "number";
    mode = !pin ? "easy" : waiting && Date.now() - lock.resetAt >= RESET_MS ? "reset" : "pin";
    $("lk-forgot").hidden = mode !== "pin" || waiting;
    $("lk-forgot").textContent = "番号を忘れた";
    $("lk-forgot").dataset.step = "";
    $("lk-note").textContent = mode === "reset" ? "正しく答えると、4桁の番号を消して開きます（鍵は計算問題に戻ります）。"
      : waiting ? "鍵の入れなおし中です。あと " + hoursLeft(lock) + " 時間で、計算問題で開けるようになります。" : "";
    $("lk-note").hidden = !$("lk-note").textContent;
    if (mode === "pin") {
      answer = lock.pin;
      $("lk-title").textContent = "おとなの かくにん";
      $("lk-question").textContent = "4桁の番号";
      renderTyped();
      $("lock").hidden = false;
      return;
    }
    var q;
    if (level === "upper") {
      // a x − b = c x + d（x は 2〜9。d が 1 いじょうに なるまで つくりなおす）
      var x, a, b, c, d;
      do {
        x = rnd(2, 9); a = rnd(3, 9); c = rnd(1, a - 1); b = rnd(1, 20);
        d = (a - c) * x - b;
      } while (d < 1);
      answer = String(x);
      q = a + "x − " + b + " = " + (c === 1 ? "" : c) + "x + " + d + "　x = ?";
    } else {
      var p = rnd(12, 19), m = rnd(3, 9);
      answer = String(p * m);
      q = p + " × " + m + " = ?";
    }
    $("lk-title").textContent = mode === "reset" ? "鍵の入れなおし" : "おとなの かくにん";
    $("lk-question").textContent = q;
    renderTyped();
    $("lock").hidden = false;
  }

  function renderTyped() {
    $("lk-typed").textContent = (mode === "pin" ? typed.replace(/./g, "●") : typed) || " ";
    $("lk-typed").classList.remove("wrong");
  }

  function closeLock() {
    $("lock").hidden = true;
    pending = null;
  }

  function submit() {
    if (typed !== answer) {
      typed = "";
      renderTyped();
      // ゆれる だけでは 気づきにくかった（2026-11-22 実機）。欄に 短い ことばを 出し、つぎに 押すと 消える
      $("lk-typed").textContent = window.Words.adult(mode === "pin" ? "lockWrongPin" : "lockWrongAnswer");
      $("lk-typed").classList.add("wrong");
      return;
    }
    var next = pending, lock = last.lock;
    closeLock();
    // 番号で あいたら 入れなおしを やめる。24時間 まって 計算問題で あいたら 番号を 消す
    var change = mode === "pin" && typeof lock.resetAt === "number" ? { type: "pin", pin: lock.pin }
      : mode === "reset" ? { type: "easy" } : null;
    if (!change) { if (next) next(); return; }
    last.lock = change;
    Api.post("/api/board/settings", { parentLock: change }).then(function () {
      window.dispatchEvent(new Event("board:reload"));
    }, function () { /* つぎに また きく */ }).then(function () { if (next) next(); });
  }

  // 「番号を忘れた」: 1回目で 説明、2回目で 入れなおしを はじめる
  $("lk-forgot").addEventListener("click", function () {
    var b = $("lk-forgot");
    if (b.dataset.step !== "confirm") {
      b.dataset.step = "confirm";
      b.textContent = "入れなおしを始める";
      $("lk-note").textContent = "24時間たつと、計算問題で開けるようになり、番号は消えます。そのあいだ、ボードに「鍵の入れなおし中」と出ます。";
      $("lk-note").hidden = false;
      return;
    }
    var lock = { type: "pin", pin: last.lock.pin, resetAt: Date.now() };
    last.lock = lock;
    Api.post("/api/board/settings", { parentLock: lock }).then(function () {
      window.dispatchEvent(new Event("board:reload"));
    }, function () { /* よめなければ そのまま */ });
    closeLock();
  });

  $("lk-keys").addEventListener("click", function (ev) {
    var key = ev.target.dataset && ev.target.dataset.key;
    if (!key) return;
    if (key === "back") typed = typed.slice(0, -1);
    else if (key === "ok") return submit();
    else if (typed.length < 4) typed += key;
    renderTyped();
  });
  $("lk-close").addEventListener("click", closeLock);

  window.ParentLock = { ask: ask };

  // ---- かんたん設定 ----
  // はじめて（説明を 見おわったあと。tutorial.js が ひらく）と、設定画面の「かんたん設定」から ひらく。
  // よく 使う ものだけ: 使い方 → 画面オフ（スマホだけの ときは とばす）→ 天気の場所 → 子ども → やること → 予定。
  // やりなおす ときは いまの 値を 入れて ひらき、ここに ない 設定（鍵・画面オフまでの 分・服装の 目安 など）は さわらない
  var STEPS = ["usage", "screen", "area", "kids", "tasks", "wallet", "lock", "calendar"];
  // はじめの 例は すぐ できる もの（さいしょの「できた！」を 早く。api.js の INITIAL_TASKS と おなじ）
  var EASY_TASKS = ["帰ったら手をあらう", "くつをそろえる", "あしたのじゅんび"];
  var POWER_KEY = "screenOff";        // sleep.js と おなじ（この端末だけ。JSON で 入れる）
  var ORIENT_KEY = "orientation";     // app.js と おなじ
  var step = 0, first = true, saving = false, cur = null, calIds = [], calUrl0 = "", calDevOk = false;
  var place = null, usage = null, power = "dim", names = [], levels = [], rubys = [], kidIds = [], kidColors = [], calPick = null;
  var tasks = [], taskNames = [], tasksEditable = true, taskYen = "1", yenMixed = false;
  // おさいふ（"on"/"off"・使う子の 印（名前の 順）・1ポイント＝○円）と 鍵（"none"/"easy"/"pin"）。2026-11-18
  var walletPick = "off", walletChecks = [], walletRate = "", walletRate0 = "", lockPick = "none", lockNow = { type: "none" };

  // つないだ スマホ・ブラウザ（データが 置いた端末に ある）では、その端末だけの「使い方」「画面オフ」を とばす
  function here() { return Api.local; }
  function steps() {
    return STEPS.filter(function (s) {
      if (!here() && (s === "usage" || s === "screen")) return false;
      if (Api.web && s === "calendar") return false;
      // Web 版は 画面オフを 使わない（sleep.js）
      if (Api.web && s === "screen") return false;
      // まだ 選んで いない ときは、スマホなら「スマホだけ」と みて 数える（選んだ とたんに「1 / 8」が「2 / 7」に かわった。2026-11-19）
      return s !== "screen" || (usage || (Device.phone() ? "phone" : null)) !== "phone";
    });
  }
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* おぼえられなくても つづける */ } }

  // 詳しい 設定で かえて いなければ（毎日・みんな・チェックで 3つまで）、ここで 名前を かえられる
  function easyShaped(list) {
    var regular = list.filter(function (t) { return (t.repeat || {}).type !== "once"; });
    return regular.length <= EASY_TASKS.length && regular.every(function (t) {
      return t.active !== false && !t.kids && (t.repeat || {}).type === "daily" && t.kind !== "count" && !t.yenByKid;
    });
  }

  function open() {
    Api.state().then(function (s) {
      cur = s;
      var st = s.settings || {};
      first = Api.needsSetup();
      saving = false;
      var u = Api.usage(st);
      place = first ? null : u === "board2" ? "board2" : "solo";
      usage = first ? null : u;
      power = Device.canSleep() && readJson(POWER_KEY) === "sleep" ? "sleep" : "dim";
      $("su-front").checked = Device.canFront() && window.EchoBoard.getFront();
      var kids = (s.kids || []).filter(function (k) { return k.active !== false; });
      names = kids.length ? kids.map(function (k) { return k.name; }) : ["", ""];
      levels = kids.length ? kids.map(function (k) { return k.level || "lower"; }) : ["lower", "lower"];
      rubys = kids.length ? kids.map(function (k) { return !!k.ruby; }) : [false, false];
      kidIds = kids.map(function (k) { return k.id; });
      kidColors = kids.map(function (k) { return k.color; });
      walletChecks = kids.map(function (k) { return !!k.wallet; });
      walletPick = walletChecks.some(Boolean) ? "on" : "off";
      // おさいふに 入れる 金額は、いま めざして いる ごほうびの yen（2026-11-24 に 1ポイント＝○円 から かえた。api.js の goalInfo）
      var yens = kids.filter(function (k) { return k.wallet; }).map(function (k) { return Api.goalInfo(s, k.id, "").item.yen; });
      var rated = yens.filter(function (y) { return y > 0; })[0];
      walletRate = walletRate0 = rated ? String(rated) : "";
      lockNow = st.parentLock || { type: "none" };
      lockPick = lockNow.type === "pin" || lockNow.type === "easy" ? lockNow.type : "none";
      $("su-pin").value = "";
      tasks = s.tasks || [];
      tasksEditable = easyShaped(tasks);
      var regular = tasks.filter(function (t) { return (t.repeat || {}).type !== "once"; });
      taskNames = EASY_TASKS.map(function (n, i) { return regular[i] ? regular[i].name : first ? n : ""; });
      // 1つ できるごとの ポイント（円）。みんな おなじ ときは その 値、ちがう ときは 空（そのまま）
      var yens = regular.map(function (t) { return t.yen; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      taskYen = !yens.length ? "1" : yens.length === 1 ? String(yens[0]) : "";
      yenMixed = yens.length > 1;
      // 予定: 設定して あれば「設定する」、なければ「あとで設定する」を えらんだ 状態で ひらく。
      // Apps Script（詳しい 設定）の ときは URL を 見せず、入れた ときだけ iCal に かえる
      var cal = st.calendar || {};
      calPick = cal.type === "device" ? "device" : (cal.type === "ical" || cal.type === "gas") && cal.url ? "ical" : "later";
      calIds = cal.type === "device" ? (cal.ids || []).slice() : [];
      calUrl0 = cal.url || "";
      // 「この端末のカレンダー」は 端末に カレンダーが ある ときだけ 出す（calpick.js）
      calDevOk = cal.type === "device";
      calDevCard();
      window.CalPick.available().then(function (ok) { if (ok) { calDevOk = true; calDevCard(); } });
      $("su-cal-url").value = cal.type === "ical" ? cal.url || "" : "";
      $("su-cal-url").placeholder = cal.type === "gas" && cal.url
        ? "いまは Apps Script で設定しています（変えるときだけ入れてください）" : "https://calendar.google.com/…/basic.ics";
      calWarn();
      var d = st.display || {};
      [["weekday", "07:00", "09:00"], ["holiday", "07:00", "09:00"]].forEach(function (x) {
        var v = d[x[0]] || {};
        $("su-" + x[0] + "-from").value = v.from || x[1];
        $("su-" + x[0] + "-to").value = v.to || x[2];
      });
      window.AreaSelect.fill($("su-office"), $("su-area"), st.location || null);
      $("su-close").hidden = first;
      // 置いた端末に つなぐ 入口（アプリで、データが この端末に ある とき。設定の「この端末」の 4つめの カードと おなじ）
      $("su-connect").hidden = !Device.canJoin();
      // 置いて スマホからも（アプリで スマホに 知らせられる とき。いま そう して いれば かならず 出す）
      $("su-board2").hidden = !(Device.canHost() || u === "board2");
      // ブラウザ（アプリでない）: 2台の カードも 隠さず 出す（usage-cards.js。設定の「この端末」と おなじ）。
      //   理由は カードの 説明に 書く（別の 行に 書くと せまい 画面で スクロールの 先に かくれる）
      var browser = Device.browser();
      $("su-qr-guide").hidden = true;
      $("su-board2").disabled = browser;
      if (browser) {
        $("su-board2").hidden = $("su-connect").hidden = false;
        window.UsageCards.markBrowser($("su-board2"), $("su-connect"));
      }
      // 毎日の お知らせ: スマホ（アプリ）だけ 聞く。まだ 決めて いなければ オン、決めて いれば いまの まま（2026-11-05）
      var noticeAsk = Device.phone() && Device.canNotice();
      $("su-notice-row").hidden = !noticeAsk;
      if (noticeAsk) {
        var nt = Device.notice(), h = Math.floor(nt.minutes / 60), mi = nt.minutes % 60;
        $("su-notice").checked = !nt.set || !!nt.on;
        $("su-notice-text").textContent = "毎朝" + h + "時" + (mi ? mi + "分" : "") + "に、今日の予定とやることをお知らせする";
      }
      // 1枚目: スマホなら「スマホだけ」の 絵と 文。タブレットなどは「置いて 1台で」
      var ph = Device.phone(), solo = $("su-solo");
      solo.querySelector("img").src = ph ? "img/usage-phone.webp" : "img/usage-board.webp";
      solo.querySelector("small").textContent = ph ? "スマホを子どもに渡して、一緒に使う" : "リビングなどに置いて、子どもが自分で見て押す";
      $("setup").hidden = false;
      showStep(0);
    });
  }

  function showStep(n) {
    var list = steps();
    step = n;
    var name = list[n];
    Array.prototype.forEach.call(document.querySelectorAll("#setup .su-step"), function (el) { el.hidden = el.dataset.step !== name; });
    $("su-count").textContent = "かんたん設定 " + (n + 1) + " / " + list.length;
    // やりなおす ときは、さいしょの 手順で「いまの 設定を 置きかえる」ことを しらせる（置いた端末でも スマホでも）
    $("su-warn").hidden = first || n !== 0;
    if (!first && n === 0) $("su-warn").textContent = here()
      ? "いまの設定を、ここで選ぶ内容に置きかえます。いまの値が入っているので、変えないところはそのまま進めてください（服装の目安・もくひょうなどは変わりません）。"
      : "置いてある端末の設定（天気の場所・子ども・やること・予定）を、ここで選ぶ内容に置きかえます。いまの値が入っているので、変えないところはそのまま進めてください。";
    $("su-back").hidden = n === 0;
    $("su-next").textContent = n < list.length - 1 ? "つぎへ" : first ? "はじめる" : "保存する";
    $("su-error").textContent = "";
    if (name === "usage") pick("su-place", place);
    if (name === "screen") {
      $("su-sleep").disabled = !Device.canSleep();
      pick("su-power", power);
      $("su-front-row").hidden = !(Device.canFront() && here());
      // 画面オフまでの 時間（設定の「この端末」の「画面オフまで」。はじめは 1分）
      var idle = parseFloat(((cur && cur.settings && cur.settings.display) || {}).idleMinutes) || 1;
      $("su-idle").textContent = idle < 1 ? Math.round(idle * 60) + "秒" : idle + "分";
    }
    if (name === "kids") renderNames();
    if (name === "tasks") renderTasks();
    if (name === "wallet") renderWallet();
    if (name === "lock") renderLock();
    if (name === "calendar") { pick("su-cal", calPick); calBoxes(false); }
  }

  $("su-connect").addEventListener("click", function () {
    // ブラウザ: アプリの「さがして つなぐ」は できないので、QR で つなぐ 手順を 出す
    if (!Device.app()) return window.UsageCards.showQrGuide($("su-qr-guide"), "center");
    applyNotice();
    $("setup").hidden = true;
    window.Remote.open(function () { $("setup").hidden = false; });
  });
  // 毎日の お知らせを この端末に 入れる（時刻は いまの まま。はじめは 7:00）。オンで 許可が なければ 端末が 聞く
  function applyNotice() {
    if ($("su-notice-row").hidden) return;
    Device.setNotice($("su-notice").checked, Device.notice().minutes);
  }
  $("su-close").addEventListener("click", function () { $("setup").hidden = true; });
  $("su-place").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b || b.dataset.value === "connect") return;   // つなぐ は 下の su-connect で
    place = b.dataset.value;
    // この端末だけ: 置くか 手に もつかは 端末で きめる（設定で 変えて いれば その まま）
    usage = place === "board2" ? "board2" : usage === "board1" || usage === "phone" ? usage : Device.phone() ? "phone" : "board1";
    pick("su-place", place);
  });
  $("su-power").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (b && !b.disabled) { power = b.dataset.value; pick("su-power", power); }
  });

  function renderNames() {
    // 色の 丸は 保存と おなじ 決め方: 前から いる 子は その子の 色、あたらしい 子は まだ つかって いない 色を 順に
    var pal = Object.keys(window.KID_PALETTE), used = {};
    kidColors.forEach(function (c) { if (c) used[c] = true; });
    var swatches = names.map(function (n, i) {
      var c = kidColors[i];
      if (!window.KID_PALETTE[c]) { c = pal.filter(function (x) { return !used[x]; })[0] || pal[0]; used[c] = true; }
      return window.KID_PALETTE[c].main;
    });
    $("su-names").innerHTML = names.map(function (n, i) {
      var c = swatches[i];
      return '<li><span class="swatch" style="background:' + c + '"></span>' +
        '<input type="text" maxlength="12" data-i="' + i + '" placeholder="なまえ" aria-label="' + (i + 1) + 'にんめの なまえ">' +
        // 年齢の めやす。ボードの ことば（ひらがな・漢字）を この子に あわせる
        '<select data-i="' + i + '" aria-label="ねんれいの めやす">' + window.Words.levelOptions({ level: levels[i], ruby: rubys[i] }) + '</select></li>';
    }).join("");
    Array.prototype.forEach.call($("su-names").querySelectorAll("input"), function (el, i) { el.value = names[i]; });
    // 表示できる 子どもの 数（4人。無料も Pro も おなじ）まで 入れたら「＋ ふやす」を 押せなく する
    var max = window.BoardApi.maxKids || 4, full = names.length >= max;
    $("su-add").disabled = full;
    $("su-free").hidden = !full;
    if (full) $("su-free").textContent = window.Words.t("maxKids", "upper", { n: max });
  }
  // select も input イベントを出すので、名前の欄だけ拾う
  $("su-names").addEventListener("input", function (ev) { if (ev.target.tagName === "INPUT") names[+ev.target.dataset.i] = ev.target.value; });
  $("su-names").addEventListener("change", function (ev) {
    if (ev.target.tagName === "SELECT") {
      var pl = window.Words.parseLevel(ev.target.value);
      levels[+ev.target.dataset.i] = pl.level;
      rubys[+ev.target.dataset.i] = pl.ruby;
    }
  });
  $("su-add").addEventListener("click", function () {
    if (names.length < (window.BoardApi.maxKids || 4)) { names.push(""); levels.push("lower"); rubys.push(false); renderNames(); }
  });

  function renderTasks() {
    $("su-tasks-edit").hidden = !tasksEditable;
    $("su-tasks-fixed").hidden = tasksEditable;
    if (!tasksEditable) return;
    $("su-tasks").innerHTML = taskNames.map(function (n, i) {
      return '<li><input type="text" maxlength="30" data-i="' + i + '" placeholder="' + EASY_TASKS[i] + '"></li>';
    }).join("");
    Array.prototype.forEach.call($("su-tasks").querySelectorAll("input"), function (el, i) { el.value = taskNames[i]; });
    $("su-yen").value = taskYen;
    // 項目ごとに ちがう 値の ときは「？」。入れると 3つとも その値に なる
    $("su-yen").placeholder = yenMixed ? "？" : "";
    $("su-yen-mixed").hidden = !yenMixed;
    $("su-tasks-note").textContent = "回数や曜日、子どもごとの やることは、あとから設定の「やること」で変えられます。";
  }
  $("su-tasks").addEventListener("input", function (ev) { taskNames[+ev.target.dataset.i] = ev.target.value; });
  $("su-yen").addEventListener("input", function () { taskYen = $("su-yen").value; });

  // おさいふ: 使う ときは 使う 子（はじめは みんな）と 1ポイント＝○円
  function renderWallet() {
    pick("su-wallet", walletPick);
    $("su-wallet-box").hidden = walletPick !== "on";
    var ul = $("su-wallet-kids");
    ul.innerHTML = "";
    names.forEach(function (n, i) {
      if (!n.trim()) return;
      var li = document.createElement("li"), lb = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.i = i;
      cb.checked = walletChecks[i] !== false;
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(" " + n.trim()));
      li.appendChild(lb);
      ul.appendChild(li);
    });
    $("su-rate").value = walletRate;
  }
  $("su-wallet").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    walletPick = b.dataset.value;
    // 使うに したら、まだ 決めて いない 子は 印を つけた 状態から
    if (walletPick === "on" && !walletChecks.some(Boolean)) walletChecks = names.map(function () { return true; });
    renderWallet();
  });
  $("su-wallet-kids").addEventListener("change", function (ev) { walletChecks[+ev.target.dataset.i] = ev.target.checked; });
  $("su-rate").addEventListener("input", function () { walletRate = $("su-rate").value; });
  function walletKid(i) { return walletPick === "on" && walletChecks[i] !== false; }

  // 鍵: いまの 鍵を えらんだ 状態から。番号は いま 番号の ときは 空なら そのまま
  function renderLock() {
    pick("su-lock", lockPick);
    $("su-pin-row").hidden = lockPick !== "pin";
    $("su-pin-keep").hidden = !(lockPick === "pin" && lockNow.type === "pin" && /^\d{4}$/.test(lockNow.pin || ""));
  }
  $("su-lock").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    lockPick = b.dataset.value;
    renderLock();
    if (lockPick === "pin") $("su-pin").focus();
  });
  $("su-pin").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); });
  function readLock() {
    if (lockPick !== "pin") return { type: lockPick };
    var pin = $("su-pin").value;
    if (!pin && lockNow.type === "pin" && /^\d{4}$/.test(lockNow.pin || "")) pin = lockNow.pin;
    return /^\d{4}$/.test(pin) ? { type: "pin", pin: pin } : null;
  }

  $("su-cal").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    calPick = b.dataset.value;
    pick("su-cal", calPick);
    calBoxes(true);
    if (calPick === "ical") $("su-cal-url").focus();
  });
  function calDevCard() { $("su-cal").querySelector("button[data-value=device]").hidden = !calDevOk; }
  // えらんだ カードの 中身（この端末の カレンダーの 一覧・URL の 欄）。ask: 許可が なければ すぐ 聞く（カードを 押した とき）
  function calBoxes(ask) {
    $("su-cal-box").hidden = calPick !== "ical";
    if (calPick === "device") window.CalPick.show($("su-cal-device"), calIds, ask);
    else $("su-cal-device").hidden = true;
  }
  // 共有リンクなど 読めない URL を 貼ったら、その場で 正しい URL の 出し方を 出す（api.js の calUrlProblem）
  function calWarn() {
    var bad = !!Api.calUrlProblem($("su-cal-url").value);
    $("su-cal-warn").hidden = !bad;
    $("su-cal-warn").textContent = bad ? window.Words.t("calShareLink", "upper") : "";
    return bad;
  }
  $("su-cal-url").addEventListener("input", calWarn);

  // 大きな カードの どれか ひとつを えらぶ
  function pick(groupId, value) {
    Array.prototype.forEach.call($(groupId).children, function (b) { b.classList.toggle("on", b.dataset.value === value); });
  }

  // やること: 名前だけ かえる（id・ポイントなどは そのまま。名前を かえたら 読みがなは けす）。1回だけの やることは そのまま
  function nextTasks() {
    var regular = tasks.filter(function (t) { return (t.repeat || {}).type !== "once"; });
    var once = tasks.filter(function (t) { return (t.repeat || {}).type === "once"; });
    var list = [], yen = String(taskYen).trim() === "" ? null : Math.max(0, Math.min(999, parseInt(taskYen, 10) || 0));
    taskNames.forEach(function (n, i) {
      var name = String(n || "").trim();
      if (!name) return;
      var t = regular[i] ? JSON.parse(JSON.stringify(regular[i])) : { yen: 1, kind: "check", kids: null, repeat: { type: "daily" }, slot: null, active: true };
      if (t.name !== name) delete t.kana;
      t.name = name;
      if (yen !== null) t.yen = yen;
      list.push(t);
    });
    return list.concat(once);
  }

  function save() {
    var rate = walletRate.trim() === "" ? 0 : parseInt(walletRate, 10) || 0;
    var kids = names.map(function (n, i) {
      // おさいふ: 使わない 子は 印を はずす（ごほうびの 金額は のこす）。使う 子は いま めざして いる ごほうびの 金額も 送る（goalYen）
      //   やり直しで 金額の 欄を さわらなければ、前から 金額の ある 子は その子の 金額の まま（設定で 子どもごとに 変えた 分を そろえない。2026-11-18）
      var w = { wallet: walletKid(i), ruby: !!rubys[i] };
      var had = (cur.kids || []).filter(function (k) { return k.id && k.id === kidIds[i]; })[0];
      if (w.wallet && !(walletRate === walletRate0 && had && Api.goalInfo(cur, had.id, "").item.yen > 0)) w.goalYen = rate;
      return Object.assign({ name: n.trim(), level: levels[i], id: kidIds[i] }, w);
    });
    if (saving) return;   // つづけて おしても 2回 とうろく しない
    saving = true;
    // 前から いる 子は id と 色を そのまま。あたらしい 子は まだ つかって いない 色
    var old = {}, used = {};
    (cur.kids || []).forEach(function (k) { old[k.id] = k; if (k.active !== false) used[k.color] = true; });
    var colors = Object.keys(window.KID_PALETTE);
    var sendKids = kids.filter(function (k) { return k.name; }).map(function (k) {
      var w = { wallet: k.wallet, ruby: k.ruby };
      if ("goalYen" in k) w.goalYen = k.goalYen;
      if (k.id && old[k.id]) return Object.assign({}, old[k.id], { name: k.name, level: k.level, active: true }, w);
      var c = colors.filter(function (x) { return !used[x]; })[0] || colors[0];
      used[c] = true;
      return Object.assign({ name: k.name, level: k.level, color: c }, w);
    });
    var next = { location: window.AreaSelect.value($("su-office"), $("su-area")), parentLock: readLock() };
    if (here()) next.usage = usage;   // つないだ スマホからは 置いた端末の 使い方を かえない
    if (here() && usage !== "phone") {
      next.display = {
        weekday: { from: $("su-weekday-from").value, to: $("su-weekday-to").value },
        holiday: { from: $("su-holiday-from").value, to: $("su-holiday-to").value },
      };
    }
    var url = $("su-cal-url").value.trim();
    if (calPick === "ical" && url) next.calendar = { type: "ical", url: url };
    if (calPick === "device") next.calendar = { type: "device", ids: window.CalPick.picked($("su-cal-device")), url: calUrl0 };
    var oldUsage = first ? null : Api.usage(cur.settings);
    // 子ども → 設定 → やること を まとめて 保存（どれか だめなら なにも かえない。古い 置いた端末には 1つずつ）
    Api.postAll([{ path: "/api/board/kids", body: { kids: sendKids } }, { path: "/api/board/settings", body: next },
      tasksEditable ? { path: "/api/parent/tasks", body: { tasks: nextTasks() } } : null]).then(function () {
      // 画面オフ・向きは この端末だけの 設定（つないだ スマホ・ブラウザでは さわらない）
      if (here() && usage !== "phone") writeJson(POWER_KEY, power);
      if (here() && usage !== "phone" && Device.canFront()) {
        window.EchoBoard.setFront($("su-front").checked);
        if ($("su-front").checked && !window.EchoBoard.canDrawOverlays()) window.EchoBoard.requestOverlay();
      }
      // 使い方を かえた ときだけ 画面の 向きも あわせる（スマホだけ: 縦 / 置く: 横）
      if (here() && usage !== oldUsage && (usage === "phone" || oldUsage === "phone")) {
        var o = usage === "phone" ? "portrait" : "landscape";
        writeJson(ORIENT_KEY, o);
        try { if (Device.canOrient()) window.EchoBoard.setOrientation(o); } catch (e) { /* できない環境 */ }
      }
      $("setup").hidden = true;
      window.dispatchEvent(new Event("board:reload"));
      // 子どもと いっしょに 使い方を ためすかを 聞く（guide.js。まだ やって いない 置いた 端末だけ）
      if (window.Guide) window.Guide.afterSetup();
    }).catch(function (e) {
      saving = false;
      $("su-error").textContent = "保存できませんでした（" + e.message + "）";
    });
  }

  $("su-back").addEventListener("click", function () { showStep(step - 1); });
  $("su-next").addEventListener("click", function () {
    var name = steps()[step];
    if (name === "usage" && !place) { $("su-error").textContent = "使い方を選んでください"; return; }
    if (name === "usage") applyNotice();
    // 府県だけ えらんで 市区町村が まだ だと 天気が 出ないので、ここで しらせる（どちらも 空なら あとで 設定）
    if (name === "area" && $("su-office").value && !window.AreaSelect.value($("su-office"), $("su-area"))) {
      $("su-error").textContent = "市区町村も選んでください"; return;
    }
    if (name === "kids" && !names.some(function (n) { return n.trim(); })) { $("su-error").textContent = "名前を1人以上入れてください"; return; }
    if (name === "tasks" && tasksEditable && String(taskYen).trim() !== "" && !/^\d{1,3}$/.test(String(taskYen).trim())) {
      $("su-error").textContent = "ポイントは 0〜999 の数字で入れてください"; return;
    }
    if (name === "wallet" && walletPick === "on") {
      if (!names.some(function (n, i) { return n.trim() && walletKid(i); })) { $("su-error").textContent = "おさいふを使う子を選んでください"; return; }
      if (walletRate.trim() !== "" && !/^\d{1,6}$/.test(walletRate.trim())) { $("su-error").textContent = "金額は数字で入れてください"; return; }
    }
    if (name === "lock" && !readLock()) { $("su-error").textContent = "鍵の4桁の番号を入れてください"; $("su-pin").focus(); return; }
    if (name === "calendar" && calPick === "device") {
      calIds = window.CalPick.picked($("su-cal-device"));
      if (!calIds.length) { $("su-error").textContent = window.Words.adult("calPickNone"); return; }
    }
    if (name === "calendar" && calPick === "ical") {
      var url = $("su-cal-url").value.trim();
      if (url && !/^(https|webcal):\/\/\S+$/i.test(url)) { $("su-error").textContent = "URL は https:// で始まるものを入れてください"; return; }
      if (calWarn()) { $("su-error").textContent = "この URL では予定を読めません（上の説明を見てください）"; return; }
    }
    if (step < steps().length - 1) return showStep(step + 1);
    save();
  });

  window.EasySetup = { open: open };
})();
