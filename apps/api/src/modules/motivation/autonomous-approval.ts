/**
 * Можно ли обойтись без человека на этом посте.
 *
 * Правило родилось у кадра и звучит так: администратор в автономном режиме —
 * оператор, а не этап. Но «автономный режим» сам по себе недостаточен: если
 * текст одобрил человек, значит он в цепочке уже участвовал, и дальше пост
 * тоже проходит через него. Поэтому смотрим, кто именно одобрил последним.
 *
 * Вынесено из воркера кадра, чтобы видеостадия судила по тому же признаку:
 * два независимых условия неминуемо разошлись бы.
 */
export function isAutonomousApproval(input: {
  origin: string | null | undefined;
  moderationMode: string;
  /** Действие последней записи одобрения: `ai_approve` или `approve_text`. */
  lastApprovalAction: string | null | undefined;
}): boolean {
  // Редакционные посты человек ведёт сам: у них нет автора, перед которым
  // стоило бы торопиться.
  if (input.origin !== 'user') return false;
  if (input.moderationMode !== 'autonomous') return false;
  return input.lastApprovalAction === 'ai_approve';
}
