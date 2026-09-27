import type { MotivationPostDto } from "@vedamatch/shared";
import { splitQuoteAndExplanation } from "./quote-text";
import { attributionLine } from "./reels";

/**
 * Адреса в тексте (VED-550): `https://…`, `www.…` и голые домены вида
 * `site.ru/путь`; точка или запятая за адресом остаётся тексту. Голосом
 * ссылку не читают — её не набрать на слух. Зона домена — только строчными
 * латинскими буквами или «рф»: так «Бхагавад-гита 2.13» и «т. е.» не
 * считаются адресами. Копия из озвучки Блог-ленты: сервисы портала друг
 * друга не импортируют.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S*[^\s.,;:!?)\]»"'…]/gi;
const BARE_DOMAIN_PATTERN =
  /(?<![\p{L}\p{N}@.\-/])(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-z]{2,24}|(?:[а-яёА-ЯЁ0-9](?:[а-яёА-ЯЁ0-9-]*[а-яёА-ЯЁ0-9])?\.)+рф)(?::\d+)?(?:\/(?:\S*[^\s.,;:!?)\]»"'…])?)?(?![\p{L}\p{N}])/gu;

/** Текст без адресов; хвосты вроде «Подробнее: » остаются без пустоты. */
export function stripUrls(text: string): string {
  return text
    .replace(URL_PATTERN, " ")
    .replace(BARE_DOMAIN_PATTERN, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Что читать голосом и на каком языке.
 *
 * Читаем цитату и подпись, но не пояснение: пояснение — это разбор, его
 * читают глазами и возвращаются к строчке, а голос отматывать нечем. Тот же
 * довод, что у кнопки «Пояснение», которая в ленте свёрнута по умолчанию.
 *
 * Подпись отделена паузой, а не запятой: синтезатор проговаривает точку
 * заметно длиннее, и «Бхагавад-гита 2.13» перестаёт слипаться с последним
 * словом цитаты.
 */
export function buildSpokenQuote(post: {
  text: MotivationPostDto["text"];
  attributionSpeaker?: string | null;
  attributionWork?: string | null;
  attributionLocator?: string | null;
}): string {
  const { quote } = splitQuoteAndExplanation(post.text ?? "");
  const source = attributionLine(post as MotivationPostDto);
  return [stripUrls(quote), stripUrls(source)]
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .join(". ");
}

/**
 * Язык озвучки. Определяем по буквам, а не по настройкам интерфейса: в
 * русской ленте попадаются шлоки на латинице, и русский голос читает
 * «kṛṣṇa» как «кырышна».
 */
export function spokenLanguage(text: string): string {
  return /[Ѐ-ӿ]/.test(text) ? "ru-RU" : "en-US";
}

/**
 * Умеет ли браузер читать вслух. Проверка отдельной функцией, чтобы кнопка
 * не появлялась там, где нажимать на неё бессмысленно: в Safari до 14 и в
 * части встроенных браузеров синтеза речи нет вовсе.
 */
export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}
