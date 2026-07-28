import type {
  DevoteeVerificationStatus,
  SpiritualStage,
} from '@vedamatch/shared';

/**
 * Значок «Проверен» получают только преданные, чей статус подтвердила
 * администрация. Наружу отдаём булево (UnionUserSummary.isVerifiedDevotee),
 * чтобы промежуточные статусы верификации не утекали в карточки знакомств.
 *
 * Живёт в API, а не в @vedamatch/shared: пакет отдаётся как TS-исходники и
 * подключается только типами — рантайм-импорт из него уронил бы сборку Nest.
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
