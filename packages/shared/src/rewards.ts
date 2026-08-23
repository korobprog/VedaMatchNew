// Сервис «Баллы и рефералы». См. docs/rewards-service-plan.md.
import type { BillingMode } from './support';

/**
 * Тип операции в леджере. Баланс — сумма `amount` по строкам, отдельной
 * колонки баланса нет: она рассинхронизируется молча, а сумма — никогда.
 *
 * - `welcome` — приглашённому при регистрации по ссылке;
 * - `referral_l1` / `referral_l2` — пригласившему первого и второго уровня;
 * - `admin_revoke` — отмена начисления администратором: отдельная строка со
 *   знаком минус, а не удаление исходной;
 * - `reserve` / `commit` / `release` — двухфазное списание при оплате
 *   абонемента. В режиме `beta` не создаются.
 */
export const REWARDS_LEDGER_TYPES = [
  'welcome',
  'referral_l1',
  'referral_l2',
  'admin_revoke',
  'reserve',
  'commit',
  'release',
] as const;

export type RewardsLedgerType = (typeof REWARDS_LEDGER_TYPES)[number];

/**
 * Где приглашённый в своём пути. `qualified` и `awarded` разъезжаются, когда
 * условие выполнено, но месячный потолок пригласившего уже выбран.
 */
export type RewardsReferralStatus =
  | 'registered'
  | 'qualified'
  | 'awarded'
  | 'rejected';

/** Почему начисление не создано. Причина пишется в журнал подозрений. */
export const REWARDS_FRAUD_REASONS = [
  'self_invite',
  'email_alias',
  'device_match',
  'ip_match',
  'monthly_cap',
] as const;

export type RewardsFraudReason = (typeof REWARDS_FRAUD_REASONS)[number];

/** Баланс, разложенный на части: зарезервированное тратить второй раз нельзя. */
export interface RewardsBalance {
  /** Сумма по всем строкам леджера. */
  total: number;
  /** Сколько сейчас в резерве под неоплаченный счёт. */
  reserved: number;
  /** Чем можно распорядиться: `total - reserved`. */
  available: number;
}

export interface RewardsMeDto extends RewardsBalance {
  /** Короткий читаемый код, уникальный на человека. */
  code: string;
  /** Готовая ссылка на лендинг с этим кодом. */
  link: string;
  mode: BillingMode;
  /** В `beta` — false: тратить пока некуда, эндпоинта списания нет. */
  spendEnabled: boolean;
  /** Сколько начислено за текущий календарный месяц. */
  earnedThisMonth: number;
  /** Потолок начислений в месяц на человека. */
  monthlyCap: number;
  /**
   * Сколько получит приглашённый при регистрации. Уезжает наружу, потому что
   * текст приглашения называет эту сумму: захардкоженная в вебе, она соврала
   * бы в тот же день, когда номинал поправят в админке.
   */
  welcomePoints: number;
  invitedTotal: number;
  qualifiedTotal: number;
}

export interface RewardsReferralDto {
  id: string;
  /** Имя по resolveDisplayName: приглашённого видят как всех остальных. */
  name: string;
  avatarUrl: string | null;
  status: RewardsReferralStatus;
  /** 1 — привёл сам, 2 — привёл приглашённый. */
  level: 1 | 2;
  createdAt: string;
  qualifiedAt: string | null;
  awardedAt: string | null;
  /** Сколько начислено за этого человека; null — ещё не начислено. */
  points: number | null;
}

export interface RewardsLedgerEntryDto {
  id: string;
  type: RewardsLedgerType;
  amount: number;
  comment: string | null;
  referralId: string | null;
  createdAt: string;
  /** Отменена ли эта строка администратором. */
  revoked: boolean;
}

export interface RewardsLedgerResponse {
  items: RewardsLedgerEntryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ===== Админка =====

export interface AdminRewardsSettingsDto {
  levelOnePoints: number;
  levelTwoPoints: number;
  welcomePoints: number;
  monthlyCapPoints: number;
  /** Задержка начисления после выполнения условия, в часах. */
  accrualDelayHours: number;
  /** Сколько дней должно пройти с регистрации приглашённого. */
  qualifyMinDays: number;
  updatedAt: string | null;
}

export type AdminUpdateRewardsSettingsRequest =
  Partial<Omit<AdminRewardsSettingsDto, 'updatedAt'>>;

export interface AdminRewardsLedgerItemDto extends RewardsLedgerEntryDto {
  userId: string;
  /** Мирское имя: админка, а не выдача наружу. */
  userName: string;
  userEmail: string;
}

export interface AdminRewardsLedgerResponse {
  items: AdminRewardsLedgerItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminRewardsLedgerQuery {
  userId?: string;
  type?: RewardsLedgerType;
  /** ISO-дата: строки не старше неё. */
  since?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminRewardsRevokeRequest {
  reason: string;
}

export interface AdminRewardsFraudItemDto {
  id: string;
  reason: RewardsFraudReason;
  inviterId: string | null;
  inviterName: string | null;
  inviteeId: string | null;
  inviteeName: string | null;
  details: string | null;
  createdAt: string;
}

export interface AdminRewardsFraudResponse {
  items: AdminRewardsFraudItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminRewardsTopInviter {
  userId: string;
  name: string;
  invited: number;
  qualified: number;
  points: number;
}

export interface AdminRewardsSummaryDto {
  invitedTotal: number;
  qualifiedTotal: number;
  /** Доля квалифицированных от приглашённых, 0..1. */
  conversion: number;
  pointsAwarded: number;
  pointsRevoked: number;
  fraudSuspicions: number;
  topInviters: AdminRewardsTopInviter[];
  mode: BillingMode;
}

/** Максимальная длина причины отмены: это строка журнала, а не переписка. */
export const REWARDS_REVOKE_REASON_MAX = 300;

/** Cookie с реферальным кодом на вебе; живёт 30 дней. */
export const REWARDS_REF_COOKIE = 'vm_ref';
/** Cookie с отпечатком устройства: нужна антифроду, секретом не является. */
export const REWARDS_DEVICE_COOKIE = 'vm_fp';
/** Сколько живёт реферальная cookie. */
export const REWARDS_REF_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
