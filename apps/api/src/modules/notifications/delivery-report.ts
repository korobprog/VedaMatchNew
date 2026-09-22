import type {
  NotificationDeliveryPointDto,
  NotificationDeliveryPointKind,
} from '@vedamatch/shared';
import {
  deliveryPointState,
  type DeliveryPointHealth,
} from './delivery-health';
import {
  describeAppDevice,
  describeWebSubscription,
} from './delivery-point-label';
import { TELEGRAM_DEVICE_PROVIDER } from './telegram-device';

/**
 * Сборка раздела «Доставка» в админке из строк таблиц (VED-314).
 *
 * Состояния считаются здесь, в одном месте с правилом
 * (`deliveryPointState`), а не условиями в SQL: запрос с переписанным от руки
 * порогом молчания разошёлся бы с правилом на первой же правке порога, и
 * админка показывала бы одно, а доставка делала другое.
 *
 * Цена известна: строки точек доставки читаются целиком, без агрегатов в базе.
 * На портале их десятки, и выборка ограничена сверху (`DELIVERY_ROWS_CAP`) —
 * когда упрёмся, отчёт честно скажет, что показан не весь список.
 */

/** Сколько строк каждой таблицы читаем за раз. */
export const DELIVERY_ROWS_CAP = 2000;

export interface WebSubscriptionRow extends DeliveryPointHealth {
  id: string;
  userId: string;
  userAgent: string | null;
  lastFailureAt: Date | null;
}

export interface AppDeviceRow extends DeliveryPointHealth {
  id: string;
  userId: string;
  provider: string;
  platform: string;
  appVariant: string | null;
  lastFailureAt: Date | null;
}

export interface DeliveryPointsSummary {
  webTotal: number;
  webDead: number;
  webSilent: number;
  appTotal: number;
  appDead: number;
  telegramTotal: number;
}

export interface DeliveryPointsDigest {
  summary: DeliveryPointsSummary;
  /** Точки по людям: у каждого — от одной до нескольких. */
  byUser: Map<string, NotificationDeliveryPointDto[]>;
  /** Кому есть куда доставлять: хотя бы одна не помеченная мёртвой точка. */
  reachableUserIds: Set<string>;
  /** У кого точки есть, но все помечены мёртвыми. */
  deadOnlyUserIds: Set<string>;
}

function toPoint(
  row: DeliveryPointHealth & { id: string; lastFailureAt: Date | null },
  kind: NotificationDeliveryPointKind,
  label: string,
  now: Date,
): NotificationDeliveryPointDto {
  return {
    id: row.id,
    kind,
    label,
    state: deliveryPointState(row, now),
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    failureCount: row.failureCount,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    deadSince: row.deadSince?.toISOString() ?? null,
  };
}

export function buildDeliveryPoints(
  rows: { web: WebSubscriptionRow[]; devices: AppDeviceRow[] },
  now: Date,
): DeliveryPointsDigest {
  const summary: DeliveryPointsSummary = {
    webTotal: 0,
    webDead: 0,
    webSilent: 0,
    appTotal: 0,
    appDead: 0,
    telegramTotal: 0,
  };
  const byUser = new Map<string, NotificationDeliveryPointDto[]>();
  const reachableUserIds = new Set<string>();
  const withPoints = new Set<string>();

  const add = (userId: string, point: NotificationDeliveryPointDto): void => {
    const list = byUser.get(userId);
    if (list) list.push(point);
    else byUser.set(userId, [point]);
    withPoints.add(userId);
    if (point.state !== 'dead') reachableUserIds.add(userId);
  };

  for (const row of rows.web) {
    const point = toPoint(
      row,
      'web',
      describeWebSubscription(row.userAgent),
      now,
    );
    summary.webTotal += 1;
    if (point.state === 'dead') summary.webDead += 1;
    if (point.state === 'silent') summary.webSilent += 1;
    add(row.userId, point);
  }

  for (const row of rows.devices) {
    const telegram = row.provider === TELEGRAM_DEVICE_PROVIDER;
    const point = toPoint(
      row,
      telegram ? 'telegram' : 'app',
      // Вид точки доставки уже сказан рядом («Telegram»), поэтому здесь —
      // имя бота, а не второе слово «Telegram».
      telegram ? '@vedamatch_bot' : describeAppDevice(row),
      now,
    );
    if (telegram) summary.telegramTotal += 1;
    else {
      summary.appTotal += 1;
      if (point.state === 'dead') summary.appDead += 1;
    }
    add(row.userId, point);
  }

  const deadOnlyUserIds = new Set<string>();
  for (const userId of withPoints) {
    if (!reachableUserIds.has(userId)) deadOnlyUserIds.add(userId);
  }

  return { summary, byUser, reachableUserIds, deadOnlyUserIds };
}

/** Худшее состояние человека: по нему он и попадает наверх списка. */
function worstRank(points: NotificationDeliveryPointDto[]): number {
  if (points.some((point) => point.state === 'dead')) return 0;
  if (points.some((point) => point.state === 'silent')) return 1;
  return 2;
}

/** Ни разу не принимавшая точка молчит дольше всех — её время равно нулю. */
function oldestSuccess(points: NotificationDeliveryPointDto[]): number {
  return Math.min(
    ...points.map((point) =>
      point.lastSuccessAt ? Date.parse(point.lastSuccessAt) : 0,
    ),
  );
}

/**
 * Порядок списка людей: сначала те, у кого точки помечены мёртвыми, потом
 * молчащие, внутри — у кого дольше не было приёма. Администратор открывает
 * раздел из-за жалобы, а не ради переписи, поэтому наверху — те, с кем
 * что-то не так.
 */
export function compareDeliveryUsers(
  a: { points: NotificationDeliveryPointDto[] },
  b: { points: NotificationDeliveryPointDto[] },
): number {
  const rank = worstRank(a.points) - worstRank(b.points);
  if (rank !== 0) return rank;
  return oldestSuccess(a.points) - oldestSuccess(b.points);
}
