// 設定の「要望・問い合わせ」タブ。スマホの カメラで 読み取れる QR コードを 出す（qrcode.js）
(function () {
  "use strict";

  // 要望・問い合わせの Google フォーム。url は「…/viewform」。
  // version・device は フォームの「事前入力した URL を取得」で わかる 項目の 名前（entry.数字）。空なら 入れない
  // サイト（docs/site/）の「要望・お問い合わせ」も 同じ フォーム（https://forms.gle/N1bPRj8BhCanZp8CA）
  var FORM = {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSckGxGhniiOAm04s2GQuvKQMHUQ6MoPbl58_BTOzwtBI-kRtQ/viewform",
    version: "entry.485428648",
    device: "entry.879531967",
  };
  // プライバシーポリシー（docs/site/privacy.html を 公開した ところ）
  var PRIVACY_URL = "https://hanamarukobo.github.io/privacy.html";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function qrSvg(text) {
    var qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }

  // アプリの バージョン（version.js）と 機種。機種は アプリなら 端末から、ブラウザなら User-Agent から
  function appInfo() {
    var api = window.BoardApi, kind = api.local ? "端末に保存" : "置いた端末につなぐ";
    var ver = window.APP_VERSION || "?", echo = window.EchoBoard;
    if (echo && echo.getAppInfo) {
      try {
        var i = JSON.parse(echo.getAppInfo());
        return { version: ver + "（アプリ・" + kind + "）", device: i.model + " / Android " + i.android };
      } catch (e) { /* ふるい アプリ */ }
    }
    var m = /\(([^)]*)\)/.exec(navigator.userAgent);
    return { version: ver + "（ブラウザ・" + kind + "）", device: m ? m[1] : navigator.userAgent.slice(0, 60) };
  }

  function formUrl(info) {
    var p = ["usp=pp_url"];
    if (FORM.version) p.push(FORM.version + "=" + encodeURIComponent(info.version));
    if (FORM.device) p.push(FORM.device + "=" + encodeURIComponent(info.device));
    return FORM.url + (FORM.url.indexOf("?") < 0 ? "?" : "&") + p.join("&");
  }

  function renderContact() {
    var info = appInfo();
    $("s-contact-info").innerHTML = "<div>バージョン：" + esc(info.version) + "</div><div>機種：" + esc(info.device) + "</div>";
    if (!FORM.url) {
      $("s-contact-qr").innerHTML = "";
      $("s-contact-text").textContent = "受付フォームは準備中です。";
      return;
    }
    var url = formUrl(info);
    $("s-contact-qr").innerHTML = qrSvg(url);
    $("s-contact-text").textContent = "スマホのカメラで QR コードを読み取ると、受付フォームが開きます。アプリのバージョンと機種は、最初から入力されています。";
    // ブラウザで 開いて いる ときと、ブラウザの ある 端末の アプリでは、その まま 押せる リンクも（同じ スマホでは QR を 読み取れない）。
    // 置いて つかう 端末（Echo など）は ブラウザが ない ことも あるので QR だけ。アプリの 中の リンクは 端末の ブラウザで ひらく
    if (Device.canOpenLink()) {
      $("s-contact-text").insertAdjacentHTML("beforeend", '<br><a href="' + esc(url) + '"' + (window.Capacitor ? "" : ' target="_blank" rel="noopener"') + '>受付フォームを開く</a>');
    }
  }


  // ブラウザの ない 端末では、リンクに せず QR と URL を 出す
  function renderPrivacy() {
    $("s-privacy-qr").innerHTML = qrSvg(PRIVACY_URL);
    $("s-privacy-text").textContent = window.Words.t("privacyNote", "upper");
    $("s-privacy-url").innerHTML = !Device.canOpenLink() ? esc(PRIVACY_URL)
      : '<a href="' + esc(PRIVACY_URL) + '"' + (window.Capacitor ? "" : ' target="_blank" rel="noopener"') + ">" + esc(PRIVACY_URL) + "</a>";
  }

  renderContact();
  renderPrivacy();
  // 設定の「使い方」（2台連携の ブラウザ用の QR）でも つかう
  window.makeQr = qrSvg;
})();
