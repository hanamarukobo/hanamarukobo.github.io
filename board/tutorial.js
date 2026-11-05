// つかいかた（チュートリアル）。アプリを ひらいたときに 出す。
// 「つぎから ひょうじしない」に チェックすると 出なくなる（この端末だけ）。設定画面の「つかいかた」から いつでも 見られる。
// 前半は 子どもと いっしょに 見る ものなので ひらがな中心。「ここからは おうちの人へ」の あとは 大人むけ（ふつうの 漢字）。
(function () {
  "use strict";

  var HIDE_KEY = "tutorial:hide";
  var page = 0;
  var parent = "ママ・パパ";
  var usage = window.BoardApi.usage(null);   // 使い方（api.js の USAGES）。操作の せつめいを かえる
  var web = !!window.BoardApi.web;   // Web 版（予定は まだ ない・ホーム画面に 追加して つかう）

  function $(id) { return document.getElementById(id); }
  var ICON = window.Words.icon;   // 自前の 絵（img/）

  function slides() {
    return [
      // はじめの 1まいは ようこその 絵（img/welcome.webp。元は docs/design/raw/splash.png）
      { title: "はなまるボードへ ようこそ！", preview: "welcome",
        text: "きょうが わかる。じぶんで できる。<br>まいにちの「できた！」を かぞくで みまもる ボードだよ。" },
      { icon: ICON("sunny"), title: "あさは てんきを みよう", preview: "weather",
        text: "きょうの てんきを みて、きる ふくや かさを じぶんで きめよう。<br>ゆうがたからは あしたの てんきに かわるよ。" },
      { icon: ICON("bell"), title: "じぶんの なまえを おしてね", preview: "kids",
        text: "きょうの やることが でてくるよ。<br>できたら おして、はなまるに しよう！" },
      { icon: ICON("hanamaru"), title: "ねるまえに " + parent + "に みせよう", preview: "check",
        text: parent + "が「みました」を おすと、その日が はなまるに なって、ごほうびが つくよ。<br>はなまるが つづくと れんぞく！" },
      // ここから 大人むけ。絵は つけない（大人の 画面は 絵が なくても わかる）。子どもに わたす あいずの ページと「このボードについて」を 1つに
      { title: "ここからは おうちの人へ", parent: true,
        text: "<p>はなまるボードは、子どもが毎日の習慣を自分で進められるように支えるためのツールです。</p>" +
          "<p>楽をするための道具ではありません。ゲームのような楽しさは残しつつ、やることはきちんとやれる子に育ってほしい。そんな願いで作りました。</p>" },
      // 大人むけは 短く（くわしくは 設定の 中と よくある質問）
      { title: "天気について", parent: true, preview: "weather",
        text: "<p>天気は地域の予報から出しているため、詳しくは天気アプリなどでご確認ください。</p>" +
          "<p>服装の目安の気温は、設定の「天気」で変えられます。</p>" },
      { title: "操作について", parent: true, preview: "today",
        text: "<p>画面の左上の歯車を押すと、設定が開きます。</p>" +
          (usage === "board2"
            ? "<p>「みました」や設定は、つないだスマホからもできます。</p>"
            : "<p>「みました」は、子どもの画面の下にあります。</p>") +
          // スマホ（アプリ）は 毎日の お知らせ（かんたん設定で 聞く。2026-11-05）
          (usage === "phone" && window.Device && Device.canNotice() ? "<p>毎日のお知らせ（はじめは朝7時）は、設定の「使い方」で変えられます。</p>" : "") +
          (usage === "phone" ? "" : web
            ? "<p>置いて使うときは、ブラウザの共有ボタンから「ホーム画面に追加」して開いてください。</p>"
            : "<p>決めた時間のほかは、しばらく触らないと画面が消えます（設定の「使い方」）。</p>") },
      { title: "安全に使うために", parent: true, preview: "battery",
        text: "<p>端末の背面が膨らんでいたり、熱くなっていたりしたときは、使うのをやめてください。</p>" +
          "<p>電池の異常が分かったときは、ボードの左下でお知らせします。</p>" },
    ];
  }

  function render() {
    var list = slides(), s = list[page];
    $("tu-icon").innerHTML = s.icon || "";
    $("tu-icon").style.display = s.icon ? "" : "none";
    $("tu-title").textContent = s.title;
    $("tu-text").innerHTML = s.text;
    $("tu-board").classList.toggle("for-parent", !!s.parent);
    $("tu-board").classList.toggle("has-preview", !!s.preview);
    $("tu-board").classList.toggle("hero", s.preview === "welcome");
    $("tu-dots").innerHTML = list.map(function (x, i) { return '<span class="' + (i === page ? "on" : "") + '"></span>'; }).join("");
    $("tu-back").disabled = page === 0;
    $("tu-next").textContent = page < list.length - 1 ? "つぎへ" : window.BoardApi.needsSetup() ? "かんたん設定へ" : "はじめる";
    preview(s.preview);
  }

  // ボードの その場所を 小さく うつして 見せる（いまの 表示を コピーする）。おうちの人むけの ページは 文に 出てくる ところだけ
  //   today: 日付の 欄（設定の 歯車に しるし）、battery: ボード全体と 左下の「電池に注意」
  var SHOTS = { board: ".board", weather: ".card.weather", kids: ".card.kids-card", today: ".card.today", battery: ".board" };
  function preview(kind) {
    var box = $("tu-preview");
    box.innerHTML = "";
    box.hidden = !kind;
    box.classList.toggle("hero", kind === "welcome");
    if (!kind || $("tutorial").hidden) return;
    if (kind === "welcome") {
      box.innerHTML = '<img class="tu-hero" src="img/welcome.webp" alt="">';
      return;
    }
    var node;
    if (SHOTS[kind]) {
      var orig = document.querySelector(SHOTS[kind]), cs = getComputedStyle(orig);
      node = orig.cloneNode(true);
      node.style.zoom = "";
      node.style.width = cs.width;
      node.style.height = cs.height;
      // おなじ id が ふたつに ならないように
      [node].concat(Array.prototype.slice.call(node.querySelectorAll("[id]"))).forEach(function (e) {
        if (e.id) { e.setAttribute("data-id", e.id); e.removeAttribute("id"); }
      });
      // 天気の 地域を まだ えらんで いない（予報が ない）ときは、れいの 天気で 見せる
      var slotsBox = node.querySelector('[data-id="slots"]');
      if (slotsBox && !slotsBox.querySelector(".slot")) {
        var T = function (k, v) { return window.Words.t(k, "lower", v); };
        if (kind === "weather") node.style.height = "auto";   // もとの 欄は 1行の 文だけで ひくいので、れいの 中身に あわせる
        slotsBox.innerHTML = [["slotMorning", "sunny", 11, 10], ["slotNoon", "partly", 18, 20], ["slotEvening", "cloudy", 14, 30]].map(function (s) {
          return '<div class="slot"><div class="label">' + T(s[0]) + '</div><div class="icon">' + ICON(s[1]) + '</div>' +
            '<div class="temp">' + T("deg", { t: s[2] }) + '</div><div class="rain">☂ ' + s[3] + '%</div></div>';
        }).join("");
        var sumBox = node.querySelector('[data-id="summary"]');
        if (sumBox) sumBox.innerHTML = '<span class="pill hi">' + T("hiShort", { t: 18 }) + '</span><span class="pill lo">' + T("loShort", { t: 11 }) + '</span>';
        var advBox = node.querySelector('[data-id="advice"]');
        if (advBox) advBox.innerHTML = [["jacket", "jacket", T("coolAt", { t: 11 }), true], ["folding-umbrella", "folding", T("rainPct", { p: 30 }), false]].map(function (a) {
          return '<div class="tile' + (a[3] ? " need" : "") + '"><span class="icon">' + ICON(a[0]) + '</span><div><div class="main">' + T(a[1]) + '</div><div class="sub">' + a[2] + '</div></div></div>';
        }).join("");
      }
      // はじめて（まだ 子どもが いない）ときは、れいの 名前で 見せる
      var kidsBox = node.querySelector('[data-id="kids"]');
      if (kidsBox && !kidsBox.children.length) {
        kidsBox.className = "kids mode-big";
        kidsBox.style.setProperty("--n", 2);
        kidsBox.innerHTML = [["あおい", "purple", ICON("bell"), "まだだよ"], ["ひなた", "pink", ICON("hanamaru"), "はなまる！"]].map(function (k) {
          return '<button class="kid-btn" style="--kid:' + window.KID_PALETTE[k[1]].main + '"><span class="badge">' + k[2] +
            '</span><span class="name">' + k[0] + '</span><span class="state">' + k[3] + '</span></button>';
        }).join("");
      }
      if (kind === "today") {
        node.style.height = "auto";   // 縦では 日付の 欄の 高さが ボードの 行で きまるので、中身に あわせる（曜日・あいさつが 切れない）
        var gear = node.querySelector('[data-id="gear-btn"]');
        if (gear) gear.classList.add("tu-mark");
      }
      var chip = null;
      if (kind === "battery") {
        chip = document.createElement("div");
        chip.className = "batt-chip tu-mark";
        chip.textContent = "電池に注意";
        node.appendChild(chip);
      }
    } else {
      node = document.createElement("div");
      node.className = "tu-mock";
      node.innerHTML = '<div class="tm-list">' +
        ["ふくを きる", "はみがき", "かばんの じゅんび"].map(function (t) { return '<div class="tm-row"><span class="tm-check">' + ICON("hanamaru") + '</span>' + t + '</div>'; }).join("") +
        '</div><div class="tm-side"><div class="tm-stamp">' + ICON("hanamaru") + '</div><div class="tm-ok">みました</div><div class="tm-streak">' + window.Words.dayHtml(3, "lower", true) + ' れんぞく</div></div>';
    }
    node.classList.add("tu-shot");
    box.appendChild(node);
    var b = box.getBoundingClientRect(), n = node.getBoundingClientRect();
    if (!n.width || !n.height) return;
    // わくの 中に 余白を のこして 小さめに（上は「がめんの れい」の 分）
    var r = Math.min((b.width - 40) / n.width, (b.height - 40) / n.height, 0.75);
    node.style.top = "calc(50% + 8px)";
    node.style.transform = "scale(" + r + ") translate(-50%, -50%)";
    // 電池の しるしは 見本の 縮みに かかわらず 画面で 14px ほどに（大きすぎて おどろかせない）
    if (chip) chip.style.fontSize = Math.round(14 / r) + "px";
  }

  // first: はじめて（まだ 設定して いない）とき。説明は とばせない（とじる ✕ を 出さない）。
  //   最初に 閉じられると 使い方が 分からない ままに なるので、さいごまで 見て かんたん設定へ 進む
  function open(first) {
    page = 0;
    $("tu-skip").hidden = first === true;
    try { $("tu-hide").checked = localStorage.getItem(HIDE_KEY) === "1"; } catch (e) { $("tu-hide").checked = false; }
    $("tutorial").hidden = false;
    render();
  }

  function close() {
    try {
      if ($("tu-hide").checked) localStorage.setItem(HIDE_KEY, "1");
      else localStorage.removeItem(HIDE_KEY);
    } catch (e) { /* おぼえられなくても とじる */ }
    $("tutorial").hidden = true;
    afterTutorial();
  }

  // まだ 設定を した ことが なければ、説明の あとは かんたん設定（setup.js）
  function afterTutorial() {
    if (window.BoardApi.needsSetup() && window.EasySetup) window.EasySetup.open();
  }

  $("tu-next").addEventListener("click", function () {
    if (page >= slides().length - 1) return close();
    page++;
    render();
  });
  $("tu-back").addEventListener("click", function () { if (page > 0) { page--; render(); } });
  $("tu-skip").addEventListener("click", close);

  // 画面の 向きが かわったら 見本を うつしなおす
  window.addEventListener("board:fit", function () { if (!$("tutorial").hidden) render(); });

  // おうちの人の よびかたは せっていに あわせる
  window.addEventListener("board:state", function (ev) {
    parent = (ev.detail.settings && ev.detail.settings.parentName) || "ママ・パパ";
    usage = window.BoardApi.usage(ev.detail.settings);
    if (!$("tutorial").hidden) render();
  });

  function hidden() {
    try { return localStorage.getItem(HIDE_KEY) === "1"; } catch (e) { return false; }
  }

  // 黒い画面に なるときは だまって とじる（「ひょうじしない」は かえない。つぎに ひらいたとき また出る）
  function dismiss() {
    if ($("tutorial").hidden) return;
    $("tutorial").hidden = true;
    afterTutorial();
  }

  window.Tutorial = { open: open, dismiss: dismiss };

  // はじめては 説明 → かんたん設定（どちらも とばせない。かんたん設定の ✕ も はじめては 出ない）。「つぎから ひょうじしない」に して いれば かんたん設定から。
  // 置いた端末に つないだ おうちの人の 端末（アプリ・QR の ブラウザ）は 設定から はじめるので 出さない（設定の「説明を見る」で 見られる）
  if (!hidden() && !window.BoardApi.paired && !window.BoardApi.remote) open(window.BoardApi.needsSetup());
  else afterTutorial();
})();
