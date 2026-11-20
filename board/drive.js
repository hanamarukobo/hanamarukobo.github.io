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

  // 失敗は code を もった Error（画面は code で 文を えらぶ。Words.adult の driveErr…）
  //   cancel（Google の 画面を 閉じた）・popup（開けない）・denied（許可されない）・auth・load（gsi を 読めない）・
  //   offline・full（ドライブが いっぱい）・busy（混んで いる）・broken（控えを 読めない）・http
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

    // アクセストークン（1時間）。のこりが 1分を 切ったら 取りなおす。はじめては Google の 画面で 許可を もらう
    function token(fresh) {
      if (!fresh && tok && tok.exp - 60000 > now()) return Promise.resolve(tok.value);
      tok = null;
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

    // Drive の API。401（トークン切れ）は 1回だけ 取りなおして やりなおす
    function call(method, url, body, type, retried) {
      return token(!!retried).then(function (t) {
        var h = { Authorization: "Bearer " + t };
        if (type) h["Content-Type"] = type;
        var init = { method: method, headers: h };
        if (body !== undefined) init.body = body;
        return Promise.resolve().then(function () { return o.fetch(url, init); }).catch(function () { throw fail("offline"); });
      }).then(function (r) {
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
    function latest() {
      var q = "appProperties has { key='" + MARK_KEY + "' and value='" + MARK_VALUE + "' } and trashed = false";
      var url = FILES + "?q=" + encodeURIComponent(q) + "&spaces=drive&orderBy=" + encodeURIComponent("modifiedTime desc") +
        "&pageSize=10&fields=" + encodeURIComponent("files(id,modifiedTime)");
      return call("GET", url).then(function (r) { return r.json(); }).then(function (j) {
        var f = ((j && j.files) || [])[0];
        return f ? { id: f.id, at: f.modifiedTime } : null;
      });
    }

    // 控える。text は 書き出しと 同じ 中身（datafile.js の text）。
    //   この ブラウザで まだ 控えて いない（記録が 消えた あとかも しれない）のに ドライブに 控えが ある ときは、
    //   opts.replace(控え) に 聞いて から 上書きする（false なら 何も しないで null）
    function backup(text, opts) {
      opts = opts || {};
      return latest().then(function (f) {
        if (f && !last() && typeof opts.replace === "function") {
          return Promise.resolve(opts.replace(f)).then(function (yes) { return yes ? f : false; });
        }
        return f;
      }).then(function (f) {
        if (f === false) return null;
        var put = f
          ? call("PATCH", UPLOAD + "/" + encodeURIComponent(f.id) + "?uploadType=media&fields=" + encodeURIComponent("id,modifiedTime"), text, "application/json")
          : create(text);
        return put.then(function (r) { return r.json(); }).then(function (j) {
          var at = (j && j.modifiedTime) || new Date(now()).toISOString();
          store.set(LAST_KEY, at);
          return { id: j && j.id, at: at, created: !f };
        });
      });
    }
    function create(text) {
      var b = "hanamaru-" + now().toString(36) + Math.random().toString(36).slice(2);
      var meta = { name: NAME, mimeType: "application/json", appProperties: {} };
      meta.appProperties[MARK_KEY] = MARK_VALUE;
      var body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
        "\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + text + "\r\n--" + b + "--";
      return call("POST", UPLOAD + "?uploadType=multipart&fields=" + encodeURIComponent("id,modifiedTime"), body, "multipart/related; boundary=" + b);
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

    return { prepare: prepare, token: token, latest: latest, backup: backup, read: read, last: last, stale: stale };
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
  var current = null;

  window.Drive = {
    SCOPE: SCOPE,
    NAME: NAME,
    STALE_DAYS: STALE_DAYS,
    make: make,
    on: on,
    // 画面が 使う もの（開発の 確かめでは use で 差し替える。tools/dev/drive-on.js）
    client: function () {
      return current || (current = make({ clientId: clientId(), fetch: function (u, i) { return window.fetch(u, i); }, loadGsi: loadGsi, storage: storage }));
    },
    use: function (c) { current = c; },
  };
})();
