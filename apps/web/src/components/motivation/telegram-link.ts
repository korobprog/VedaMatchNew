/**
 * Сайт `t.me` у части операторов рвётся на уровне сети
 * (ERR_CONNECTION_ABORTED), и ссылка на источник у таких пользователей просто
 * не открывается. Схему `tg://` телефон отдаёт установленному приложению, не
 * загружая никакой страницы, — блокировать нечего.
 *
 * Разбор адреса вынесен сюда отдельной функцией: обёртка вокруг него в ленте
 * не тестируется, а таблица форм ссылок — да.
 */

const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me", "telegram.dog"]);

/**
 * Служебные разделы t.me: первый сегмент у них выглядит как имя канала, но
 * приложение открывает по ним совсем другое, а то и ничего.
 */
const RESERVED_PATHS = new Set([
  "share",
  "iv",
  "login",
  "confirmphone",
  "proxy",
  "socks",
  "setlanguage",
  "addstickers",
  "addemoji",
  "addtheme",
  "bg",
]);

const USERNAME = /^[A-Za-z0-9_]{1,32}$/;

/**
 * Возвращает `tg://`-адрес для ссылки на Telegram или `null`, если ссылка ведёт
 * не в Telegram либо в раздел, которому нет пары в приложении.
 */
export function toTelegramAppLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!TELEGRAM_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, "")))
    return null;

  const segments = url.pathname.split("/").filter(Boolean);
  // `/s/<канал>` — веб-превью канала, само имя стоит следующим.
  if (segments[0] === "s") segments.shift();
  if (segments.length === 0) return null;

  const [first, second] = segments;

  // `/+<хеш>` и `/joinchat/<хеш>` — приглашение в закрытую группу.
  if (first.startsWith("+") || first === "joinchat") {
    const invite = first === "joinchat" ? second : first.slice(1);
    if (!invite) return null;
    // `/+79001234567` — не приглашение, а номер телефона.
    if (/^\d+$/.test(invite))
      return `tg://resolve?phone=${encodeURIComponent(invite)}`;
    return `tg://join?invite=${encodeURIComponent(invite)}`;
  }

  // `/c/<id канала>/<номер поста>` — пост закрытого канала.
  if (first === "c") {
    if (!second || !/^\d+$/.test(second)) return null;
    const post = segments[2];
    return post && /^\d+$/.test(post)
      ? `tg://privatepost?channel=${second}&post=${post}`
      : `tg://privatepost?channel=${second}`;
  }

  if (RESERVED_PATHS.has(first.toLowerCase())) return null;
  if (!USERNAME.test(first)) return null;

  // `/<канал>` и `/<канал>/<номер поста>`.
  return second && /^\d+$/.test(second)
    ? `tg://resolve?domain=${first}&post=${second}`
    : `tg://resolve?domain=${first}`;
}
