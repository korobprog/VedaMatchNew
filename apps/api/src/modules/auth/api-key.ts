import { createHash, randomBytes } from 'node:crypto';

/**
 * Персональные ключи доступа — вход для программ, а не для человека.
 *
 * Портал живёт на Google OIDC и refresh-cookie: и то и другое требует браузера
 * и живого человека. MCP-клиент (Claude на машине пользователя) браузера не
 * имеет, поэтому нужен долгоживущий предъявитель. Ключ персональный: у каждого
 * свой, и всё, что через него доступно, ограничено правами его владельца —
 * иначе напарник, подключивший свой Claude, ходил бы под чужим именем.
 *
 * Хранится хеш, как у refresh-токенов: база, утёкшая целиком, не даёт войти.
 */

/** Видимая часть — по ней ключ узнают в списке, не показывая целиком. */
export const API_KEY_PREFIX = 'vm_';

/** 32 байта — как у refresh-токена: перебор бессмыслен, длина терпимая. */
const API_KEY_BYTES = 32;

/**
 * Право ключа. Пара «сервис:действие»: сервис режет доступ по префиксу
 * маршрута, действие — по HTTP-методу.
 *
 * Проверка методом, а не декоратором на каждом маршруте, выбрана осознанно: у
 * одной «Работы» 37 эндпоинтов, и право, которое нужно не забыть повесить в 37
 * местах, однажды забудут повесить. Метод же врать не может: GET не меняет
 * состояние по определению REST, а всё остальное — меняет.
 */
export type ApiKeyScope = `${string}:${'read' | 'write'}`;

/** Методы, которые ничего не меняют, — их пускает `:read`. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateApiKey(): { token: string; hash: string } {
  const token = `${API_KEY_PREFIX}${randomBytes(API_KEY_BYTES).toString('base64url')}`;
  return { token, hash: hashApiKey(token) };
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/**
 * Хвост ключа для списка в интерфейсе: «vm_…9f3a».
 *
 * Показывать начало бессмысленно — оно у всех одинаковое; показывать много
 * значит помогать тому, кто подсматривает.
 */
export function apiKeyHint(token: string): string {
  return `${API_KEY_PREFIX}…${token.slice(-4)}`;
}

/**
 * Пускать ли ключ с такими правами к такому запросу.
 *
 * Путь сравнивается по первому сегменту — он же slug сервиса, по контракту
 * репозитория совпадающий с префиксом маршрутов (`@Controller('work/...')`).
 * Поэтому ключ «work:read» не дотянется до Общения, даже если маршрут добавят
 * завтра: разрешение выдано сервису, а не списку адресов.
 */
export function isRequestAllowed(
  scopes: readonly string[],
  method: string,
  path: string,
): boolean {
  const service = serviceOf(path);
  if (!service) return false;
  const writing = !READ_METHODS.has(method.toUpperCase());
  return scopes.some((scope) => {
    const [scopeService, action] = scope.split(':');
    if (scopeService !== service) return false;
    return writing
      ? action === 'write'
      : action === 'read' || action === 'write';
  });
}

/** Первый непустой сегмент пути: `/work/tasks/42` → `work`. */
function serviceOf(path: string): string | null {
  const [segment] = path.replace(/^\/+/, '').split(/[/?]/);
  return segment ? segment : null;
}

/** Годен ли ключ сам по себе — до всякой проверки прав. */
export function isApiKeyUsable(
  key: { revoked: boolean; expiresAt: Date | null },
  now: Date,
): boolean {
  if (key.revoked) return false;
  return !key.expiresAt || key.expiresAt > now;
}

/**
 * Права, которые вообще можно выдать ключу.
 *
 * Список закрытый и начинается с одной «Работы»: право на сервис, для которого
 * ещё некому его предъявить, — это только лишняя дыра. Расширяется по мере
 * того, как у сервисов появляются программные потребители.
 */
export const ALLOWED_API_KEY_SCOPES = ['work:read', 'work:write'] as const;

/**
 * Что из запрошенного можно выдать: неизвестное отбрасывается молча, повторы
 * схлопываются. Пустой ответ — повод отказать: ключ без прав бесполезен и
 * только смущает владельца в списке.
 */
export function normalizeScopes(requested: readonly unknown[]): string[] {
  const allowed = new Set<string>(ALLOWED_API_KEY_SCOPES);
  return [
    ...new Set(
      requested.filter(
        (scope): scope is string =>
          typeof scope === 'string' && allowed.has(scope),
      ),
    ),
  ];
}
