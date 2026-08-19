import { BadRequestException } from '@nestjs/common';
import {
  DONATION_REQUISITE_KINDS,
  type DonationRequisite,
  type DonationSettingsDto,
} from '@vedamatch/shared';

export const MAX_DONATION_TEXT = 600;
export const MAX_DONATION_REQUISITES = 8;
export const MAX_REQUISITE_LABEL = 60;
export const MAX_REQUISITE_VALUE = 200;

/**
 * Реквизиты из JSON-колонки в пригодный для показа вид. Хранилище могло
 * получить что угодно (ручная правка, старый формат), поэтому всё, что не
 * похоже на реквизит, молча отбрасывается, а не роняет страницу.
 */
export function parseStoredRequisites(value: unknown): DonationRequisite[] {
  if (!Array.isArray(value)) return [];
  const result: DonationRequisite[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { kind, label, value: raw } = item as Record<string, unknown>;
    if (
      typeof kind !== 'string' ||
      !(DONATION_REQUISITE_KINDS as readonly string[]).includes(kind) ||
      typeof label !== 'string' ||
      typeof raw !== 'string' ||
      !label.trim() ||
      !raw.trim()
    )
      continue;
    result.push({
      kind: kind as DonationRequisite['kind'],
      label: label.trim(),
      value: raw.trim(),
    });
  }
  return result;
}

/** Проверка входа от админа: пустые строки и чужие виды — ошибка, а не тихая потеря. */
export function validateRequisites(value: unknown): DonationRequisite[] {
  if (!Array.isArray(value))
    throw new BadRequestException('Реквизиты должны быть списком');
  if (value.length > MAX_DONATION_REQUISITES)
    throw new BadRequestException(
      `Не больше ${MAX_DONATION_REQUISITES} реквизитов`,
    );
  return value.map((item, index) => {
    const { kind, label, value: raw } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof kind !== 'string' ||
      !(DONATION_REQUISITE_KINDS as readonly string[]).includes(kind)
    )
      throw new BadRequestException(`Реквизит ${index + 1}: неизвестный вид`);
    const cleanLabel = typeof label === 'string' ? label.trim() : '';
    const cleanValue = typeof raw === 'string' ? raw.trim() : '';
    if (!cleanLabel || cleanLabel.length > MAX_REQUISITE_LABEL)
      throw new BadRequestException(
        `Реквизит ${index + 1}: подпись от 1 до ${MAX_REQUISITE_LABEL} символов`,
      );
    if (!cleanValue || cleanValue.length > MAX_REQUISITE_VALUE)
      throw new BadRequestException(
        `Реквизит ${index + 1}: значение от 1 до ${MAX_REQUISITE_VALUE} символов`,
      );
    if (kind === 'link' && !/^https:\/\/\S+$/i.test(cleanValue))
      throw new BadRequestException(
        `Реквизит ${index + 1}: ссылка должна начинаться с https://`,
      );
    return {
      kind: kind as DonationRequisite['kind'],
      label: cleanLabel,
      value: cleanValue,
    };
  });
}

/**
 * Публичный вид: кнопка «поддержать» показывается только когда включено и
 * есть что показать — пустой список при включённом флаге равен выключенному.
 */
export function toPublicDonation(
  settings: {
    donationEnabled: boolean;
    donationText: string | null;
    donationRequisites: unknown;
  } | null,
): DonationSettingsDto {
  const requisites = parseStoredRequisites(settings?.donationRequisites);
  const enabled = Boolean(settings?.donationEnabled) && requisites.length > 0;
  return {
    enabled,
    text: enabled ? (settings?.donationText ?? '') : '',
    requisites: enabled ? requisites : [],
  };
}
