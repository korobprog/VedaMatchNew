import Link from "next/link";
import { Bot } from "lucide-react";

/**
 * Полоса ассистента на главной: обычная GET-форма, вопрос уходит на
 * страницу ассистента адресом `?q=` и задаётся уже там. Главная не ждёт
 * ответа модели — она и так самая тяжёлая страница портала, — а форме без
 * скриптов не нужен ни роутер, ни гидратация.
 */
export function AssistantHomeBar() {
  return (
    <section aria-label="Ассистент портала" className="mb-4">
      <form
        action="/assistant"
        method="get"
        className="service-edge glass flex items-center gap-2 rounded-2xl px-3 py-2"
      >
        <Link
          href="/assistant"
          aria-label="Открыть ассистента"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-cyan/34 bg-cyan/12 text-cyan"
        >
          <Bot className="size-5" aria-hidden />
        </Link>
        <input
          type="text"
          name="q"
          maxLength={2000}
          placeholder="Спросить ассистента: найти товар, цитату, материал…"
          aria-label="Вопрос ассистенту"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-text-0 placeholder:text-text-2 outline-none"
        />
        <button
          type="submit"
          className="btn-mint shrink-0 rounded-xl px-3 py-2 text-sm font-medium"
        >
          Спросить
        </button>
      </form>
    </section>
  );
}
