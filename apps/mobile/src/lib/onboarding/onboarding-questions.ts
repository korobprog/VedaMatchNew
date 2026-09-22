import type { Gender, SelfIdentificationAnswers } from '@vedamatch/shared';

/**
 * Формулировки анкеты самоидентификации. Вынесены из экрана, потому что
 * обязаны совпадать до буквы с формой сайта
 * (`apps/web/src/components/self-identification-questions.tsx`): этап пути
 * считается по ответам, и разошедшийся текст означал бы, что человек
 * отвечает на разные вопросы в зависимости от того, откуда зашёл. Тест
 * рядом сторожит именно совпадение наборов.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export const GENDER_OPTIONS: readonly Choice<Gender>[] = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
];

export const INTEREST_QUESTION = {
  label: 'Как бы вы описали свой интерес к самоосознанию?',
  options: [
    { value: 'beginning', label: 'Только начинаю интересоваться' },
    { value: 'learning', label: 'Изучаю основы и пробую применять' },
    { value: 'deepening', label: 'Углубляю регулярную практику' },
    { value: 'devotional_service', label: 'Живу практикой, служением и общиной' },
  ] as readonly Choice<SelfIdentificationAnswers['interest']>[],
} as const;

export const PRACTICE_QUESTION = {
  label: 'Есть ли у вас регулярная духовная практика?',
  options: [
    { value: 'none', label: 'Пока нет' },
    { value: 'sometimes', label: 'Иногда' },
    { value: 'daily', label: 'Ежедневно' },
    { value: 'strict_daily', label: 'Строго и ежедневно' },
  ] as readonly Choice<SelfIdentificationAnswers['regularPractice']>[],
} as const;

export const FOCUS_QUESTION = {
  label: 'Что вам сейчас ближе всего?',
  options: [
    { value: 'curiosity', label: 'Понять, подходит ли мне этот путь' },
    { value: 'basic_practice', label: 'Освоить базовую практику' },
    { value: 'deep_practice', label: 'Углубить практику' },
    { value: 'service_community', label: 'Служение и жизнь в общине' },
  ] as readonly Choice<SelfIdentificationAnswers['currentFocus']>[],
} as const;

/** Поля-галочки анкеты: ключ и подпись, порядок — как в форме сайта. */
export type AnswerFlag = 'hasMentor' | 'hasCommunity' | 'hasSpiritualName' | 'participatesInService' | 'wantsRecommendations';

export const FLAG_QUESTIONS: readonly { key: AnswerFlag; label: string }[] = [
  { key: 'hasMentor', label: 'Есть наставник' },
  { key: 'hasCommunity', label: 'Есть связь с общиной' },
  { key: 'hasSpiritualName', label: 'Есть духовное имя' },
  { key: 'participatesInService', label: 'Участвую в служении' },
  { key: 'wantsRecommendations', label: 'Хочу получать рекомендации по развитию' },
];
