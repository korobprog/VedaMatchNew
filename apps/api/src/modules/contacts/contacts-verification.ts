import type {
  DevoteeVerificationStatus,
  SpiritualStage,
} from '@vedamatch/shared';

/**
 * «Подтверждённый — этап `devotee`, подтверждённый администрацией.
 * Промежуточные статусы верификации наружу не отдаются: в справочнике это
 * булев сигнал доверия, а не история заявки.
 *
 * Своя копия проверки, а не импорт из `union`: контракт сервисного модуля
 * запрещает зависеть от кода другого сервиса. Правило крошечное и стабильное,
 * дублирование дешевле связанности.
 */
export function isVerifiedDevotee(user: {
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
}): boolean {
  return (
    user.spiritualStage === 'devotee' &&
    user.devoteeVerificationStatus === 'confirmed'
  );
}
