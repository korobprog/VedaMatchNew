/** Лимиты сервиса астрологии. Правятся в админке без передеплоя. */
export interface AstroSettingsDto {
  /** Сервис виден пользователям. Выключение прячет его целиком. */
  enabled: boolean;
  /** Генерация разборов. Выключение оставляет карту и кэш, но не создаёт новых текстов. */
  aiEnabled: boolean;
  dailyReadingsPerUser: number;
  dailyTokensPerUser: number;
  dailyTokenBudget: number;
  /** 0 — денежный лимит не применяется (цены модели могут быть не заданы). */
  dailyCostLimitUsdCents: number;
  transitPushEnabled: boolean;
}

export type UpdateAstroSettingsRequest = Partial<AstroSettingsDto>;

export interface AstroUsageDay {
  /** `YYYY-MM-DD`. */
  day: string;
  tokensIn: number;
  tokensOut: number;
  costUsdCents: number;
  /** В этот день срабатывала аварийная остановка. */
  halted: boolean;
}

export interface AstroTopConsumer {
  userId: string;
  name: string;
  email: string;
  readings: number;
  tokens: number;
}

export interface AstroAdminUsageDto {
  /** По дню на строку, от свежего к старому. */
  days: AstroUsageDay[];
  today: {
    tokensIn: number;
    tokensOut: number;
    costUsdCents: number;
    halted: boolean;
  };
  /** Кто расходует больше всех за период — первый признак злоупотребления. */
  topConsumers: AstroTopConsumer[];
}
