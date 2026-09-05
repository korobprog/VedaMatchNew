import type { MotivationPostDto } from "@vedamatch/shared";
import { splitQuoteAndExplanation } from "./quote-text";
import { attributionLine } from "./reels";

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
  return [quote.trim(), source.trim()].filter(Boolean).join(". ");
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
