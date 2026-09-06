import type { SelfIdentificationAnswers, SpiritualStage } from './index';

/**
 * Этап пути по ответам анкеты самоидентификации.
 *
 * Живёт в общем пакете, а не только в API: анкета показывает выбор духовной
 * линии сразу, как только ответы складываются в «преданного», — до отправки.
 * Считать это второй копией правил на вебе нельзя: разошедшись, форма
 * спрашивала бы линию у йога и молчала бы у преданного. Сервер по-прежнему
 * решает сам, вызывая ту же функцию.
 */
export function detectSpiritualStage(
  answers: SelfIdentificationAnswers,
): SpiritualStage {
  const devoteeSignals = [
    answers.hasMentor,
    answers.hasCommunity,
    answers.hasSpiritualName,
    answers.participatesInService,
    answers.interest === 'devotional_service',
    answers.currentFocus === 'service_community',
    answers.regularPractice === 'strict_daily',
  ].filter(Boolean).length;

  if (devoteeSignals >= 4) return 'devotee';
  if (
    answers.regularPractice === 'daily' ||
    answers.regularPractice === 'strict_daily' ||
    answers.interest === 'deepening' ||
    answers.currentFocus === 'deep_practice'
  ) {
    return 'yogi';
  }
  if (
    answers.regularPractice === 'sometimes' ||
    answers.interest === 'learning' ||
    answers.currentFocus === 'basic_practice'
  ) {
    return 'practitioner';
  }
  return 'seeker';
}
