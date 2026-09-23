/**
 * Сведения об устройстве в обращении в поддержку (VED-336).
 *
 * Сервер поддержки принимает у обращения ровно три поля — тему, категорию и
 * текст (`CreateSupportTicketRequest`, `apps/api/src/modules/support`).
 * Отдельных полей «версия», «модель», «экран» у него нет, и заводить их ради
 * приложения значило бы менять сервис, которым сайт обходится как есть.
 * Поэтому сведения дописываются в конец ТЕКСТА — отдельным абзацем, который
 * человек видит в форме слово в слово до отправки и может выключить.
 *
 * Модуль чистый: сами факты собирает `device-facts.ts`, здесь — только их
 * запись словами и склейка с текстом человека. Так «что именно отправится»
 * проверяется тестом, а не на слово.
 */

/** Предел текста обращения на сервере (`MAX_MESSAGE_LENGTH` в support.service.ts). */
export const SUPPORT_MESSAGE_MAX = 4000;
/** Предел темы на сервере (`MAX_SUBJECT_LENGTH`). */
export const SUPPORT_SUBJECT_MAX = 160;

/** Заголовок абзаца со сведениями — по нему поддержка отличает его от текста человека. */
export const DEVICE_REPORT_HEADING = '— Сведения из приложения —';

export interface DeviceFacts {
  /** versionName: `0.1.0` или `0.1.0+a1b2c3d`. */
  appVersion: string | null;
  /** versionCode Android — по нему видно, какая именно сборка. */
  versionCode: number | null;
  /** Канал сборки: с сайта или из магазина — у них разный набор возможностей. */
  channel: 'site' | 'store' | null;
  /** `android` / `ios` / `web`. */
  platform: string;
  /** Версия системы: `14` для Android, `17.5` для iOS. */
  osVersion: string | null;
  /** Производитель: `samsung`. */
  brand: string | null;
  /** Модель: `SM-A515F`. */
  model: string | null;
}

/**
 * Экраны, откуда можно написать в поддержку, и как их называть человеку и
 * поддержке. Список закрытый: ключ приходит параметром адреса, и
 * произвольная строка из адреса в обращение попадать не должна.
 *
 * `subject` и `category` — подсказка формы, а не решение за человека: оба
 * поля он волен поменять.
 */
export const SUPPORT_ORIGINS = {
  chat: {
    label: 'Переписка',
    subject: 'Не открывается переписка',
    category: 'technical',
  },
  wellness: {
    label: 'Здоровье — ответ сканера',
    subject: 'Сканер состава не ответил',
    category: 'technical',
  },
  notifications: {
    label: 'Уведомления',
    subject: 'Не загружаются уведомления',
    category: 'technical',
  },
} as const satisfies Record<string, { label: string; subject: string; category: 'technical' | 'other' }>;

export type SupportOrigin = keyof typeof SUPPORT_ORIGINS;

/** Ключ экрана из параметра адреса. Незнакомое — `null`, а не «как есть». */
export function parseSupportOrigin(raw: unknown): SupportOrigin | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(SUPPORT_ORIGINS, value) ? (value as SupportOrigin) : null;
}

/**
 * Откуда поставлено приложение — словами. Это не решение «что можно каналу»
 * (такие живут только в `config/capabilities.ts`), а подпись для поддержки:
 * у сборки с сайта и из магазина разный набор возможностей, и без этой
 * строки поддержка будет гадать, почему у человека нет самообновления.
 */
const CHANNEL_WORDS: Record<NonNullable<DeviceFacts['channel']>, string> = {
  site: 'с сайта',
  store: 'из магазина',
};

const PLATFORM_NAMES: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'веб-версия' };

function clean(value: string | null | undefined): string | null {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text ? text : null;
}

/** «Samsung SM-A515F»: марку с большой буквы и без повтора, если модель её уже содержит. */
function phoneName(brand: string | null, model: string | null): string | null {
  const b = clean(brand);
  const m = clean(model);
  if (!b) return m;
  const title = b.charAt(0).toUpperCase() + b.slice(1);
  if (!m) return title;
  return m.toLowerCase().startsWith(b.toLowerCase()) ? m : `${title} ${m}`;
}

/**
 * Строки абзаца со сведениями. Пустое не пишется: «Модель: неизвестно»
 * поддержке ничего не говорит, а человеку выглядит как слежка впустую.
 */
export function deviceReportLines(facts: DeviceFacts, origin: SupportOrigin | null): string[] {
  const lines: string[] = [];

  const version = clean(facts.appVersion);
  if (version) {
    const details = [
      facts.versionCode && facts.versionCode > 1 ? `сборка ${facts.versionCode}` : null,
      facts.channel ? CHANNEL_WORDS[facts.channel] : null,
    ].filter(Boolean);
    lines.push(`Приложение: VedaMatch ${version}${details.length ? ` (${details.join(', ')})` : ''}`);
  }

  const system = PLATFORM_NAMES[facts.platform] ?? clean(facts.platform);
  const os = system ? [system, clean(facts.osVersion)].filter(Boolean).join(' ') : null;
  const phone = phoneName(facts.brand, facts.model);
  const device = [phone, os].filter(Boolean).join(', ');
  if (device) lines.push(`Устройство: ${device}`);

  if (origin) lines.push(`Экран: ${SUPPORT_ORIGINS[origin].label}`);
  return lines;
}

/** Абзац целиком — ровно то, что допишется к тексту. Пусто, если писать нечего. */
export function deviceReportText(lines: readonly string[]): string {
  return lines.length ? `${DEVICE_REPORT_HEADING}\n${lines.join('\n')}` : '';
}

/** Разделитель между текстом человека и абзацем сведений. */
const SEPARATOR = '\n\n';

/**
 * Сколько знаков остаётся на текст человека: предел сервера минус абзац
 * сведений. Считается заранее, чтобы форма сказала «слишком длинно» сама, а
 * не отдала сервер отказать уже после нажатия.
 */
export function messageRoom(report: string): number {
  return report ? SUPPORT_MESSAGE_MAX - report.length - SEPARATOR.length : SUPPORT_MESSAGE_MAX;
}

/** Текст, который уйдёт на сервер. */
export function composeSupportMessage(text: string, report: string): string {
  const body = text.trim();
  return report ? `${body}${SEPARATOR}${report}` : body;
}
