import type { PhotoVerificationState } from '@vedamatch/shared';

interface PhotoVerificationFields {
  photoVerifiedAt: Date | null;
  photoVerificationRequestedAt: Date | null;
}

export function toPhotoVerificationState(
  user: PhotoVerificationFields,
): PhotoVerificationState {
  return {
    status: user.photoVerifiedAt
      ? 'verified'
      : user.photoVerificationRequestedAt
        ? 'requested'
        : 'none',
    requestedAt: user.photoVerificationRequestedAt?.toISOString() ?? null,
    verifiedAt: user.photoVerifiedAt?.toISOString() ?? null,
  };
}

/**
 * Проверка привязана к конкретному набору фото: как только галерея меняется,
 * значок снимается — иначе подтверждённым окажется любое новое изображение.
 */
export const RESET_PHOTO_VERIFICATION = {
  photoVerifiedAt: null,
  photoVerificationRequestedAt: null,
} as const;
