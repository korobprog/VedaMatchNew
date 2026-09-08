import type { McpConfig } from './config.js';

/**
 * Тонкий клиент портального API.
 *
 * Сервер ходит по HTTP, а не в базу напрямую, и это главное архитектурное
 * решение здесь: все проверки прав — членство в среде, роль, доступ к доске —
 * уже живут в контроллерах «Работы» и применяются сами. Клиент, знающий про
 * Prisma, пришлось бы учить тем же правилам заново, и однажды они разошлись бы
 * с настоящими.
 */
export class PortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class PortalClient {
  constructor(private readonly config: McpConfig) {}

  get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  post(path: string, body?: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }

  patch(path: string, body?: unknown): Promise<unknown> {
    return this.request('PATCH', path, body);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new PortalError(
        await describeFailure(response, method, path),
        response.status,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

/**
 * Что сказать модели, когда портал отказал.
 *
 * Голый код ответа заставляет её гадать и пробовать снова то же самое. Поэтому
 * к каждому частому отказу приписан следующий шаг — не «403 Forbidden», а
 * «ключу не хватает права work:write, выпустите новый».
 */
async function describeFailure(
  response: Response,
  method: string,
  path: string,
): Promise<string> {
  const detail = await readMessage(response);
  switch (response.status) {
    case 401:
      return `Портал не принял ключ (${detail}). Проверьте VEDAMATCH_API_KEY: ключ мог быть отозван или просрочен — выпустите новый в настройках портала.`;
    case 403:
      return `Прав не хватает для ${method} ${path} (${detail}). Либо ключ выпущен только на чтение (work:read), либо у вас нет доступа к этой среде.`;
    case 404:
      return `Портал не нашёл ${path} (${detail}). Проверьте идентификатор: доску и задачи можно перечислить через work_list_spaces и work_get_board.`;
    case 429:
      return `Портал просит подождать (${detail}). Повторите запрос через несколько секунд.`;
    default:
      return `Портал ответил ${response.status} на ${method} ${path}: ${detail}`;
  }
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join('; ');
    return response.statusText || 'без пояснения';
  } catch {
    return response.statusText || 'без пояснения';
  }
}
