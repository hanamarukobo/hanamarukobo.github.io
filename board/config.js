// 同梱版（build-app.ps1 -Standalone）の設定。dashboard/config.js の代わりに APK に入る。
// 家の地域やカレンダーの URL は入れない（天気の地域とカレンダーは、はじめての設定・設定画面で えらぶ）
window.CONFIG = {
  place: null,
  jma: null,
  calendar: { url: "" },

  // 何時から「あした」の てんき・よていに切り替えるか
  tomorrowFromHour: 17,

  // 夜モード（画面を暗い色にする）の時間帯
  night: { from: 18, to: 6 },

  // 画面の表示時間（既定値）。設定画面から変えられる
  display: {
    weekday: { from: "07:00", to: "09:00" },
    holiday: { from: "07:00", to: "09:00" },
    idleMinutes: 1,
  },

  // 待機中の画面の明るさ（0〜255）
  brightness: { on: 180, off: 0 },
};
window.CONFIG.web = true;
