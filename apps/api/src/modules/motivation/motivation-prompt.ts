import { DEFAULT_MOTIVATION_VIDEO_PROMPT } from '@vedamatch/shared';

/**
 * Правила вокруг промптов, которые правит человек.
 *
 * Вынесено из сервисов отдельным модулем: сервисы вокруг этого — обёртки над
 * Prisma, а сами решения (что уйдёт в генерацию, когда черновик пересобирать)
 * — чистая логика, и проверять её надо тестом, а не прогоном пайплайна за
 * деньги провайдера.
 */

/**
 * Потолок длины промпта.
 *
 * Не про «красиво»: у моделей вход ограничен, и слишком длинный текст
 * обрезается уже на их стороне — молча и в непредсказуемом месте. Лучше
 * отказать в админке, где человек ещё видит, что именно он написал.
 */
export const MAX_PROMPT_LENGTH = 4000;

/**
 * Приводит правку в вид, пригодный для базы.
 *
 * Переносы строк сохраняются: промпт иллюстрации собирается абзацами, и
 * склейка их в одну строку сломала бы читаемость правки. `null` означает
 * «человек стёр всё» — вызывающий решает, ошибка это или откат к дефолту.
 */
export function normalizeEditedPrompt(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Промпт длиннее потолка модель всё равно обрежет — отказываем заранее. */
export function isPromptTooLong(prompt: string): boolean {
  return prompt.length > MAX_PROMPT_LENGTH;
}

/**
 * Что уйдёт видеомодели.
 *
 * Пустое поле — это «промпт не задавали», а не «промпт пустой»: провайдер на
 * пустой строке всё равно выставит счёт, поэтому подставляем осмысленный
 * дефолт, а не отправляем как есть.
 */
export function resolveVideoPrompt(raw: string | null | undefined): string {
  return normalizeEditedPrompt(raw) ?? DEFAULT_MOTIVATION_VIDEO_PROMPT;
}

/**
 * Сохранять ли правку промпта при повторном заказе картинки.
 *
 * Правка человека важнее черновика — иначе редактирование было бы бессмысленным:
 * следующая же перегенерация вернула бы автосборку. Исключение одно: сменили
 * стиль. Стиль вшит в текст черновика, и оставить старый текст значило бы
 * проигнорировать выбор в селекте — кнопка «Перегенерировать» тогда вернула бы
 * ту же картинку в том же стиле.
 */
export function shouldKeepEditedImagePrompt(input: {
  editedAt: Date | null;
  currentStyle: string | null;
  requestedStyle: string | null | undefined;
}): boolean {
  if (!input.editedAt) return false;
  const styleChanged =
    Boolean(input.requestedStyle) &&
    input.requestedStyle !== input.currentStyle;
  return !styleChanged;
}
