/** Семейство браузера, определённое по User-Agent. */
export type PwaBrowserFamily =
  | 'chrome'
  | 'samsung'
  | 'yandex-browser'
  /// Встроенный обозреватель приложения «Яндекс — с Алисой»: это WebView,
  /// установки в нём нет вовсе.
  | 'yandex-app'
  | 'safari'
  | 'firefox'
  | 'edge'
  | 'opera'
  | 'other';

export type PwaPlatform = 'android' | 'ios' | 'desktop';

export type PwaDisplayMode =
  | 'fullscreen'
  | 'standalone'
  | 'minimal-ui'
  | 'browser';

/** Замер окружения: с чего человек открыл портал и чем это обернулось. */
export interface InstallEnvironmentReport {
  browser: PwaBrowserFamily;
  platform: PwaPlatform;
  displayMode: PwaDisplayMode;
  /** Даст ли установка из этого браузера настоящее приложение без хрома. */
  standaloneCapable: boolean;
}

export interface InstallEnvironmentRow extends InstallEnvironmentReport {
  users: number;
}

export interface InstallEnvironmentSummary {
  /** Сколько человек вообще попало в замер. */
  total: number;
  /** Сколько уже открывает портал как приложение. */
  installed: number;
  /**
   * Сколько сидит в браузере, который настоящую установку не даст, —
   * это и есть размер проблемы.
   */
  deadEnd: number;
  rows: InstallEnvironmentRow[];
}
