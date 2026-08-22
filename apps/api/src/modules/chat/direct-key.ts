/**
 * Ключ личного диалога: два id через двоеточие, меньший первым.
 *
 * Уникальность пары держит база (`ChatConversation.directKey`), а не проверка
 * «нет ли уже такого диалога» перед вставкой: два одновременных первых
 * сообщения друг другу иначе заводят два диалога, и половина переписки
 * уезжает в невидимый второй.
 */
export function directKey(a: string, b: string): string {
  if (a === b) throw new Error('Личный диалог с самим собой не заводится');
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Второй участник личного диалога по ключу. */
export function directCompanionId(
  key: string,
  viewerId: string,
): string | null {
  const [first, second] = key.split(':');
  if (!first || !second) return null;
  if (viewerId === first) return second;
  if (viewerId === second) return first;
  return null;
}
