import type {
  ProfileLocation,
  UnionAdminShowcaseState,
  UnionPrivacySettings,
  UnionShowcaseCard,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { calculateAge } from '../users/age';

/** Сколько карточек показывает витрина. Больше в макет телефона не влезает:
 *  индикатор точек внизу перестаёт читаться, а гость не долистывает. */
export const SHOWCASE_LIMIT = 6;

/** Столько знаков «О себе» помещается в карточку, дальше — многоточие. */
const ABOUT_MAX_LENGTH = 160;

/** Сколько интересов показываем тегами под именем. */
const INTERESTS_LIMIT = 3;

export interface ShowcasePhoto {
  id: string;
  storageKey: string;
  width: number;
  height: number;
}

export interface ShowcaseCandidate {
  showcaseOptIn: boolean;
  showcaseBlockedAt: Date | null;
  isActive: boolean;
  privacy: UnionPrivacySettings | null;
  interests: string[];
  user: {
    id: string;
    name: string;
    spiritualName: string | null;
    about: string | null;
    birthDate: Date | null;
    homeLocation: unknown;
    accountStatus: string;
    photoVerifiedAt: Date | null;
    photos: ShowcasePhoto[];
  };
}

/**
 * Карточка витрины до подписи ссылки на фото: сама подпись — обращение к S3,
 * и держать её здесь значит лишить весь отбор теста.
 */
export interface ShowcaseDraft {
  card: Omit<UnionShowcaseCard, 'photoUrl'>;
  photo: ShowcasePhoto;
}

/**
 * Пускать ли анкету на публичную страницу сервиса и что именно на ней
 * показать. Витрину видят гости и поисковики, поэтому условий больше, чем в
 * рекомендациях, и все они складываются:
 *
 * 1. человек сам отметил согласие — молчание согласием не считается;
 * 2. администрация не снимала анкету с витрины;
 * 3. анкета не скрыта самим человеком и аккаунт не заблокирован;
 * 4. администрация сверила фото с живым человеком — иначе на публичной
 *    странице легко оказывается чужой снимок из интернета;
 * 5. фото открыто настройкой приватности на уровне «everyone»: `after_match`
 *    здесь недостижим, у гостя мэтча быть не может.
 *
 * Возраст и город добавляются в карточку по той же логике «everyone», каждый
 * отдельно: согласие на витрину не отменяет настройки, которые человек уже
 * выставил, а сужается ими.
 */
export function toShowcaseDraft(
  candidate: ShowcaseCandidate,
): ShowcaseDraft | null {
  const { user, privacy } = candidate;
  if (!candidate.showcaseOptIn) return null;
  if (candidate.showcaseBlockedAt) return null;
  if (!candidate.isActive) return null;
  if (user.accountStatus !== 'active') return null;
  if (!user.photoVerifiedAt) return null;
  if (!isPublic(privacy?.photo)) return null;

  const photo = user.photos[0];
  if (!photo) return null;

  const location = (user.homeLocation as ProfileLocation | null) ?? null;
  const cityVisible = isPublic(privacy?.city);
  return {
    card: {
      id: user.id,
      name: resolveDisplayName(user),
      age: isPublic(privacy?.age) ? calculateAge(user.birthDate) : null,
      city: cityVisible ? (location?.city ?? null) : null,
      country: cityVisible ? (location?.country ?? null) : null,
      about: clampAbout(user.about),
      interests: candidate.interests.slice(0, INTERESTS_LIMIT),
    },
    photo,
  };
}

/**
 * Для гостя открыт только уровень «everyone». `after_match` недостижим —
 * у незнакомца нет анкеты, с которой можно совпасть, — а отсутствующая
 * настройка на витрине читается как «не решал», то есть закрыто: значение по
 * умолчанию писалось для участников портала, не для всего интернета.
 */
function isPublic(level: UnionPrivacySettings[keyof UnionPrivacySettings]) {
  return level === 'everyone';
}

function clampAbout(about: string | null): string | null {
  const text = about?.trim();
  if (!text) return null;
  if (text.length <= ABOUT_MAX_LENGTH) return text;
  return `${text.slice(0, ABOUT_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Как витрина выглядит из админки. Снятие администрацией и отсутствие
 * согласия — разные состояния: во втором случае человека не за что
 * восстанавливать, он просто не соглашался.
 */
export function toShowcaseState(profile: {
  showcaseOptIn: boolean;
  showcaseBlockedAt: Date | null;
}): UnionAdminShowcaseState {
  if (profile.showcaseBlockedAt) return 'blocked';
  return profile.showcaseOptIn ? 'on' : 'off';
}
