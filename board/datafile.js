// データの 書き出し・読み込み（おうちの人）。設定の「おうちの人」（settings.js）と がんばり管理（admin.js）で つかう。
// 記録と 設定を 1つの ファイルに する。機種変更の 前に 書き出して おくと、あとで 戻せる（戻すと いまの 内容は 置きかわる）
(function () {
  "use strict";

  // 書き出す 中身 { name, text }（Google ドライブの 控え（drive.js）も 同じ 中身）
  function text() {
    return window.BoardApi.state().then(function (s) {
      var data = JSON.parse(JSON.stringify(s));
      delete data.today;
      data.exportedAt = new Date().toISOString();
      return { name: "ganbari-" + s.today + ".json", text: JSON.stringify(data, null, 1) };
    });
  }

  // 書き出す。結果の 文（「保存しました: …」など）を かえす
  function save() {
    return text().then(function (f) {
      var name = f.name, text = f.text;
      // アプリの 中では ダウンロードが 使えないので、アプリ（MainActivity）に 保存して もらう
      if (window.EchoBoard && typeof window.EchoBoard.saveFile === "function") {
        var where = window.EchoBoard.saveFile(name, text);
        return where ? "保存しました: " + where : "保存できませんでした";
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return name + " を保存しました";
    });
  }

  // ファイルから 戻す。中身を たしかめ、置きかえて よいか 聞いてから。戻したら true、やめたら false。
  // 失敗は 理由の 文を もった Error（そのまま 画面に 出せる）
  function load(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); } catch (e) { return reject(new Error("ファイルを読めませんでした")); }
        apply(data, "").then(function (done) {
          if (done) detachDrive();
          resolve(done);
        }, reject);
      };
      reader.onerror = function () { reject(new Error("ファイルを読めませんでした")); };
      reader.readAsText(file);
    });
  }

  // 読んだ データで 置きかえる（ファイル・Google ドライブの 控え）。置きかえて よいか 聞いてから。
  //   from は 確かめの 文の 頭（ドライブなら「11月20日 9:05 に控えた、」）。戻す 前の 状態は バックアップに のこる（api.js の import）
  //   asked: 画面で もう 確かめた（ブラウザ版の 入口で 日時と 件数を 見せて「この控えを戻す」を 押した）ときは 聞きなおさない
  function apply(data, from, asked) {
    if (!data || !Array.isArray(data.kids) || !data.days || typeof data.days !== "object") return Promise.reject(new Error("はなまるボードのファイルではありません"));
    var days = Object.keys(data.days).length;
    if (!asked && !confirm((from || "") + "子ども " + data.kids.length + "人・記録 " + days + "日ぶんの内容に置き換えます。よろしいですか？")) return Promise.resolve(false);
    return window.BoardApi.post("/api/parent/import", { data: data }).then(function () { return true; }, function (err) {
      throw new Error("戻せませんでした: " + (err && err.message || ""));
    });
  }

  // ブラウザ版で Google ドライブの 控えが ある ときは、ファイルで 置きかえた あと この 端末の 控えの ファイルを 外す
  //   （前の 内容の 控えを 次の 控えで 上書きしない。次の 控えは 新しい ファイル。2026-11-22 案 A。がんばり管理の iframe からは 親の Drive）
  function detachDrive() {
    try {
      var D = window.Drive || (window.parent && window.parent !== window ? window.parent.Drive : null);
      if (D && D.on() && D.client().mine()) D.client().detach();
    } catch (e) { /* 外せなくても 読みこみは できて いる */ }
  }

  window.DataFile = { save: save, load: load, text: text, apply: apply };
})();
