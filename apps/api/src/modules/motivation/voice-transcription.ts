/**
 * Подсказки ударений для озвучки.
 *
 * Модель синтеза обучена в основном не на русском и совсем не на санскрите:
 * «Арджуне» и «Бхагавад-гита» она читает с произвольным ударением. Знак ударения
 * (U+0301) — штатный способ подсказать, и ставится он перед отправкой в синтез,
 * а не в самом тексте поста: цитата обязана храниться дословно, без служебных
 * пометок.
 *
 * Заменяется только основа, окончание остаётся: «Арджун» + «е» → «Арджу́не»,
 * «Арджун» + «ой» → «Арджу́ной». Так один словарь покрывает все падежи.
 */

/** Комбинирующий знак ударения — ставится сразу за ударной гласной. */
const STRESS = '́';

/**
 * Основы и их огласовка. Список намеренно короткий и состоит из слов, которые
 * ни с чем не спутать: «карм» сюда не попал, потому что превратил бы «карман»
 * в «ка́рман».
 */
export const VOICE_STEMS: ReadonlyArray<[string, string]> = [
  ['Бхагавад-гит', `Бхагава${STRESS}д-Ги${STRESS}т`],
  ['Прабхупад', `Прабхупа${STRESS}д`],
  ['Курукшетр', `Курукше${STRESS}тр`],
  ['Вриндаван', `Вринда${STRESS}ван`],
  ['Арджун', `Арджу${STRESS}н`],
  ['Кришн', `Кри${STRESS}шн`],
  ['Говинд', `Гови${STRESS}нд`],
  ['вайшнав', `вайшна${STRESS}в`],
  ['киртан', `кирта${STRESS}н`],
  ['санскрит', `санскри${STRESS}т`],
  ['Маяпур', `Маяпу${STRESS}р`],
  ['бхакти', `бха${STRESS}кти`],
  ['дхарм', `дха${STRESS}рм`],
];

/**
 * Окончания, которые допускаются после основы.
 *
 * Список закрытый не из педантизма: без него основа «Кришн» совпала бы внутри
 * любого слова, которое с неё начинается, и словарь портил бы текст молча.
 */
const ENDINGS =
  '(?:а|ы|е|у|ой|ою|ом|ах|ами|и|я|ю|ей|ем|ов|у́|)(?![а-яё])';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Сохраняет регистр исходного слова: в начале предложения слово написано с
 * прописной, а в словаре основа может лежать со строчной.
 */
function matchCase(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;
  const first = source[0];
  if (first === first.toLocaleUpperCase('ru-RU') && first !== first.toLocaleLowerCase('ru-RU'))
    return replacement[0].toLocaleUpperCase('ru-RU') + replacement.slice(1);
  return replacement[0].toLocaleLowerCase('ru-RU') + replacement.slice(1);
}

export function applyVoiceTranscription(text: string): string {
  let result = text;
  for (const [stem, voiced] of VOICE_STEMS) {
    const pattern = new RegExp(
      `(?<![а-яёА-ЯЁ])(${escapeRegExp(stem)})${ENDINGS}`,
      'gi',
    );
    result = result.replace(pattern, (whole, head: string) =>
      matchCase(head, voiced) + whole.slice(head.length),
    );
  }
  return result;
}
