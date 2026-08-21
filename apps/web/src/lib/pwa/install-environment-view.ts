import type {
  InstallEnvironmentSummary,
  PwaBrowserFamily,
} from "@vedamatch/shared";

export interface InstallEnvironmentTableRow {
  browser: PwaBrowserFamily;
  users: number;
  /** Доля от всего замера, целыми процентами. */
  share: number;
  /** Из них уже открывают портал не во вкладке. */
  installed: number;
  standaloneCapable: boolean;
}

export function formatShare(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Сводка приходит разложенной по четырём измерениям сразу — для чтения это
 * слишком дробно. Складываем по браузеру: решение «куда уводить установку»
 * принимается именно на этом уровне.
 */
export function buildInstallEnvironmentTable(
  summary: InstallEnvironmentSummary,
): InstallEnvironmentTableRow[] {
  const byBrowser = new Map<PwaBrowserFamily, InstallEnvironmentTableRow>();

  for (const row of summary.rows) {
    const current = byBrowser.get(row.browser) ?? {
      browser: row.browser,
      users: 0,
      share: 0,
      installed: 0,
      standaloneCapable: row.standaloneCapable,
    };
    current.users += row.users;
    if (row.displayMode !== "browser") current.installed += row.users;
    // Один и тот же браузер на Android и на десктопе различается по
    // возможности установки: тупиковым считаем, если тупиковый хоть где-то.
    current.standaloneCapable &&= row.standaloneCapable;
    byBrowser.set(row.browser, current);
  }

  return [...byBrowser.values()]
    .map((row) => ({ ...row, share: formatShare(row.users, summary.total) }))
    .sort((a, b) => b.users - a.users);
}
