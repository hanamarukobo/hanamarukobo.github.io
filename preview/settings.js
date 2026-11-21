// 設定の 画面（おうちの人）。日付の 長押し・歯車・キーボードの S で ひらく。中身を 入れる・タブ・タブごとの 保存・鍵・
// 使い方の カードと 2台連携の 置く がわ・こどもの 設定・電池。保存したら applySettings（board.js）で ボードに 当てる
(function () {
  "use strict";

  var B = window.Board;
  var $ = B.$, W = B.W, setText = B.setText, storageGet = B.storageGet, storageSet = B.storageSet, escapeHtml = B.escapeHtml;
  var kidsEdit = [];

  function post(url, body) { return window.BoardApi.post(url, body); }

  // ---- せってい がめん ----
  function fillSettings(s) {
    $("s-weekday-from").value = s.display.weekday.from;
    $("s-weekday-to").value = s.display.weekday.to;
    $("s-holiday-from").value = s.display.holiday.from;
    $("s-holiday-to").value = s.display.holiday.to;
    // 画面オフまで（30秒〜30分）。前に えらんだ 一覧に ない 値（31分以上 など）は 消さずに 足して えらべる まま
    var idle = String(s.display.idleMinutes);
    if (!$("s-idle").querySelector('option[value="' + idle + '"]')) {
      var opt = document.createElement("option");
      opt.value = idle;
      opt.textContent = idle + "分";
      $("s-idle").appendChild(opt);
    }
    $("s-idle").value = idle;
    $("s-week-mon").checked = s.weekStart === 1;
    $("s-week-sun").checked = s.weekStart !== 1;
    $("s-lowpower").checked = !!s.lowPower;
    fillLock(s.parentLock || { type: "none" });
    // 鍵は 置いた 端末で 聞く（つないだ スマホ・ブラウザでは 聞かない。setup.js の ParentLock）。2台で 使う ときだけ 一言
    $("s-lock-remote").hidden = !(window.BoardApi.remote || window.BoardApi.paired || window.BoardApi.usage(s) === "board2");
    $("s-parent-name").value = s.parentName || "";
    setText("s-export-result", "");
    renderDrive("");
    fillUsage(window.BoardApi.usage(s));
    window.AreaSelect.fill($("s-office"), $("s-area"), s.location || B.place());
    var clock = s.clock || "d24";
    Array.prototype.forEach.call(document.getElementsByName("s-clock"), function (r) { r.checked = r.value === clock; });
    fillWords(s.words);
    // 服装と傘の目安を ボードに 出すか（既定は 出す）
    $("s-advice").checked = s.showAdvice !== false;
    adviceChanged();
    var cl = s.clothes || B.CLOTHES;
    $("s-cl-short").value = cl.short;
    $("s-cl-jacket").value = cl.jacket;
    $("s-cl-coat").value = cl.coat;
    var pm = B.powerMode();
    Array.prototype.forEach.call(document.getElementsByName("s-power"), function (r) {
      r.checked = r.value === pm;
      r.disabled = r.value === "sleep" && !Device.canSleep();
    });
    $("s-power-note").hidden = Device.canSleep();
    $("s-front-group").hidden = !Device.canFront();
    if (Device.canFront()) $("s-front").checked = window.EchoBoard.getFront();
    renderFront();
    // 毎日の お知らせ（アプリだけ。この端末の 設定。保存は 下の saveBoard）
    $("s-notice-group").hidden = !Device.canNotice();
    if (Device.canNotice()) {
      var nt = Device.notice();
      $("s-notice").checked = !!nt.on;
      $("s-notice-time").value = B.pad(Math.floor(nt.minutes / 60)) + ":" + B.pad(nt.minutes % 60);
    }
    renderNotice();
    // 自動更新（Play から 入れた アプリだけ。この端末の 設定。update.js）
    renderAutoGroup();
    var au = window.Update ? window.Update.auto() : { on: true, from: "04:00", to: "05:00" };
    $("s-auto").checked = au.on;
    $("s-auto-from").value = au.from;
    $("s-auto-to").value = au.to;
    renderAuto();
    $("s-cal-help").hidden = true;
    // 画面の向きは この端末だけの せってい（アプリのときだけ だす）
    $("s-orient-row").hidden = !Device.canOrient();
    var orient = storageGet(B.ORIENT_KEY) || B.defaultOrient();
    Array.prototype.forEach.call(document.getElementsByName("s-orient"), function (r) { r.checked = r.value === orient; });
    renderBrightness();
    // 「使わない」でも URL は のこして おく（また 使うときに 入れなおさなくて よいように）
    var cal = (s.calendar && (s.calendar.type === "none" || s.calendar.type === "device") ? s.calendar : B.calSource()) || { type: "none", url: "" };
    // iCal と Apps Script は「URL を貼る」1つ（どちらかは URL から 見分ける。api.js の gasUrl）
    $("s-cal-type").value = cal.type === "gas" ? "ical" : cal.type;
    $("s-cal-url").value = cal.url || "";
    $("s-event-time").checked = !!s.eventTime;
    calDeviceOption(cal.type === "device");
    calTypeChanged(cal.type === "device" ? cal.ids || [] : []);
    // 「この端末のカレンダー」は 端末に カレンダーが ある ときだけ 出す（つないだ スマホは 置いた端末に 聞く）
    window.CalPick.available().then(function (ok) { if (ok) calDeviceOption(true); });
    setText("s-error", "");
  }

  // 待機中に バックライトを 下げるには「システム設定の変更」の許可が いる（アプリのときだけ）
  function renderBrightness() {
    var eb = window.EchoBoard, can = eb && typeof eb.canWriteSettings === "function";
    var dim = !document.querySelector('input[name=s-power][value=sleep]:checked');
    $("s-bright-row").hidden = !can;
    if (!can) return;
    var ok = eb.canWriteSettings();
    // 暗くするだけ: 明るさを 下げるのに / スリープ: 画面オフまでの 時間を 端末に 設定するのに いる
    setText("s-bright-status", dim
      ? (ok ? "暗くできます" : "画面は黒くなりますが、明るさは下がりません")
      : (ok ? "画面オフまでの時間を端末に設定できます" : "許可がないと、端末の設定の時間でスリープします"));
    $("s-bright-allow").hidden = ok;
  }
  $("s-bright-allow").addEventListener("click", function () {
    window.EchoBoard.requestWriteSettings();
  });
  // 「ボードを前に出す」には「ほかのアプリの上に重ねて表示」の許可が いる。オンに したときだけ 状態を 出す
  function renderFront() {
    if (!Device.canFront()) return;
    var ok = window.EchoBoard.canDrawOverlays();
    $("s-front-perm").hidden = !$("s-front").checked;
    setText("s-front-status", ok ? "許可されています" : "許可がないと、ボードを前に出せません");
    $("s-front-allow").hidden = ok;
  }
  $("s-front").addEventListener("change", renderFront);
  // 毎日の お知らせ: オンの ときだけ 時刻を 出す。端末の 設定で 通知が 止まって いれば その ことを 書く
  function renderNotice() {
    if (!Device.canNotice()) return;
    $("s-notice-row").hidden = !$("s-notice").checked;
    var nt = Device.notice();
    $("s-notice-off").hidden = !(nt.on && $("s-notice").checked && !nt.permitted);
  }
  $("s-notice").addEventListener("change", renderNotice);
  function renderAuto() { $("s-auto-row").hidden = !$("s-auto").checked; }
  // 夜の 入れ替えは 置いて 使う 端末だけ（update.js の nightOk）。つないだ スマホ・スマホだけでは 出さない
  function renderAutoGroup() {
    $("s-auto-group").hidden = !(window.EchoBoard && window.EchoBoard.startUpdate) ||
      window.BoardApi.remote || pickedUsage() === "phone";
  }
  $("s-auto").addEventListener("change", renderAuto);
  // 通知の 許可を 聞いた 結果（MainActivity が 知らせる）
  window.addEventListener("board:notice", function () { if (!$("settings").hidden) renderNotice(); });
  $("s-front-allow").addEventListener("click", function () {
    window.EchoBoard.requestOverlay();
  });
  // 許可の画面から もどってきたら 表示を なおす
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !$("settings").hidden) { renderBrightness(); renderFront(); renderNotice(); }
  });

  // 「この端末のカレンダー」は 端末に カレンダーが ある ときだけ 出す（出せない ときは「URL を貼る」だけ）
  function calDeviceOption(on) {
    $("s-cal-type").querySelector('option[value=device]').hidden = !on;
  }
  // ids: 設定を 開いた ときに えらんで いた カレンダー（それ 以外は 画面の 印の まま）
  function calTypeChanged(ids, ask) {
    var dev = $("s-cal-type").value === "device";
    $("s-cal-url").disabled = $("s-cal-type").value === "none";
    $("s-cal-url").hidden = dev;
    $("s-cal-note").hidden = dev;
    if (dev) window.CalPick.show($("s-cal-device"), Array.isArray(ids) ? ids : null, ask);
    else $("s-cal-device").hidden = true;
    $("s-cal-clear").hidden = dev || !$("s-cal-url").value;
    // 共有リンクなど 読めない URL を 貼ったら、その場で 正しい URL の 出し方を 出す
    var bad = $("s-cal-type").value === "ical" && window.BoardApi.calUrlProblem($("s-cal-url").value);
    $("s-cal-warn").hidden = !bad;
    $("s-cal-warn").textContent = bad ? window.Words.t("calShareLink", "upper") : "";
  }
  $("s-cal-type").addEventListener("change", function () { calTypeChanged(null, true); });
  $("s-cal-url").addEventListener("input", function () { calTypeChanged(); });
  $("s-cal-clear").addEventListener("click", function () {
    if (!confirm("予定の URL を消去しますか？（保存すると元に戻せません）")) return;
    $("s-cal-url").value = "";
    $("s-cal-type").value = "none";
    calTypeChanged();
  });
  // 予定の 読み込み先の せつめい
  $("s-cal-help-btn").addEventListener("click", function () { $("s-cal-help").hidden = !$("s-cal-help").hidden; });
  // 「スリープ」の ときは 明るさの 許可は いらない
  Array.prototype.forEach.call(document.getElementsByName("s-power"), function (r) {
    r.addEventListener("change", renderBrightness);
  });

  // 4つめの「置いてある端末につなぐ」（join）は 使い方の 値では なく、この端末を ほかの 置いた端末に つなぐ 入口。
  // アプリで データが この端末に ある ときと、もう つないで いる ときに 出す（つないで いれば えらばれた 状態）
  // 使い方の カードは 3枚: この端末だけ（solo。置く board1 か 手に もつ phone かは 下の「置き方」）・board2・join
  function fillUsage(u) {
    var remote = window.BoardApi.remote, ph = Device.phone(), solo = $("u-card-solo");
    // ブラウザ（アプリでない）では 2台の カードも 隠さず 出す（usage-cards.js。かんたん設定と おなじ）
    var browser = Device.browser() && !remote;
    $("u-card-join").hidden = !(Device.canJoin() || remote || browser);
    if (browser) window.UsageCards.markBrowser($("u-card-board2"), $("u-card-join"));
    $("u-qr-guide").hidden = true;
    $("s-system-usage").classList.toggle("two", $("u-card-join").hidden);
    solo.querySelector("img").src = ph ? "img/usage-phone.webp" : "img/usage-board.webp";
    Array.prototype.forEach.call(document.getElementsByName("s-usage"), function (r) {
      r.checked = remote ? r.value === "join" : r.value === (u === "board2" ? "board2" : "solo");
      // つないで いる スマホでは かえない（置いた端末で かえる）。2台連携の 置く がわは アプリの ときだけ
      r.disabled = remote ? true : r.value === "join" ? !Device.canJoin() :
        window.BoardApi.local ? r.value === "board2" && !Device.canHost() : r.value !== "board2";
    });
    // 置き方: いま「この端末だけ」なら その 値、ちがえば 端末で きめる（スマホは 手に もつ）
    var hold = u === "board1" || u === "phone" ? u : ph ? "phone" : "board1";
    Array.prototype.forEach.call(document.getElementsByName("s-hold"), function (r) { r.checked = r.value === hold; });
    usageChanged();
  }
  // 保存する 使い方（「つなぐ」を えらんで いる ときは いまの まま）
  function pickedUsage() {
    var r = document.querySelector("input[name=s-usage]:checked");
    if (!r || r.value === "join") return window.BoardApi.usage(B.settings);
    if (r.value === "board2") return "board2";
    var h = document.querySelector("input[name=s-hold]:checked");
    return h ? h.value : "board1";
  }
  // 手に もつ ときは 画面を つけておく 時間・画面オフの 設定を 出さない
  function usageChanged() {
    var r = document.querySelector("input[name=s-usage]:checked");
    // Web 版は 置いても 画面の つけ消しは 端末に まかせるので、置き方は 聞かない
    $("s-hold-row").hidden = !r || r.value !== "solo" || r.disabled || window.BoardApi.web;
    $("s-screen-group").hidden = pickedUsage() === "phone" || window.BoardApi.remote || window.BoardApi.web;
    renderAutoGroup();
    renderLanGroup();
  }
  Array.prototype.forEach.call(document.getElementsByName("s-hold"), function (r) {
    r.addEventListener("change", usageChanged);
  });

  // ---- 2台連携（置いた端末）: アプリの 中で サーバーを うごかし、同じ Wi-Fi に 知らせる（MainActivity・LanServer）----
  var LAN_CODE_KEY = "lan:code", lanStarted = "";
  function lanCode(renew) {
    var c = storageGet(LAN_CODE_KEY);
    if (!c || renew) {
      c = String(Math.floor(100000 + Math.random() * 900000));
      storageSet(LAN_CODE_KEY, c);
    }
    return c;
  }
  function updateLan() {
    if (!Device.canHost()) return;
    // 保存した 使い方か、設定を 開いて「この端末を置いて…」を 選んで いる あいだ（保存の 前から QR を 出す。11-18）
    if (window.BoardApi.usage(B.settings) === "board2" || (!$("settings").hidden && pickedUsage() === "board2")) {
      var c = lanCode(false);
      if (lanStarted !== c) { window.EchoBoard.startLan(c); lanStarted = c; }
    } else if (lanStarted) {
      window.EchoBoard.stopLan();
      lanStarted = "";
    }
    checkIp();
  }
  // 置いた端末の アドレス（IP）が かわったか（2026-11-18）。ルーターが DHCP で かえると、ブラウザ（QR）で 開いた ページは
  //   つながらなく なり、ページも この端末から 来るので 自分では 直せない。かわったら 画面の 下に 小さく 出し、
  //   設定の「この端末」を 開いたら（QR を 見せたら）新しい アドレスを おぼえて けす。アプリで つないだ スマホは 名前で さがしなおす
  var IP_KEY = "lan:ip";
  function lanIps() {
    var info = {};
    try { info = JSON.parse(window.EchoBoard.lanInfo()); } catch (e) { /* ふるい アプリ */ }
    return info.running ? info.ips || [] : [];
  }
  function ipChanged() {
    if (!Device.canHost() || window.BoardApi.usage(B.settings) !== "board2") return false;
    var ips = lanIps(), known = storageGet(IP_KEY);
    if (!ips.length) return false;
    if (!known) { storageSet(IP_KEY, ips[0]); return false; }
    return ips.indexOf(known) < 0;
  }
  // 知らせは 歯車（update.js の render。おうちの人に して ほしい ことは 歯車に まとめる。11-18 ユーザー）
  function checkIp() { if (window.Update) window.Update.render(); }
  function ackIp() {
    var ips = lanIps();
    if (ips.length && ipChanged()) storageSet(IP_KEY, ips[0]);
    checkIp();
  }
  window.LanNotice = { changed: ipChanged };
  function renderLanGroup() {
    var r = document.querySelector("input[name=s-usage]:checked");
    var show = Device.canHost() && !!r && r.value === "board2";
    $("s-lan-group").hidden = !show;
    $("s-remote-group").hidden = !window.BoardApi.remote;
    // ほかの 置いた端末に つなぐ ボタン（「置いてある端末につなぐ」を えらんだ とき）
    $("s-join-group").hidden = !(r && r.value === "join" && Device.canJoin());
    if (window.BoardApi.remote) $("s-remote-name").textContent = "「" + window.BoardApi.remoteName() + "」につないでいます。設定や「みました」は、その端末のデータを変えます。";
    if (!show) return;
    // 選んだ ときから サーバーを 動かして QR を 出す（前は 保存を 押すまで 出ず、とまどった。11-18 ユーザー）。
    //   保存しないで 閉じたら closeSettings の updateLan で 止まる
    updateLan();
    var code = lanCode(false), info = {};
    try { info = JSON.parse(window.EchoBoard.lanInfo()); } catch (e) { /* ふるい アプリ */ }
    $("s-lan-code").textContent = code;
    $("s-ip-changed").hidden = !ipChanged();
    $("s-lan-status").textContent = info.running
      ? "スマホから見つけられる状態です（" + (info.name || "はなまるボード") + "）。"
      : "保存すると、スマホから見つけられるようになります。";
    var ip = (info.ips || [])[0];
    var url = info.running && ip ? "http://" + ip + ":" + info.port + "/?pair=" + code + "#settings" : "";
    $("s-lan-url").textContent = url || "（保存すると、ここに QR コードが出ます）";
    $("s-lan-qr").innerHTML = url && window.makeQr ? window.makeQr(url) : "";
  }
  $("s-lan-new").addEventListener("click", function () {
    if (!confirm("つなぐための番号を変えますか？（つないでいるスマホは、新しい番号でつなぎ直しが必要です）")) return;
    var c = lanCode(true);
    if (lanStarted) { window.EchoBoard.startLan(c); lanStarted = c; }
    renderLanGroup();
  });
  $("s-join").addEventListener("click", function () {
    closeSettings();
    window.Remote.open();
  });
  // つなぎ直す（番号が かわった・つながらなく なった とき。いまの 端末を えらんだ 状態で 探す 画面を 開く。11-18）
  $("s-remote-again").addEventListener("click", function () {
    closeSettings();
    window.Remote.open();
  });
  $("s-remote-off").addEventListener("click", function () {
    if (!confirm("つなぐのをやめますか？（置いてある端末のデータは、そのまま残ります）")) return;
    window.BoardApi.disconnect();
    location.reload();
  });
  // ブラウザで「つなぐ」を 押したら、QR で つなぐ 手順（usage-cards.js）
  $("u-card-join").addEventListener("click", function () {
    if (!Device.browser() || window.BoardApi.remote) return;
    window.UsageCards.showQrGuide($("u-qr-guide"));
  });
  Array.prototype.forEach.call(document.getElementsByName("s-usage"), function (r) {
    r.addEventListener("change", function () {
      usageChanged();
      // 「つなぐ」を えらんだら、下の ボタンが 見える ところまで うごかす
      if (r.value === "join" && r.checked) $("s-join-group").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  // みんなで 見る ところ（時計・天気・よてい）の 文字。1か所で 選び、3つに 同じ 値を 入れる（2026-11-18。前は タブごと）
  var WORD_SECS = ["clock", "weather", "schedule"];
  var WORD_MODES = [["auto", "自動（いちばん小さい子に合わせる）"], ["kana", "ひらがな"], ["kanji", "漢字"], ["ruby", "漢字＋ふりがな"]];
  function fillWords(w) {
    Array.prototype.forEach.call(document.querySelectorAll("#settings .s-words"), function (box) {
      var cur = (w || {}).weather || "auto";
      box.innerHTML = WORD_MODES.map(function (m) {
        return '<label><input type="radio" name="s-words" value="' + m[0] + '"' + (m[0] === cur ? " checked" : "") + '> ' + m[1] + '</label>';
      }).join("");
    });
  }
  function readClothes() {
    function v(id, d) { var n = parseInt($(id).value, 10); return isNaN(n) ? d : Math.max(-10, Math.min(40, n)); }
    var c = { short: v("s-cl-short", B.CLOTHES.short), jacket: v("s-cl-jacket", B.CLOTHES.jacket), coat: v("s-cl-coat", B.CLOTHES.coat) };
    c.coat = Math.min(c.coat, c.jacket);
    return c;
  }
  function readWords() {
    var w = {}, r = document.querySelector('input[name="s-words"]:checked');
    WORD_SECS.forEach(function (sec) { w[sec] = r ? r.value : "auto"; });
    return w;
  }

  function adviceChanged() { $("s-advice-group").classList.toggle("off", !$("s-advice").checked); }
  $("s-advice").addEventListener("change", adviceChanged);

  // ---- こどもの せってい（なまえ・いろ・ひょうじ・ならび） ----
  var COLOR_KEYS = Object.keys(window.KID_PALETTE);

  function renderKidsEdit() {
    $("s-kids").innerHTML = kidsEdit.map(function (k, i) {
      var c = window.KID_PALETTE[k.color] || window.KID_PALETTE.purple;
      return '<li data-i="' + i + '">' +
        '<button class="swatch" data-act="color" style="background:' + c.main + '" aria-label="色"></button>' +
        '<input type="text" maxlength="12" data-act="name" placeholder="名前" value="' + escapeHtml(k.name) + '">' +
        '<select data-act="honor" aria-label="名前のあと">' + [["", "なし"], ["ちゃん", "ちゃん"], ["くん", "くん"]].map(function (h) {
          return '<option value="' + h[0] + '"' + ((k.honor || "") === h[0] ? " selected" : "") + '>' + h[1] + '</option>';
        }).join("") + '</select>' +
        '<select data-act="level" aria-label="年齢の目安">' + window.Words.levelOptions(k) + '</select>' +
        '<label><input type="checkbox" data-act="active"' + (k.active !== false ? " checked" : "") + '> 表示</label>' +
        '<span class="k-moves"><button class="ghost small" data-act="up" aria-label="上へ">↑</button>' +
        '<button class="ghost small" data-act="down" aria-label="下へ">↓</button></span>' +
        '</li>';
    }).join("");
    renderGoals();
    renderFeatures();
    maxKidsNote();
  }
  // 使う機能（子どもごと）。がんばりカレンダーは いつも 使う。おさいふは 印を つけた 子だけ（kid.wallet。2026-11-18）
  function renderFeatures() {
    $("s-features").innerHTML = kidsEdit.map(function (k, i) {
      if (!k.name.trim() || k.active === false) return "";
      return '<li data-i="' + i + '"><span class="g-name">' + escapeHtml(k.name) + '</span>' +
        '<label class="off"><input type="checkbox" checked disabled> がんばりカレンダー</label>' +
        '<label><input type="checkbox" data-act="wallet"' + (k.wallet ? " checked" : "") + '> おさいふ</label>' +
        // 1ポイント＝○円（こうかんした ときに おさいふに 入れるかを 聞く。空は 聞かない。2026-11-18）
        '<label class="s-rate"' + (k.wallet ? "" : " hidden") + '>1ポイント＝<input type="number" min="0" max="10000" inputmode="numeric" data-act="rate" value="' +
          (k.walletRate > 0 ? k.walletRate : "") + '">円</label></li>';
    }).join("");
  }
  $("s-features").addEventListener("change", function (ev) {
    var li = ev.target.closest("li"), k = li && kidsEdit[+li.dataset.i];
    if (!k) return;
    if (ev.target.dataset.act === "wallet") {
      k.wallet = ev.target.checked;
      li.querySelector(".s-rate").hidden = !k.wallet;
    }
  });
  $("s-features").addEventListener("input", function (ev) {
    var li = ev.target.closest("li");
    if (li && ev.target.dataset.act === "rate") kidsEdit[+li.dataset.i].walletRate = Math.max(0, parseInt(ev.target.value, 10) || 0);
  });
  // もくひょう（子どもごと。保存して ある 子だけ。新しい 子は はじめ 50 で、保存の あとに かえられる）
  var goalsEdit = {};
  function goalSize(k) { return (k.goal && k.goal.size) || window.BoardApi.goalSize; }
  function renderGoals() {
    var ks = kidsEdit.filter(function (k) { return k.id && k.name.trim() && k.active !== false; });
    $("s-goals").innerHTML = ks.map(function (k) {
      var v = goalsEdit.hasOwnProperty(k.id) ? goalsEdit[k.id] : goalSize(k);
      return '<li><span class="g-name">' + escapeHtml(k.name) + '</span>' +
        '<label><input type="number" min="1" max="9999" inputmode="numeric" data-goal="' + k.id + '" value="' + escapeHtml(String(v)) + '"> ポイント</label></li>';
    }).join("");
  }
  $("s-goals").addEventListener("input", function (ev) {
    if (ev.target.dataset.goal) goalsEdit[ev.target.dataset.goal] = ev.target.value;
  });
  // 表示できる 子どもの 数（4人。無料も Pro も おなじ。2026-11-19 に 無料の 2人の 上限を なくした）まで いたら「＋ 子どもを追加」を 押せなく する
  function maxKidsNote() {
    var max = window.BoardApi.maxKids || 4;
    var full = kidsEdit.filter(function (k) { return k.active !== false; }).length >= max;
    $("s-add-kid").disabled = full;
    $("s-max-kids").hidden = !full;
    if (full) $("s-max-kids").textContent = W("maxKids", { n: max });
  }

  $("s-kids").addEventListener("click", function (ev) {
    var btn = ev.target.closest("button");
    if (!btn) return;
    var i = +btn.closest("li").dataset.i, k = kidsEdit[i], j = i;
    if (btn.dataset.act === "color") k.color = COLOR_KEYS[(COLOR_KEYS.indexOf(k.color) + 1) % COLOR_KEYS.length];
    else if (btn.dataset.act === "up") j = i - 1;
    else if (btn.dataset.act === "down") j = i + 1;
    if (j !== i) {
      if (j < 0 || j >= kidsEdit.length) return;
      kidsEdit[i] = kidsEdit[j];
      kidsEdit[j] = k;
    }
    renderKidsEdit();
  });
  $("s-kids").addEventListener("input", function (ev) {
    var k = kidsEdit[+ev.target.closest("li").dataset.i];
    if (ev.target.dataset.act === "name") { k.name = ev.target.value; renderGoals(); renderFeatures(); }
    if (ev.target.dataset.act === "active") { k.active = ev.target.checked; maxKidsNote(); renderGoals(); renderFeatures(); }
    if (ev.target.dataset.act === "level") { var pl = window.Words.parseLevel(ev.target.value); k.level = pl.level; k.ruby = pl.ruby; }
    if (ev.target.dataset.act === "honor") k.honor = ev.target.value;
  });
  $("s-add-kid").addEventListener("click", function () {
    // まだ つかっていない いろを えらぶ
    var used = kidsEdit.map(function (k) { return k.color; });
    var color = COLOR_KEYS.filter(function (c) { return used.indexOf(c) < 0; })[0] || COLOR_KEYS[0];
    kidsEdit.push({ id: "", name: "", color: color, active: true, level: "lower", honor: "" });
    renderKidsEdit();
    var inputs = $("s-kids").querySelectorAll("input[type=text]");
    inputs[inputs.length - 1].focus();
  });

  // 左の 項目を えらぶと 右に その なかみ
  function showTab(page) {
    Array.prototype.forEach.call($("s-nav").children, function (b) { b.classList.toggle("on", b.dataset.page === page); });
    Array.prototype.forEach.call(document.querySelectorAll("#settings .s-page"), function (p) { p.hidden = p.id !== "s-page-" + page; });
    $("settings").querySelector(".s-pages").scrollTop = 0;
    // 「この端末」で QR を 見せたら、かわった アドレスを おぼえて 下の 札を けす（QR の 上の 知らせは この 画面の あいだ のこす）
    if (page === "system") ackIp();
    // Google の 窓口（gsi）は「おうちの人」を ひらいた ときに 読んで おく（押してから 読むと、iPhone の Safari が Google の 画面を 止める ことが ある）
    if (page === "parent" && driveOn()) window.Drive.client().prepare();
    // 保存は 子ども・おうちの人・ボードの表示・この端末 の ときだけ（やること・がんばりチェックは 中に 保存が ある）
    $("s-save").hidden = SAVE_PAGES.indexOf(page) < 0;
    $("s-saved").textContent = "";
    // やること・がんばりチェック（admin.html）は はじめて ひらいた ときに よむ。中で かえた ものは とじる ときに ボードへ
    if (page === "pro" && window.ProPage) window.ProPage.render();
    var frame = { tasks: ["s-admin-frame", "only=tasks"], day: ["s-day-frame", "only=day"] }[page];
    if (frame && !$(frame[0]).getAttribute("src")) {
      var url = window.BoardApi.adminUrl;
      $(frame[0]).src = url + (url.indexOf("?") < 0 ? "?" : "&") + "embed=1&" + frame[1];
    }
  }
  // 「がんばりチェック」（「みました」・すぎた日を 直す）は いちばん よく 使うので、どの 端末でも いちばん 左に して、ひらいたら まず そこを 見せる
  // Web 版では 予定を まだ よめないので、ボードの表示の 予定の 欄を 出さない
  if (window.BoardApi.web) $("s-cal-group").hidden = true;
  $("s-nav").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (b && b.dataset.page) showTab(b.dataset.page);
  });

  // ---- 電池（アプリの ときだけ。MainActivity.getBattery）----
  // 熱い（45℃ いじょう・overheat）・弱って いる（dead など）と 端末が 知らせて いる ときに、おうちの人に 知らせる。
  // 10分ごとに Android の さいごの 値を よむだけ（軽い）。つないだ スマホでは 出さない（その スマホの 電池なので）
  var BAD_HEALTH = { overheat: "熱くなっている", dead: "劣化している", over_voltage: "電圧が高すぎる", failure: "異常がある" };
  function battery() {
    var eb = window.EchoBoard;
    if (window.BoardApi.remote || !eb || typeof eb.getBattery !== "function") return null;
    try { return JSON.parse(eb.getBattery()); } catch (e) { return null; }
  }
  // 電池の ない 端末でも「電池あり・電圧 0・温度 0」と 出る ことが ある
  function noBattery(b) { return !b.present || (b.voltage === 0 && b.temp === 0); }
  // 温度を 知らせない 端末は とても 小さい 数（MainActivity の 既定値）に なる。ありえない 値は「わからない」（null）
  function battTemp(b) { return typeof b.temp === "number" && b.temp > -40 && b.temp < 120 ? b.temp : null; }
  function batteryWarn(b) {
    if (!b || noBattery(b)) return "";
    if (BAD_HEALTH[b.health]) return "端末が「電池が" + BAD_HEALTH[b.health] + "」と知らせています";
    var t = battTemp(b);
    if (t !== null && t >= 45) return "端末の電池が熱くなっています（" + Math.round(t) + "℃）";
    return "";
  }
  function renderBattery() {
    var b = battery(), warn = batteryWarn(b);
    $("batt-chip").hidden = !warn;
    $("s-battery-warn").hidden = !warn;
    $("s-battery-warn").textContent = warn ? warn + "。押すと詳しく見られます" : "";
    $("s-battery-group").hidden = !b;
    if (!b) return;
    var t = battTemp(b);
    setText("s-battery-status", noBattery(b) ? "電池は見つかりませんでした（電源につないで動いています）。" :
      "いまの電池：" + (b.level >= 0 ? "残り " + b.level + "%・" : "") + (b.charging ? "充電中" : b.plugged ? "電源につないでいます" : "電池で動いています") +
      "・温度 " + (t === null ? "不明" : Math.round(t) + "℃") + (warn ? "（注意が必要です）" : "（いまは問題は見つかりません）"));
  }
  $("s-battery-warn").addEventListener("click", function () {
    showTab("system");
    $("s-battery-group").scrollIntoView({ block: "nearest" });
  });
  renderBattery();
  setInterval(renderBattery, 10 * 60 * 1000);

  function openSettings() {
    // Web 版で ドライブに つないで いて 通行証が 切れて いたら、開いた ついでに 取りなおす（鍵の あとの 押した 処理の 中で 同期で。drive.js の nudge）
    if (driveOn()) window.Drive.auto().nudge();
    renderBattery();
    fillSettings(B.settings);
    kidsEdit = JSON.parse(JSON.stringify(B.kids));
    goalsEdit = {};
    renderKidsEdit();
    showTab("day");
    $("settings").hidden = false;
    renderLockHint();
    // つないで いる 間は 設定を 開いた ときにも Google の 窓口を 読んで おく（帯の「つなぎ直す」の ため）
    if (driveOn() && window.Drive.client().linked()) window.Drive.client().prepare();
    setText("s-procode-msg", "");
    renderPro();
    fitTabs();
    resetDirty();
  }
  // 鍵が「なし」の あいだは「おうちの人」の タブに 小さな しるし（保存して いない ● とは 別の 見た目。2026-11-19 ユーザー）。
  //   鍵が あると 気づかず「みました を 子どもが 押せてしまう」と 言われた（11-18）
  //   Web 版で Google ドライブに 控えてから 7日を すぎた ときも 同じ しるし（中に 一言。drive.js の stale）
  //   つないで いる 人は 7日の 代わりに「止まって いる」とき（切れた・前の 控えが ある・空きが ない）
  function driveHint() {
    if (!driveOn()) return false;
    var c = window.Drive.client(), a = window.Drive.auto();
    return c.linked() ? a.needsReconnect() || /^(held-|full)/.test(a.status()) : c.stale();
  }
  function renderLockHint() {
    var lock = B.settings.parentLock || {}, b = document.querySelector('#s-nav [data-page="parent"]');
    if (b) b.classList.toggle("hint", !lock.type || lock.type === "none" || driveHint());
  }
  // 横で タブが 1行に 入らない ときは 字を 小さく（端末の 字の 形で 幅が かわる。iPlay などは 字の 幅が 広い）。
  // 2だんかいまで 小さく して、それでも 入らなければ 2行に。縦は もとから 2行
  function fitTabs() {
    var nav = $("s-nav"), tabs = Array.prototype.filter.call(nav.children, function (b) { return !b.hidden; });
    function wrapped() { return tabs.length > 1 && tabs[tabs.length - 1].offsetTop > tabs[0].offsetTop + 4; }
    nav.classList.remove("tight", "tight2");
    if (document.body.classList.contains("portrait")) return;
    if (wrapped()) nav.classList.add("tight");
    if (wrapped()) nav.classList.add("tight2");
  }
  // 画面を 回した ときは、盤面の 向き（app.js の fit が body に つける portrait）が かわって から 決める
  //   （resize で 決めると fit より 先に 動き、古い 向きの まま 字の 大きさを 決めて いた）
  window.addEventListener("board:fit", function () { if (!$("settings").hidden) fitTabs(); });

  // ---- 保存は タブごと（子ども・おうちの人・ボードの表示・この端末。どの タブの「保存」も、それらを まとめて 保存する）----
  // 保存して いない 変更が ある タブには ●。閉じる ときは、やること（admin.html）の 中の 欄も あわせて きく
  var SAVE_PAGES = ["kids", "parent", "board", "system"], baseline = {};
  function pageState(page) {
    // ファイルを えらぶ 欄（データの 読み込み）は 保存とは 関係ない
    //   予定の カレンダーの 一覧（calpick.js）は あとから 描くので、印 そのものでは なく えらんだ id で くらべる
    var v = Array.prototype.map.call($("s-page-" + page).querySelectorAll("input:not([type=file]):not([data-id]), select, textarea"), function (i) {
      return i.type === "checkbox" || i.type === "radio" ? (i.checked ? "1" : "0") : i.value;
    }).join("|");
    if (page === "board") v += "|" + window.CalPick.picked($("s-cal-device")).join(",");
    return page === "kids" ? v + JSON.stringify(kidsEdit) : v;
  }
  function dirtyPages() { return SAVE_PAGES.filter(function (p) { return pageState(p) !== baseline[p]; }); }
  function refreshDirty() {
    var d = dirtyPages();
    SAVE_PAGES.forEach(function (p) {
      var b = document.querySelector('#s-nav [data-page="' + p + '"]');
      if (b) b.classList.toggle("dirty", d.indexOf(p) >= 0);
    });
    $("s-save").disabled = !d.length;
  }
  function resetDirty() {
    SAVE_PAGES.forEach(function (p) { baseline[p] = pageState(p); });
    refreshDirty();
  }
  ["input", "change", "click"].forEach(function (type) {
    $("settings").addEventListener(type, function () { setTimeout(refreshDirty, 0); });
  });
  // がんばり項目の 中で 保存して いない 欄（admin.html の unsavedSections）
  function frameUnsaved() {
    try { return ($("s-admin-frame").contentWindow.unsavedSections || function () { return []; })(); } catch (e) { return []; }
  }
  // 保存して いない 変更が あれば「保存しないで閉じますか？」と きいてから
  function confirmClose(then) {
    var names = dirtyPages().map(function (p) { return document.querySelector('#s-nav [data-page="' + p + '"]').textContent.replace(" ●", ""); })
      .concat(frameUnsaved().map(function (n) { return "やることの「" + n + "」"; }));
    if (!names.length || window.confirm("保存していない変更があります（" + names.join("・") + "）。" + String.fromCharCode(10) + "保存しないで閉じますか？")) then();
  }

  // ブラウザで「…/#settings」を ひらくと 設定画面から はじめる（おうちの人が スマホや PC の ブラウザから 設定するとき）
  // おうちの人の べつの 端末（つないだ スマホの アプリ）も、ひらいたら まず 設定（がんばりチェック）
  var settingsFromHash = location.hash === "#settings" || window.BoardApi.remote;
  window.addEventListener("board:state", function () {
    if (!settingsFromHash) return;
    settingsFromHash = false;
    // 鍵（setup.js）は あとから よまれるので、ページを よみおえてから
    function go() { window.ParentLock.ask(openSettings); }
    if (document.readyState === "complete") go(); else window.addEventListener("load", go);
  });

  function closeSettings() {
    $("settings").hidden = true;
    updateLan();   // 保存しないで 閉じたら、選んだ だけの「置いて…」の サーバーを 止める
    B.lastTouch = Date.now();
    // がんばり項目を ひらいて いたら、つぎは よみなおす（ほかの タブで かえた 設定と ずれない ように）
    var reload = false;
    ["s-admin-frame", "s-day-frame"].forEach(function (id) {
      if (!$(id).getAttribute("src")) return;
      $(id).removeAttribute("src");
      reload = true;
    });
    if (reload) window.dispatchEvent(new Event("board:reload"));
  }

  // 鍵（setup.js の ParentLock）。番号は 入れた ときだけ かえる（空なら いまの 番号の まま）
  function fillLock(lock) {
    var type = lock.type === "pin" && !/^\d{4}$/.test(lock.pin || "") ? "easy" : lock.type || "none";
    Array.prototype.forEach.call(document.getElementsByName("s-lock"), function (r) { r.checked = r.value === type; });
    $("s-pin").value = "";
    $("s-pin-keep").hidden = type !== "pin";
    lockChanged();
  }
  function lockChanged() {
    var r = document.querySelector("input[name=s-lock]:checked");
    $("s-pin-row").hidden = !r || r.value !== "pin";
  }
  Array.prototype.forEach.call(document.getElementsByName("s-lock"), function (r) {
    r.addEventListener("change", lockChanged);
  });
  $("s-pin").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); });
  function readLock() {
    var type = (document.querySelector("input[name=s-lock]:checked") || {}).value || "none";
    if (type !== "pin") return { type: type };
    var cur = B.settings.parentLock || {}, pin = $("s-pin").value;
    if (!pin && cur.type === "pin" && /^\d{4}$/.test(cur.pin || "")) pin = cur.pin;
    return /^\d{4}$/.test(pin) ? { type: "pin", pin: pin } : null;
  }

  $("s-save").addEventListener("click", saveBoard);
  function saveBoard() {
    var lock = readLock();
    if (!lock) {
      showTab("parent");
      return setText("s-error", "鍵の4桁の番号を入れてください");
    }
    var calReq = { type: $("s-cal-type").value, url: $("s-cal-url").value.trim() };
    if (calReq.type === "device") {
      calReq.ids = window.CalPick.picked($("s-cal-device"));
      if (!calReq.ids.length) { showTab("board"); return setText("s-error", window.Words.adult("calPickNone")); }
    }
    var next = {
      parentLock: lock,
      parentName: $("s-parent-name").value.trim(),
      location: window.AreaSelect.value($("s-office"), $("s-area")),
      calendar: calReq,
      weekStart: $("s-week-mon").checked ? 1 : 0,
      lowPower: $("s-lowpower").checked,
      usage: pickedUsage(),
      clock: (document.querySelector("input[name=s-clock]:checked") || {}).value || "d24",
      words: readWords(),
      clothes: readClothes(),
      showAdvice: $("s-advice").checked,
      eventTime: $("s-event-time").checked,
      display: {
        weekday: { from: $("s-weekday-from").value || B.display.weekday.from, to: $("s-weekday-to").value || B.display.weekday.to },
        holiday: { from: $("s-holiday-from").value || B.display.holiday.from, to: $("s-holiday-to").value || B.display.holiday.to },
        idleMinutes: Math.max(0.5, Math.min(60, parseFloat($("s-idle").value) || 1)),
      },
    };
    var named = kidsEdit.filter(function (k) { return k.name.trim(); });
    if (!named.some(function (k) { return k.active !== false; })) {
      showTab("kids");
      return setText("s-error", "表示する子どもを1人以上入れてください");
    }
    // もくひょうは 変えた 子だけ 送る（大きさを かえると、たっせいの 回数と とちゅうまでの ぶんを のこして かぞえなおす）
    var goals = [];
    for (var gid in goalsEdit) {
      var gk = kidsEdit.filter(function (k) { return k.id === gid; })[0], gv = parseInt(goalsEdit[gid], 10);
      if (!gk || String(gv) === String(goalSize(gk))) continue;
      if (!(gv >= 1 && gv <= 9999)) { showTab("kids"); return setText("s-error", "もくひょうは 1〜9999 の数字で入れてください"); }
      goals.push({ kid: gid, size: gv });
    }
    // 設定 → 子ども → もくひょう を まとめて 保存（どれか だめなら なにも かえない。古い 置いた端末には 1つずつ）
    window.BoardApi.postAll([{ path: "/api/board/settings", body: next }, { path: "/api/board/kids", body: { kids: named } }]
      .concat(goals.map(function (g) { return { path: "/api/parent/goal", body: g }; }))).then(function () {
      goalsEdit = {};
      var o = document.querySelector("input[name=s-orient]:checked");
      if (o && !$("s-orient-row").hidden) { storageSet(B.ORIENT_KEY, o.value); B.applyOrientation(); }
      var pw = document.querySelector("input[name=s-power]:checked");
      if (pw) storageSet(B.POWER_KEY, pw.value);
      if (Device.canFront()) window.EchoBoard.setFront($("s-front").checked);
      if (Device.canNotice()) {
        if (!$("s-auto-group").hidden) {
          storageSet("autoUpdate", { on: $("s-auto").checked, from: $("s-auto-from").value || "04:00", to: $("s-auto-to").value || "05:00" });
        }
        var tm = $("s-notice-time").value || "07:00";
        Device.setNotice($("s-notice").checked, +tm.slice(0, 2) * 60 + +tm.slice(3, 5));
        renderNotice();
      }
      if (B.settings.pro) next.pro = B.settings.pro;   // 招待コードで 開いた 印（保存する 欄には ない）を のこす
      B.applySettings(next);
      renderLockHint();
      // 置いた端末: 保存で サーバーを はじめたら、その場で QR を 出す（前は 設定を 開きなおすまで「保存すると…」の まま。11-18 テスターの 声）
      renderLanGroup();
      window.dispatchEvent(new Event("board:reload")); // カレンダーの週の始まり などを かきなおす
      setText("s-error", "");
      resetDirty();
      // 押した ボタンの となりに「保存しました」（しばらくして けす）
      var note = $("s-saved");
      note.textContent = "✓ 保存しました";
      clearTimeout(note._t);
      note._t = setTimeout(function () { note.textContent = ""; }, 2500);
    }).catch(function (e) {
      var why = window.BoardApi.connWhy(e);
      setText("s-error", why ? "保存できませんでした。" + why : "保存できませんでした（" + (e.message || "サーバーにつながりません") + "）");
    });
  }
  $("s-cancel").addEventListener("click", function () { confirmClose(closeSettings); });

  // データの 書き出し・読み込み（datafile.js。がんばり管理の ページと おなじ）。戻したら ボードと 設定の 欄を よみなおす
  $("s-export").addEventListener("click", function () {
    window.DataFile.save().then(function (msg) { setText("s-export-result", msg); },
      function (e) { setText("s-export-result", "保存できませんでした（" + (e.message || "") + "）"); });
  });
  $("s-import").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    window.DataFile.load(file).then(function (done) {
      if (done) afterRestore(function () { setText("s-export-result", "戻しました"); });
    }, function (e) { setText("s-export-result", e.message); });
  });
  // 戻したら ボードと 設定の 欄を よみなおす（ファイル・Google ドライブ）
  function afterRestore(then) {
    window.addEventListener("board:state", function refill() {
      window.removeEventListener("board:state", refill);
      fillSettings(B.settings);
      kidsEdit = JSON.parse(JSON.stringify(B.kids));
      goalsEdit = {};
      renderKidsEdit();
      renderLockHint();
      resetDirty();
      then();
    });
    // 中に 出して いる admin.html も 読みなおす
    ["s-admin-frame", "s-day-frame"].forEach(function (id) {
      var src = $(id).getAttribute("src");
      if (src) { $(id).removeAttribute("src"); $(id).setAttribute("src", src); }
    });
    window.dispatchEvent(new Event("board:reload"));
  }

  // ---- Google ドライブの 控え（Web 版だけ。drive.js。2026-11-20）----
  //   1台で つかう ブラウザの Web 版で、クライアント ID が ある ときだけ 出す。アプリ・つないだ スマホ・ID が ない ときは 何も 出さない
  function driveOn() { return !!(window.Drive && window.Drive.on()); }
  var AW = window.Words.adult;
  // 日時を「11月20日 9:05」に
  function driveWhen(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function driveErr(e) { return window.Drive.errText(e); }
  var driveBusy = false;
  // 止まって いる わけ（held・full）の 文。日時は 見つけた 控えの 日時（読みなおした あとは 分からないので 日時なしの 文）
  function driveHeldText(st) {
    if (st === "full") return AW("driveHeldFull");
    var at = window.Drive.auto().heldAt(), d = at ? driveWhen(at) : "";
    return AW(st === "held-other" ? "driveHeldOther" : "driveHeldAsk").replace(d ? "{d}" : / ?\{d\} ?/, d);
  }
  // msg: 結果の 文（"" なら 消す。null なら そのまま）
  function renderDrive(msg) {
    var on = driveOn();
    $("s-drive-group").hidden = !on;
    $("faq-web-drive").hidden = !on;
    $("s-drive-band").hidden = true;
    if (!on) return;
    var c = window.Drive.client(), a = window.Drive.auto(), last = c.last(), linked = c.linked(), st = a.status();
    var held = /^(held-|full)/.test(st), reconnect = a.needsReconnect();
    $("s-drive-title").textContent = AW("driveTitle");
    $("s-drive-save").textContent = AW("driveSave");
    $("s-drive-restore").textContent = AW("driveRestore");
    $("s-drive-note").textContent = AW("driveNote") + AW("driveOneAccount");
    $("faq-drive-one").textContent = AW("driveOneAccount");
    $("s-drive-last").textContent = last ? AW("driveLast").replace("{d}", driveWhen(last)) : AW("driveNever");
    // 7日の 一言は つながずに 手で 控える 人だけ（つないで いる 人には 止まった ときの 帯）
    $("s-drive-stale").textContent = AW("driveStale");
    $("s-drive-stale").hidden = linked || !c.stale();
    // つないで いる 間の 状態。止まって いる ときは 先頭に ボタン（つなぎ直す・この内容で上書き）
    $("s-drive-state").hidden = !linked;
    var who = c.account ? c.account() : "";
    $("s-drive-state").textContent = (held ? driveHeldText(st) : reconnect ? AW("driveStopped") : AW("driveLinked")) +
      (who ? AW("driveWho").replace("{who}", who) : "");
    $("s-drive-state").classList.toggle("warn", held || reconnect);
    $("s-drive-fix").hidden = !(linked && (held || reconnect));
    $("s-drive-reconnect").textContent = AW("driveReconnect");
    $("s-drive-reconnect").hidden = !reconnect;
    $("s-drive-overwrite").textContent = AW("driveOverwrite");
    $("s-drive-overwrite").hidden = !/^held-/.test(st);
    $("s-drive-unlink").textContent = AW("driveUnlink");
    $("s-drive-unlink").hidden = !linked;
    // 設定の タブの 上の 細い 帯（つないで いる・切れた・控えて いない 変更が ある ときだけ）
    $("s-drive-band").hidden = !reconnect;
    $("s-drive-band-text").textContent = AW("driveStopped");
    $("s-drive-band-btn").textContent = AW("driveReconnect");
    $("s-drive-save").disabled = $("s-drive-restore").disabled = $("s-drive-reconnect").disabled =
      $("s-drive-overwrite").disabled = $("s-drive-unlink").disabled = $("s-drive-band-btn").disabled = driveBusy;
    // 止まった ときは 前の「控えました」を 残さない（「止まって います」と 食い違って 見える）
    if (msg === null && (held || reconnect)) msg = "";
    if (msg !== null) $("s-drive-result").textContent = msg || "";
  }
  // 押して いる 間は ボタンを 押せなく して、いま している ことを 出す
  function driveRun(doing, work) {
    if (driveBusy) return;
    driveBusy = true;
    renderDrive(doing);
    work().then(function (msg) {
      driveBusy = false;
      renderDrive(msg === null ? "" : msg);
      renderLockHint();
    }, function (e) {
      driveBusy = false;
      renderDrive(driveErr(e));
    });
  }
  $("s-drive-save").addEventListener("click", function () {
    var c = window.Drive.client();
    driveRun(AW("driveSaving"), function () {
      // 先に Google の 許可（押した すぐ あとで ないと Safari が 画面を 止める）
      return c.token().then(function () { return window.DataFile.text(); }).then(function (f) {
        return c.backup(f.text, { replace: function (old) { return confirm(AW("driveReplace").replace("{d}", driveWhen(old.at))); } });
      }).then(function (r) {
        if (!r) return null;
        // 手で 控えたら つないだ ことに する（つぎからは 自動で 控える）
        c.setLinked(true);
        window.Drive.auto().clearHeld();
        window.Drive.auto().clearDirty();
        return AW("driveSaved");
      });
    });
  });
  $("s-drive-restore").addEventListener("click", function () {
    var c = window.Drive.client();
    driveRun(AW("driveFinding"), function () {
      return c.token().then(function () { c.setLinked(true); return c.latest(); }).then(function (f) {
        if (!f) return AW("driveNone");
        return c.read(f.id).then(function (data) {
          return window.DataFile.apply(data, AW("driveFrom").replace("{d}", driveWhen(f.at)));
        }).then(function (done) {
          if (!done) return null;
          // 戻した 控えを「最後に 控えた」に して、自動の 控えが 止まらない ように
          c.adopt(f.at);
          window.Drive.auto().clearHeld();
          window.Drive.auto().clearDirty();
          return new Promise(function (resolve) { afterRestore(function () { resolve(AW("driveRestored")); }); });
        });
      });
    });
  });
  // つなぎ直す（帯・ドライブの 欄）: 押した その場で Google の 窓 → 止まって いた 控えを すぐ 送る
  function driveReconnect() {
    var c = window.Drive.client();
    driveRun(AW("driveSaving"), function () {
      return c.token().then(function () { return window.Drive.auto().run(); }).then(function (st) {
        return st === "" ? AW("driveSaved") : /^(held-|full)/.test(st) ? null : driveErr({ code: st });
      });
    });
  }
  $("s-drive-reconnect").addEventListener("click", driveReconnect);
  $("s-drive-band-btn").addEventListener("click", driveReconnect);
  // 止まって いる とき（前の 控え・ほかの 端末の 控えが ある）: この 内容で 上書き
  $("s-drive-overwrite").addEventListener("click", function () {
    var c = window.Drive.client();
    if (!confirm(AW("driveOverwriteAsk"))) return;
    driveRun(AW("driveSaving"), function () {
      return c.token().then(function () { return window.DataFile.text(); }).then(function (f) {
        return c.backup(f.text, { force: true });
      }).then(function () {
        window.Drive.auto().clearHeld();
        window.Drive.auto().clearDirty();
        return AW("driveSaved");
      });
    });
  });
  // つなぐのを やめる（ドライブの 控えは 残る。7日の 一言に もどる）
  $("s-drive-unlink").addEventListener("click", function () {
    if (driveBusy || !confirm(AW("driveUnlinkAsk"))) return;
    window.Drive.client().unlink();
    window.Drive.auto().clearHeld();
    window.Drive.auto().clearDirty();
    renderDrive(AW("driveUnlinked"));
    renderLockHint();
  });
  // 自動で 控える（つないで いる 間）。保存の たび（admin.html の 中の 保存も 親に 知らせが 来る）・隠れた とき・つながった とき
  if (driveOn()) {
    var auto = window.Drive.auto();
    window.addEventListener("board:saved", function () { auto.changed(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) auto.run(); });
    window.addEventListener("online", function () { auto.run(); });
    auto.onChange(function () {
      if ($("settings").hidden || driveBusy) return;
      renderDrive(null);
      renderLockHint();
    });
    // つないで いる 間は 起動した ときにも Google の 窓口を 読んで おく（つなぎ直すを 押した すぐ あとに 窓を 出せる ように）
    if (window.Drive.client().linked()) window.Drive.client().prepare();
    // 前に 控えきれなかった 変更が あれば（読みなおした あと）、状態を 決めて おく（トークンが ないので 送らずに 帯）
    auto.run();
  }

  // 説明は 設定の 上に ひらく（とじると 設定に もどる。はじめての ときの 説明は 設定を とおらないので、とじると そのまま ボード）
  $("s-help").addEventListener("click", function () { window.Tutorial.open(); });

  // ---- Pro と 招待コード（2026-11-20）----
  //   Pro（ビルドの -Pro か 招待コードで 開いた 家。BoardApi.isPro）の ときだけ「Pro」タブを 出す。
  //   招待コードの 欄は ヘルプの いちばん 下。-Pro の ビルドでは 出さない。開いた あとは 一言だけ
  $("s-procode-title").textContent = AW("proCodeTitle");
  $("s-procode-btn").textContent = AW("proCodeOpen");
  function renderPro() {
    var on = window.BoardApi.isPro({ settings: B.settings }), tab = document.querySelector('#s-nav [data-page="pro"]');
    if (tab) tab.hidden = !on;
    $("s-procode-group").hidden = window.BoardApi.proBuild;
    $("s-procode-row").hidden = on;
    if (on && !$("s-procode-msg").textContent) setText("s-procode-msg", AW("proCodeOn"));
  }
  window.addEventListener("board:state", function () {
    var tab = document.querySelector('#s-nav [data-page="pro"]'), was = !!tab && !tab.hidden;
    renderPro();
    if (tab && was !== !tab.hidden && !$("settings").hidden) fitTabs();
  });
  $("s-procode").addEventListener("keydown", function (ev) { if (ev.key === "Enter") $("s-procode-btn").click(); });
  $("s-procode-btn").addEventListener("click", function () {
    var code = $("s-procode").value.trim(), btn = $("s-procode-btn");
    if (!code) {
      setText("s-procode-msg", AW("proCodeEmpty"));
      return $("s-procode-msg").scrollIntoView({ block: "nearest" });
    }
    btn.disabled = true;
    setText("s-procode-msg", "");
    window.BoardApi.post("/api/parent/pro-code", { code: code }).then(function () {
      return window.BoardApi.state();
    }).then(function (s) {
      $("s-procode").value = "";
      B.applySettings(s.settings);
      setText("s-procode-msg", AW("proCodeDone"));
      renderPro();
      fitTabs();
      window.dispatchEvent(new Event("board:reload"));   // 子どもの 画面の 段の 地図なども Pro に
    }).catch(function (e) {
      var why = window.BoardApi.connWhy(e);
      setText("s-procode-msg", e && e.status === 400 ? AW("proCodeWrong") : AW("proCodeFail") + (why ? "。" + why : "（" + ((e && e.message) || "") + "）"));
    }).then(function () {
      btn.disabled = false;
      $("s-procode-msg").scrollIntoView({ block: "nearest" });   // ヘルプの いちばん 下なので、一言が 見切れない ように
    });
  });
  renderPro();
  // 押して 覚える ガイド（guide.js）。置いた 端末は 設定を 閉じて ホームから、つないだ スマホ・ブラウザは 設定の まま
  $("s-guide").addEventListener("click", function () {
    if (window.BoardApi.remote || window.BoardApi.paired) return window.Guide.open();
    confirmClose(function () {
      closeSettings();
      setTimeout(window.Guide.open, 300);
    });
  });
  // かんたん設定（setup.js）を やりなおす。置いた端末と、つないだ スマホ（アプリ）・ブラウザ
  $("s-easy").addEventListener("click", function () {
    confirmClose(function () {
      closeSettings();
      window.EasySetup.open();
    });
  });

  // 子どもが うっかり開かないよう、日付を2秒長押ししたときだけ開く
  (function () {
    var timer = null;
    function cancel() { clearTimeout(timer); timer = null; }
    var el = $("today");
    el.addEventListener("pointerdown", function () {
      cancel();
      // 親モードの鍵（setup.js）を かけているときは 先に たしかめる
      timer = setTimeout(function () { window.ParentLock.ask(openSettings); }, 2000);
    });
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    // 歯車（すぐ ひらく）。長押しの タイマーに とられないように
    $("gear-btn").addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    // 新しい版が あるときは、鍵の あとに 先に おしらせ（update.js。「設定を開く」で 設定へ）
    $("gear-btn").addEventListener("click", function () {
      if ($("settings").hidden && $("lock").hidden) window.ParentLock.ask(function () {
        // アドレスが かわった ときは「この端末」（QR）を 開く
        var next = ipChanged() ? function () { openSettings(); showTab("system"); } : openSettings;
        if (!(window.Update && window.Update.popup(next))) next();
      });
    });
    el.addEventListener("pointercancel", cancel);
    // タッチの PC などで 長押しが 右クリック（メニュー）に とられないように
    el.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    // PC で ためすとき: キーボードの S でも ひらける（Echo には キーボードが ないので 子どもは つかえない）
    document.addEventListener("keydown", function (ev) {
      var tag = (ev.target && ev.target.tagName) || "";
      if (ev.key.toLowerCase() !== "s" || ev.ctrlKey || ev.metaKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ($("settings").hidden && $("lock").hidden) window.ParentLock.ask(openSettings);
    });
  })();

  B.updateLan = updateLan;
})();
