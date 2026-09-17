import { LOGIN_CLIENTS, type AdminLoginStats, type LoginClient } from "@vedamatch/shared";

/** Подпись источника для таблицы «Входы по источникам» в админке. */
export const LOGIN_CLIENT_LABELS: Record<LoginClient, string> = {
  site: "Сайт",
  "web-app": "Веб-версия (ios.vedamatch.com)",
  telegram: "Telegram",
  android: "Приложение (Android)",
};

export interface LoginFunnelRow {
  client: LoginClient;
  label: string;
  logins7: number;
  users7: number;
  logins30: number;
  users30: number;
  /** Целыми процентами; `null` — когорта пуста, возврат не считается. */
  returnRatePercent: number | null;
}

/**
 * Строка на источник для компактной таблицы `/admin`. Бэкенд уже отдаёт три
 * массива в фиксированном порядке `LOGIN_CLIENTS` с нулями за пропущенные
 * источники (`login-funnel-shape.ts`), но таблица собирается по ключу
 * `client`, а не по индексу — так вёрстка не разъедется, если порядок раздела
 * когда-нибудь изменится на бэкенде.
 */
export function buildLoginFunnelTable(
  stats: AdminLoginStats,
): LoginFunnelRow[] {
  const by7 = new Map(stats.last7Days.map((row) => [row.client, row]));
  const by30 = new Map(stats.last30Days.map((row) => [row.client, row]));
  const byReturn = new Map(stats.return7Day.map((row) => [row.client, row]));

  return LOGIN_CLIENTS.map((client) => {
    const r7 = by7.get(client);
    const r30 = by30.get(client);
    const ret = byReturn.get(client);
    return {
      client,
      label: LOGIN_CLIENT_LABELS[client],
      logins7: r7?.logins ?? 0,
      users7: r7?.users ?? 0,
      logins30: r30?.logins ?? 0,
      users30: r30?.users ?? 0,
      returnRatePercent:
        ret?.returnRate != null ? Math.round(ret.returnRate * 100) : null,
    };
  });
}

/** Текст ячейки возврата: процент или прочерк, когда считать не из чего. */
export function formatReturnRate(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}
