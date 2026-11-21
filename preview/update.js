// 新しい版の おしらせと 更新（2026-11-16 に おしらせ、11-18 に アプリの 中で 更新・夜の 自動更新）。
//   Play から 入れた アプリ: Play に この端末へ 届く 新しい 版が あるか 聞く（MainActivity の checkUpdate・getUpdate）
//     歯車を 押すと 最初に おしらせ（#upd）。「OK」= 裏で ダウンロードして、自動更新の 時間帯（はじめ 4:00〜5:00）に 入れ替える
//     （Play の 確認が 1回 出る。入れ替えは だれも さわって いない ときだけ。開きなおしたら 待機の まま）。「今すぐ更新」= その場で
//     自動更新は この端末だけの 設定（設定の「この端末」）。スマホだけで 使う ときは 夜に 前に 出て いないので「今すぐ更新」だけ
//   置いた端末に つないだ スマホの アプリ・ブラウザ: 置いた端末の /api/state の board.update を 見て「本体で更新してください」（ボタンなし）
//   子どもの 画面には 言葉を 出さず、歯車の 色と 点で 知らせる（style.css の .gear-btn.has-update・.update-set）
(function () {
  var eb = window.EchoBoard, api = window.BoardApi, B = window.Board;
  var state = "unknown", board = false, checking = null;
  // 置いた端末の アプリの 版（つないだ スマホの アプリで くらべる。null は まだ 読んで いない、"" は 版を 返さない 古い 版）
  var boardVer = null;
  var CHECK_MS = 6 * 60 * 60 * 1000; // 置きっぱなしの 端末は 前に もどる ことが ないので 6時間ごとにも 聞く
  var AUTO_KEY = "autoUpdate", NIGHT_KEY = "updateNight";
  var IDLE_MS = 10 * 60 * 1000;      // 入れ替えるのは 10分 だれも さわって いない とき

  function $(id) { return document.getElementById(id); }
  function A(key) { return window.Words.adult(key); }
  function canAsk() { return !!(eb && eb.checkUpdate && eb.getUpdate); }
  function canInstall() { return !!(eb && eb.startUpdate && eb.completeUpdate); }
  function ask() {
    if (!canAsk()) return;
    try { eb.checkUpdate(); } catch (e) { /* ふるい アプリ */ }
  }

  // ---- 自動更新の 設定（この端末だけ）----
  function auto() {
    var a = B.storageGet(AUTO_KEY) || {};
    return { on: a.on !== false, from: a.from || "04:00", to: a.to || "05:00" };
  }
  // 夜に 前に 出て いる 使い方（置いて 使う）の ときだけ 時間帯で 入れ替える
  function nightOk() { return canInstall() && auto().on && api.usage(B.settings) !== "phone" && !api.remote; }
  function mins(hm) { return +hm.slice(0, 2) * 60 + +hm.slice(3, 5); }
  function inWindow(now) {
    var a = auto(), m = now.getHours() * 60 + now.getMinutes(), f = mins(a.from), t = mins(a.to);
    return f <= t ? (m >= f && m < t) : (m >= f || m < t);
  }
  // 「明日 4:00〜5:00」（時間帯の 前なら 今日）
  function when() {
    var a = auto(), now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    var day = inWindow(now) ? A("updToday") : (m < mins(a.from) ? A("updToday") : A("updTomorrow"));
    return day + " " + a.from.replace(/^0/, "") + "〜" + a.to.replace(/^0/, "");
  }

  function readSelf() {
    try { state = canAsk() ? String(eb.getUpdate()) : "unknown"; } catch (e) { state = "unknown"; }
    render();
    if (checking) checked();
  }
  // つないで いる ときだけ（この端末に データが ある ときは 自分が 本体）
  function readBoard() {
    if (api.local) return;
    api.state().then(function (s) {
      board = !!(s && s.board && s.board.update);
      boardVer = (s && s.board && s.board.version) || "";
      render();
    }).catch(function () { /* つながらない ときは そのまま */ });
  }

  // 版の くらべ（"0.1.20" と "0.1.9" など。数の 大きさで くらべる）
  function cmpVer(a, b) {
    var x = String(a).split("."), y = String(b).split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d;
    }
    return 0;
  }
  // つないだ スマホの アプリと 置いた端末で 版が ちがうか（11-18。スマホの アプリは 自分の 画面で 置いた端末の データを
  //   使うので、ずれると 機能が 欠ける。ブラウザは 置いた端末の 画面を 開くので ずれない）。"board" = 置いた端末が 古い、"me" = スマホが 古い
  function verDiff() {
    if (!api.remote || boardVer === null) return "";
    var me = window.APP_VERSION || "";
    if (!boardVer) return "board";
    var d = cmpVer(boardVer, me);
    return d < 0 ? "board" : d > 0 ? "me" : "";
  }
  function hasNew() { return state === "available" || state === "downloading" || state === "downloaded"; }
  // 更新を 待って いる（OK を 押して、夜に 入れ替える）
  function waiting() { return (state === "downloading" || state === "downloaded") && nightOk(); }

  function render() {
    var gear = $("gear-btn"), bar = $("s-update");
    // 押して ほしい ときは オレンジと 赤い 点。夜に 入れ替える のを 待つ ときは 点だけ
    // アドレスが かわった（置いた端末。settings.js の LanNotice）も 同じ 札で 知らせる。両方 ある ときは「更新」
    var addr = !!(window.LanNotice && window.LanNotice.changed()), vd = verDiff(), upd = (hasNew() && !waiting()) || board || !!vd;
    if (gear) {
      gear.classList.toggle("has-update", upd || addr);
      gear.classList.toggle("update-set", waiting() && !board && !addr);
      var tag = gear.querySelector(".gear-tag");
      if (tag) tag.textContent = !upd && addr ? A("gearAddress") : A("gearUpdate");
    }
    if (!bar) return;
    var lines = [], btn = false;
    if (state === "available") { lines.push(A("updateSelf")); btn = true; }
    else if (waiting()) lines.push(A("updWait").replace("{when}", when()));
    else if (state === "downloading") lines.push(A("updDownloading"));
    else if (state === "downloaded") { lines.push(A("updReady")); btn = true; }
    if (vd) lines.push(A(vd === "board" ? "verBoardOld" : "verMeOld").replace("{board}", boardVer || A("verOld")).replace("{me}", window.APP_VERSION || ""));
    else if (board) lines.push(A("updateBoard"));
    bar.hidden = !lines.length;
    bar.querySelector(".s-update-text").textContent = lines.join("。");
    $("s-update-btn").hidden = !btn;
  }

  // ---- おしらせ（歯車を 押したとき・設定の「更新する」「更新を確認」）----
  var after = null;
  function closePop(go) {
    $("upd").hidden = true;
    var next = after; after = null;
    if (go && next) next();
  }
  function showPop(next) {
    after = next || null;
    var night = nightOk(), text, ok = false, now = false;
    if (state === "available") {
      text = night ? A("updAsk").replace("{when}", when()) : A("updateSelf");
      ok = night; now = true;
    } else if (state === "downloaded") {
      text = night ? A("updWait").replace("{when}", when()) : A("updReady");
      now = true;
    } else if (state === "downloading") {
      text = night ? A("updWait").replace("{when}", when()) : A("updDownloading");
    } else return false;
    $("upd-text").textContent = text;
    $("upd-note").hidden = !(ok || (now && state === "available"));
    $("upd-ok").hidden = !ok;
    $("upd-now").hidden = !now;
    $("upd-later").textContent = next ? A("updOpenSettings") : A("updClose");
    $("upd").hidden = false;
    return true;
  }
  $("upd-ok").addEventListener("click", function () { closePop(false); eb.startUpdate(false); });
  $("upd-now").addEventListener("click", function () {
    closePop(false);
    if (state === "downloaded") eb.completeUpdate(); else eb.startUpdate(true);
  });
  $("upd-later").addEventListener("click", function () { closePop(true); });
  $("upd-close").addEventListener("click", function () { closePop(false); });

  // 設定の いちばん上の「更新する」
  $("s-update-btn").addEventListener("click", function () {
    if (canInstall()) { if (!showPop(null)) ask(); }
    else { try { eb.openStore(); } catch (e) { /* ふるい アプリ */ } }
  });

  // 設定の「ヘルプ」の「更新を確認」
  var checkBtn = $("s-update-check"), checkMsg = $("s-update-check-msg");
  if (checkBtn) {
    checkBtn.hidden = !canAsk();
    checkBtn.addEventListener("click", function () {
      checkMsg.textContent = A("updChecking");
      clearTimeout(checking);
      checking = setTimeout(function () { checking = null; checkMsg.textContent = A("updCheckFail"); }, 15000);
      ask();
    });
  }
  function checked() {
    clearTimeout(checking); checking = null;
    if (state === "noplay") checkMsg.textContent = A("updNoPlay");
    else if (hasNew()) { checkMsg.textContent = ""; if (!canInstall() || !showPop(null)) checkMsg.textContent = A("updateSelf"); }
    else checkMsg.textContent = A("updLatest");
  }

  // ---- 夜の 入れ替え ----
  function night() {
    if (state !== "downloaded" || !nightOk() || !inWindow(new Date())) return;
    if (!$("settings").hidden || !$("upd").hidden) return;
    if (!B.sleeping && Date.now() - B.lastTouch < IDLE_MS) return;
    B.storageSet(NIGHT_KEY, Date.now());
    try { eb.completeUpdate(); } catch (e) { /* ふるい アプリ */ }
  }
  // 夜に 入れ替えて 開きなおした ときは、画面を 明るく しないで 待機から はじめる
  (function () {
    var t = B.storageGet(NIGHT_KEY);
    if (!t) return;
    B.storageSet(NIGHT_KEY, null);
    if (Date.now() - t < 30 * 60 * 1000) B.lastTouch = 0;
  })();

  function refresh() { ask(); readBoard(); }
  window.addEventListener("board:update", readSelf);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  setInterval(refresh, CHECK_MS);
  setInterval(night, 60 * 1000);
  refresh();

  window.Update = {
    // 置いた端末が つないだ スマホに 知らせる（api.js の lanServe）
    self: function () { return hasNew(); },
    // 歯車を 押したとき（settings.js）。おしらせを 出したら true（「設定を開く」で next）
    popup: function (next) { return canInstall() && showPop(next); },
    auto: auto,
    render: render,
    // 確かめ用（PC で 見た目を 撮る）: Update.show("available", false)
    show: function (s, b) { state = s === true ? "available" : (s || "none"); board = !!b; render(); },
  };
})();
