// 置いてある端末に つなぐ（2台連携の おうちの人の スマホ）。はじめての かんたん設定の「置いてある端末に、このスマホからつなぐ」と、設定の「使い方」の「置いてある端末につなぐ」から ひらく。
// 同じ Wi-Fi の「はなまるボード」を NSD（_dekitayo）で さがし（IP アドレスは いらない）、置いた端末に 出ている 番号で つなぐ
(function () {
  "use strict";

  var boards = [], picked = null, searching = false, onBack = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function render() {
    // さがして いる あいだは くるくるを 出す（見つかった 端末が あっても、さがし おわるまで）
    var spin = searching ? '<li class="cn-searching"><span class="cn-spin"></span>同じ Wi-Fi の中を さがしています…</li>' : "";
    $("cn-list").innerHTML = boards.map(function (b, i) {
      return '<li><button data-i="' + i + '" class="' + (picked === i ? "on" : "") + '">' + esc(b.name) + '</button></li>';
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
    if (picked === null && boards.length === 1) picked = 0;
    render();
  }

  function search() {
    searching = true;
    boards = [];
    picked = null;
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
    picked = +b.dataset.i;
    render();
  });
  $("cn-retry").addEventListener("click", search);
  $("cn-cancel").addEventListener("click", function () {
    $("connect").hidden = true;
    if (onBack) onBack();
  });
  $("cn-ok").addEventListener("click", function () {
    var code = $("cn-code").value.trim();
    if (picked === null || !boards[picked]) { $("cn-error").textContent = "つなぐ端末を選んでください"; return; }
    if (!/^\d{6}$/.test(code)) { $("cn-error").textContent = "番号は 6けたの数字です"; return; }
    $("cn-error").textContent = "つないでいます…";
    window.BoardApi.connect(boards[picked], code).then(function () {
      // おうちの人の スマホは 縦（この端末の 設定。app.js の ORIENT_KEY は JSON で よむ）。
      // Echo Show など 置いて つかう 端末を つないだ ときは 向きを かえない
      var model = "";
      try { model = JSON.parse(window.EchoBoard.getAppInfo()).model || ""; } catch (e) { /* ふるい アプリ */ }
      if (!/echo/i.test(model)) {
        try { localStorage.setItem("orientation", JSON.stringify("portrait")); } catch (e) { /* おぼえられなくても よい */ }
      }
      location.reload();
    }).catch(function (e) {
      $("cn-error").textContent = e.status === 401 ? "番号がちがいます" : "つなげませんでした（" + e.message + "）";
    });
  });

  window.Remote = { open: open };
})();
