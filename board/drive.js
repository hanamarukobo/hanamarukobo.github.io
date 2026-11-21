// Google ドライブに 控える・ドライブから 戻す（Web 版だけ。2026-11-20 社長の 決定）。
//   Android の アプリ・QR で 置いた端末に つないだ ブラウザ・localhost の 開発では 出さない（Drive.on）。
//   クライアント ID は config.js の googleClientId（Web 版の ビルド build-web.ps1 が 入れる）。空なら 機能ごと 出さない。ソースに ID を 書かない
//   - Google Identity Services の トークンモデル（https://accounts.google.com/gsi/client。設定の「おうちの人」を ひらいた とき・押した ときだけ 読む）
//   - 範囲は drive.file だけ（この アプリが 作った ファイルだけ 触れる）。控えは 1つの ファイルに し、次からは 同じ ファイルを 上書き（ドライブに 版の 履歴が のこる）
//   - データは その人の ドライブと この ブラウザの あいだだけ。はなまる工房の サーバーには 送らない
//   画面は settings.js（「おうちの人」の 控える・戻す）。中身は datafile.js（書き出しと 同じ）。fetch と gsi は 差し替えられる（tools/dev/test-drive.mjs）
(function () {
  "use strict";

  var SCOPE = "https://www.googleapis.com/auth/drive.file";
  var GSI = "https://accounts.google.com/gsi/client";
  var FILES = "https://www.googleapis.com/drive/v3/files";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  var NAME = "はなまるボードの控え.json";
  // アプリが 作った 控えの しるし（名前を かえられても 見つける）
  var MARK_KEY = "hanamaru", MARK_VALUE = "backup";
  // この ブラウザで 最後に 控えた 日時（ISO）。ブラウザが 記録を 消すと これも 消える
  var LAST_KEY = "drive:last";
  var STALE_DAYS = 7;
  // つないで いる 印（"1"）。トークンは メモリだけ（2026-11-21 社長。ストレージに 置かない）なので、読みなおすと「切れた」に なる
  var LINK_KEY = "drive:link";
  // 「新しく 始める」を 選んだ 印（"1"）。つぎの 控えは 前の 控えを 残して 別の ファイルに 作る
  var FRESH_KEY = "drive:fresh";

  // 失敗は code を もった Error（画面は code で 文を えらぶ。Words.adult の driveErr…）
  //   cancel（Google の 画面を 閉じた）・popup（開けない）・denied（許可されない）・auth・load（gsi を 読めない）・
  //   offline・full（ドライブが いっぱい）・busy（混んで いる）・broken（控えを 読めない）・http・
  //   expired（自動の 控えで トークンが ない・切れた。窓は 開かない。設定の「つなぎ直す」で 押して もらう）
  function fail(code, status) {
    var e = new Error(code);
    e.code = code;
    if (status) e.status = status;
    return e;
  }

  // o: { clientId, fetch(url, init), loadGsi() → Promise<google>, storage: { get(k), set(k, v) }, now() → ミリ秒 }
  function make(o) {
    var now = o.now || function () { return Date.now(); };
    var store = o.storage || { get: function () { return null; }, set: function () {} };
    var tok = null;          // { value, exp }
    var client = null, gsi = null, pending = null;

    function prepare() { return o.loadGsi().then(function () { return true; }, function () { return false; }); }

    function ready() { return !!tok && tok.exp - 60000 > now(); }
    // アクセストークン（1時間）。のこりが 1分を 切ったら 取りなおす。はじめては Google の 画面で 許可を もらう。
    //   { silent: true } は 窓を 開かない（自動の 控え。iPhone は 押して いない ときの 窓を 止める）→ なければ expired
    function token(fresh) {
      var silent = !!(fresh && fresh.silent);
      if (silent) fresh = false;
      if (!fresh && ready()) return Promise.resolve(tok.value);
      tok = null;
      if (silent) return Promise.reject(fail("expired"));
      return o.loadGsi().catch(function () { throw fail("load"); }).then(function (google) {
        return new Promise(function (resolve, reject) {
          if (pending) pending.reject(fail("cancel"));
          var me = pending = { resolve: resolve, reject: reject };
          // Google の 画面が 閉じられたのに 知らせが 来ない ときに 待ちつづけない（2分）
          setTimeout(function () { if (pending === me) { pending = null; reject(fail("cancel")); } }, 120000);
          if (!client || gsi !== google) {
            gsi = google;
            client = google.accounts.oauth2.initTokenClient({
              client_id: o.clientId,
              scope: SCOPE,
              callback: function (r) {
                var p = pending;
                pending = null;
                if (!p) return;
                if (!r || r.error || !r.access_token) return p.reject(fail(r && r.error === "access_denied" ? "denied" : "auth"));
                // 画面で ドライブの チェックを 外された とき
                var ok = google.accounts.oauth2.hasGrantedAllScopes;
                if (typeof ok === "function" && !ok(r, SCOPE)) return p.reject(fail("denied"));
                tok = { value: r.access_token, exp: now() + (Number(r.expires_in) || 3600) * 1000 };
                p.resolve(tok.value);
              },
              error_callback: function (e) {
                var p = pending;
                pending = null;
                if (!p) return;
                var t = e && e.type;
                p.reject(fail(t === "popup_closed" ? "cancel" : t === "popup_failed_to_open" ? "popup" : "auth"));
              },
            });
          }
          client.requestAccessToken({ prompt: "" });
        });
      });
    }

    // Drive の API。401（トークン切れ）は 1回だけ 取りなおして やりなおす（silent の ときは 窓を 開かず expired）
    function call(method, url, body, type, retried, silent) {
      return token(silent ? { silent: true } : !!retried).then(function (t) {
        var h = { Authorization: "Bearer " + t };
        if (type) h["Content-Type"] = type;
        var init = { method: method, headers: h };
        if (body !== undefined) init.body = body;
        return Promise.resolve().then(function () { return o.fetch(url, init); }).catch(function () { throw fail("offline"); });
      }).then(function (r) {
        if (r.status === 401 && silent) { tok = null; throw fail("expired", 401); }
        if (r.status === 401 && !retried) { tok = null; return call(method, url, body, type, true); }
        if (r.ok) return r;
        if (r.status === 401) throw fail("auth", 401);
        if (r.status === 403 || r.status === 429) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            var why = (((j && j.error && j.error.errors) || [])[0] || {}).reason || "";
            throw fail(/quota/i.test(why) && /storage/i.test(why) ? "full" : /rate|limit/i.test(why) || r.status === 429 ? "busy" : "http", r.status);
          });
        }
        throw fail(r.status >= 500 ? "busy" : "http", r.status);
      });
    }

    // アプリが 作った 控えの うち いちばん 新しい もの { id, at（ドライブの 更新日時 ISO） }。なければ null
    function latest(silent) {
      var q = "appProperties has { key='" + MARK_KEY + "' and value='" + MARK_VALUE + "' } and trashed = false";
      var url = FILES + "?q=" + encodeURIComponent(q) + "&spaces=drive&orderBy=" + encodeURIComponent("modifiedTime desc") +
        "&pageSize=10&fields=" + encodeURIComponent("files(id,modifiedTime)");
      return call("GET", url, undefined, undefined, false, silent).then(function (r) { return r.json(); }).then(function (j) {
        var f = ((j && j.files) || [])[0];
        return f ? { id: f.id, at: f.modifiedTime } : null;
      });
    }

    // 控える。text は 書き出しと 同じ 中身（datafile.js の text）。良い 控えを 古い・空の 内容で 消さないために:
    //   ① この ブラウザで まだ 控えて いない（記録が 消えた あとかも しれない）のに ドライブに 控えが ある（"ask"）
    //   ② ドライブの 控えが この ブラウザで 最後に 控えた より 新しい（ほかの 端末が 後から 控えた。"other"）
    //   ときは opts.replace(控え, なぜ) に 聞いて から 上書きする（false なら 何も しないで null）。
    //   opts.auto（自動）は 聞かずに 止めて { held: "ask"|"other", file } を かえす。窓も 開かない。
    //   opts.force は 聞かずに 上書き（設定の「この内容で上書き」）。「新しく 始める」の あとは 前の 控えを 残して 別の ファイルを 作る
    function backup(text, opts) {
      opts = opts || {};
      var auto = !!opts.auto, fresh = !!opts.fresh || store.get(FRESH_KEY) === "1";
      return latest(auto).then(function (f) {
        if (fresh) return null;
        if (!f || opts.force) return f;
        var mine = last(), why = !mine ? "ask" : Date.parse(f.at) > Date.parse(mine) ? "other" : "";
        if (!why) return f;
        if (auto) return { held: why, file: f };
        if (typeof opts.replace !== "function") return f;
        return Promise.resolve(opts.replace(f, why)).then(function (yes) { return yes ? f : false; });
      }).then(function (f) {
        if (f === false) return null;
        if (f && f.held) return f;
        var put = f
          ? call("PATCH", UPLOAD + "/" + encodeURIComponent(f.id) + "?uploadType=media&fields=" + encodeURIComponent("id,modifiedTime"), text, "application/json", false, auto)
          : create(text, auto);
        return put.then(function (r) { return r.json(); }).then(function (j) {
          var at = (j && j.modifiedTime) || new Date(now()).toISOString();
          store.set(LAST_KEY, at);
          if (fresh) store.set(FRESH_KEY, "");
          return { id: j && j.id, at: at, created: !f };
        });
      });
    }
    function create(text, silent) {
      var b = "hanamaru-" + now().toString(36) + Math.random().toString(36).slice(2);
      var meta = { name: NAME, mimeType: "application/json", appProperties: {} };
      meta.appProperties[MARK_KEY] = MARK_VALUE;
      var body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
        "\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + text + "\r\n--" + b + "--";
      return call("POST", UPLOAD + "?uploadType=multipart&fields=" + encodeURIComponent("id,modifiedTime"), body, "multipart/related; boundary=" + b, false, silent);
    }

    // 控えの 中身（はなまるボードの データ）。戻すのは 画面（datafile.js の apply → /api/parent/import）
    function read(id) {
      return call("GET", FILES + "/" + encodeURIComponent(id) + "?alt=media").then(function (r) { return r.text(); }).then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (e) { throw fail("broken"); }
        if (!d || !Array.isArray(d.kids) || !d.days || typeof d.days !== "object") throw fail("broken");
        return d;
      });
    }

    // この ブラウザで 最後に 控えた 日時（ISO）。まだ なら null
    function last() {
      var v = store.get(LAST_KEY);
      return v && !isNaN(Date.parse(v)) ? v : null;
    }
    // 控えてから 7日を すぎたか（まだ 控えて いない ときは false。すすめるのは 設定の 中だけ）
    function stale() {
      var v = last();
      return !!v && now() - Date.parse(v) > STALE_DAYS * 86400000;
    }

    // つないで いるか（つないで はじめた・控えた・戻した）。トークンが 切れても つないだ まま（「つなぎ直す」を 出す）
    function linked() { return store.get(LINK_KEY) === "1"; }
    function setLinked(v) { store.set(LINK_KEY, v ? "1" : ""); }
    // ドライブの 控えを 戻した あと: その 控えの 日時を「最後に 控えた」に する（つぎの 自動の 控えが 止まらない ように）
    function adopt(at) {
      if (at && !isNaN(Date.parse(at))) store.set(LAST_KEY, at);
      store.set(FRESH_KEY, "");
    }
    // 「新しく 始める」: 前の 控えは 消さず、つぎの 控えを 別の ファイルに
    function startFresh() { store.set(FRESH_KEY, "1"); }
    // つなぐのを やめる: Google の 許可を 取り消して（できれば）、印を 消す。控えの ファイルは ドライブに 残る
    function unlink() {
      var t = tok && tok.value;
      tok = null;
      setLinked(false);
      var o2 = gsi && gsi.accounts && gsi.accounts.oauth2;
      if (t && o2 && typeof o2.revoke === "function") { try { o2.revoke(t, function () {}); } catch (e) { /* 取り消せなくても 印は 消えて いる */ } }
    }
    // トークンを 忘れる（確かめの 道具で「切れた」形を 作る）
    function forget() { tok = null; }

    return { prepare: prepare, token: token, ready: ready, latest: latest, backup: backup, read: read, last: last, stale: stale,
      linked: linked, setLinked: setLinked, adopt: adopt, startFresh: startFresh, unlink: unlink, forget: forget };
  }

  // ---- 自動で 控える（つないで いる 間。2026-11-21 社長）----
  //   o: { client() → make の 組, text() → Promise<書き出しの 中身>, hasRecords() → bool, storage, now(), timer: { set(fn, ms), clear(id) } }
  //   changed()（保存の たび）→ 最後の 変更から 20秒 静かに なったら 1回。続く ときは 最初の 変更から 2分で 1回（秒数は 推測。実物で 調整）。
  //   窓は 開かない（token silent）。トークンが なければ「expired」で 待つ（設定の「つなぎ直す」）。
  //   status: "" | "expired" | "held-ask" | "held-other" | "full" | "offline" | "busy"（held と full は 押して もらう まで 止める）
  var QUIET = 20000, MAX_WAIT = 120000, BUSY_WAIT = [60000, 300000, 900000];
  var DIRTY_KEY = "drive:dirty", HELD_KEY = "drive:held";
  function makeAuto(o) {
    var now = o.now || function () { return Date.now(); };
    var store = o.storage;
    var timer = o.timer || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (id) { clearTimeout(id); } };
    var waiting = null, running = false, again = false, busyN = 0, heldAt = "";
    var status = store.get(HELD_KEY) || "", subs = [];

    function stopped() { return /^(held-|full)/.test(status); }
    function dirtySince() { var v = Number(store.get(DIRTY_KEY)); return v > 0 ? v : 0; }
    function emit() { subs.forEach(function (f) { try { f(status); } catch (e) { /* 画面の 失敗で 止めない */ } }); }
    function set(s) {
      if (s === status) return;
      status = s;
      store.set(HELD_KEY, stopped() ? s : "");
      emit();
    }
    function schedule(ms) {
      if (waiting !== null) timer.clear(waiting);
      waiting = timer.set(function () { waiting = null; return run(); }, Math.max(0, ms));
    }
    function changed() {
      if (!o.client().linked()) return;
      var t = now(), first = dirtySince();
      if (!first) { first = t; store.set(DIRTY_KEY, String(t)); }
      if (running) again = true;
      if (!stopped()) schedule(Math.min(QUIET, first + MAX_WAIT - t));
      emit();
    }
    // いま 控える（隠れた・つながった・つなぎ直した とき・間引きの 時間が 来た とき）
    function run() {
      var c = o.client();
      if (!c.linked() || !dirtySince() || stopped()) return Promise.resolve(status);
      if (running) { again = true; return Promise.resolve(status); }
      if (!o.hasRecords()) { store.set(DIRTY_KEY, ""); emit(); return Promise.resolve(status); }   // 空の 内容は 送らない
      if (!c.ready()) { set("expired"); emit(); return Promise.resolve(status); }
      running = true;
      again = false;
      return Promise.resolve().then(o.text).then(function (text) {
        return c.backup(text, { auto: true });
      }).then(function (r) {
        running = false;
        busyN = 0;
        if (r && r.held) { heldAt = (r.file && r.file.at) || ""; set("held-" + r.held); return status; }
        // 控えて いる 間に また 変わったら、もう 1回
        if (again) { again = false; store.set(DIRTY_KEY, String(now())); schedule(QUIET); }
        else store.set(DIRTY_KEY, "");
        set("");
        emit();
        return status;
      }, function (e) {
        running = false;
        again = false;
        var k = e && e.code;
        if (k === "offline") set("offline");   // つながった とき（online）か つぎの 変更で
        else if (k === "full") set("full");
        else if (k === "busy" || k === "http") { set("busy"); schedule(BUSY_WAIT[Math.min(busyN++, BUSY_WAIT.length - 1)]); }
        else set("expired");
        return status;
      });
    }
    // 止まって いた 控えを 戻した・上書きした あと
    function clearHeld() { set(""); }
    // 戻した あとは 控えて いない 変更は ない（戻した 内容が ドライブの 控えと 同じ）
    function clearDirty() {
      store.set(DIRTY_KEY, "");
      if (waiting !== null) { timer.clear(waiting); waiting = null; }
      emit();
    }
    // 「つなぎ直す」を 出すか: つないで いる・切れた・控えて いない 変更が ある（そろった ときだけ）
    function needsReconnect() { var c = o.client(); return c.linked() && !c.ready() && !!dirtySince() && !stopped(); }
    return {
      changed: changed, run: run, clearHeld: clearHeld, clearDirty: clearDirty, needsReconnect: needsReconnect,
      status: function () { return status; }, dirty: function () { return !!dirtySince(); }, heldAt: function () { return heldAt; },
      onChange: function (f) { subs.push(f); },
    };
  }

  // ---- ブラウザでの 既定 ----
  var loading = null;
  function loadGsi() {
    var g = window.google;
    if (g && g.accounts && g.accounts.oauth2) return Promise.resolve(g);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = GSI;
      s.async = true;
      var timer = setTimeout(function () { done(false); }, 20000);
      function done(ok) {
        clearTimeout(timer);
        var gg = window.google;
        if (ok && gg && gg.accounts && gg.accounts.oauth2) return resolve(gg);
        loading = null;
        s.remove();
        reject(fail("load"));
      }
      s.onload = function () { done(true); };
      s.onerror = function () { done(false); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function clientId() {
    var c = window.CONFIG || {};
    return typeof c.googleClientId === "string" ? c.googleClientId.trim() : "";
  }
  // 出すのは 1台で つかう ブラウザの Web 版で、クライアント ID が ある ときだけ
  function on() {
    var A = window.BoardApi, cap = window.Capacitor;
    if (!clientId() || !A || !A.web || !A.local || A.remote || A.paired) return false;
    if (window.EchoBoard) return false;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return false;
    return true;
  }
  var storage = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* おぼえられなくても 控えは できて いる */ } },
  };
  var current = null, auto = null;

  window.Drive = {
    SCOPE: SCOPE,
    NAME: NAME,
    STALE_DAYS: STALE_DAYS,
    make: make,
    makeAuto: makeAuto,
    on: on,
    // 画面が 使う もの（開発の 確かめでは use で 差し替える。tools/dev/drive-on.js）
    client: function () {
      return current || (current = make({ clientId: clientId(), fetch: function (u, i) { return window.fetch(u, i); }, loadGsi: loadGsi, storage: storage }));
    },
    use: function (c) { current = c; },
    // 失敗の 文（Words.adult の driveErr…。設定と 入口で 同じ 文）
    errText: function (e) {
      var AW = window.Words.adult;
      var key = { cancel: "driveErrCancel", popup: "driveErrPopup", denied: "driveErrDenied", auth: "driveErrDenied", expired: "driveErrDenied", load: "driveErrLoad",
        offline: "driveErrOffline", full: "driveErrFull", busy: "driveErrBusy", broken: "driveErrBroken" }[e && e.code];
      return key ? AW(key) : e && e.message && !e.code ? e.message : AW("driveErr");
    },
    // 自動で 控える（settings.js が 保存の 知らせ board:saved で changed を 呼ぶ）
    auto: function () {
      return auto || (auto = makeAuto({
        client: function () { return window.Drive.client(); },
        text: function () { return window.DataFile.text().then(function (f) { return f.text; }); },
        hasRecords: function () { return window.BoardApi.hasRecords(); },
        storage: storage,
      }));
    },
  };
})();
