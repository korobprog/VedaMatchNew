// Формулировки справочника «Контакты». Значения энумов пользователю ничего
// не говорят, поэтому подписи собраны в одном месте сервиса.
import type {
  ContactsAshram,
  ContactsFormat,
  ContactsRequestStatus,
  ContactsTagKind,
  ProfileMessengers,
  ProfileSocialLinks,
  SpiritualStage,
} from "@vedamatch/shared";

export const contactsAshramLabels: Record<ContactsAshram, string> = {
  brahmachari: "Брахмачари",
  grihastha: "Грихастха",
  vanaprastha: "Ванапрастха",
  sannyasi: "Санньяси",
};

export const contactsFormatLabels: Record<ContactsFormat, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  any: "Любой",
};

export const contactsStageLabels: Record<SpiritualStage, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

export const contactsTagKindLabels: Record<ContactsTagKind, string> = {
  service: "Служение",
  profession: "Профессия",
  skill: "Навыки",
  interest: "Интересы",
};

export const contactsTagKindOrder: ContactsTagKind[] = [
  "service",
  "profession",
  "skill",
  "interest",
];

/** Тот же набор, что предлагает редактор карточки, — иначе фильтр не совпадёт. */
export const contactsLanguageOptions: string[] = [
  "русский",
  "английский",
  "украинский",
  "испанский",
  "немецкий",
  "французский",
  "хинди",
  "бенгали",
  "санскрит",
];

export const contactsRadiusOptions: number[] = [25, 50, 100, 250, 500, 1000];

/** Что стало с запросом контакта — словами, а не значением энума. */
export const contactsRequestStatusLabels: Record<ContactsRequestStatus, string> =
  {
    pending: "Ждёт ответа",
    accepted: "Контакты открыты",
    declined: "Отказано",
    cancelled: "Отозван",
  };

export const contactsMessengerLabels: Record<keyof ProfileMessengers, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mx: "MX",
  phone: "Телефон",
};

export const contactsSocialLabels: Record<keyof ProfileSocialLinks, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  x: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  vk: "VK",
  tiktok: "TikTok",
  youtube: "YouTube",
  website: "Сайт",
};

/**
 * Дата человеческим текстом. Только день: точное время выдачи доступа
 * в журнале ничего не объясняет, а строку удлиняет.
 */
export function formatContactsDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
