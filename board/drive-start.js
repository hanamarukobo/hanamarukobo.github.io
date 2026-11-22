// ブラウザ版の 入口「Google ドライブと つないで はじめる」（Web 版で Drive.on、まだ データが ない ときだけ。2026-11-21 社長。表の 15a）。
//   つないで はじめる（おすすめ）→ Google の 窓 → 控えが あれば 一覧（どの データを 使うか／＋ 新しく 始める）、なければ いつもの 説明 → かんたん設定。
//   一覧と 置きかえる 前の 確かめは、設定の「ほかの控えから戻す」でも 使う（pick。2026-11-22 案 A。どの 操作でも データを 消さない）。
//   つながずに 使う → いつもの 説明 → かんたん設定（あとから 設定の「おうちの人」で つなげる）。
//   前の データを 戻す → ドライブから／ファイルから。Google の 決まりで つなぐのは 必須に しない。
//   選んだ 印は localStorage の drive:start（ブラウザが 消すと 印も 消えて 入口が また 出る。戻す 入口に なるので よい）。
//   くわしい 設計は docs/handover/web-drive-entry.md
(function () {
  "use strict";

  var KEY = "drive:start";
  var $ = function (id) { return document.getElementById(id); };
  var AW = window.Words.adult;
  // mode: "start"（入口）| "settings"（設定の「ほかの控えから戻す」）。files: 一覧。done: 設定から 開いた ときの 終わりの 知らせ
  var next = null, busy = false, mode = "start", files = [], sel = null, done = null;

  function chosen() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function choose(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* おぼえられなくても すすむ */ } }
  // 入口を 出すか（tutorial.js が はじめての 分かれ道の 前に 聞く）
  function wanted() { return !!(window.Drive && window.Drive.on()) && window.BoardApi.needsSetup() && !chosen(); }

  function when(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  // "2026-10-11" →「10月11日」
  function day(k) {
    var m = /^\d{4}-(\d\d)-(\d\d)$/.exec(k || "");
    return m ? Number(m[1]) + "月" + Number(m[2]) + "日" : "";
  }
  function step(id) {
    ["ds-first", "ds-pick", "ds-confirm", "ds-from"].forEach(function (s) { $(s).hidden = s !== id; });
    msg("");
    // 一覧が 長い ときに 上から 見せる
    var b = $("drive-start").querySelector(".su-board");
    if (b) b.scrollTop = 0;
    $("drive-start").scrollTop = 0;
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
    $("ds-pick-title").textContent = AW("drivePickTitle");
    $("ds-new").querySelector("b").textContent = AW("driveStartNew");
    $("ds-new").querySelector("small").textContent = AW("driveStartNewNote");
    $("ds-confirm-title").textContent = AW("driveConfirmTitle");
    $("ds-safe").textContent = AW("driveConfirmSafe");
    $("ds-cancel").textContent = AW("drivePickCancel");
    $("ds-replace").textContent = AW("driveConfirmGo");
    $("ds-from-title").textContent = AW("driveStartRestore");
    $("ds-from-drive").textContent = AW("driveStartFromDrive");
    $("ds-from-file").textContent = AW("driveStartFromFile");
    $("ds-back").textContent = AW("driveStartBack");
  }

  // then: 入口の あと（いつもの 説明 → かんたん設定）
  function open(then) {
    next = then || function () {};
    mode = "start";
    done = null;
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

  // Google の 窓（押した すぐ あと）→ 控えの 一覧（目印から。前の 版の ファイルは 中身を 読む）
  function linkAndList() {
    var c = window.Drive.client();
    lock(true);
    msg(AW("driveStartWait"));
    return c.token().then(function () {
      c.setLinked(true);
      return c.list();
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

  // ---- 一覧（見本の ①）----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // 子どもの 名前（人数）と 記録 ◯日ぶん（◯月◯日から）。名前は 文字として 入れる（HTML に しない）
  function kidsLine(s) {
    var p = el("div", "ds-kids");
    if (s.kids) p.appendChild(el("b", "", s.kids));
    p.appendChild(document.createTextNode(AW("drivePickKids").replace("{n}", s.kn)));
    return p;
  }
  function daysLine(p, s) {
    p.appendChild(document.createTextNode(AW("drivePickRecord") + " "));
    p.appendChild(el("b", "", AW("drivePickDays").replace("{n}", s.days)));
    if (s.from) p.appendChild(document.createTextNode(AW("drivePickFrom").replace("{d}", day(s.from))));
  }
  function card(f, i) {
    var c = el("div", "ds-bk" + (f.mine ? " me" : ""));
    var h = el("div", "ds-dev", f.old ? AW("drivePickOld") : f.dev || AW("drivePickOld"));
    if (f.mine) h.appendChild(el("span", "ds-tag", AW("drivePickHere")));
    c.appendChild(h);
    c.appendChild(kidsLine(f));
    var m = el("div", "ds-meta");
    daysLine(m, f);
    m.appendChild(el("br"));
    m.appendChild(document.createTextNode(AW("drivePickAt") + " "));
    m.appendChild(el("b", "", when(f.at)));
    c.appendChild(m);
    var b = el("button", "small" + (i ? " ghost" : ""), AW("drivePickUse"));
    b.type = "button";
    b.addEventListener("click", function () { if (!busy) pick(f); });
    c.appendChild(b);
    return c;
  }
  function showPick(list) {
    files = list;
    sel = null;
    var box = $("ds-list");
    box.textContent = "";
    list.forEach(function (f, i) { box.appendChild(card(f, i)); });
    $("ds-pick-lead").textContent = AW("drivePickLead").replace("{n}", list.length);
    // 「新しく 始める」は 入口だけ（設定では いまの データを 使いつづける）
    $("ds-new").hidden = mode !== "start";
    $("ds-pick-back").textContent = AW(mode === "start" ? "driveStartBack" : "drivePickCancel");
    step("ds-pick");
  }

  // ---- 選んだ とき: この 端末に 記録が あれば 置きかえる 前に 並べて 見せる（見本の ②）----
  function pick(f) {
    sel = f;
    if (!window.BoardApi.hasRecords()) return use();
    lock(true);
    window.BoardApi.state().then(function (s) {
      lock(false);
      var cur = window.Drive.summary(s), c = window.Drive.client();
      var a = $("ds-cur"), b = $("ds-to");
      a.textContent = "";
      a.appendChild(el("div", "ds-h", AW("driveConfirmCur").replace("{dev}", c.device() || window.Drive.here())));
      a.appendChild(kidsLine(cur));
      var am = el("div", "ds-meta");
      daysLine(am, cur);
      a.appendChild(am);
      b.textContent = "";
      b.appendChild(el("div", "ds-h", f.mine ? AW("driveConfirmToHere") : f.old || !f.dev ? AW("driveConfirmToOld") : AW("driveConfirmTo").replace("{dev}", f.dev)));
      b.appendChild(kidsLine(f));
      var bm = el("div", "ds-meta");
      daysLine(bm, f);
      bm.appendChild(el("br"));
      bm.appendChild(document.createTextNode(AW("drivePickAt") + " "));
      bm.appendChild(el("b", "", when(f.at)));
      b.appendChild(bm);
      step("ds-confirm");
    }, function (e) {
      lock(false);
      msg(e && e.message);
    });
  }
  // 使う: 先に この 端末の データを この 端末の ファイルに 控えて から 読みこむ（drive.js の useFile）。控えられなければ 読みこまない
  function use() {
    var f = sel, has = window.BoardApi.hasRecords(), a = window.Drive.auto();
    if (!f) return;
    lock(true);
    msg(AW(has ? "driveKeeping" : "driveLoading"));
    window.Drive.client().useFile(f, {
      hasRecords: has,
      dirty: a.dirty(),
      text: function () { return window.DataFile.text().then(function (x) { return x.text; }); },
      apply: function (data) { msg(AW("driveLoading")); return window.DataFile.apply(data, "", true); },
    }).then(function (r) {
      lock(false);
      if (!r) return;
      // 読みこんだ 内容は 選んだ 控えと 同じ（控えて いない 変更は ない）
      a.clearDirty();
      a.clearHeld();
      if (mode === "start") return restored("link");
      close();
      if (done) done(AW("driveRestored"));
    }, function (e) {
      lock(false);
      var t = e && e.code ? window.Drive.errText(e) : (e && e.message) || window.Drive.errText(e);
      msg(e && e.kept === false ? AW("driveKeepFail") + t : t);
    });
  }

  // 設定の「ほかの控えから戻す」: 一覧（list。設定で 取った もの）を 重ねて 出す。done(文) で 終わりを 知らせる
  function pickFrom(list, then) {
    mode = "settings";
    done = then || null;
    fill();
    lock(false);
    showPick(list);
    $("drive-start").hidden = false;
  }

  $("ds-link").addEventListener("click", function () {
    if (busy) return;
    linkAndList().then(function (list) {
      if (list.length) showPick(list);
      else go("link");
    }, function () { /* 文は 出した */ });
  });
  $("ds-local").addEventListener("click", function () { if (!busy) go("local"); });
  $("ds-restore").addEventListener("click", function () { if (!busy) step("ds-from"); });
  $("ds-back").addEventListener("click", function () { if (!busy) step("ds-first"); });
  $("ds-pick-back").addEventListener("click", function () {
    if (busy) return;
    if (mode === "start") step("ds-first");
    else close();
  });
  $("ds-cancel").addEventListener("click", function () { if (!busy) showPick(files); });
  $("ds-replace").addEventListener("click", function () { if (!busy) use(); });
  // 新しく 始める: 今 ある 控えは どれも 消さず、この 端末の 控えは 新しい ファイル
  $("ds-new").addEventListener("click", function () {
    if (busy) return;
    window.Drive.client().detach();
    go("link");
  });

  $("ds-from-drive").addEventListener("click", function () {
    if (busy) return;
    linkAndList().then(function (list) {
      if (list.length) showPick(list);
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

  window.DriveStart = { wanted: wanted, open: open, close: close, pick: pickFrom };
})();
