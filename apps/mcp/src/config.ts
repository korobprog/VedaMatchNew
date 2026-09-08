/**
 * Настройки MCP-сервера: адрес портала и персональный ключ.
 *
 * Оба приходят из окружения, которое задаёт MCP-клиент в своей конфигурации, —
 * файла с секретом на диске нет. Ключ персональный: под каким выпущен, от того
 * имени сервер и ходит, поэтому два человека с одним и тем же сервером видят
 * разные доски.
 */

export interface McpConfig {
  baseUrl: string;
  apiKey: string;
}

export class ConfigError extends Error {}

/**
 * Разбор окружения.
 *
 * Ошибки формулируются как инструкция, а не как диагноз: единственный, кто их
 * прочитает, — человек, настраивающий клиент, и ему нужно знать, что вписать,
 * а не то, какая проверка не прошла.
 */
export function readConfig(env: Record<string, string | undefined>): McpConfig {
  const apiKey = (env.VEDAMATCH_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new ConfigError(
      'Не задан VEDAMATCH_API_KEY. Выпустите ключ в портале (Настройки → Ключи доступа) и укажите его в конфигурации MCP-клиента.',
    );
  }
  if (!apiKey.startsWith('vm_')) {
    throw new ConfigError(
      'VEDAMATCH_API_KEY не похож на ключ портала: он начинается с «vm_». Похоже, вписан токен из браузера — он живёт минуты и здесь не годится.',
    );
  }

  const raw = (env.VEDAMATCH_API_URL ?? 'http://localhost:4000').trim();
  return { baseUrl: stripTrailingSlash(raw), apiKey };
}

/**
 * Хвостовой слэш в адресе портала — самая частая опечатка в конфигурации, а
 * склейка с путём дала бы `//work/spaces` и невнятный 404.
 */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
