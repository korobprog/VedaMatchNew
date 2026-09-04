import type { AdminServiceSlug, DevoteeVerificationStatus, Gender, Role, SpiritualStage, StageChangeActor, UserAccountStatus } from '@vedamatch/shared';

/** Пол. Необязателен у `User`, поэтому «не указан» показывается прочерком. */
export const genderLabels: Record<Gender, string> = {
  male: 'Мужской',
  female: 'Женский',
};

export const roleLabels: Record<Role, string> = {
  user: 'Пользователь',
  admin: 'Администратор',
  'service-admin': 'Админ сервиса',
};

/** Названия сервисов в форме выдачи прав администратору сервиса. */
export const adminServiceLabels: Record<AdminServiceSlug, string> = {
  auth: 'Вход — способы входа на портал',
  union: 'Union — знакомства',
  chat: 'Chat — общение',
  market: 'Market — объявления и магазины',
  motivation: 'Motivation — цитаты и ролики',
  library: 'Library — библиотека',
  notices: 'Notices — доска объявлений',
  astro: 'Astro — ведическая астрология',
  vedabase: 'Vedabase — священные тексты',
  music: 'Music — киртаны и бхаджаны',
};

export const stageLabels: Record<SpiritualStage, string> = {
  seeker: 'Ищущий',
  practitioner: 'Практикующий основы',
  yogi: 'Йог',
  devotee: 'Преданный',
};

export const verificationLabels: Record<DevoteeVerificationStatus, string> = {
  self_identified: 'Самоопределён',
  awaiting_mentor: 'Ожидает наставника',
  mentor_submitted: 'Наставник заполнил форму',
  awaiting_admin: 'Ожидает администратора',
  confirmed: 'Подтверждён',
  rejected: 'Отклонён',
  needs_clarification: 'Требует уточнения',
};

export const actorLabels: Record<StageChangeActor, string> = {
  system: 'Система',
  user: 'Пользователь',
  admin: 'Администратор',
};

export const accountStatusLabels: Record<UserAccountStatus, string> = {
  active: 'Активен',
  blocked: 'Заблокирован',
  deleted: 'Удалён',
};

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export function formatBool(value: boolean | null | undefined) {
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  return '—';
}
