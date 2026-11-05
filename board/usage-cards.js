// 使い方の カード（かんたん設定 setup.js と 設定の「使い方」settings.js で おなじ 3枚）の、ブラウザでの 見せ方。
//   ブラウザ（アプリでない）では 2台の 使い方は できないが、出てこない 理由が わかるよう 隠さずに 出す（2026-11-05）
//   「この端末を置いて、別の端末からつなぐ」: 押せない 見た目で 理由を 書く（押せなく するのは 呼ぶ がわ）
//   「置いてある端末に、この端末からつなぐ」: ブラウザでも QR で できるので うすく せず、押すと 手順を 出す
//   文は words.js の Words.adult
(function () {
  "use strict";

  function A(key) { return window.Words.adult(key); }

  window.UsageCards = {
    // board2・join: 2つ目と 3つ目の カード（説明の <small> を もつ 要素）
    markBrowser: function (board2, join) {
      board2.classList.add("app-only");
      board2.querySelector("small").textContent = A("usageAppOnly");
      join.classList.add("how-only");
      join.querySelector("small").textContent = A("usageQrHowto");
    },
    // 「つなぐ」を 押した ときの 手順。block は 手順を 画面の どこに 寄せるか（scrollIntoView）
    showQrGuide: function (el, block) {
      el.innerHTML = A("usageQrGuide");
      el.hidden = false;
      el.scrollIntoView({ behavior: "smooth", block: block || "nearest" });
    },
  };
})();
