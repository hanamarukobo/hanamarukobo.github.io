// Google ドライブに 控える・ドライブから 戻す（Web 版だけ。2026-11-20 社長の 決定）。
//   Android の アプリ・QR で 置いた端末に つないだ ブラウザ・localhost の 開発では 出さない（Drive.on）。
//   クライアント ID は config.js の googleClientId（Web 版の ビルド build-web.ps1 が 入れる）。空なら 機能ごと 出さない。ソースに ID を 書かない
//   - Google Identity Services の トークンモデル（https://accounts.google.com/gsi/client。設定の「おうちの人」を ひらいた とき・押した とき、
//     つないで いる 間は 起動した とき・設定を 開いた ときにも 読む）。トークンは メモリだけ（約1時間）。切れたら おうちの人が 押した
//     ついでに 取りなおす（makeAuto の nudge。設定を 開いた・「みました」）
//   - 範囲は drive.file だけ（この アプリが 作った ファイルだけ 触れる）。控えは 端末（ブラウザ）ごとに 1つの ファイル（2026-11-22 案 A。0.1.35）。
//     ブラウザが 自分の ファイルの id を おぼえ（drive:file）、自分の ファイルだけを 書きかえる（ドライブに 版の 履歴が のこる）。
//     ほかの 端末の ファイルは 上書きしない。ファイルには 中身の 目印（appProperties: 端末の 名前・子どもの 名前と 人数・記録の 日数・
//     いちばん 古い 日）を 付け、一覧は 目印だけで 出す（目印の ない 前の 版の ファイルは 中身を 読んで 数える）
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
  // この ブラウザで 最後に 控えた 日時（ISO。自分の ファイルの ドライブの 更新日時）。ブラウザが 記録を 消すと これも 消える
  var LAST_KEY = "drive:last";
  var STALE_DAYS = 7;
  // つないで いる 印（"1"）。トークンは メモリだけ（2026-11-21 社長。ストレージに 置かない）なので、読みなおすと「切れた」に なる
  var LINK_KEY = "drive:link";
  // この ブラウザの 控えの ファイルの id（2026-11-22。なければ 次の 控えで 作って おぼえる）。前の 版の「drive:fresh」は もう 読まない
  var FILE_KEY = "drive:file";
  // この ブラウザの 控えの 中身（最後に 控えた ときの 人数・日数。設定に 出す）{ kn, days }
  var SUM_KEY = "drive:sum";
  // appProperties の 1組（キー＋値）の 上限（UTF-8 の バイト）。Google の 決まり
  var PROP_BYTES = 124;
  // つないだ Google アカウント（メールアドレス）。Google の 窓に 伝えて、アカウントを 選ぶ 画面を 出さない（2026-11-22。
  //   iPad に 2人ぶんの アカウントが あると 毎回 選ばされた）。この ブラウザの 中だけ。控えの ファイルには 入れない
  var WHO_KEY = "drive:who";
  var ABOUT = "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)";

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

  // ---- 中身の 目印（appProperties。2026-11-22）----
  // 端末の 名前を UA から（「iPad・Safari」「Android・Chrome」「Windows・Edge」）。o: { touch: 指の 数（iPad は Mac の UA で 来る）, standalone: ホーム画面の アプリ }
  function deviceName(ua, o) {
    ua = String(ua || "");
    o = o || {};
    var os = /iPad/.test(ua) || (/Macintosh/.test(ua) && o.touch > 1) ? "iPad"
      : /iPhone|iPod/.test(ua) ? "iPhone"
      : /Android/.test(ua) ? "Android"
      : /CrOS/.test(ua) ? "Chromebook"
      : /Windows/.test(ua) ? "Windows"
      : /Macintosh|Mac OS X/.test(ua) ? "Mac"
      : /Linux/.test(ua) ? "Linux" : "";
    var br = o.standalone ? "ホーム画面のアプリ"
      : /Edg(A|iOS)?\//.test(ua) ? "Edge"
      : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
      : /OPR\/|OPiOS\//.test(ua) ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
      : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari" : "";
    return [os, br].filter(Boolean).join("・") || "ブラウザ";
  }
  // UTF-8 の バイト数
  function bytes(s) { return encodeURIComponent(s).replace(/%[0-9A-F]{2}/gi, "x").length; }
  // 1組が 上限に おさまる ように 値を 切る（切ったら …）
  function cut(key, value) {
    value = String(value == null ? "" : value);
    if (bytes(key) + bytes(value) <= PROP_BYTES) return value;
    var ch = Array.from(value);
    while (ch.length && bytes(key) + bytes(ch.join("") + "…") > PROP_BYTES) ch.pop();
    return ch.join("") + "…";
  }
  // データ（書き出しと 同じ 形）の 中身の まとめ { kids: 名前を「・」で, kn: 人数, days: 記録の 日数, from: いちばん 古い 日 }
  function summary(d) {
    var kids = d && Array.isArray(d.kids) ? d.kids : [];
    var keys = Object.keys((d && d.days && typeof d.days === "object" && d.days) || {}).filter(function (k) { return /^\d{4}-\d\d-\d\d$/.test(k); }).sort();
    return {
      kids: kids.map(function (k) { return String((k && k.name) || "").trim(); }).filter(Boolean).join("・"),
      kn: kids.length, days: keys.length, from: keys[0] || "",
    };
  }
  // ファイルに 付ける 目印（しるし ＋ 端末の 名前 ＋ まとめ）。名前が 長ければ 切る
  function props(sum, dev) {
    var p = {};
    p[MARK_KEY] = MARK_VALUE;
    p.dev = cut("dev", dev || "");
    if (sum) {
      p.kids = cut("kids", sum.kids);
      p.kn = String(sum.kn);
      p.days = String(sum.days);
      p.from = sum.from;
    }
    return p;
  }
  // 目印から まとめを 読む（目印の ない 前の 版の ファイルは null）
  function fromProps(p) {
    if (!p || p.days === undefined || p.kn === undefined) return null;
    return { dev: p.dev || "", kids: p.kids || "", kn: Number(p.kn) || 0, days: Number(p.days) || 0, from: p.from || "" };
  }

  // o: { clientId, fetch(url, init), loadGsi() → Promise<google>, storage: { get(k), set(k, v) }, now() → ミリ秒, device: 端末の 名前 }
  function make(o) {
    var now = o.now || function () { return Date.now(); };
    var dev = o.device || "";
    var store = o.storage || { get: function () { return null; }, set: function () {} };
    var tok = null;          // { value, exp }
    var client = null, gsi = null, pending = null;

    // gsi を 読んで、トークン クライアントも 先に 作って おく（押した ときに 同期で 窓を 開ける ように。tokenNow）
    function prepare() {
      return o.loadGsi().then(function (google) {
        try { ensureClient(google); return true; } catch (e) { return false; }
      }, function () { return false; });
    }
    function ensureClient(google) {
      if (client && gsi === google) return client;
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
          remember(tok.value);
        },
        error_callback: function (e) {
          var p = pending;
          pending = null;
          if (!p) return;
          var t = e && e.type;
          p.reject(fail(t === "popup_closed" ? "cancel" : t === "popup_failed_to_open" ? "popup" : "auth"));
        },
      });
      return client;
    }
    // Google の 窓を 開く。requestAccessToken は この 呼び出しの 中で 同期で 呼ぶ（Promise の 中身は すぐ 動く）
    function request() {
      return new Promise(function (resolve, reject) {
        if (pending) pending.reject(fail("cancel"));
        var me = pending = { resolve: resolve, reject: reject };
        // Google の 画面が 閉じられたのに 知らせが 来ない ときに 待ちつづけない（2分）
        setTimeout(function () { if (pending === me) { pending = null; reject(fail("cancel")); } }, 120000);
        var who = account();
        client.requestAccessToken(who ? { prompt: "", login_hint: who, hint: who } : { prompt: "" });
      });
    }
    // 取れた トークンで、どの アカウントか（メールアドレス）を 聞いて おぼえる。失敗しても 控えには 関係ない
    function remember(t) {
      if (!o.remember) return;  // 本物の クライアントだけ（確かめの にせの fetch の 回数を かえない）
      Promise.resolve().then(function () {
        return o.fetch(ABOUT, { method: "GET", headers: { Authorization: "Bearer " + t } });
      }).then(function (r) {
        return r && r.ok ? r.json() : null;
      }).then(function (j) {
        var mail = j && j.user && j.user.emailAddress;
        if (mail) store.set(WHO_KEY, String(mail));
      }).catch(function () { /* おぼえられなくても よい（つぎも 選ぶ 画面が 出るだけ） */ });
    }
    function account() { return store.get(WHO_KEY) || ""; }

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
        ensureClient(google);
        return request();
      });
    }
    // 押した 処理の 中で そのまま（同期で）窓を 開いて 取りなおす（Safari は 押した 処理から 同期で 開いた 窓しか 許さない。
    //   token() は loadGsi().then の あとに 開くので 止められる 心配が ある）。gsi と クライアントが 先に できて いる（prepare の あと）
    //   ときだけ。できて いなければ null（何も しない）
    function tokenNow() {
      if (ready()) return Promise.resolve(tok.value);
      if (!client) return null;
      tok = null;
      return request();
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

    // この ブラウザの 控えの ファイルの id（まだ なら ""）
    function mine() { return store.get(FILE_KEY) || ""; }
    // この ブラウザの 控えの 中身（最後に 控えた ときの { kn, days }。まだ なら null）
    function mineSum() {
      try { var s = JSON.parse(store.get(SUM_KEY) || "null"); return s && typeof s === "object" ? s : null; } catch (e) { return null; }
    }

    // アプリが 作った 控えの 一覧（ごみ箱は 見ない）。[{ id, at（ドライブの 更新日時 ISO）, mine（この 端末の）, dev, kids, kn, days, from, old }]。
    //   この 端末の ものを 先に、ほかは 新しい 順。中身は 目印（appProperties）だけで 出し、目印の ない 前の 版の ファイル（old）は
    //   中身を 読んで 数える（端末の 名前は 分からない ""）。こわれて 読めない ファイルは 出さない（ドライブには 残る）
    function list() {
      var q = "appProperties has { key='" + MARK_KEY + "' and value='" + MARK_VALUE + "' } and trashed = false";
      var url = FILES + "?q=" + encodeURIComponent(q) + "&spaces=drive&orderBy=" + encodeURIComponent("modifiedTime desc") +
        "&pageSize=100&fields=" + encodeURIComponent("files(id,modifiedTime,appProperties)");
      return call("GET", url).then(function (r) { return r.json(); }).then(function (j) {
        var me = mine();
        return Promise.all(((j && j.files) || []).map(function (f) {
          var e = { id: f.id, at: f.modifiedTime, mine: !!me && f.id === me, old: false };
          var s = fromProps(f.appProperties);
          if (s) return assign(e, s);
          return read(f.id).then(function (d) {
            return assign(assign(e, summary(d)), { dev: "", old: true });
          }, function (err) {
            if (err && err.code === "broken") return null;
            throw err;
          });
        }));
      }).then(function (a) {
        return a.filter(Boolean).sort(function (x, y) {
          return x.mine !== y.mine ? (x.mine ? -1 : 1) : Date.parse(y.at) - Date.parse(x.at);
        });
      });
    }
    function assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

    // 控える。text は 書き出しと 同じ 中身（datafile.js の text）。この ブラウザの ファイル（drive:file）だけを 書きかえる。
    //   なければ（はじめて・ごみ箱に 入った・消された）新しく 作って おぼえる。ほかの 端末の ファイルは 書きかえない。
    //   自分の ファイルが 自分の 知らない 時刻に 書きかえられて いた（ドライブの 更新日時 > drive:last）ときは:
    //     opts.auto（自動）は 止めて { held: "other", file } を かえす（窓も 開かない）。
    //     手で 控える ときは、書きかえた 内容を 残して 別の ファイルを 作り、そちらを おぼえる。
    //   opts.apart: 別の ファイルを 作り、おぼえない（「このデータを使う」で この 端末の 控えを 選んだ ときに、いまの 内容を 残す）
    function backup(text, opts) {
      opts = opts || {};
      var auto = !!opts.auto, id = opts.apart ? "" : mine();
      var sum = null;
      try { sum = summary(JSON.parse(text)); } catch (e) { /* 目印なしで 控える */ }
      var meta = props(sum, dev);
      var look = !id ? Promise.resolve(null) :
        call("GET", FILES + "/" + encodeURIComponent(id) + "?fields=" + encodeURIComponent("id,modifiedTime,trashed"), undefined, undefined, false, auto)
          .then(function (r) { return r.json(); }, function (e) { if (e && e.status === 404) return null; throw e; });
      return look.then(function (f) {
        if (f && f.trashed) f = null;
        if (f) {
          var me = last();
          if (me && Date.parse(f.modifiedTime) > Date.parse(me)) {
            if (auto) return { held: "other", file: { id: f.id, at: f.modifiedTime } };
            f = null;
          }
        }
        var put = f ? send("PATCH", UPLOAD + "/" + encodeURIComponent(f.id), { appProperties: meta }, text, auto)
          : send("POST", UPLOAD, { name: NAME, mimeType: "application/json", appProperties: meta }, text, auto);
        return put.then(function (r) { return r.json(); }).then(function (j) {
          var at = (j && j.modifiedTime) || new Date(now()).toISOString();
          if (!opts.apart) {
            store.set(FILE_KEY, (j && j.id) || "");
            store.set(LAST_KEY, at);
            store.set(SUM_KEY, sum ? JSON.stringify({ kn: sum.kn, days: sum.days }) : "");
          }
          return { id: j && j.id, at: at, created: !f };
        });
      });
    }
    // 中身と 目印を いっしょに 送る（作る: POST・書きかえる: PATCH。どちらも multipart）
    function send(method, url, meta, text, silent) {
      var b = "hanamaru-" + now().toString(36) + Math.random().toString(36).slice(2);
      var body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
        "\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + text + "\r\n--" + b + "--";
      return call(method, url + "?uploadType=multipart&fields=" + encodeURIComponent("id,modifiedTime"), body, "multipart/related; boundary=" + b, false, silent);
    }

    // 一覧で 選んだ 控えの データを 使う（2026-11-22 案 A。どの 操作でも データを 消さない）。
    //   sel: list() の 1つ。h: { text() → Promise<いまの 書き出しの 中身>, hasRecords: この 端末に 記録が ある, dirty: まだ 控えて いない 変更が ある,
    //     apply(data) → Promise<読みこんだら true> }
    //   ① 選んだ 控えを 読む ② この 端末に 記録が あれば、先に この 端末の ファイルに 控える（選んだのが この 端末の 控えで、
    //   控えて いない 変更が あれば、別の ファイルに 残す）。控えられなければ 読みこまない（code を もった Error、e.kept = false）
    //   ③ 読みこむ ④ ほかの 端末の 控えを 使ったら、おぼえた id を 外す（外さないと 次の 控えで 置きかえる 前の 控えを 上書きする。
    //   次の 控えは 新しい ファイル）。この 端末の 控えを 使ったら、その 控えを 最後に 控えた ものに する
    function useFile(sel, h) {
      var own = !!sel && sel.id === mine();
      var data;
      return read(sel.id).then(function (d) {
        data = d;
        if (!h.hasRecords || (own && !h.dirty)) return null;
        return Promise.resolve().then(h.text).then(function (text) {
          return backup(text, own ? { apart: true } : {});
        }).catch(function (e) {
          var x = e && e.code ? e : fail("http");
          x.kept = false;
          throw x;
        });
      }).then(function (kept) {
        return Promise.resolve(h.apply(data)).then(function (ok) {
          if (!ok) return null;
          if (own) {
            store.set(LAST_KEY, sel.at);
            var s = summary(data);
            store.set(SUM_KEY, JSON.stringify({ kn: s.kn, days: s.days }));
          } else detach();
          return { kept: kept };
        });
      });
    }
    // この ブラウザの 控えの ファイルを 外す（ファイルは ドライブに 残る。次の 控えは 新しい ファイル）
    function detach() {
      store.set(FILE_KEY, "");
      store.set(LAST_KEY, "");
      store.set(SUM_KEY, "");
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
    // つなぐのを やめる: Google の 許可を 取り消して（できれば）、印を 消す。控えの ファイルは ドライブに 残る
    function unlink() {
      var t = tok && tok.value;
      tok = null;
      setLinked(false);
      store.set(WHO_KEY, "");
      var o2 = gsi && gsi.accounts && gsi.accounts.oauth2;
      if (t && o2 && typeof o2.revoke === "function") { try { o2.revoke(t, function () {}); } catch (e) { /* 取り消せなくても 印は 消えて いる */ } }
    }
    // トークンを 忘れる（確かめの 道具で「切れた」形を 作る）
    function forget() { tok = null; }

    return { prepare: prepare, token: token, tokenNow: tokenNow, ready: ready, list: list, backup: backup, read: read, useFile: useFile, detach: detach,
      mine: mine, mineSum: mineSum, device: function () { return dev; }, last: last, stale: stale,
      linked: linked, setLinked: setLinked, account: account, unlink: unlink, forget: forget };
  }

  // ---- 自動で 控える（つないで いる 間。2026-11-21 社長）----
  //   o: { client() → make の 組, text() → Promise<書き出しの 中身>, hasRecords() → bool, storage, now(), timer: { set(fn, ms), clear(id) } }
  //   changed()（保存の たび）→ 最後の 変更から 20秒 静かに なったら 1回。続く ときは 最初の 変更から 2分で 1回（秒数は 推測。実物で 調整）。
  //   窓は 開かない（token silent）。トークンが なければ「expired」で 待つ（設定の「つなぎ直す」）。
  //   status: "" | "expired" | "held-other" | "full" | "offline" | "busy"（held と full は 押して もらう まで 止める）。
  //   held-other は この 端末の ファイルが 自分の 知らない 時刻に 書きかえられた ときだけ（2026-11-22。前の 版の held-ask は 読んだら 外す）
  //   押した ついでの 取りなおし（nudge）は 同じ 窓を 何度も 出さない ように 3分 あける（推測。実物で 調整）
  var QUIET = 20000, MAX_WAIT = 120000, BUSY_WAIT = [60000, 300000, 900000], NUDGE_GAP = 180000;
  var DIRTY_KEY = "drive:dirty", HELD_KEY = "drive:held";
  function makeAuto(o) {
    var now = o.now || function () { return Date.now(); };
    var store = o.storage;
    var timer = o.timer || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (id) { clearTimeout(id); } };
    var waiting = null, running = false, again = false, busyN = 0, heldAt = "";
    var status = store.get(HELD_KEY) || "", subs = [];
    // 前の 版（〜0.1.34）の「まだ 控えて いない 端末で 控えが ある」止め。いまは 端末ごとの ファイルに 作るので 止めない
    if (status === "held-ask") { status = ""; store.set(HELD_KEY, ""); }

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
    // おうちの人が 押した ついでに 通行証を 取りなおす（2026-11-22 社長。案 B）。鍵の あとの 操作（設定を 開いた・「みました」）の
    //   押した 処理の 中で 同期で 呼ぶ。子どもの 操作では 呼ばない（子どもの 前で Google の 窓を 出さない）。
    //   試すのは つないで いる・トークンが ない・止まって いない（held・full）・押した 扱いが 続いて いる（o.active）・
    //   前に 試してから NUDGE_GAP たった ときだけ。gsi が まだ なら 窓は 開かず、つぎの ために 読んで おく。
    //   取れたら たまって いる 変更を すぐ 控える。失敗（窓が 止められた・閉じられた・エラー）は 黙って いまの 帯の まま。
    //   返り値: 試したら Promise<status>、試さなければ null
    var tried = 0;
    function nudge() {
      var c = o.client();
      if (!c.linked() || c.ready() || stopped() || typeof c.tokenNow !== "function") return null;
      if (o.active && !o.active()) return null;
      var t = now();
      if (tried && t - tried < NUDGE_GAP) return null;
      var p = c.tokenNow();
      if (!p) { c.prepare(); return null; }
      tried = t;
      // 窓が 一瞬 白く 出るので、何を して いるかを 画面の まんなかに 出す（2026-11-22 社長「バグかと思う」）
      tell("start");
      return p.then(function () {
        tell("done");
        if (dirtySince()) return run();
        if (status === "expired") set("");
        emit();
        return status;
      }, function () {
        tell("");
        emit();
        return status;
      });
    }
    function tell(kind) { if (o.notice) { try { o.notice(kind); } catch (e) { /* 知らせの 失敗で 止めない */ } } }
    return {
      changed: changed, run: run, clearHeld: clearHeld, clearDirty: clearDirty, needsReconnect: needsReconnect, nudge: nudge,
      status: function () { return status; }, dirty: function () { return !!dirtySince(); }, heldAt: function () { return heldAt; },
      onChange: function (f) { subs.push(f); },
    };
  }

  // ---- ブラウザでの 既定 ----
  var loading = null;
  // 押した ついでの 取りなおし（nudge）の あいだ、画面の まんなかに 一言（start: つないで います… / done: つなぎ直しました を 2秒 / "": 消す）。
  //   Google の 窓が 一瞬 白く 出るのが 何か 分かる ように（2026-11-22 社長）。style.css に 頼らず ここで 形を 決める
  var noticeEl = null, noticeTimer = null;
  function notice(kind) {
    if (typeof document === "undefined") return;
    if (!noticeEl) {
      noticeEl = document.createElement("div");
      noticeEl.setAttribute("role", "status");
      noticeEl.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;padding:14px 22px;" +
        "border-radius:14px;background:rgba(40,40,48,.92);color:#fff;font-size:18px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,.3);" +
        "pointer-events:none;max-width:80vw;text-align:center";
      document.body.appendChild(noticeEl);
    }
    clearTimeout(noticeTimer);
    var AW = window.Words && window.Words.adult;
    if (!kind || !AW) { noticeEl.hidden = true; return; }
    noticeEl.textContent = AW(kind === "done" ? "driveNudged" : "driveNudging");
    noticeEl.hidden = false;
    noticeTimer = setTimeout(function () { noticeEl.hidden = true; }, kind === "done" ? 2000 : 30000);
  }

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
  // この ブラウザの 名前（控えの 目印。iPad の Safari は Mac の UA で 来るので 指の 数で 見分ける）
  function here() {
    var n = window.navigator || {}, standalone = false;
    try { standalone = n.standalone === true || (!!window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); } catch (e) { /* 分からなければ ふつうの ブラウザ */ }
    return deviceName(n.userAgent, { touch: n.maxTouchPoints || 0, standalone: standalone });
  }

  window.Drive = {
    SCOPE: SCOPE,
    NAME: NAME,
    STALE_DAYS: STALE_DAYS,
    PROP_BYTES: PROP_BYTES,
    make: make,
    makeAuto: makeAuto,
    on: on,
    deviceName: deviceName,
    here: here,
    summary: summary,
    props: props,
    // 画面が 使う もの（開発の 確かめでは use で 差し替える。tools/dev/drive-on.js）
    client: function () {
      return current || (current = make({ clientId: clientId(), fetch: function (u, i) { return window.fetch(u, i); }, loadGsi: loadGsi, storage: storage, remember: true, device: here() }));
    },
    use: function (c) { current = c; },
    notice: notice,   // 確かめの 道具から 形を 見る
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
        // 押した 扱いが 続いて いるか（長押しの タイマーや ページの 読みこみから 呼ばれた ときは 窓を 出さない。知らない ブラウザは 試す）
        active: function () { var u = window.navigator && window.navigator.userActivation; return !u || !!u.isActive; },
        notice: notice,
      }));
    },
  };
})();
