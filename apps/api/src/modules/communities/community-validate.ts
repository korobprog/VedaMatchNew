import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
  COMMUNITY_MEMBER_TITLE_MAX_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
  type CommunityJoinPolicy,
  type CommunityKind,
  type CommunityMemberRole,
  type CommunityStatus,
  type ProfileLocation,
  type UpdateCommunityRequest,
} from '@vedamatch/shared';

export const COMMUNITY_KINDS: CommunityKind[] = [
  'yatra',
  'temple',
  'ashram',
  'nama_hatta',
  'farm',
  'club',
  'center',
  'project',
];

export const COMMUNITY_JOIN_POLICIES: CommunityJoinPolicy[] = [
  'open',
  'request_approval',
  'invite_only',
];

/**
 * Статусы, которые владелец/админ общины меняет сам через PATCH. Остальные
 * (`pending`, `removed_by_admin`, …) — решение администрации портала, и
 * принимать их из тела запроса нельзя, иначе Prisma упадёт 500 на неизвестном
 * значении или, хуже, община сама выйдет из-под модерации.
 */
export const COMMUNITY_EDITABLE_STATUSES: NonNullable<
  UpdateCommunityRequest['status']
>[] = ['active', 'paused', 'archived'];

export const COMMUNITY_MEMBER_ROLES: CommunityMemberRole[] = [
  'owner',
  'admin',
  'moderator',
  'member',
];

export const MAX_ADDRESS_LENGTH = 300;

export type CommunityValidationError =
  | 'name_required'
  | 'name_too_long'
  | 'description_too_long'
  | 'address_too_long'
  | 'kind_invalid'
  | 'join_policy_invalid'
  | 'location_invalid'
  | 'status_invalid'
  | 'role_invalid'
  | 'title_too_long';

export function isEditableCommunityStatus(
  value: unknown,
): value is CommunityStatus {
  return (COMMUNITY_EDITABLE_STATUSES as unknown[]).includes(value);
}

export function isCommunityMemberRole(
  value: unknown,
): value is CommunityMemberRole {
  return (COMMUNITY_MEMBER_ROLES as unknown[]).includes(value);
}

export interface CommunityValidationInput {
  kind?: CommunityKind | null;
  name?: string | null;
  description?: string | null;
  address?: string | null;
  joinPolicy?: CommunityJoinPolicy | null;
  location?: ProfileLocation | null;
}

/**
 * Правила карточки общины. Возвращает первую нарушенную, а не список: форма
 * на вебе подсвечивает поля сама, а серверу достаточно отказать — тот же
 * приём, что в market-listing-validate.ts.
 *
 * `requireName` разводит создание и правку: при `PATCH` имя может не
 * приходить вовсе, и это не значит «стереть имя».
 */
export function validateCommunity(
  input: CommunityValidationInput,
  { requireName }: { requireName: boolean },
): CommunityValidationError | null {
  const name = input.name?.trim();
  if (requireName || input.name !== undefined) {
    if (!name) return 'name_required';
    if (name.length > COMMUNITY_NAME_MAX_LENGTH) return 'name_too_long';
  }
  if (
    input.description &&
    input.description.length > COMMUNITY_DESCRIPTION_MAX_LENGTH
  )
    return 'description_too_long';
  if (input.address && input.address.length > MAX_ADDRESS_LENGTH)
    return 'address_too_long';
  if (input.kind !== undefined && input.kind !== null) {
    if (!COMMUNITY_KINDS.includes(input.kind)) return 'kind_invalid';
  } else if (requireName) {
    // Тип обязателен при создании: от него зависят иконка и подсказки формы.
    return 'kind_invalid';
  }
  if (
    input.joinPolicy !== undefined &&
    input.joinPolicy !== null &&
    !COMMUNITY_JOIN_POLICIES.includes(input.joinPolicy)
  )
    return 'join_policy_invalid';
  if (input.location && !isValidLocation(input.location))
    return 'location_invalid';
  return null;
}

/**
 * Локация приходит от клиента, а не от геокодера напрямую, поэтому проверяем
 * её целиком: половина координаты хуже отсутствующей — она поставит метку
 * в Гвинейский залив.
 */
export function isValidLocation(location: ProfileLocation): boolean {
  if (typeof location.city !== 'string' || !location.city.trim()) return false;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon))
    return false;
  if (location.lat < -90 || location.lat > 90) return false;
  if (location.lon < -180 || location.lon > 180) return false;
  return true;
}

export function validateMemberTitle(
  title: string | null | undefined,
): CommunityValidationError | null {
  if (title && title.length > COMMUNITY_MEMBER_TITLE_MAX_LENGTH)
    return 'title_too_long';
  return null;
}

/** Человекочитаемые сообщения: коды наружу не отдаются. */
export const COMMUNITY_VALIDATION_MESSAGES: Record<
  CommunityValidationError,
  string
> = {
  name_required: 'Укажите название общины',
  name_too_long: `Название длиннее ${COMMUNITY_NAME_MAX_LENGTH} символов`,
  description_too_long: `Описание длиннее ${COMMUNITY_DESCRIPTION_MAX_LENGTH} символов`,
  address_too_long: `Адрес длиннее ${MAX_ADDRESS_LENGTH} символов`,
  kind_invalid: 'Выберите тип общины',
  join_policy_invalid: 'Неизвестный порядок вступления',
  location_invalid: 'Город указан неверно',
  status_invalid: 'Недопустимый статус общины',
  role_invalid: 'Неизвестная роль участника',
  title_too_long: `Служение длиннее ${COMMUNITY_MEMBER_TITLE_MAX_LENGTH} символов`,
};
