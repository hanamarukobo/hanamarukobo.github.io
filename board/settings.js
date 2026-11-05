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
    $("s-cal-help").hidden = true;
    // 画面の向きは この端末だけの せってい（アプリのときだけ だす）
    $("s-orient-row").hidden = !Device.canOrient();
    var orient = storageGet(B.ORIENT_KEY) || B.defaultOrient();
    Array.prototype.forEach.call(document.getElementsByName("s-orient"), function (r) { r.checked = r.value === orient; });
    renderBrightness();
    // 「使わない」でも URL は のこして おく（また 使うときに 入れなおさなくて よいように）
    var cal = (s.calendar && s.calendar.type === "none" ? s.calendar : B.calSource()) || { type: "none", url: "" };
    $("s-cal-type").value = cal.type;
    $("s-cal-url").value = cal.url || "";
    calTypeChanged();
    $("s-unit-point").checked = s.unit === "point";
    $("s-unit-yen").checked = s.unit !== "point";
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
  // 通知の 許可を 聞いた 結果（MainActivity が 知らせる）
  window.addEventListener("board:notice", function () { if (!$("settings").hidden) renderNotice(); });
  $("s-front-allow").addEventListener("click", function () {
    window.EchoBoard.requestOverlay();
  });
  // 許可の画面から もどってきたら 表示を なおす
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !$("settings").hidden) { renderBrightness(); renderFront(); renderNotice(); }
  });

  function calTypeChanged() {
    $("s-cal-url").disabled = $("s-cal-type").value === "none";
    $("s-cal-clear").hidden = !$("s-cal-url").value;
    // 共有リンクなど 読めない URL を 貼ったら、その場で 正しい URL の 出し方を 出す
    var bad = $("s-cal-type").value === "ical" && window.BoardApi.calUrlProblem($("s-cal-url").value);
    $("s-cal-warn").hidden = !bad;
    $("s-cal-warn").textContent = bad ? window.Words.t("calShareLink", "upper") : "";
  }
  $("s-cal-type").addEventListener("change", calTypeChanged);
  $("s-cal-url").addEventListener("input", calTypeChanged);
  $("s-cal-clear").addEventListener("click", function () {
    if (!confirm("予定の URL を消去しますか？（保存すると元に戻せません）")) return;
    $("s-cal-url").value = "";
    $("s-cal-type").value = "none";
    calTypeChanged();
  });
  // iCal と Apps Script の ちがいの せつめい
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
    $("s-hold-row").hidden = !r || r.value !== "solo" || r.disabled;
    $("s-screen-group").hidden = pickedUsage() === "phone" || window.BoardApi.remote;
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
    if (window.BoardApi.usage(B.settings) === "board2") {
      var c = lanCode(false);
      if (lanStarted !== c) { window.EchoBoard.startLan(c); lanStarted = c; }
    } else if (lanStarted) {
      window.EchoBoard.stopLan();
      lanStarted = "";
    }
  }
  function renderLanGroup() {
    var r = document.querySelector("input[name=s-usage]:checked");
    var show = Device.canHost() && !!r && r.value === "board2";
    $("s-lan-group").hidden = !show;
    $("s-remote-group").hidden = !window.BoardApi.remote;
    // ほかの 置いた端末に つなぐ ボタン（「置いてある端末につなぐ」を えらんだ とき）
    $("s-join-group").hidden = !(r && r.value === "join" && Device.canJoin());
    if (window.BoardApi.remote) $("s-remote-name").textContent = "「" + window.BoardApi.remoteName() + "」につないでいます。設定や「みました」は、その端末のデータを変えます。";
    if (!show) return;
    var code = lanCode(false), info = {};
    try { info = JSON.parse(window.EchoBoard.lanInfo()); } catch (e) { /* ふるい アプリ */ }
    $("s-lan-code").textContent = code;
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

  // 時計・天気・よてい ごとの 文字（ひらがな／漢字）
  var WORD_SECS = ["clock", "weather", "schedule"];
  var WORD_MODES = [["auto", "自動（いちばん小さい子に合わせる）"], ["kana", "ひらがな"], ["kanji", "漢字"]];
  function fillWords(w) {
    Array.prototype.forEach.call(document.querySelectorAll("#settings .s-words"), function (box) {
      var sec = box.dataset.sec, cur = (w || {})[sec] || "auto";
      box.innerHTML = WORD_MODES.map(function (m) {
        return '<label><input type="radio" name="s-words-' + sec + '" value="' + m[0] + '"' + (m[0] === cur ? " checked" : "") + '> ' + m[1] + '</label>';
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
    var w = {};
    WORD_SECS.forEach(function (sec) {
      var r = document.querySelector('input[name="s-words-' + sec + '"]:checked');
      w[sec] = r ? r.value : "auto";
    });
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
        '<select data-act="level" aria-label="年齢の目安">' + window.Words.LEVELS.map(function (l) {
          return '<option value="' + l + '"' + ((k.level || "lower") === l ? " selected" : "") + '>' + window.Words.LABELS[l] + '</option>';
        }).join("") + '</select>' +
        '<label><input type="checkbox" data-act="active"' + (k.active !== false ? " checked" : "") + '> 表示</label>' +
        '<span class="k-moves"><button class="ghost small" data-act="up" aria-label="上へ">↑</button>' +
        '<button class="ghost small" data-act="down" aria-label="下へ">↓</button></span>' +
        '</li>';
    }).join("");
    freeKidsNote();
  }
  // 無料の 上限（同梱版だけ）。表示する 子が 上限まで いたら「＋ 子どもを追加」を 押せなく する
  function freeKidsNote() {
    var lim = window.BoardApi.limits();
    var full = !!lim && kidsEdit.filter(function (k) { return k.active !== false; }).length >= lim.kids;
    $("s-add-kid").disabled = full;
    $("s-free-kids").hidden = !full;
    if (full) $("s-free-kids").textContent = W("freeKids", { n: lim.kids, next: lim.kids + 1 });
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
    if (ev.target.dataset.act === "name") k.name = ev.target.value;
    if (ev.target.dataset.act === "active") { k.active = ev.target.checked; freeKidsNote(); }
    if (ev.target.dataset.act === "level") k.level = ev.target.value;
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
    // 保存は 時計・天気・がんばりカレンダー・カレンダー連携・使い方 の ときだけ（がんばり項目・がんばりチェックは 中に 保存が ある）
    $("s-save").hidden = SAVE_PAGES.indexOf(page) < 0;
    $("s-saved").textContent = "";
    // がんばり項目・がんばりチェック（admin.html）は はじめて ひらいた ときに よむ。中で かえた ものは とじる ときに ボードへ
    if (page === "pro" && window.ProPage) window.ProPage.render();
    var frame = { tasks: ["s-admin-frame", "hide=day"], day: ["s-day-frame", "only=day"] }[page];
    if (frame && !$(frame[0]).getAttribute("src")) {
      var url = window.BoardApi.adminUrl;
      $(frame[0]).src = url + (url.indexOf("?") < 0 ? "?" : "&") + "embed=1&" + frame[1];
    }
  }
  // 「がんばりチェック」（「みました」・すぎた日を 直す）は いちばん よく 使うので、どの 端末でも いちばん 左に して、ひらいたら まず そこを 見せる
  // Web 版では 予定を まだ よめないので、予定の タブを 出さない
  if (window.BoardApi.web) document.querySelector('#s-nav [data-page="calendar"]').hidden = true;
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
    renderBattery();
    fillSettings(B.settings);
    kidsEdit = JSON.parse(JSON.stringify(B.kids));
    renderKidsEdit();
    showTab("day");
    $("settings").hidden = false;
    fitTabs();
    resetDirty();
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

  // ---- 保存は タブごと（時計・天気・がんばりカレンダー・カレンダー連携・使い方。どの タブの「保存」も、それらを まとめて 保存する）----
  // 保存して いない 変更が ある タブには ●。閉じる ときは、がんばり項目（admin.html）の 中の 欄も あわせて きく
  var SAVE_PAGES = ["clock", "weather", "kids", "calendar", "system"], baseline = {};
  function pageState(page) {
    var v = Array.prototype.map.call($("s-page-" + page).querySelectorAll("input, select, textarea"), function (i) {
      return i.type === "checkbox" || i.type === "radio" ? (i.checked ? "1" : "0") : i.value;
    }).join("|");
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
      .concat(frameUnsaved().map(function (n) { return "がんばり項目の「" + n + "」"; }));
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
      showTab("system");
      return setText("s-error", "鍵の4桁の番号を入れてください");
    }
    var next = {
      parentLock: lock,
      unit: $("s-unit-point").checked ? "point" : "yen",
      location: window.AreaSelect.value($("s-office"), $("s-area")),
      calendar: { type: $("s-cal-type").value, url: $("s-cal-url").value.trim() },
      weekStart: $("s-week-mon").checked ? 1 : 0,
      lowPower: $("s-lowpower").checked,
      usage: pickedUsage(),
      clock: (document.querySelector("input[name=s-clock]:checked") || {}).value || "d24",
      words: readWords(),
      clothes: readClothes(),
      showAdvice: $("s-advice").checked,
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
    post("/api/board/settings", next).then(function () {
      return post("/api/board/kids", { kids: named });
    }).then(function () {
      var o = document.querySelector("input[name=s-orient]:checked");
      if (o && !$("s-orient-row").hidden) { storageSet(B.ORIENT_KEY, o.value); B.applyOrientation(); }
      var pw = document.querySelector("input[name=s-power]:checked");
      if (pw) storageSet(B.POWER_KEY, pw.value);
      if (Device.canFront()) window.EchoBoard.setFront($("s-front").checked);
      if (Device.canNotice()) {
        var tm = $("s-notice-time").value || "07:00";
        Device.setNotice($("s-notice").checked, +tm.slice(0, 2) * 60 + +tm.slice(3, 5));
        renderNotice();
      }
      B.applySettings(next);
      window.dispatchEvent(new Event("board:reload")); // カレンダーの週の始まり などを かきなおす
      setText("s-error", "");
      resetDirty();
      // 押した ボタンの となりに「保存しました」（しばらくして けす）
      var note = $("s-saved");
      note.textContent = "✓ 保存しました";
      clearTimeout(note._t);
      note._t = setTimeout(function () { note.textContent = ""; }, 2500);
    }).catch(function (e) {
      setText("s-error", "保存できませんでした（" + (e.message || "サーバーにつながりません") + "）");
    });
  }
  $("s-cancel").addEventListener("click", function () { confirmClose(closeSettings); });

  // 説明は 設定の 上に ひらく（とじると 設定に もどる。はじめての ときの 説明は 設定を とおらないので、とじると そのまま ボード）
  $("s-help").addEventListener("click", function () { window.Tutorial.open(); });
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
    $("gear-btn").addEventListener("click", function () {
      if ($("settings").hidden && $("lock").hidden) window.ParentLock.ask(openSettings);
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
