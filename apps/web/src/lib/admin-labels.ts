import type { DevoteeVerificationStatus, Role, SpiritualStage, StageChangeActor } from '@vedamatch/shared';

export const roleLabels: Record<Role, string> = {
  user: 'Пользователь',
  admin: 'Администратор',
  'service-admin': 'Админ сервиса',
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

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export function formatBool(value: boolean | null | undefined) {
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  return '—';
}
