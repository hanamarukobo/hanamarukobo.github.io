// 画面オフ（暗くする・スリープ）と 明るさ。いまが「つけておく 時間」か（休日・祝日は 休日の 時間）を みて、さわったら もどす
(function () {
  "use strict";

  var B = window.Board, C = window.CONFIG;
  var $ = B.$, ymd = B.ymd, storageGet = B.storageGet;

  function isHoliday(now) {
    var dow = now.getDay();
    return dow === 0 || dow === 6 || !!B.holidays[ymd(now)];
  }

  function toMinutes(hhmm) {
    var p = hhmm.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function inAlwaysOn(now) {
    var range = isHoliday(now) ? B.display.holiday : B.display.weekday;
    var m = now.getHours() * 60 + now.getMinutes();
    var from = toMinutes(range.from), to = toMinutes(range.to);
    return from <= to ? (m >= from && m < to) : (m >= from || m < to);
  }

  // 明るさを変えられる環境（アプリ）のときだけバックライトも落とす
  function setBrightness(v) {
    try {
      if (Device.canBrightness()) window.EchoBoard.setBrightness(v);
    } catch (e) { /* できない環境では何もしない */ }
  }

  // ---- 画面オフの しかた（この端末だけ） ----
  //   dim  : 暗くするだけ。黒い画面を かさねて 明るさを 下げる（さわると すぐ もどる）
  //   sleep: スリープ。つけておく時間の ほかは 画面を つけっぱなしに しないで、端末の 画面オフ（N分）に まかせる。
  //          つけておく時間に なったら アプリ（MainActivity）が 画面を つける。アプリのときだけ えらべる
  var POWER_KEY = "screenOff";
  // 「ボードを前に出す」（電源を入れたとき・つけておく時間のはじめ）。アプリの 0.1.6 から。値は アプリの中（BootReceiver が読む）
  function powerMode() { return Device.canSleep() && storageGet(POWER_KEY) === "sleep" ? "sleep" : "dim"; }
  var keepOn = null, wakeAt = null, timeoutMs = null, timeoutTried = 0;

  // つぎに「つけておく時間」が はじまる 時刻（ミリ秒）。1週間 さきまで さがす
  function nextAlwaysOn(now) {
    for (var i = 0; i < 8; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var off = d.getDay() === 0 || d.getDay() === 6 || B.holidays[ymd(d)];
      var from = (off ? B.display.holiday : B.display.weekday).from.split(":");
      var at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +from[0], +from[1]).getTime();
      if (at > now.getTime()) return at;
    }
    return 0;
  }

  function setKeepOn(on) {
    if (keepOn === on || !Device.canSleep()) return;
    keepOn = on;
    window.EchoBoard.setKeepScreenOn(on);
  }

  // 暗くする 10秒前の 知らせ（「暗くするだけ」の ときだけ。さわると そのまま）。
  //   何も 言わずに 急に 暗く なると 驚く（2026-11-21 社長）。文字は みんなで 見る ところと 同じ（時計に あわせる）
  var SOON_MS = 10 * 1000, soonOn = false;
  function setSoon(on) {
    var el = $("dim-soon");
    if (!el || soonOn === on) return;
    soonOn = on;
    if (on) el.innerHTML = window.Words.t("dimSoon", B.levelFor ? B.levelFor("clock") : "lower", {});
    el.hidden = !on;
  }

  function updateSleep(now) {
    // Web 版も 同じ（ブラウザは 画面を つけて おけず 明るさも 変えられないので、黒い 画面を かぶせる だけに なって しまう。
    //   説明の 途中で 急に 真っ暗に なった。2026-11-21 社長）
    if (window.BoardApi.usage(B.settings) === "phone" || window.BoardApi.remote || window.BoardApi.web) {
      // スマホだけ・置いた端末に つないだ スマホは ふつうの アプリと おなじ（画面オフは 端末に まかせる。黒い画面も 出さない）。
      //   明るさも 端末に まかせる（-1）。前は 起動の たびに 180 に 固定して、暗い 部屋で まぶしく なっていた（2026-11-11 の 問い合わせ、Pixel 9 Pro XL）
      setKeepOn(false);
      setSoon(false);
      if (wakeAt) { wakeAt = null; window.EchoBoard.scheduleWake(0); }
      if (B.sleeping !== false) {
        B.sleeping = false;
        $("sleep").hidden = true;
        setBrightness(-1);
      }
      return;
    }
    // はじめて（まだ 設定して いない）ときの 説明も 暗くしない。読んでいる 途中で 1分たつと 暗くなって 説明が 閉じていた（2026-11-21）。
    //   2回目からの「説明を見る」は 今のまま（だれも 閉じないと 一日中 明るいままに なるため）
    var firstTour = !$("tutorial").hidden && window.BoardApi.needsSetup();
    var force = !$("settings").hidden || !$("setup").hidden || firstTour || inAlwaysOn(now);
    if (powerMode() === "sleep") {
      // 黒い画面は 出さず、つけておく時間の ほかは 端末に まかせて スリープさせる
      setKeepOn(force);
      setSoon(false);
      var next = nextAlwaysOn(now), ms = B.display.idleMinutes * 60 * 1000;
      if (next !== wakeAt) { wakeAt = next; window.EchoBoard.scheduleWake(next); }
      // 許可（システム設定の変更）が ないと 設定できない。ためすのは 1分に 1回
      if (ms !== timeoutMs && Date.now() - timeoutTried > 60 * 1000) {
        timeoutTried = Date.now();
        if (window.EchoBoard.setScreenTimeout(ms)) timeoutMs = ms;
      }
      if (B.sleeping !== false) {
        B.sleeping = false;
        $("sleep").hidden = true;
        setBrightness(C.brightness.on);
      }
      return;
    }
    // 「ボードを前に出す」が ON なら、暗くするだけでも つけておく時間の はじまりに ボードを 前に 出す
    var front = Device.canFront() && window.EchoBoard.getFront() ? nextAlwaysOn(now) : 0;
    if (front !== (wakeAt || 0)) { wakeAt = front || null; window.EchoBoard.scheduleWake(front); }
    setKeepOn(true);
    // つかいかたが ひらいたままでも 時間に なったら 消す（だれも とじないと 一日中 明るいままに なるため。はじめての ときは 上の firstTour）
    var left = B.display.idleMinutes * 60 * 1000 - (Date.now() - B.lastTouch);
    var awake = force || left > 0;
    setSoon(!force && awake && left <= SOON_MS);
    if (B.sleeping === !awake) return;
    B.sleeping = !awake;
    if (B.sleeping && window.Tutorial) window.Tutorial.dismiss();
    $("sleep").hidden = !B.sleeping;
    setBrightness(B.sleeping ? C.brightness.off : C.brightness.on);
  }

  // 画面の キーボードで 入力している あいだも さわっている ことに する
  // スリープから もどった（電源ボタン・ダブルタップ）ときも さわった ことに する
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    B.lastTouch = Date.now();
    updateSleep(new Date());
  });
  ["pointerdown", "input"].forEach(function (type) {
    document.addEventListener(type, function () {
      B.lastTouch = Date.now();
      updateSleep(new Date());
    }, true);
  });

  B.updateSleep = updateSleep;
  B.powerMode = powerMode;
  B.POWER_KEY = POWER_KEY;
})();
