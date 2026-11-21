// ブラウザ版の 入口「Google ドライブと つないで はじめる」（Web 版で Drive.on、まだ データが ない ときだけ。2026-11-21 社長。表の 15a）。
//   つないで はじめる（おすすめ）→ Google の 窓 → 控えが あれば「戻す／新しく 始める」、なければ いつもの 説明 → かんたん設定。
//   つながずに 使う → いつもの 説明 → かんたん設定（あとから 設定の「おうちの人」で つなげる）。
//   前の データを 戻す → ドライブから／ファイルから。Google の 決まりで つなぐのは 必須に しない。
//   選んだ 印は localStorage の drive:start（ブラウザが 消すと 印も 消えて 入口が また 出る。戻す 入口に なるので よい）。
//   くわしい 設計は docs/handover/web-drive-entry.md
(function () {
  "use strict";

  var KEY = "drive:start";
  var $ = function (id) { return document.getElementById(id); };
  var AW = window.Words.adult;
  var next = null, found = null, busy = false;

  function chosen() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function choose(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* おぼえられなくても すすむ */ } }
  // 入口を 出すか（tutorial.js が はじめての 分かれ道の 前に 聞く）
  function wanted() { return !!(window.Drive && window.Drive.on()) && window.BoardApi.needsSetup() && !chosen(); }

  function when(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function step(id) {
    ["ds-first", "ds-found", "ds-from"].forEach(function (s) { $(s).hidden = s !== id; });
    msg("");
  }
  function msg(t) { $("ds-msg").textContent = t || ""; }
  // 押して いる 間は ほかを 押せなく する
  function lock(on) {
    busy = on;
    Array.prototype.forEach.call($("drive-start").querySelectorAll("button"), function (b) { b.disabled = on; });
  }

  function fill() {
    $("ds-title").textContent = AW("driveStartTitle");
    $("ds-link").querySelector("b").textContent = AW("driveStartLink");
    $("ds-link").querySelector("small").textContent = AW("driveStartLinkNote");
    $("ds-local").querySelector("b").textContent = AW("driveStartLocal");
    $("ds-local").querySelector("small").textContent = AW("driveStartLocalNote");
    $("ds-note").textContent = AW("driveStartNote");
    $("ds-restore").textContent = AW("driveStartRestore");
    $("ds-use").textContent = AW("driveStartUse");
    $("ds-new").querySelector("span").textContent = AW("driveStartNew");
    $("ds-new").querySelector("small").textContent = AW("driveStartNewNote");
    $("ds-from-title").textContent = AW("driveStartRestore");
    $("ds-from-drive").textContent = AW("driveStartFromDrive");
    $("ds-from-file").textContent = AW("driveStartFromFile");
    $("ds-back").textContent = AW("driveStartBack");
  }

  // then: 入口の あと（いつもの 説明 → かんたん設定）
  function open(then) {
    next = then || function () {};
    found = null;
    fill();
    lock(false);
    step("ds-first");
    $("drive-start").hidden = false;
    // 押してから 読むと iPhone の Safari が Google の 窓を 止める ことが あるので 先に 読む
    window.Drive.client().prepare();
  }
  function close() { $("drive-start").hidden = true; }
  // 入口を 閉じて いつもの 説明へ
  function go(v) {
    choose(v);
    close();
    next();
  }
  // 戻した あと: 説明・かんたん設定は 出さずに ボードへ
  function restored(v) {
    choose(v);
    close();
    window.dispatchEvent(new Event("board:reload"));
  }

  // Google の 窓（押した すぐ あと）→ 控えを 探して、あれば 中身の 件数も 見せる
  function linkAndFind() {
    var c = window.Drive.client();
    lock(true);
    msg(AW("driveStartWait"));
    return c.token().then(function () {
      c.setLinked(true);
      return c.latest();
    }).then(function (f) {
      if (!f) return null;
      return c.read(f.id).then(function (data) { return { file: f, data: data }; });
    }).then(function (r) {
      lock(false);
      msg("");
      return r;
    }, function (e) {
      lock(false);
      msg(window.Drive.errText(e));
      throw e;
    });
  }
  function showFound(r) {
    found = r;
    step("ds-found");
    $("ds-found-text").textContent = AW("driveStartFound").replace("{d}", when(r.file.at))
      .replace("{k}", r.data.kids.length).replace("{n}", Object.keys(r.data.days).length);
  }

  $("ds-link").addEventListener("click", function () {
    if (busy) return;
    linkAndFind().then(function (r) {
      if (r) showFound(r);
      else go("link");
    }, function () { /* 文は 出した */ });
  });
  $("ds-local").addEventListener("click", function () { if (!busy) go("local"); });
  $("ds-restore").addEventListener("click", function () { if (!busy) step("ds-from"); });
  $("ds-back").addEventListener("click", function () { if (!busy) step("ds-first"); });

  // この 控えを 戻す（日時と 件数を 見せたので 確かめを 二重に しない）
  $("ds-use").addEventListener("click", function () {
    if (busy || !found) return;
    var r = found;
    lock(true);
    window.DataFile.apply(r.data, "", true).then(function () {
      window.Drive.client().adopt(r.file.at);
      window.Drive.auto().clearDirty();
      window.Drive.auto().clearHeld();
      lock(false);
      restored("link");
    }, function (e) {
      lock(false);
      msg(e && e.message);
    });
  });
  // 新しく 始める: 前の 控えは 消さず、最初の 控えは 別の ファイル
  $("ds-new").addEventListener("click", function () {
    if (busy) return;
    window.Drive.client().startFresh();
    go("link");
  });

  $("ds-from-drive").addEventListener("click", function () {
    if (busy) return;
    linkAndFind().then(function (r) {
      if (r) showFound(r);
      else msg(AW("driveNone"));
    }, function () { /* 文は 出した */ });
  });
  $("ds-from-file").addEventListener("click", function () { if (!busy) $("ds-file").click(); });
  $("ds-file").addEventListener("change", function () {
    var file = this.files && this.files[0];
    this.value = "";
    if (!file) return;
    lock(true);
    window.DataFile.load(file).then(function (done) {
      lock(false);
      if (done) restored("file");
    }, function (e) {
      lock(false);
      msg(e && e.message);
    });
  });

  window.DriveStart = { wanted: wanted, open: open, close: close };
})();
