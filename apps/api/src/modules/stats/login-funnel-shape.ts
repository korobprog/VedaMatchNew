import {
  LOGIN_CLIENTS,
  type AdminLoginStats,
  type LoginClient,
  type LoginClientCounter,
  type LoginClientReturn,
} from '@vedamatch/shared';

/** Строка сырого запроса «входы и уникальные люди по источнику за период». */
export type LoginCounterRow = {
  client: string | null;
  logins: bigint | number;
  users: bigint | number;
};

/** Строка сырого запроса «возврат за 7 дней по источнику». */
export type LoginReturnRow = {
  client: string | null;
  cohortSize: bigint | number;
  returnedCount: bigint | number;
};

function isLoginClient(value: string | null): value is LoginClient {
  return (LOGIN_CLIENTS as readonly string[]).includes(value ?? '');
}

/**
 * Строки `$queryRaw` — в фиксированный порядок `LOGIN_CLIENTS`, с нулём для
 * источника, по которому за период не было ни одного входа. Источник вне
 * известного набора (записи до миграции, где `client IS NULL`) в сводку не
 * попадает: воронка считает только размеченные входы.
 */
export function shapeLoginCounters(
  rows: readonly LoginCounterRow[],
): LoginClientCounter[] {
  const byClient = new Map(
    rows
      .filter((row): row is LoginCounterRow & { client: string } =>
        isLoginClient(row.client),
      )
      .map((row) => [
        row.client,
        { logins: Number(row.logins), users: Number(row.users) },
      ]),
  );
  return LOGIN_CLIENTS.map((client) => ({
    client,
    logins: byClient.get(client)?.logins ?? 0,
    users: byClient.get(client)?.users ?? 0,
  }));
}

/**
 * То же для когорты возврата: `returnRate` — доля 0..1, округления не делает
 * (округляет и форматирует в проценты уже интерфейс). `null`, когда когорта
 * пуста — по нулю людей возврат не считается ни в чью пользу.
 */
export function shapeLoginReturns(
  rows: readonly LoginReturnRow[],
): LoginClientReturn[] {
  const byClient = new Map(
    rows
      .filter((row): row is LoginReturnRow & { client: string } =>
        isLoginClient(row.client),
      )
      .map((row) => [
        row.client,
        {
          cohortSize: Number(row.cohortSize),
          returnedCount: Number(row.returnedCount),
        },
      ]),
  );
  return LOGIN_CLIENTS.map((client) => {
    const found = byClient.get(client);
    const cohortSize = found?.cohortSize ?? 0;
    const returnedCount = found?.returnedCount ?? 0;
    return {
      client,
      cohortSize,
      returnedCount,
      returnRate: cohortSize > 0 ? returnedCount / cohortSize : null,
    };
  });
}

export function buildAdminLoginStats(input: {
  last7Days: readonly LoginCounterRow[];
  last30Days: readonly LoginCounterRow[];
  return7Day: readonly LoginReturnRow[];
}): AdminLoginStats {
  return {
    last7Days: shapeLoginCounters(input.last7Days),
    last30Days: shapeLoginCounters(input.last30Days),
    return7Day: shapeLoginReturns(input.return7Day),
  };
}
