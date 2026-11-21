// カードを 左右に スワイプして 日を うごかす 部品（window.BoardSwipe）。天気（weather.js）・予定（events.js）・
// 子どもの 画面の カレンダー（kids.js）が つかう
(function () {
  "use strict";

  // 子どもの 画面の カレンダー（kids.js）でも つかう
  window.BoardSwipe = swipe;
  // カードを 左右に スワイプしたら move(+1 / -1)（左へ = つぎの 日）。たての うごきは スクロールに のこす（CSS の touch-action）
  //   うごかして いる あいだは 中身（els）が 指に ついて くる（スワイプ できると 分かる ように）。
  //   さきに すすめない がわは 少しだけ（ゴムのように）。とどかずに はなしたら もとの 位置へ もどる
  function swipe(card, move, els, canMove) {
    var x0 = null, y0 = 0, drag = false;
    function shift(dx, animate) {
      els().forEach(function (el) {
        el.style.transition = animate ? "transform 0.18s ease-out" : dx ? "none" : "";
        el.style.transform = dx ? "translateX(" + Math.round(dx) + "px)" : "";
      });
    }
    card.addEventListener("pointerdown", function (ev) { x0 = ev.clientX; y0 = ev.clientY; drag = false; });
    card.addEventListener("pointermove", function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!drag) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        drag = true;
        // ゆびが カードの 外に 出ても はなした ことが わかる ように（うごかし はじめて から。◀ ▶ の タップは そのまま）
        try { card.setPointerCapture(ev.pointerId); } catch (e) { /* なくても うごく */ }
      }
      shift(canMove(dx < 0 ? 1 : -1) ? dx : dx / 4);
    });
    card.addEventListener("pointercancel", function () {
      x0 = null;
      if (drag) shift(0, true);
    });
    card.addEventListener("pointerup", function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0, dy = ev.clientY - y0, dir = dx < 0 ? 1 : -1;
      x0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || !canMove(dir)) {
        if (drag) shift(0, true);
        return;
      }
      shift(0);
      move(dir);
    });
  }
})();
