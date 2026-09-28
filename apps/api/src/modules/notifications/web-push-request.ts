import { CALL_INCOMING_TTL_SECONDS } from './fcm';

/**
 * Параметры запроса к службе доставки веб-пушей и разбор её отказа (VED-313).
 *
 * Раньше пуш уходил с умолчаниями библиотеки `web-push`: срочность `normal`
 * и срок жизни четыре недели для всего подряд. Для iPhone это две беды сразу.
 * Apple доставляет `normal` в режиме энергосбережения пачками, когда телефону
 * удобно, — сообщение в беседе приходит через полчаса. А входящий звонок,
 * пролежавший у службы доставки, пока телефон был без сети, показывался
 * через час с кнопками «Ответить» и «Отклонить» у давно погасшего вызова.
 *
 * Чистые функции без сети и без Nest: отправитель (`push-sender.service.ts`)
 * только подставляет их результат в `webpush.sendNotification`.
 */

/** Чья служба доставки стоит за подпиской — по хосту её `endpoint`. */
export type PushService = 'apple' | 'fcm' | 'mozilla' | 'microsoft' | 'other';

const SERVICES: Array<[RegExp, PushService]> = [
  // `web.push.apple.com` — Safari на iPhone (только с домашнего экрана),
  // iPad и Mac.
  [/(^|\.)push\.apple\.com$/, 'apple'],
  // Chrome, Edge на Android, Яндекс.Браузер, Opera — все через FCM.
  [/(^|\.)(fcm|android)\.googleapis\.com$/, 'fcm'],
  [/(^|\.)push\.services\.mozilla\.com$/, 'mozilla'],
  [/(^|\.)notify\.windows\.com$/, 'microsoft'],
];

/**
 * Служба доставки подписки. Хост `endpoint` — не секрет (секрет — путь после
 * него), поэтому годится и для логов, и для отчётов по платформам.
 */
export function pushServiceOf(endpoint: string): PushService {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  for (const [pattern, service] of SERVICES) {
    if (pattern.test(host)) return service;
  }
  return 'other';
}

/** Умолчание библиотеки `web-push`, записанное явно. */
const FOUR_WEEKS_SECONDS = 4 * 7 * 24 * 60 * 60;

export interface WebPushRequestOptions {
  /** Сколько секунд служба доставки держит пуш для устройства без сети. */
  TTL: number;
  urgency: 'high';
}

/**
 * Срочность и срок жизни пуша.
 *
 * Срочность — всегда `high`: всё, что портал шлёт в пуш, — ответ живого
 * человека или событие, которого человек ждёт; рассылок «когда-нибудь» среди
 * них нет. `normal` Apple и Google вправе копить до пробуждения устройства.
 *
 * Срок жизни у входящего звонка — те же 45 секунд, что у нативного пуша
 * (`CALL_INCOMING_TTL_SECONDS`): после них вызов погас, и показывать его уже
 * нельзя. У остального — умолчание библиотеки, четыре недели: пропущенное
 * сообщение лучше увидеть поздно, чем не увидеть вовсе.
 */
export function webPushOptions(payload: {
  tag?: unknown;
}): WebPushRequestOptions {
  const isIncomingCall =
    typeof payload.tag === 'string' && payload.tag.startsWith('call:');
  return {
    TTL: isIncomingCall ? CALL_INCOMING_TTL_SECONDS : FOUR_WEEKS_SECONDS,
    urgency: 'high',
  };
}

/**
 * Строка лога об отказе. Apple объясняет отказ в теле ответа
 * (`{"reason":"BadJwtToken"}`), и без этой причины «403» у айфона ничем не
 * отличался от «403» у Chrome — разбирать жалобу «на айфоне не приходит» было
 * не по чему. Тело обрезается: служба доставки вправе вернуть что угодно.
 */
export function describePushFailure(
  service: PushService,
  statusCode: number | undefined,
  body: unknown,
): string {
  const reason = typeof body === 'string' ? body.trim().slice(0, 200) : '';
  return `${service}, ${statusCode ?? 'без кода'}${reason ? `: ${reason}` : ''}`;
}
