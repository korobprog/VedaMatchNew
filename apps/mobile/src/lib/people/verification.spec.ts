import { VERIFICATION_BADGE_LABELS, verificationA11yParts, visibleVerificationBadges } from './verification';

describe('visibleVerificationBadges', () => {
  it('ничего не показывает без подтверждений', () => {
    expect(visibleVerificationBadges({ isVerifiedDevotee: false, isPhotoVerified: false })).toEqual([]);
  });

  it('преданный идёт раньше фото, каждый значок независим', () => {
    expect(visibleVerificationBadges({ isVerifiedDevotee: true, isPhotoVerified: false })).toEqual(['devotee']);
    expect(visibleVerificationBadges({ isVerifiedDevotee: false, isPhotoVerified: true })).toEqual(['photo']);
    expect(visibleVerificationBadges({ isVerifiedDevotee: true, isPhotoVerified: true })).toEqual(['devotee', 'photo']);
  });
});

describe('verificationA11yParts', () => {
  it('переводит значки в подписи для скринридера в том же порядке', () => {
    expect(verificationA11yParts({ isVerifiedDevotee: true, isPhotoVerified: true })).toEqual([
      VERIFICATION_BADGE_LABELS.devotee,
      VERIFICATION_BADGE_LABELS.photo,
    ]);
    expect(verificationA11yParts({ isVerifiedDevotee: false, isPhotoVerified: false })).toEqual([]);
  });
});
