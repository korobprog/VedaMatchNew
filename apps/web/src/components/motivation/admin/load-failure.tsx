import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { secondaryButton } from "./ui";

/**
 * Заглушка вместо данных, которые не приехали.
 *
 * Самая частая причина — устаревшая роль в токене: guard читает её из JWT, а
 * профиль из базы, поэтому свежеиспечённый админ попадает на страницу, но
 * получает 403, пока токен не перевыпустится. Поэтому и подсказка про перезаход.
 */
export function LoadFailure({ what }: { what: string }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-5 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-gold" />
      <p className="mt-2 font-medium text-text-0">Не удалось загрузить {what}</p>
      <p className="mt-1 text-sm text-text-2">
        Если роль администратора выдали только что, войдите заново — она
        появится в новом токене.
      </p>
      <Link href="/login" className={`${secondaryButton} mt-4`}>
        Войти заново
      </Link>
    </div>
  );
}
