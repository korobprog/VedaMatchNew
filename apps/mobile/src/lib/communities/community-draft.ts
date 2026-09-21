import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
  type CommunityJoinPolicy,
  type CommunityKind,
  type CreateCommunityRequest,
  type ProfileLocation,
} from '@vedamatch/shared';

/**
 * Черновик новой общины (ятры, храма, нама-хатты) — та же форма, что на
 * сайте (`apps/web/src/components/communities/community-form.tsx`).
 *
 * Проверки повторяют серверные из
 * `apps/api/src/modules/communities/community-validate.ts` слово в слово:
 * человек должен увидеть одну и ту же формулировку и до отправки, и если
 * сервер всё же откажет.
 */
export const COMMUNITY_ADDRESS_MAX_LENGTH = 300;

export const COMMUNITY_KIND_ORDER: CommunityKind[] = [
  'yatra',
  'temple',
  'ashram',
  'nama_hatta',
  'farm',
  'club',
  'center',
  'project',
];

export const COMMUNITY_JOIN_POLICY_ORDER: CommunityJoinPolicy[] = ['request_approval', 'open', 'invite_only'];

export const COMMUNITY_JOIN_POLICY_LABELS: Record<CommunityJoinPolicy, string> = {
  open: 'Вступают свободно',
  request_approval: 'По заявке',
  invite_only: 'Только по приглашению',
};

export interface CommunityDraft {
  kind: CommunityKind;
  name: string;
  description: string;
  address: string;
  joinPolicy: CommunityJoinPolicy;
  location: ProfileLocation | null;
}

export function emptyCommunityDraft(): CommunityDraft {
  return { kind: 'yatra', name: '', description: '', address: '', joinPolicy: 'request_approval', location: null };
}

/** Город обязателен и должен быть с настоящими координатами — как на сервере. */
export function isValidLocation(location: ProfileLocation | null): boolean {
  if (!location) return false;
  if (!location.city || !location.city.trim()) return false;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return false;
  if (location.lat < -90 || location.lat > 90) return false;
  return location.lon >= -180 && location.lon <= 180;
}

/** Текст ошибки для человека или `null`, если черновик можно отправлять. */
export function validateCommunityDraft(draft: CommunityDraft): string | null {
  if (!draft.name.trim()) return 'Укажите название общины';
  if (draft.name.trim().length > COMMUNITY_NAME_MAX_LENGTH) {
    return `Название длиннее ${COMMUNITY_NAME_MAX_LENGTH} символов`;
  }
  if (draft.description.trim().length > COMMUNITY_DESCRIPTION_MAX_LENGTH) {
    return `Описание длиннее ${COMMUNITY_DESCRIPTION_MAX_LENGTH} символов`;
  }
  if (draft.address.trim().length > COMMUNITY_ADDRESS_MAX_LENGTH) {
    return `Адрес длиннее ${COMMUNITY_ADDRESS_MAX_LENGTH} символов`;
  }
  // Город необязателен на сервере, но община без города не попадёт ни на
  // карту, ни в поиск по городу, поэтому просим его сразу — и только
  // выбранный из подсказок, со своими координатами.
  if (draft.location !== null && !isValidLocation(draft.location)) return 'Город указан неверно';
  return null;
}

export function canSubmitCommunityDraft(draft: CommunityDraft, busy: boolean): boolean {
  return !busy && validateCommunityDraft(draft) === null;
}

export function buildCreateCommunityRequest(draft: CommunityDraft): CreateCommunityRequest {
  return {
    kind: draft.kind,
    name: draft.name.trim(),
    descriptionRu: draft.description.trim() || null,
    address: draft.address.trim() || null,
    location: draft.location,
    joinPolicy: draft.joinPolicy,
  };
}

/**
 * Пора ли дёргать геокодер: меньше двух символов искать нечего, а повторять
 * запрос по уже выбранному городу — тем более (его название и лежит в поле).
 */
export function shouldSearchGeo(query: string, location: ProfileLocation | null): boolean {
  const needle = query.trim();
  if (needle.length < 2) return false;
  return needle !== location?.displayName;
}

/** Подпись выбранного города в форме: «Москва, Россия». */
export function locationLabel(location: ProfileLocation | null): string | null {
  if (!location) return null;
  return location.displayName ?? [location.city, location.country].filter(Boolean).join(', ');
}
