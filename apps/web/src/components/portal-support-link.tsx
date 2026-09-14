import Link from "next/link";
import { HeadsetIcon } from "@/components/icons/notification-icons";

/**
 * «Написать в поддержку» на главной.
 *
 * Стоит первым, над поиском (VED-146): человек со сломанной кнопкой или
 * вопросом приходит на главную именно за этим, и искать ссылку под новостями
 * ему не нужно. Ведёт в поддержку, а не в чат: там обращение привязывается к
 * аккаунту и получает статус.
 */
export function PortalSupportLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/support"
      className={`glass flex items-center gap-3 rounded-2xl border border-glass-brd px-4 py-3 transition-colors hover:border-cyan/40 ${className}`}
    >
      <HeadsetIcon className="h-8 w-8 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-0">
          Написать в поддержку
        </span>
        <span className="block text-xs text-text-2">
          Вопрос, идея или что-то сломалось — ответим и покажем статус обращения
        </span>
      </span>
      <span aria-hidden="true" className="ml-auto text-text-2">
        ›
      </span>
    </Link>
  );
}
