/**
 * Что не должно уехать в магазинную сборку (VED-207).
 *
 * Правила витрин живут в `docs/mobile-app-store-links.md`; здесь — та их
 * часть, которую можно проверить машиной, а не глазами ревьюера: строки в
 * коде, который попадает в бандл `APP_CHANNEL=store`, и разрешения Android
 * в собранном `app.config.ts`.
 *
 * Чего проверка НЕ делает (остаётся за VED-216, вручную): смысл текстов и
 * картинок, содержимое постов бота и канала новостей, ссылки, приходящие с
 * сервера (`GET /services` отдаёт названия и адреса из админки — в коде их
 * нет), соответствие описанию в консоли витрины.
 *
 * Модуль чистый: принимает текст и списки, файловую систему не трогает.
 */

import type { AppCapabilities } from './capabilities';
import { stripComments } from './source-text';

/**
 * Разрешения Android, которых в манифесте магазинной сборки быть не должно.
 * REQUEST_INSTALL_PACKAGES Google Play проверяет отдельной декларацией
 * назначения и не пропускает приложению, которое на этом канале и не умеет
 * ставить APK (`app.config.ts`, VED-176).
 */
export const STORE_FORBIDDEN_PERMISSIONS: readonly string[] = [
  'android.permission.REQUEST_INSTALL_PACKAGES',
];

/**
 * Человеческое имя возможности — для текста упавшей проверки. Живёт здесь, а
 * не рядом с таблицей: `capabilities.ts` попадает в бандл обеих сборок, а эти
 * строки состоят из слов, которые проверка в бандле витрины и ищет. Этот
 * модуль в граф приложения не входит — его импортируют только тесты.
 */
export const CAPABILITY_LABELS: Record<keyof AppCapabilities, string> = {
  selfUpdate: 'самообновление с сайта',
  inAppPayments: 'оплата и подписка в приложении',
  paidWebLinks: 'ссылки на платные разделы сайта',
  apkDownloadPrompt: 'предложение скачать APK с сайта',
  siteServiceLinks: 'ссылки на бесплатные разделы сайта',
};

export function findForbiddenPermissions(permissions: readonly string[]): string[] {
  return STORE_FORBIDDEN_PERMISSIONS.filter((name) => permissions.includes(name));
}

export interface ForbiddenPattern {
  /** Короткое имя для сообщения об ошибке. */
  id: string;
  /** Возможность канала, которой этот текст принадлежит. */
  capability: keyof AppCapabilities;
  /** Без флага `g`: регулярка переиспользуется между файлами. */
  pattern: RegExp;
  /** Почему это нельзя в магазинной сборке. */
  why: string;
}

/**
 * Строки, по которым видно запрещённую возможность. Ищутся в исходниках
 * модулей, достижимых из точки входа сборки `store` (`module-graph.ts`), —
 * то есть ровно в том, что попадёт в бандл.
 *
 * Список намеренно про конкретные слова, а не про «что-то про деньги»:
 * ловить надо не абстракцию, а то, что реально напишет человек, добавляя
 * экран тарифа или кнопку «скачать полную версию». Поэтому здесь нет,
 * например, слова «подписка» — в переписке им называют подписку на канал
 * общины (`app/communities/[id].tsx`), и правило било бы по невиновным.
 */
export const STORE_FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  {
    id: 'цена в рублях',
    capability: 'inAppPayments',
    pattern: /₽|\bRUB\b|руб\.?\s*\/\s*мес/i,
    why: 'цена цифровой подписки в интерфейсе — прямое нарушение правил платежей обеих витрин',
  },
  {
    id: 'цена в криптовалюте',
    capability: 'inAppPayments',
    pattern: /\bUSDT\b|криптокошел/i,
    why: 'оплата мимо витрины',
  },
  {
    id: 'тариф',
    capability: 'inAppPayments',
    pattern: /тариф/i,
    why: 'экран тарифа — точка входа в оплату (VED-209), в магазинной сборке его нет',
  },
  {
    id: 'призыв оплатить',
    capability: 'inAppPayments',
    pattern: /оплат[аиуеы]|оплатить|оформить\s+подписку|продлить\s+доступ|купить/i,
    why: 'Apple 3.1.3 и Google Play Payments запрещают поощрять оплату мимо витрины',
  },
  {
    id: 'ссылка на платный раздел сайта',
    capability: 'paidWebLinks',
    pattern: /\/(?:billing|tariffs?|pricing|payments?|checkout)\b/i,
    why: 'ссылка на платный раздел сайта приравнивается к призыву оплатить мимо витрины',
  },
  {
    id: 'предложение скачать APK',
    capability: 'apkDownloadPrompt',
    pattern: /\bAPK\b|скача(?:ть|йте)\s+(?:полную|приложение)/i,
    why: 'уводить ставить приложение мимо витрины запрещает Spam and Minimum Functionality',
  },
  {
    id: 'установка пакетов',
    capability: 'selfUpdate',
    pattern: /INSTALL_PACKAGES?\b|vnd\.android\.package-archive/,
    why: 'самообновления на канале store нет, установщик в бандл попадать не должен',
  },
  {
    id: 'манифест самообновления',
    capability: 'selfUpdate',
    pattern: /latest\.json|mobile\/android\//,
    why: 'адрес раздачи APK с сайта в магазинной сборке не нужен и виден при распаковке',
  },
];

export interface TextFinding {
  file: string;
  id: string;
  capability: keyof AppCapabilities;
  why: string;
  /** Кусок строки, на которой сработало правило, — чтобы не искать вручную. */
  sample: string;
}

/**
 * Находки в одном файле: не больше одной на правило — сообщение об ошибке
 * должно называть проблему, а не печатать весь файл.
 */
export function findForbiddenText(
  file: string,
  rawSource: string,
  patterns: readonly ForbiddenPattern[] = STORE_FORBIDDEN_PATTERNS,
): TextFinding[] {
  // Комментарии не код: в релизный бандл они не попадают, а описание правила
  // — ровно те слова, которые правило запрещает (см. `source-text.ts`).
  const source = stripComments(rawSource);
  const findings: TextFinding[] = [];
  for (const rule of patterns) {
    const match = rule.pattern.exec(source);
    if (!match) continue;
    const start = Math.max(0, match.index - 30);
    findings.push({
      file,
      id: rule.id,
      capability: rule.capability,
      why: rule.why,
      sample: source.slice(start, match.index + match[0].length + 30).replace(/\s+/g, ' ').trim(),
    });
  }
  return findings;
}

/** Текст для `expect(...).toEqual([])`: человек должен понять, что чинить. */
export function describeFindings(findings: readonly TextFinding[]): string {
  return findings
    .map((f) => `${f.file}: «${f.id}» (возможность ${f.capability}) — ${f.why}\n    …${f.sample}…`)
    .join('\n');
}
