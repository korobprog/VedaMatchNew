import { BadRequestException } from '@nestjs/common';
import {
  TRAVEL_MAP_GUIDE_ABOUT_MAX,
  TRAVEL_MAP_GUIDE_CITIES_MAX,
  TRAVEL_MAP_GUIDE_LANGUAGES_MAX,
} from '@vedamatch/shared';
import { parseTelegram } from './map-input';

/** Поля профиля экскурсовода, готовые к записи в `TravelMapGuide`. */
export interface GuideFields {
  about: string;
  languages: string[];
  cities: string[];
  telegram: string | null;
  phone: string | null;
}

const ITEM_MAX = 40;
const PHONE_MAX = 30;

/**
 * Список коротких строк без дублей. Дубли схлопываем молча, а не отказываем:
 * форма с чипами легко даёт «Москва» дважды, и ошибка тут никому не нужна.
 */
function parseList(value: unknown, field: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException(`Поле «${field}» должно быть списком`);
  }
  const out: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') {
      throw new BadRequestException(
        `Поле «${field}»: элементы должны быть текстом`,
      );
    }
    const trimmed = item.trim();
    if (trimmed.length < 1 || trimmed.length > ITEM_MAX) {
      throw new BadRequestException(
        `Поле «${field}»: каждый элемент от 1 до ${ITEM_MAX} знаков`,
      );
    }
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  if (out.length > max) {
    throw new BadRequestException(
      `Поле «${field}»: не больше ${max} элементов`,
    );
  }
  return out;
}

function parsePhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('Поле «телефон» должно быть текстом');
  }
  const trimmed = value.trim();
  if (trimmed.length > PHONE_MAX) {
    throw new BadRequestException(`Поле «телефон» длиннее ${PHONE_MAX} знаков`);
  }
  return trimmed || null;
}

export function parseGuideInput(body: unknown): GuideFields {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Тело запроса должно быть объектом');
  }
  const input = body as Record<string, unknown>;
  const rawAbout = input.about ?? '';
  if (typeof rawAbout !== 'string') {
    throw new BadRequestException('Поле «о себе» должно быть текстом');
  }
  const about = rawAbout.trim();
  if (about.length > TRAVEL_MAP_GUIDE_ABOUT_MAX) {
    throw new BadRequestException(
      `Поле «о себе» длиннее ${TRAVEL_MAP_GUIDE_ABOUT_MAX} знаков`,
    );
  }
  return {
    about,
    languages: parseList(
      input.languages,
      'языки',
      TRAVEL_MAP_GUIDE_LANGUAGES_MAX,
    ),
    cities: parseList(input.cities, 'города', TRAVEL_MAP_GUIDE_CITIES_MAX),
    telegram: parseTelegram(input.telegram),
    phone: parsePhone(input.phone),
  };
}
