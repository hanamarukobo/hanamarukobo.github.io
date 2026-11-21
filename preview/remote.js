// 置いてある端末に つなぐ（2台連携の おうちの人の スマホ）。はじめての かんたん設定の「置いてある端末に、このスマホからつなぐ」と、設定の「この端末」の「置いてある端末につなぐ」から ひらく。
// 同じ Wi-Fi の「はなまるボード」を NSD（_dekitayo）で さがし（IP アドレスは いらない）、置いた端末に 出ている 番号で つなぐ
(function () {
  "use strict";

  // picked は 選んだ 端末の 名前（見つかる たびに 一覧の 順が かわるので 番号で なく 名前で おぼえる）。chose は 人が 押して えらんだ
  var boards = [], picked = null, chose = false, searching = false, onBack = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function render() {
    // さがして いる あいだは くるくるを 出す（見つかった 端末が あっても、さがし おわるまで）
    var spin = searching ? '<li class="cn-searching"><span class="cn-spin"></span>同じ Wi-Fi の中を さがしています…</li>' : "";
    $("cn-list").innerHTML = boards.map(function (b, i) {
      return '<li><button data-i="' + i + '" class="' + (picked === b.name ? "on" : "") + '">' + esc(b.name) + '</button></li>';
    }).join("") + (spin || (boards.length ? "" : '<li class="none">見つかりませんでした</li>'));
    $("cn-hint").hidden = searching || boards.length > 0;
    $("cn-retry").disabled = searching;
  }

  // この端末 じしんも「置いて、別の端末からつなぐ」なら 一覧に 出るので はずす（じぶんに つなぐと データが ぐるぐる）
  function notSelf(b) {
    var me = {};
    try { me = JSON.parse(window.EchoBoard.lanInfo()); } catch (e) { /* ふるい アプリ・ブラウザ */ }
    return !(me.running && b.port === me.port && (me.ips || []).indexOf(b.host) >= 0);
  }

  function found(ev) {
    boards = (ev.detail || []).filter(notSelf);
    // 人が えらぶ までは、つなぎ直す ときは いま つないで いる 端末、はじめては 1台だけ 見つかった ときに その 端末を えらぶ。
    //   つなぎ直す ときに 先に ほかの 端末が 1台 見つかっても、それは えらばない（11-18 に 実機で べつの 置いた端末が えらばれた）
    var cur = window.BoardApi.remote ? window.BoardApi.remoteName() : "";
    var names = boards.map(function (b) { return b.name; });
    if (!chose) {
      if (cur) picked = names.indexOf(cur) >= 0 ? cur : null;
      else picked = !searching && boards.length === 1 ? names[0] : null;   // さがし おわって 1台だけ の とき
    } else if (names.indexOf(picked) < 0) picked = null;
    render();
  }

  function search() {
    searching = true;
    boards = [];
    picked = null;
    chose = false;
    render();
    window.addEventListener("board:found", found);
    window.BoardApi.findBoards(6000).then(function (list) {
      window.removeEventListener("board:found", found);
      searching = false;
      found({ detail: list });
    });
  }

  function open(back) {
    onBack = back || null;
    $("cn-code").value = "";
    $("cn-error").textContent = "";
    // この端末に 記録が あるときだけ「消えません・移すなら ファイルで」と 出す（つないだ とたんに 消えたと おもわれないように）
    $("cn-keep").hidden = !window.BoardApi.hasRecords();
    $("connect").hidden = false;
    search();
  }

  $("cn-list").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    picked = boards[+b.dataset.i].name;
    chose = true;
    render();
  });
  $("cn-retry").addEventListener("click", search);
  $("cn-cancel").addEventListener("click", function () {
    $("connect").hidden = true;
    if (onBack) onBack();
  });
  $("cn-ok").addEventListener("click", function () {
    var code = $("cn-code").value.trim();
    var board = boards.filter(function (b) { return b.name === picked; })[0];
    if (!board) { $("cn-error").textContent = "つなぐ端末を選んでください"; return; }
    if (!/^\d{6}$/.test(code)) { $("cn-error").textContent = "番号は 6けたの数字です"; return; }
    $("cn-error").textContent = "つないでいます…";
    window.BoardApi.connect(board, code).then(function () {
      // おうちの人の スマホは 縦（この端末の 設定。app.js の ORIENT_KEY は JSON で よむ）。
      // Echo Show など 置いて つかう 端末を つないだ ときは 向きを かえない
      var model = "";
      try { model = JSON.parse(window.EchoBoard.getAppInfo()).model || ""; } catch (e) { /* ふるい アプリ */ }
      if (!/echo/i.test(model)) {
        try { localStorage.setItem("orientation", JSON.stringify("portrait")); } catch (e) { /* おぼえられなくても よい */ }
      }
      location.reload();
    }).catch(function (e) {
      $("cn-error").textContent = e.status === 401 ? "番号がちがいます" : e.status === 429 ? window.Words.adult("connWait")
        : "つなげませんでした（" + e.message + "）";
    });
  });

  window.Remote = { open: open };
})();
