// おさいふ（2026-11-18）。がんばりカレンダー（子どもの 画面）の 中の もう1つの ページ。
//   設定の「使う機能」で おさいふに 印を つけた 子だけ（kid.wallet）。入口は 子どもの 画面の 上（2026-11-18 に 決めた。無料）。
//   もくひょうの「こうかんした」の あとに「おさいふに 入れますか？」（金額の ある ごほうびだけ。kid.goal.menu の yen。2026-11-24 までは kid.walletRate）。
//   左: ほしいもの（いまの お金で どこまで とどいたか）と のこり（おさいふ・ちょきん）。右: お金の きろく（あたらしい 順）。
//   使った・ちょきんする・ほしいもの は 本人。入れる（おさいふ／ちょきん）・ちょきんから おさいふへ・行を けす は おうちの人（鍵の あと。大人向けの ことば）。
//   ちょきん（2026-11-18 に「あずけてる」から かえた）は とっておく お金。いつも 出す（ためる ことを 知る きっかけ）
//   決まりは api.js の /api/kid/wallet・/api/parent/wallet・walletInfo
(function () {
  "use strict";

  var KV = window.KidView, api = window.BoardApi;
  var on = false;
  var pop = null; // いま 開いて いる 入力 { type, ... }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function W(key, vars) { return KV.W(key, vars); }
  function A(key) { return window.Words.adult(key); }
  // タグの ない 文（入力欄の 見本・ボタンの 値。ふりがなの 子には ひらがな）
  function T(key, vars) { return window.Words.text(key, KV.level(), vars); }
  function kidOf(id) { return ((KV.state() || {}).kids || []).filter(function (k) { return k.id === id; })[0]; }
  function yen(n) { return W("wlYen", { x: Number(n).toLocaleString("ja-JP") }); }
  function info() { return api.walletInfo(KV.state(), KV.kid()); }
  function md(date) {
    var y = +date.slice(0, 4), s = +date.slice(5, 7) + "/" + +date.slice(8, 10);
    return y === new Date().getFullYear() ? s : y + "/" + s;
  }
  // 内容から しるしを えらぶ（お金まわりは 自前の 絵。ゲーム・おかし・本・おもちゃは まだ 絵文字）
  function mark(r) {
    var w = r.what || "";
    if (/ポイント/.test(w)) return window.Words.icon("point-star");
    var I = window.Words.icon;
    var list = [[/おこづかい/, I("allowance")], [/お年玉|おとしだま/, I("otoshidama")], [/お祝い|おいわい/, I("gift")], [/ゲームセンター/, "🕹️"], [/ゲーム/, "🎮"],
      [/おかし|お菓子/, "🍬"], [/まんが|本|ほん/, "📕"], [/おもちゃ/, "🧸"]];
    if (r.pair || r.pocket === "kept") return I("piggy");
    for (var i = 0; i < list.length; i++) if (list[i][0].test(w)) return list[i][1];
    return r.amount > 0 ? I("coins") : I("shop-bag");
  }

  // ---- 子どもの 画面の 中の ページ ----
  function set(v) {
    on = v;
    $("kid-view").classList.toggle("wallet-mode", on);
    $("wl-body").hidden = !on;
    $("kv-tab-cal").classList.toggle("on", !on);
    $("kv-wallet").classList.toggle("on", on);
    $("kv-tab-cal").setAttribute("aria-selected", String(!on));
    $("kv-wallet").setAttribute("aria-selected", String(on));
    if (!on) closePop();
  }
  function render() {
    var kid = KV.kid(), k = kid && kidOf(kid);
    if (!k || !k.wallet) { if (on) set(false); return; }
    if (!on) return;
    $("wl-wants-title").innerHTML = W("wlWants");
    $("wl-want-add").innerHTML = W("wlWantAdd");
    $("wl-log-title").innerHTML = W("wlLog");
    $("wl-use").innerHTML = W("wlUse");
    $("wl-in").innerHTML = W("wlIn");
    var w = info();
    // ほしいもの: いまの おさいふで どこまで とどいたか（マイナスは 0）
    $("wl-wants").innerHTML = w.wants.length ? w.wants.map(function (x) {
      var can = w.wallet >= x.price, pct = Math.max(0, Math.min(100, Math.round(w.wallet / x.price * 100)));
      return '<li class="wl-want' + (can ? " can" : "") + '" data-want="' + esc(x.id) + '">' +
        '<div class="wl-want-row"><span class="nm">' + esc(x.name) + '</span><span class="pr">' + yen(x.price) + '</span></div>' +
        '<div class="wl-track"><span class="wl-fill" style="width:' + pct + '%"></span></div>' +
        '<div class="wl-left">' + (can ? W("wlCan") : W("wlLeft", { x: yen(x.price - Math.max(0, w.wallet)) })) + '</div></li>';
    }).join("") : '<li class="wl-none">' + W("wlWantNone") + '</li>';
    $("wl-want-add").disabled = w.wants.length >= 10;
    // のこり（おさいふ・ちょきん）。ちょきんは 押すと「ちょきんする」
    $("wl-bal").innerHTML =
      '<div class="wl-pocket"><div class="lb">' + W("wlWallet") + '</div><div class="v' + (w.wallet < 0 ? " minus" : "") + '">' + yen(w.wallet) + '</div><div class="nt">' + W("wlWalletNote") + '</div></div>' +
      '<div class="wl-pocket kept" id="wl-kept"><div class="lb"><span>' + W("wlKept") + '</span><button type="button" class="wl-save-btn" id="wl-save">' + W("wlSaveBtn") + '</button></div>' +
      '<div class="v">' + yen(w.kept) + '</div><div class="nt">' + W("wlKeptNote") + '</div></div>';
    // きろく（おさいふと ちょきんの 間で うつした 2つの 行は、おさいふの 側だけ 出す）
    var rows = w.log.filter(function (r) { return !(r.pair && r.pocket === "kept"); });
    $("wl-log").innerHTML = rows.length ? rows.map(function (r) {
      // うつした 行は「ちょきんから」「ちょきんに」、ちょきんに 入れた 行は 札を つける
      var tag = !r.pair && r.pocket === "kept" ? W("wlToKept") : "";
      var what = r.pair ? W(r.amount > 0 ? "wlFromKept" : "wlToSave") : r.what || "";
      return '<li data-row="' + esc(r.id) + '"><span class="d">' + md(r.date) + '</span><span class="e">' + mark(r) + '</span>' +
        '<span class="t">' + esc(what) + (tag ? '<span class="tag' + (r.pocket === "kept" ? " kept" : "") + '">' + tag + '</span>' : "") + '</span>' +
        '<span class="a ' + (r.amount > 0 ? "in" : "out") + '">' + (r.amount > 0 ? "＋" : "−") + yen(Math.abs(r.amount)) + '</span></li>';
    }).join("") : '<li class="wl-none">' + W("wlLogNone") + '</li>';
  }

  $("kv-wallet").addEventListener("click", function () { if (!on) { set(true); render(); } });
  $("kv-tab-cal").addEventListener("click", function () { if (on) { set(false); KV.reload(); } });

  // ---- 入力（使った・ほしいもの・入れる・行） ----
  function closePop() { pop = null; $("wl-pop").hidden = true; }
  $("wl-pop-close").addEventListener("click", closePop);
  $("wl-pop").addEventListener("click", function (ev) { if (ev.target === $("wl-pop")) closePop(); });

  function numInput(id, value) {
    return '<input type="number" class="wl-num" id="' + id + '" min="1" max="999999" inputmode="numeric" value="' + (value || "") + '">';
  }
  function chips(list, cls) {
    return '<div class="qk-chips ' + cls + '">' + list.map(function (s) { return '<button type="button" data-v="' + esc(window.Words.plain(s)) + '">' + s + '</button>'; }).join("") + '</div>';
  }
  function row(label, body) { return '<div class="qk-row"><span class="qk-label">' + label + '</span>' + body + '</div>'; }
  function btn(id, text, cls) { return '<button type="button" class="' + (cls || "") + '" id="' + id + '">' + text + '</button>'; }
  function openPop(p, title, body, btns, adult) {
    pop = p;
    var k = kidOf(KV.kid());
    $("wl-pop").style.setProperty("--kid", (window.KID_PALETTE[k.color] || window.KID_PALETTE.purple).main);
    $("wl-pop").classList.toggle("adult", !!adult);
    $("wl-pop-title").innerHTML = title;
    $("wl-pop-body").innerHTML = body;
    $("wl-pop-btns").innerHTML = btns;
    $("wl-pop-error").textContent = "";
    $("wl-pop").hidden = false;
    window.Board.fitLine($("wl-pop-title"));
  }
  function amountOf(id) {
    var n = parseInt($(id).value, 10);
    if (!(n >= 1 && n <= 999999)) { $(id).classList.add("need"); $(id).focus(); return 0; }
    return n;
  }
  function send(path, body, fail) {
    return api.post(path, Object.assign({ kid: KV.kid() }, body)).then(function () {
      closePop();
      return KV.reload();
    }).catch(function (e) { $("wl-pop-error").innerHTML = fail + "（" + esc(e.message) + "）"; });
  }

  // 使った（本人）
  function openUse() {
    openPop({ type: "use" }, W("wlUseTitle"),
      row(W("wlHowMuch"), numInput("wl-amount") + '<span class="wl-unit">' + W("wlYen", { x: "" }).trim() + '</span>') +
      row(W("wlWhat"), chips(W("wlWhats"), "wl-what-chips")) +
      row("", '<input type="text" class="wl-text" id="wl-what" maxlength="20" placeholder="' + esc(T("wlWhatHint")) + '">'),
      btn("wl-ok", W("wlSave"), "qk-ok"));
  }
  // ちょきんする（本人）: おさいふから ちょきんに うつす
  function openSave() {
    openPop({ type: "save" }, W("wlSaveTitle"),
      '<p class="wl-hint">' + W("wlSaveNote") + '</p>' +
      row(W("wlHowMuch"), numInput("wl-amount") + '<span class="wl-unit">' + W("wlYen", { x: "" }).trim() + '</span>'),
      btn("wl-ok", W("wlSave"), "qk-ok"));
  }
  // ほしいもの（本人）。直す ときは けす・買えた も
  function openWant(id) {
    var x = id && api.walletInfo(KV.raw(), KV.kid()).wants.filter(function (y) { return y.id === id; })[0]; // なおす 欄は 本物（撮影用に かくして いても）
    openPop({ type: "want", id: x ? x.id : null }, W("wlWantTitle"),
      row(W("wlWantName"), '<input type="text" class="wl-text" id="wl-want-name" maxlength="20" placeholder="' + esc(T("wlWantHint")) + '" value="' + esc(x ? x.name : "") + '">') +
      row(W("wlPrice"), numInput("wl-amount", x ? x.price : "") + '<span class="wl-unit">' + W("wlYen", { x: "" }).trim() + '</span>') +
      (x ? '<p class="wl-hint" id="wl-bought-ask" hidden></p>' : ""),
      (x ? btn("wl-remove", W("wlRemove"), "ghost") + btn("wl-bought", W("wlBought"), "ghost") : "") + btn("wl-ok", W("wlSave"), "qk-ok"));
  }
  // 入れる（おうちの人。鍵の あと）
  function openIn(mode) {
    var w = info(), m = mode || "in";
    var modes = [["in", A("wlModeIn")], ["keep", A("wlModeKeep")]];
    if (w.kept > 0) modes.push(["give", A("wlModeGive")]);
    openPop({ type: "in", mode: m }, A("wlInTitle"),
      '<div class="qk-chips wl-modes">' + modes.map(function (x) {
        return '<button type="button" data-mode="' + x[0] + '"' + (x[0] === m ? ' class="on"' : "") + '>' + x[1] + '</button>';
      }).join("") + '</div>' +
      (m === "give" ? '<p class="wl-hint">' + A("wlKeptNow").replace("{x}", w.kept.toLocaleString("ja-JP")) + '</p>' : "") +
      row(A("wlAmount"), numInput("wl-amount") + '<span class="wl-unit">円</span>') +
      (m === "give" ? "" : row(A("wlWhatAdult"), chips(A("wlWhatsAdult"), "wl-what-chips")) +
        row("", '<input type="text" class="wl-text" id="wl-what" maxlength="20" placeholder="' + esc(A("wlWhatHintAdult")) + '">')),
      btn("wl-ok", A("wlSaveAdult"), "qk-ok"), true);
  }
  // 行（だれでも 見られる。けすのは おうちの人）
  function openRow(id) {
    var r = info().log.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    openPop({ type: "row", id: id }, A("wlRowTitle"),
      '<p class="wl-row-view"><span>' + md(r.date) + '</span> <span>' + mark(r) + '</span> <b>' + esc(r.what || "") + '</b> <span class="' + (r.amount > 0 ? "in" : "out") + '">' +
        (r.amount > 0 ? "＋" : "−") + Math.abs(r.amount).toLocaleString("ja-JP") + '円</span></p>',
      btn("wl-remove", A("wlRowRemove"), "ghost"), true);
  }

  // もくひょうの「こうかんした」の あと（おうちの人。鍵の あと。kids.js から）。1ポイント＝○円で 出した 金額を 入れて おき、直せる
  // it: いま めざして いる ごほうび（api.js の goalInfo().item。金額は ごほうびの yen から。2026-11-24 に 1ポイント＝○円 から かえた）
  function openExchange(it) {
    openPop({ type: "exchange" }, A("wlExTitle"),
      '<p class="wl-hint">' + esc(A("wlExNote").replace("{n}", it.name || "もくひょう").replace("{p}", it.size)) + '</p>' +
      row(A("wlAmount"), numInput("wl-amount", it.yen) + '<span class="wl-unit">円</span>'),
      btn("wl-ex-no", A("wlExNo"), "ghost") + btn("wl-ok", A("wlExYes"), "qk-ok"), true);
  }
  function exchange(body) {
    send("/api/parent/goal-exchange", body, A("wlExFail")).then(function () { if ($("wl-pop").hidden) KV.confetti(); });
  }

  $("wl-use").addEventListener("click", openUse);
  $("wl-bal").addEventListener("click", function (ev) { if (ev.target.closest("#wl-kept")) openSave(); });
  $("wl-want-add").addEventListener("click", function () { openWant(null); });
  $("wl-wants").addEventListener("click", function (ev) {
    var li = ev.target.closest("[data-want]");
    if (li) openWant(li.dataset.want);
  });
  $("wl-in").addEventListener("click", function () { window.ParentLock.ask(function () { openIn("in"); }); });
  $("wl-log").addEventListener("click", function (ev) {
    var li = ev.target.closest("[data-row]");
    if (li) openRow(li.dataset.row);
  });

  $("wl-pop-body").addEventListener("click", function (ev) {
    var c = ev.target.closest(".wl-what-chips button");
    if (c) {
      $("wl-what").value = c.dataset.v;
      Array.prototype.forEach.call(c.parentNode.children, function (b) { b.classList.toggle("on", b === c); });
      return;
    }
    var m = ev.target.closest(".wl-modes button");
    if (m && pop && pop.type === "in") openIn(m.dataset.mode);
  });
  $("wl-pop-body").addEventListener("input", function (ev) {
    ev.target.classList.remove("need");
    if (ev.target.id === "wl-what") {
      Array.prototype.forEach.call(document.querySelectorAll(".wl-what-chips button"), function (b) { b.classList.toggle("on", b.dataset.v === ev.target.value); });
    }
  });
  $("wl-pop-btns").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b || !pop) return;
    var p = pop;
    if (b.id === "wl-ok") {
      if (p.type === "use") {
        var n = amountOf("wl-amount");
        if (!n) return ($("wl-pop-error").innerHTML = W("wlNeedYen"));
        send("/api/kid/wallet", { spend: { amount: n, what: $("wl-what").value } }, W("wlFail"));
      } else if (p.type === "save") {
        var sv = amountOf("wl-amount");
        if (!sv) return ($("wl-pop-error").innerHTML = W("wlNeedYen"));
        if (sv > info().wallet) { $("wl-amount").classList.add("need"); return ($("wl-pop-error").innerHTML = W("wlSaveOver")); }
        send("/api/kid/wallet", { save: { amount: sv } }, W("wlFail"));
      } else if (p.type === "want") {
        var name = $("wl-want-name").value.trim();
        if (!name) { $("wl-want-name").classList.add("need"); $("wl-want-name").focus(); return ($("wl-pop-error").innerHTML = W("wlNeedWant")); }
        var price = amountOf("wl-amount");
        if (!price) return ($("wl-pop-error").innerHTML = W("wlNeedYen"));
        send("/api/kid/wallet", { want: { id: p.id, name: name, price: price } }, W("wlFail"));
      } else if (p.type === "in") {
        var a = amountOf("wl-amount");
        if (!a) return ($("wl-pop-error").innerHTML = W("wlNeedYen"));
        if (p.mode === "give") send("/api/parent/wallet", { give: { amount: a, what: A("wlGiveWhat") } }, W("wlFail"));
        else send("/api/parent/wallet", { add: { amount: a, what: $("wl-what").value, pocket: p.mode === "keep" ? "kept" : "wallet" } }, W("wlFail"));
      } else if (p.type === "exchange") {
        var e = amountOf("wl-amount");
        if (!e) return ($("wl-pop-error").innerHTML = W("wlNeedYen"));
        exchange({ toWallet: e });
      }
    } else if (b.id === "wl-ex-no") {
      exchange({});
    } else if (b.id === "wl-bought") {
      // 1回目は どう なるかを 見せて、もう1回 押したら 買えた に する
      var x = info().wants.filter(function (y) { return y.id === p.id; })[0];
      if (!x) return;
      if (!p.ask) {
        p.ask = true;
        $("wl-bought-ask").hidden = false;
        $("wl-bought-ask").innerHTML = W("wlBoughtAsk", { x: yen(x.price) });
        b.classList.remove("ghost");
        return;
      }
      send("/api/kid/wallet", { bought: p.id }, W("wlFail")).then(function () { KV.confetti(); });
    } else if (b.id === "wl-remove") {
      if (p.type === "want") send("/api/kid/wallet", { removeWant: p.id }, W("wlFail"));
      else if (p.type === "row") window.ParentLock.ask(function () { send("/api/parent/wallet", { remove: p.id }, W("wlFail")); });
    }
  });

  window.Wallet = {
    render: render,
    // がんばりカレンダーを とじる ときに もどす
    exit: function () { if (on) set(false); },
    askExchange: openExchange,
  };
})();
