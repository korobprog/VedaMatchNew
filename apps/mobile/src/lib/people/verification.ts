import type { ContactsCardDto } from '@vedamatch/shared';

/**
 * Какие значки подтверждения показывать у карточки/строки человека и в
 * каком порядке — перенос правила с сайта (`components/union/verified-badge.tsx`):
 * преданный подтверждается раньше фото, оба значка независимы друг от друга.
 */
export type VerificationBadgeKind = 'devotee' | 'photo';

/** Подписи значков — те же слова, что видно в `title`/`aria-label` на сайте. */
export const VERIFICATION_BADGE_LABELS: Record<VerificationBadgeKind, string> = {
  devotee: 'Преданный подтверждён администрацией',
  photo: 'Фото проверено администрацией',
};

export function visibleVerificationBadges(
  card: Pick<ContactsCardDto, 'isVerifiedDevotee' | 'isPhotoVerified'>,
): VerificationBadgeKind[] {
  const badges: VerificationBadgeKind[] = [];
  if (card.isVerifiedDevotee) badges.push('devotee');
  if (card.isPhotoVerified) badges.push('photo');
  return badges;
}

/**
 * Подписи значков, готовые встать в общую фразу для скринридера: строка
 * справочника и карточка человека объявляют одной фразой всё сразу — имя,
 * город, значки — а не заставляют переключаться на отдельный узел за каждым
 * значком.
 */
export function verificationA11yParts(card: Pick<ContactsCardDto, 'isVerifiedDevotee' | 'isPhotoVerified'>): string[] {
  return visibleVerificationBadges(card).map((kind) => VERIFICATION_BADGE_LABELS[kind]);
}
