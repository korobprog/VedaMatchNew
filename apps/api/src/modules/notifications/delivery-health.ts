/**
 * Живость точки доставки: веб-подписки браузера и телефона с приложением
 * (VED-314).
 *
 * Чего измерение стоит. `delivered` в логах доставки означает «служба доставки
 * приняла сообщение», а не «человек увидел». Браузер, который не открывали
 * месяц, принимает пуш ровно так же, как живой, поэтому «доставлено 6 из 6»
 * соседствовало с жалобой «не приходят пуши». Сервер честно знает только три
 * вещи, и все три собраны здесь:
 *
 * - служба доставки приняла пуш (`lastSuccessAt`);
 * - служба доставки отказала, и сколько раз подряд (`failureCount`);
 * - сам клиент подтвердил подписку при загрузке страницы или запуске
 *   приложения (`lastSeenAt`) — единственный сигнал, идущий не от посредника.
 *
 * Правило намеренно осторожное. Раньше подписка удалялась только по ответу
 * `gone` — и всё остальное копилось годами. Теперь у неудач есть конец, но не
 * мгновенный: сначала подписка ПОМЕЧАЕТСЯ (`deadSince`) и видна такой в
 * админке, и лишь через отсрочку удаляется. Потерять живую подписку человека,
 * который был в отпуске, дороже, чем подержать лишнюю строку.
 */

/** Сколько молчания считается подозрительным. Месяц — обычный отпуск. */
export const DELIVERY_SILENCE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Сколько отказов подряд нужно, чтобы молчание перестало быть случайным.
 * Одного мало: 500 от пуш-сервиса и обрыв сети — рядовые события, и по одному
 * такому ответу подписка живого браузера ушла бы в мёртвые.
 */
export const DELIVERY_FAILURE_STREAK = 3;

/**
 * Отсрочка между «помечено» и «удалено». Две недели: за это время человек
 * успевает открыть портал (и подписка оживёт сама), а администратор — увидеть
 * пометку в разделе доставки.
 */
export const DELIVERY_MARK_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Состояние точки доставки в отчётах. */
export type DeliveryPointState =
  /** Приняла пуш или подтверждена клиентом недавно. */
  | 'alive'
  /** Ни одного успеха за срок молчания, но и в мёртвые записывать не за что. */
  | 'silent'
  /** Правило сочло мёртвой: `deadSince` выставлен, идёт отсрочка до удаления. */
  | 'dead';

/** Что сделать с точкой доставки после попытки отправки. */
export type DeliveryVerdict =
  /** Оставить как есть. */
  | 'keep'
  /** Выставить `deadSince` — но не удалять. */
  | 'mark'
  /** Пометка стоит дольше отсрочки: строку можно убрать. */
  | 'delete';

/** Отметки живости одной точки доставки — колонки `PushSubscription`
 *  и `NotificationDevice` один в один. */
export interface DeliveryPointHealth {
  /** Когда точка появилась: до первого успеха отсчёт молчания идёт от неё. */
  createdAt: Date;
  lastSuccessAt: Date | null;
  failureCount: number;
  /** Подтверждение от самого клиента; у строк до VED-314 его нет. */
  lastSeenAt: Date | null;
  deadSince: Date | null;
}

/**
 * Молчит ли точка доставки: сколько прошло с последнего успеха, а если успеха
 * не было ни разу — с её появления.
 */
function silentFor(point: DeliveryPointHealth, now: Date): number {
  const since = point.lastSuccessAt ?? point.createdAt;
  return now.getTime() - since.getTime();
}

/** Клиент сам объявлялся недавно — значит он жив, что бы ни говорил посредник. */
function confirmedByClient(point: DeliveryPointHealth, now: Date): boolean {
  if (!point.lastSeenAt) return false;
  return now.getTime() - point.lastSeenAt.getTime() < DELIVERY_SILENCE_MS;
}

/**
 * Мёртвая — это молчание дольше срока И неудачи подряд одновременно.
 *
 * Только молчания недостаточно: подписке, которой ни разу ничего не
 * отправляли, молчать нечем, и по одному этому признаку в мёртвые ушли бы все
 * подписки людей, о которых просто нечего было сообщить.
 *
 * Только неудач тоже недостаточно: три отказа подряд у подписки, которая
 * принимала пуш вчера, — это сбой на стороне пуш-сервиса, а не мёртвый
 * браузер.
 */
function looksDead(point: DeliveryPointHealth, now: Date): boolean {
  if (confirmedByClient(point, now)) return false;
  return (
    silentFor(point, now) >= DELIVERY_SILENCE_MS &&
    point.failureCount >= DELIVERY_FAILURE_STREAK
  );
}

/**
 * Решение о судьбе точки доставки. Вызывается после неудачной попытки — с уже
 * увеличенным `failureCount`, каким он будет в базе.
 *
 * Успех сюда не заходит: он снимает пометку и обнуляет счётчик сам, без
 * правил, — принятый пуш и есть доказательство жизни.
 */
export function judgeDeliveryPoint(
  point: DeliveryPointHealth,
  now: Date,
): DeliveryVerdict {
  if (!looksDead(point, now)) return 'keep';
  if (!point.deadSince) return 'mark';
  return now.getTime() - point.deadSince.getTime() >= DELIVERY_MARK_GRACE_MS
    ? 'delete'
    : 'keep';
}

/**
 * Состояние для отчётов админки. Пометка важнее прочего: раз правило её
 * поставило, администратор должен видеть именно её, а не «молчит».
 */
export function deliveryPointState(
  point: DeliveryPointHealth,
  now: Date,
): DeliveryPointState {
  if (point.deadSince) return 'dead';
  if (confirmedByClient(point, now)) return 'alive';
  return silentFor(point, now) >= DELIVERY_SILENCE_MS ? 'silent' : 'alive';
}
