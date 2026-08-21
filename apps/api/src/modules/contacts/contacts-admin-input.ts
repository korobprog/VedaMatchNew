import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ContactsAdminProfileQuery,
  ContactsTagKind,
  CreateContactsTagRequest,
  UpdateContactsTagRequest,
} from '@vedamatch/shared';

const KINDS: ContactsTagKind[] = ['service', 'profession', 'skill', 'interest'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 60;

export interface NormalizedTagInput {
  nameRu?: string;
  kind?: ContactsTagKind;
  sortOrder?: number;
}

/**
 * Слаг тега. Попадает в фильтры выдачи и в ссылки, поэтому задаётся один раз
 * и проверяется строго — как и слаг сервиса в каталоге портала.
 */
export function assertTagSlug(value: string | undefined): string {
  const slug = value?.trim().toLowerCase() ?? '';
  if (!SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'Слаг: строчные латинские буквы, цифры и дефис',
    );
  }
  return slug;
}

/**
 * Разбор тела запроса на тег. Отсутствующее поле значит «не менять»: правка
 * порядка не должна затирать название.
 */
export function normalizeTagInput(
  body: UpdateContactsTagRequest | CreateContactsTagRequest,
): NormalizedTagInput {
  const data: NormalizedTagInput = {};
  if (!body) return data;

  if (body.nameRu !== undefined) {
    const nameRu = body.nameRu.trim();
    if (!nameRu) throw new BadRequestException('Название обязательно');
    if (nameRu.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `Название не длиннее ${MAX_NAME_LENGTH} символов`,
      );
    }
    data.nameRu = nameRu;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) {
      throw new BadRequestException('Неизвестный вид тега');
    }
    data.kind = body.kind;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      throw new BadRequestException('Порядок — целое число');
    }
    data.sortOrder = sortOrder;
  }
  return data;
}

/**
 * Фильтры списка карточек. Поиск идёт по имени, почте и заголовку: карточку
 * ищут то по человеку, то по тому, что он предлагает.
 */
export function buildProfileWhere(
  query: ContactsAdminProfileQuery,
): Prisma.ContactsProfileWhereInput {
  const where: Prisma.ContactsProfileWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.hiddenOnly) where.visibility = 'hidden';

  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { headline: { contains: q, mode: 'insensitive' } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return where;
}
