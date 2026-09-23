/**
 * Разбор исходников экранов: где есть поле ввода и поднимается ли оно над
 * клавиатурой (VED-335, третий заход).
 *
 * Правило «поле в фокусе должно быть видно» до этого держалось на глаз, и
 * ровно поэтому дважды поймано пользователем на живом телефоне: сначала в
 * ручном вводе штрихкода, потом в названии продукта. Оба раза экран был
 * собран на обычном `ScrollView`/`View`, который про клавиатуру не знает
 * ничего.
 *
 * Устроено как `hit-target-scan.ts`: разбор узкий, без догадок, а сам охват
 * сторожится отдельным тестом — сломанная регулярка иначе означала бы
 * «нарушений не найдено», то есть зелёный тест, который ничего не проверяет.
 *
 * Чего разбор НЕ видит, и это осознанно: поле, спрятанное в чужой компонент
 * без `TextInput` в самом файле экрана. Такие ловятся только глазами, и
 * именно поэтому у формы ручного ввода поле объявлено в её собственном файле.
 */

/** Обёртки, которые в этом проекте действительно поднимают поле. */
export const KEYBOARD_SAFE_WRAPPERS = [
  'PersonKeyboardAwareScroll',
  'ChatKeyboardAvoidingView',
  'KeyboardAwareScrollView',
  'KeyboardAvoidingView',
] as const;

export interface KeyboardScanResult {
  /** Есть ли в файле собственное поле ввода. */
  hasInput: boolean;
  /** Упомянута ли хотя бы одна принятая обёртка. */
  hasWrapper: boolean;
  /** Имена найденных обёрток — для внятного сообщения теста. */
  wrappers: string[];
}

export function scanKeyboardSafety(source: string): KeyboardScanResult {
  // Поле ввода: только собственный `<TextInput`, не упоминание в комментарии.
  const hasInput = /<TextInput[\s/>]/.test(source);
  // Обёртка засчитывается только по РАЗМЕТКЕ, а не по импорту: оставшийся
  // импорт после замены обёртки на голый `ScrollView` иначе молча проходит
  // сторожа — ровно эту дыру поймала мутация. Имена обёрток в проекте
  // приходят через алиасы (`ChatKeyboardAvoidingView as KeyboardAvoidingView`),
  // поэтому ищем имя тега, под которым она реально стоит в разметке.
  const wrappers = KEYBOARD_SAFE_WRAPPERS.filter((name) =>
    new RegExp(`<${name}[\\s/>]`).test(source),
  );
  return { hasInput, hasWrapper: wrappers.length > 0, wrappers: [...wrappers] };
}

/**
 * Экраны, где поле есть, а подъёма нет. Пустой массив — правило соблюдено.
 */
export function keyboardViolations(
  files: { file: string; source: string }[],
): string[] {
  return files
    .map(({ file, source }) => ({ file, ...scanKeyboardSafety(source) }))
    .filter((item) => item.hasInput && !item.hasWrapper)
    .map(
      (item) =>
        `${item.file} — есть <TextInput>, но нет ни одной обёртки из ${KEYBOARD_SAFE_WRAPPERS.join(', ')}`,
    );
}
