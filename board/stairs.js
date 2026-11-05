// 段の 地図（Pro）。できるようになったことを 山の 斜面に きざんだ 段で 見せる（HANDOVER の 相談14 ④）。
//   山は 1つ。てっぺんは 見えず ずっと つづく（つぎの 段は「?」）。「あと○つ」は 出さない。やることに もどした ものは 段に しない
//   左右に ドラッグで うごかす（斜面に そって 上下も）。ひらいたら 古い 段から 新しい 段へ はなまるが 1回 のぼる
//   名前は 段の 数字の 下から 右へ のびる 1行の 吹き出し。段の 高さを 吹き出しより 高く して、右に はみ出しても 重ならない
//   段を 押すと 上の 空に その ことと おうちの人の コメントが 出る（さいしょは いちばん 新しい もの）
(function () {
  "use strict";

  var HANAMARU = "img/hanamaru.svg";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function tree(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')"><rect x="-3" y="0" width="6" height="12" fill="#a9785a"/>' +
      '<path d="M0 -34 L16 2 L-16 2 Z" fill="#6cbf6a"/><path d="M0 -44 L12 -16 L-12 -16 Z" fill="#82cf74"/></g>';
  }
  function cloud(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')" fill="#fff"><ellipse cx="0" cy="0" rx="80" ry="26"/>' +
      '<ellipse cx="40" cy="-18" rx="46" ry="26"/><ellipse cx="-36" cy="-10" rx="36" ry="20"/></g>';
  }

  // box: 地図を かく 枠（大きさは 枠に あわせる）
  // opt.items: 古い じゅん [{ date: 日づけの HTML, name, comment: おうちの人の コメント }]
  // opt.pick: さいしょに 空に 出す 段（なければ いちばん 新しい もの）
  // opt.text: { recent, picked, fresh, from, empty }（words.js の ことば。empty は 段が 0この ときの 空の カード）
  // opt.animate: のぼる うごきを 見せるか
  function render(box, opt) {
    var items = opt.items, N = items.length, T = opt.text;
    var SW = box.clientWidth, SH = box.clientHeight, phone = SW < 600, tall = SH > SW;
    var W = phone ? 96 : 120, H = phone ? 60 : 64, BH = phone ? 46 : 50;
    // 空の カード（えらんだ 段）。縦は 上の まんなか、横は 左上（段は 右上へ のぼるので 左上が あく）
    var cw = tall ? Math.min(SW - 32, 560) : Math.min(440, SW * 0.44), cx = tall ? (SW - cw) / 2 : 16, cy = 12;
    var html = '<div class="sm-sky"><svg width="' + SW + '" height="' + SH + '">' +
      '<path d="M0 ' + (SH * 0.55) + ' C ' + SW * 0.35 + ' ' + (SH * 0.42) + ', ' + SW * 0.7 + ' ' + (SH * 0.25) + ', ' + SW + ' ' + (SH * 0.12) +
      ' L' + SW + ' ' + SH + ' L0 ' + SH + ' Z" fill="#d8edcc"/>' + cloud(SW * (tall ? 0.15 : 0.55), 50, phone ? 0.5 : 0.7) + cloud(SW - 70, 40, phone ? 0.6 : 0.9) +
      '</svg></div><div class="sm-world">';
    // 地面と 段（世界の 座標: 段 i の 左 = i*W、上 = -(i+1)*H。地面が 0）
    var g = '<path d="M' + (-6 * W) + ' ' + (6 * H) + ' L' + ((N + 30) * W) + ' ' + (-(N + 32) * H - 60) + ' L' + ((N + 30) * W) + ' 4000 L' + (-6 * W) + ' 4000 Z" fill="#a9dc8f"/>';
    for (var t = -3; t < N + 4; t += 1.7) g += tree(t * W + 30, -(t + 1) * H - 18, 0.7);
    for (var i = 0; i < N + 4; i++) {
      var x = i * W, top = -(i + 1) * H, has = i < N, next = i === N;
      g += '<g opacity="' + (has || next ? 1 : i === N + 1 ? 0.45 : 0.2) + '">' +
        '<rect x="' + x + '" y="' + top + '" width="' + W + '" height="4000" fill="' + (has ? (i % 2 ? "#efe3d2" : "#e6d7c3") : "#f6f1ea") + '"' +
        (has ? "" : ' stroke="#d8cfc2" stroke-width="2" stroke-dasharray="7 6"') + '/>' +
        '<rect x="' + x + '" y="' + top + '" width="' + W + '" height="8" fill="' + (has ? "#c9b49a" : "#e4ddd2") + '"/></g>';
      if (has) g += '<text x="' + (x + 14) + '" y="' + (top + 30) + '" font-size="20" font-weight="700" fill="#a68d72">' + (i + 1) + '</text>';
      if (next) g += '<text x="' + (x + W / 2) + '" y="' + (top - 12) + '" font-size="26" font-weight="700" fill="#c9b9a8" text-anchor="middle">?</text>';
    }
    html += '<svg class="sm-ground" width="1" height="1">' + g + '</svg>';
    // 段の 上の はなまる と 吹き出し（左の 段の 吹き出しが 右の 段の 上に のるよう、段の あとに かく）
    for (i = 0; i < N; i++) {
      x = i * W; top = -(i + 1) * H;
      html += '<img class="sm-mark" data-i="' + i + '" src="' + HANAMARU + '" alt="" draggable="false" style="left:' + (x + W / 2 - 16) + 'px;top:' + (top - 32) + 'px">';
      html += '<div class="sm-bubble" data-i="' + i + '" style="left:' + (x + 6) + 'px;top:' + (top + 38) + 'px;height:' + BH + 'px">' +
        '<span class="sm-date">' + items[i].date + '</span><span class="sm-name">' + esc(items[i].name) + '</span></div>';
    }
    html += '<img class="sm-climber" src="' + HANAMARU + '" alt="" draggable="false"></div>';
    html += '<div class="sm-card" style="left:' + cx + 'px;top:' + cy + 'px;width:' + cw + 'px"></div>';
    html += '<div class="sm-hint">◀</div>';
    box.innerHTML = html;
    box.classList.add("sm", phone ? "phone" : "wide");

    var world = box.querySelector(".sm-world"), card = box.querySelector(".sm-card"), hint = box.querySelector(".sm-hint");
    var climber = box.querySelector(".sm-climber"), marks = box.querySelectorAll(".sm-mark");
    var bubbles = box.querySelectorAll(".sm-bubble");
    // 見る はんい: 右は「?」の 段まで、左は いちばん 古い 段まで
    // 1段目は 下に つけず 少し 上から（吹き出しが 下に 切れない よう、段が すくなくても 地図の まんなかに 寄る）
    var maxX = 24, minX = Math.min(SW - (N + 1.6) * W, 24), ground0 = Math.min(SH - 22 - BH - 30, SH * 0.62);
    var picked = -1, tx = minX, anim = null;

    function showCard(i) {
      picked = i;
      Array.prototype.forEach.call(bubbles, function (b) { b.classList.toggle("on", +b.dataset.i === i); });
      var it = items[i];
      // 長い 名前は 字を 小さく（カードの 中で 2行まで）
      var fs = (phone ? 20 : 26) * (it.name.length > 14 ? 0.72 : it.name.length > 9 ? 0.85 : 1);
      card.innerHTML = '<div class="sm-card-head">' + (i === N - 1 ? T.recent : it.date) + '</div>' +
        '<div class="sm-card-name" style="font-size:' + fs + 'px"><img src="' + HANAMARU + '" alt=""><span>' + esc(it.name) + '</span></div>' +
        (it.comment ? '<div class="sm-card-comment">' + T.from + '「' + esc(it.comment) + '」</div>' : '');
      if (opt.fresh === i) card.querySelector(".sm-card-head").innerHTML = T.fresh;
    }
    function topLimit() { return (tall ? card.offsetTop + card.offsetHeight : 0) + 56; }
    function place() {
      tx = Math.max(minX, Math.min(maxX, tx));
      // 右の 端（新しい ほう）は 空の カードに かからない よう 合わせる。横は 左の 端の 段が 下の ほうに 来るよう 斜面に そって 下げる。
      // 縦は 見える 段が すくないので、新しい 段を カードの すぐ 下に（下は 段の 柱と 山が つづく）
      // 右の 端に 見える 段は「?」の 段（N）まで（段が すくない ときに 下へ 押し下げない）
      var iL = -tx / W, iR = Math.min((SW - tx) / W - 1.6, N), under = topLimit() + (iR + 1) * H;
      // 横: 空の カード（左上）の 下に 来る 段は、カードより 下に（段が すくない ときに「?」が カードに かくれない）
      var ic = Math.min(Math.floor((card.offsetLeft + card.offsetWidth - tx) / W), N);
      var belowCard = ic >= 0 ? card.offsetTop + card.offsetHeight + 40 + (ic + 1) * H : 0;
      // 縦で 段が 0この ときは 地面を 下げて、空の 下に 山の ふもとが ある 絵に（柱ばかりに ならない）
      var ty = tall ? Math.max(under + 30, N ? 0 : SH * 0.62) : Math.max(ground0 + (iL + 1) * H, under, belowCard);
      world.style.transform = "translate(" + tx + "px," + ty + "px)";
      hint.style.display = tx < 0 ? "" : "none";
    }
    // のぼる はなまる: k（段の 番号。小数は 段と 段の あいだ）の 上に 置く
    function climbTo(k) {
      var f = k - Math.floor(k);
      var x = k * W + W / 2 - 22, y = -(k + 1) * H - 46 - Math.sin(f * Math.PI) * 24;   // 段から 段へ はねる
      climber.style.transform = "translate(" + x + "px," + y + "px)";
      // 段の しるしは のぼる はなまるが 半分 はなれてから 出す（いま いる 段に 小さい はなまるが 重ならない）
      Array.prototype.forEach.call(marks, function (m) { m.style.opacity = +m.dataset.i <= k - 0.5 ? 1 : 0; });
    }
    function settle() {
      anim = null;
      climbTo(N - 1);
      climber.classList.add("done");
    }

    // まだ 段が ない（0こ）ときは、のぼる はなまるを 出さず、空の カードに「できる ことを ふやそう！」
    if (N) showCard(opt.pick >= 0 && opt.pick < N ? opt.pick : N - 1);
    else {
      climber.style.display = "none";
      card.innerHTML = '<div class="sm-card-name" style="font-size:' + (phone ? 22 : 28) + 'px"><img src="' + HANAMARU + '" alt=""><span>' + esc(T.empty) + '</span></div>';
    }
    var still = !opt.animate || document.body.classList.contains("lowpower") ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (still || N < 2) {
      place();
      settle();
    } else {
      // 古い 段から 新しい 段へ。カメラは のぼる はなまるに ついていく
      var dur = Math.min(3200, 600 + N * 260), t0 = null;
      tx = maxX;
      place();
      climbTo(0);
      anim = requestAnimationFrame(function step(now) {
        if (anim === null) return;
        t0 = t0 || now;
        var p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, k = e * (N - 1);
        climbTo(k);
        tx = SW * 0.55 - (k * W + W / 2);
        place();
        if (p < 1) anim = requestAnimationFrame(step);
        else settle();
      });
    }

    // ドラッグで うごかす。うごかさずに はなしたら 押した 段を 空に 出す
    var sx = null, s0 = 0, moved = false;
    box.onpointerdown = function (e) {
      if (anim !== null) { cancelAnimationFrame(anim); settle(); }
      sx = e.clientX; s0 = tx; moved = false;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* できなくても よい */ }
    };
    box.onpointermove = function (e) {
      if (sx === null) return;
      if (Math.abs(e.clientX - sx) > 8) moved = true;
      if (moved) { tx = s0 + (e.clientX - sx); place(); }
    };
    box.onpointerup = function (e) {
      if (sx === null) return;
      sx = null;
      if (moved) return;
      var hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest("[data-i]");
      if (el && box.contains(el)) showCard(+el.dataset.i);
    };
    box.onpointercancel = function () { sx = null; };

    return {
      stop: function () { if (anim !== null) cancelAnimationFrame(anim); anim = null; },
      picked: function () { return picked; },
    };
  }

  window.StairsMap = { render: render };
})();
