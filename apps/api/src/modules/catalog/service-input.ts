import { BadRequestException } from '@nestjs/common';
import type {
  ServiceStatus,
  UpdateAdminServiceRequest,
} from '@vedamatch/shared';

const STATUSES: ServiceStatus[] = ['active', 'coming_soon', 'disabled'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Поля, которые администратор правит как есть. */
const FLAGS = [
  'public',
  'seekerVisible',
  'practitionerVisible',
  'yogiVisible',
  'devoteeSelfIdentifiedVisible',
  'devoteeVerifiedVisible',
] as const;

export interface NormalizedServiceInput {
  name?: string;
  nameEn?: string | null;
  description?: string;
  url?: string;
  iconUrl?: string | null;
  status?: ServiceStatus;
  category?: string;
  sortOrder?: number;
  public?: boolean;
  seekerVisible?: boolean;
  practitionerVisible?: boolean;
  yogiVisible?: boolean;
  devoteeSelfIdentifiedVisible?: boolean;
  devoteeVerifiedVisible?: boolean;
}

/**
 * Слаг сервиса. Задаётся один раз и попадает в ссылки, поэтому проверяется
 * строго: только строчные латинские буквы, цифры и дефис между ними.
 */
export function assertServiceSlug(value: string | undefined): string {
  const slug = value?.trim().toLowerCase() ?? '';
  if (!SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'Слаг: строчные латинские буквы, цифры и дефис',
    );
  }
  return slug;
}

/**
 * Разбор тела запроса в поля для базы. Пропускает только то, что пришло:
 * отсутствующее поле означает «не менять», а не «стереть» — иначе правка
 * одного флага обнуляла бы описание.
 */
export function normalizeServiceInput(
  body: UpdateAdminServiceRequest,
): NormalizedServiceInput {
  const data: NormalizedServiceInput = {};
  if (!body) return data;

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) throw new BadRequestException('Имя не может быть пустым');
    data.name = name;
  }
  if (body.nameEn !== undefined) {
    // Пустое английское имя — «показывать русское», а не пустая подпись.
    data.nameEn = body.nameEn?.trim() || null;
  }
  if (body.description !== undefined) {
    const description = body.description.trim();
    if (!description) {
      throw new BadRequestException('Описание не может быть пустым');
    }
    data.description = description;
  }
  if (body.url !== undefined) {
    const url = body.url.trim();
    // Только внутренние адреса: карточка портала ведёт в портал.
    if (!url.startsWith('/')) {
      throw new BadRequestException('Адрес должен начинаться с «/»');
    }
    data.url = url;
  }
  if (body.iconUrl !== undefined) {
    data.iconUrl = body.iconUrl?.trim() || null;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      throw new BadRequestException('Неизвестный статус сервиса');
    }
    data.status = body.status;
  }
  if (body.category !== undefined) {
    const category = body.category.trim();
    if (!category) throw new BadRequestException('Категория обязательна');
    data.category = category;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      throw new BadRequestException('Порядок — целое число');
    }
    data.sortOrder = sortOrder;
  }
  for (const flag of FLAGS) {
    if (body[flag] !== undefined) data[flag] = body[flag] === true;
  }
  return data;
}
