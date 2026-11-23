// 押して 覚える ガイド（2026-11-20、0.1.23）。見て ほしい ところ だけ 明るく して、ほかは 半分 暗く する。
//   子どもの 部分: 天気 → 家族の 予定（読めて いる ときだけ）→ 名前 → だいじ の 箱（ある ときだけ）→ 火の ボタン（いまから やる）→ やることを 1つ 押す → みました・ゲージ → おさいふ（使う 子だけ）→ できるようになったこと → ✕
//   おうちの人の 部分: 置いた 端末は 歯車を 指して ひとこと。つないだ スマホ・QR の ブラウザは 設定の タブ（がんばりチェック・鍵・ヘルプ）
//   はじめかた: かんたん設定の あとに「まずはお子さんと一緒に、使い方を試しましょう」（11-23 に 強めた。前は「試しますか？」）。「あとで」は 次の 日に 1度だけ 聞きなおす。
//   いつでも 設定の「ヘルプ」→「使い方をためす」。「とばす」は いつも 出す（押さないと 進めない 作りなので 逃げ道を 残す）
//   くわしくは docs/handover/onboarding-walk.md の「説明とガイド」
(function () {
  "use strict";

  var DONE_KEY = "guide:done";       // 子どもの 部分を 終えた（とばした）。この端末だけ
  var LATER_KEY = "guide:later";     // 「あとで」を 押した 日（YYYY-MM-DD）。次の 日に 1度だけ 聞く
  var PARENT_KEY = "guide:parent";   // つないだ スマホ・ブラウザで おうちの人の 部分を 終えた
  var B = window.Board, Api = window.BoardApi;
  var steps = [], idx = -1, timer = null, waitSince = 0, moving = false;

  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* おぼえられなくても すすむ */ } }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function here() { return !Api.remote && !Api.paired; }
  // 子どもの 文は いちばん 小さい 子に あわせる（B.level）。おうちの人の 呼び方も 入れる
  function K(key) { return window.Words.t(key, B.level || "lower", { parent: B.parentName || "ママ・パパ" }); }
  function visible(el) { return !!el && el.getClientRects().length > 0 && !el.closest("[hidden]"); }
  function pick(sel) { return typeof sel === "function" ? sel() : document.querySelector(sel); }

  // ---- 手順 ----
  function confirmed() { return $("kv-status").classList.contains("ok"); }
  // やることの 行だけ（ごぜん・ごご の 見出しは のぞく）
  function firstTask() {
    //   まだ できて いない 行を 先に（できた 行を 押すと 取り消しに なる）
    var lis = document.querySelectorAll("#kv-list li[data-task]"), first = null;
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].classList.contains("bundle") || lis[i].classList.contains("weekdone") || !visible(lis[i])) continue;
      if (!lis[i].classList.contains("done")) return lis[i];
      first = first || lis[i];
    }
    return first;
  }
  function firstGo() {
    var b = document.querySelector("#kv-list button.go");
    return visible(b) ? b : null;
  }
  function kidSteps() {
    var board2 = Api.usage(B.settings) === "board2";
    var lock = (B.settings.parentLock || {}).type || "none";
    return [
      { sel: ".card.weather", t: "gdWeatherT", x: "gdWeather", tap: true },
      // 予定は 読めて いる ときだけ（つないで いない・読めない 家は おうちの人の 部分で 場所だけ 言う）
      { sel: ".card.schedule", t: "gdEventsT", x: "gdEvents", tap: true, when: function () { return !!(B.calReady && B.calReady()); } },
      { sel: "#kids", hit: ".kid-btn", t: "gdNameT", x: "gdName", tap: true, until: function () { return !$("kid-view").hidden; } },
      // だいじ の 箱（おうちの人が だいじ を 付けた 家・その日に ある ときだけ）
      { sel: "#kv-list li.daiji", t: "gdDaijiT", x: "gdDaiji", when: function () { return visible(document.querySelector("#kv-list li.daiji")); } },
      // 火の ボタン（いまから やる）。押すと 吹き出しの 演出が 出るので、終わるまで 待つ（hold）。「やるきの ひ」「いってから やってみよう」は ここで 言う（演出には 出さない）
      { sel: firstGo, t: "gdGoT", x: "gdGo", tap: true, hold: 2600, when: function () { return !!firstGo(); } },
      // 「みました」の あとに 押すと「みました」が 取り消しに なるので、その日は 押させない
      { sel: firstTask, t: "gdTaskT", x: "gdTask", tap: function () { return !confirmed(); } },
      { sel: "#kv-status", t: "gdShowT", x: "gdShow" },
      { sel: "#kv-wallet", t: "gdWalletT", x: "gdWallet", when: function () { return visible($("kv-wallet")); } },
      // できるようになったこと（緑の 階段）。押さないと 気づかないので 1度 指す（11-20 ユーザー）
      { sel: "#kv-grad", t: "gdGradT", x: "gdGrad", when: function () { return visible($("kv-grad")); } },
      { sel: "#kv-close", t: "gdCloseT", x: "gdClose", tap: true, until: function () { return $("kid-view").hidden; } },
      { sel: "#gear-btn", adult: true, title: "おうちの人へ：設定はここ",
        text: "毎晩の「みました」は「がんばりチェック」、困ったときは「ヘルプ」。" +
          (lock === "none" ? "鍵をかけると、設定と「みました」はおうちの人だけになります（「おうちの人」）。" : "") +
          (B.calReady && B.calReady() ? "" : "家族の予定は「ボードの表示」でカレンダーをつなぐと出ます。") +
          (board2 ? "つないだスマホからもできます。" : "") },
    ];
  }
  // つないだ スマホ・QR の ブラウザ（おうちの人が ふだん 使う 端末）。設定が 開いて いる ところで タブを 指す
  function parentSteps() {
    var lock = (B.settings.parentLock || {}).type || "none";
    return [
      { sel: "#s-nav [data-page=day]", adult: true, title: "毎晩ここで「みました」", text: "子どもがチェックしたやることを見て、「みました」を押します。" },
      { sel: "#s-nav [data-page=parent]", adult: true, title: "鍵はここ", text: "鍵をかけると、設定と「みました」はおうちの人だけになります。",
        when: function () { return lock === "none"; } },
      { sel: "#s-nav [data-page=contact]", adult: true, title: "困ったときはここ", text: "よくある質問と、ご要望・お問い合わせがあります。" },
    ];
  }

  // ---- 見せる ----
  function start(list, doneKey) {
    stop(false);
    steps = list.map(function (s) { s.doneKey = doneKey; return s; });
    idx = -1;
    $("guide").hidden = false;
    next();
    timer = setInterval(place, 250);
  }
  function stop(done) {
    var key = steps.length && steps[0].doneKey;
    clearInterval(timer);
    timer = null;
    idx = -1;
    steps = [];
    moving = false;
    $("guide").classList.remove("moving", "holding");
    $("guide").hidden = true;
    if (done && key) put(key, "1");
  }
  function next() {
    moving = false;
    for (idx = idx + 1; idx < steps.length; idx++) {
      var s = steps[idx];
      if (!s.when || s.when()) break;
    }
    if (idx >= steps.length) return stop(true);
    waitSince = Date.now();
    var s2 = steps[idx], tap = tapOf(s2);
    $("gd-title").innerHTML = s2.adult ? s2.title : K(s2.t);
    $("gd-text").innerHTML = s2.adult ? s2.text : K(s2.x);
    $("gd-tip").classList.toggle("adult", !!s2.adult);
    $("gd-hint").textContent = tap ? K("gdTap") : "";
    $("gd-next").hidden = tap;
    $("gd-next").textContent = s2.adult ? "わかった" : K("gdNext");
    $("gd-skip").textContent = s2.adult ? "とばす" : K("gdSkip");
    place();
  }
  function tapOf(s) { return typeof s.tap === "function" ? s.tap() : !!s.tap; }

  // 見せる ところに 穴を あけて、まわりの 4つの 板で ほかを 押せなく する（押さない 手順は 穴も ふさぐ）
  function place() {
    if (idx < 0 || moving) return;
    var s = steps[idx], el = pick(s.sel);
    if (!visible(el)) {
      // 出るまでは 枠と 吹き出しを かくして 画面ぜんぶを ふさぐ。3びょう 待っても 出なければ（子どもの 画面が とじた など）その 手順は とばす
      $("guide").classList.add("waiting");
      box("gd-top", 0, 0, window.innerWidth, window.innerHeight);
      if (Date.now() - waitSince > 3000) next();
      return;
    }
    $("guide").classList.remove("waiting");
    // 枠は 画面の 内側に おさめる（画面の はばいっぱいの 欄だと、外に ふとる 枠が スマホで 左右に 切れた。11-20）
    var r = el.getBoundingClientRect(), pad = 4, edge = 4, W = window.innerWidth, H = window.innerHeight;
    var x = Math.max(edge, r.left - pad), y = Math.max(edge, r.top - pad);
    var x2 = Math.min(W - edge, r.right + pad), y2 = Math.min(H - edge, r.bottom + pad);
    box("gd-top", 0, 0, W, y);
    box("gd-bottom", 0, y2, W, H - y2);
    box("gd-left", 0, y, x, y2 - y);
    box("gd-right", x2, y, W - x2, y2 - y);
    box("gd-ring", x, y, x2 - x, y2 - y);
    $("gd-cover").hidden = tapOf(s);
    box("gd-cover", x, y, x2 - x, y2 - y);
    // 吹き出しは 下に 入れば 下、だめなら 上、どちらも だめなら 画面の 下の はし
    var tip = $("gd-tip"), tw = Math.min(W - 24, Math.max(360, W * 0.36)), th = tip.offsetHeight || 140, gap = 14;
    var left = Math.max(12, Math.min(W - tw - 12, (x + x2) / 2 - tw / 2));
    var top = y2 + gap + th <= H - 8 ? y2 + gap : y - gap - th >= 8 ? y - gap - th : H - th - 12;
    tip.style.width = tw + "px";
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }
  function box(id, l, t, w, h) {
    var e = $(id).style;
    e.left = Math.round(l) + "px"; e.top = Math.round(t) + "px";
    e.width = Math.max(0, Math.round(w)) + "px"; e.height = Math.max(0, Math.round(h)) + "px";
  }

  // 穴の 中を 押したら（本物の ボタンが 動いた あと）次へ。until が ある ときは その 画面に なるまで 待つ
  document.addEventListener("click", function (ev) {
    if (idx < 0 || moving) return;
    var s = steps[idx];
    if (!tapOf(s)) return;
    var el = pick(s.sel), hit = s.hit ? ev.target.closest(s.hit) : null;
    if (!el || !el.contains(ev.target) || (s.hit && !hit)) return;
    moving = true;
    $("guide").classList.add("moving");
    // hold の ある 手順（火の ボタン）は、演出が 見えるよう その あいだ 幕を すける（押せないのは そのまま）
    $("guide").classList.toggle("holding", !!s.hold);
    var t0 = Date.now();
    (function wait() {
      if (idx < 0) return;
      var dt = Date.now() - t0;
      if (dt >= (s.hold || 0) && (!s.until || s.until() || dt > 3000 + (s.hold || 0))) { $("guide").classList.remove("moving", "holding"); setTimeout(next, 350); }
      else setTimeout(wait, 150);
    })();
  }, true);
  $("gd-next").addEventListener("click", next);
  $("gd-skip").addEventListener("click", function () { stop(true); });

  // ---- はじめかた ----
  function canAsk() { return here() && !get(DONE_KEY) && (B.kids || []).length > 0; }
  function ask(again) {
    $("gd-ask").hidden = false;
    $("gd-ask").dataset.again = again ? "1" : "";
  }
  $("gd-ask-yes").addEventListener("click", function () {
    $("gd-ask").hidden = true;
    put(LATER_KEY, null);
    startKids();
  });
  $("gd-ask-no").addEventListener("click", function () {
    $("gd-ask").hidden = true;
    // 聞きなおすのは 1度だけ（2度目の「あとで」は 設定の「ヘルプ」から）
    put(LATER_KEY, $("gd-ask").dataset.again ? null : ymd(new Date()));
  });
  function startKids() {
    // 子どもの 画面や 設定が 開いて いたら 閉じて、ホームから はじめる
    if (!$("kid-view").hidden) $("kv-close").click();
    setTimeout(function () { start(kidSteps(), DONE_KEY); }, 400);
  }
  function startParent() { start(parentSteps(), PARENT_KEY); }

  // 次の 日に 1度だけ（朝 5時から。ホームが 出て いて ほかの 画面が 開いて いない とき）
  function askLater() {
    var d = get(LATER_KEY);
    if (!d || d >= ymd(new Date()) || new Date().getHours() < 5 || !canAsk() || busy()) return;
    ask(true);
  }
  function busy() {
    return ["setup", "tutorial", "settings", "kid-view", "lock", "quick", "connect", "sleep"].some(function (id) { var e = $(id); return e && !e.hidden; }) || idx >= 0;
  }

  // つないだ スマホ・ブラウザ: 設定が 開いて（鍵の あと）おちついたら 1度だけ
  var parentTries = 0;
  function watchParent() {
    if (here() || get(PARENT_KEY) || idx >= 0) return;
    if (!$("settings").hidden && !visible($("lock")) && B.gotState) return startParent();
    if (++parentTries < 120) setTimeout(watchParent, 1000);
  }

  window.addEventListener("board:fit", place);
  window.addEventListener("resize", place);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(askLater, 1500); });
  setTimeout(askLater, 4000);
  setTimeout(watchParent, 3000);

  window.Guide = {
    // かんたん設定を 保存した あと（setup.js）。読みなおしが 終わってから 聞く
    //   1度 やった あとも、かんたん設定を やりなおしたら 毎回 聞く（「あとで」で やめられる。11-20 ユーザー）
    //   前は 1.5びょう 待って いて「ラグが ある」と 言われた（11-20）。読みなおしが 終わった（board:state）すぐ あとに 聞く
    afterSetup: function () {
      var asked = false;
      function go() { if (asked) return; asked = true; window.removeEventListener("board:state", soon); if (here() && (B.kids || []).length && !busy()) ask(false); }
      function soon() { setTimeout(go, 150); }
      window.addEventListener("board:state", soon);
      setTimeout(go, 2500);   // 読みなおしの 知らせが 来なくても
    },
    // 設定の「ヘルプ」→「使い方をためす」
    open: function () { if (here()) startKids(); else startParent(); },
    active: function () { return idx >= 0 || !$("gd-ask").hidden; },
    // 戻るキー（board.js）
    back: function () { if (!$("gd-ask").hidden) $("gd-ask-no").click(); else stop(true); },
  };
})();
