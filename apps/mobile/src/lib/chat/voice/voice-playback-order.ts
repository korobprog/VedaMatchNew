/**
 * Правило автоперехода к следующему голосовому — как в Telegram/WhatsApp:
 * одно голосовое доиграло, ниже по переписке само включается следующее
 * НЕПРОСЛУШАННОЕ, после последнего — тишина. Никакого возврата к началу
 * списка и никакого повтора уже прослушанного.
 *
 * Модуль целиком чистый: порядок задаёт вызывающая сторона (см.
 * `voice-playback-registry.ts`, который сверяет его с реально смонтированными
 * плеерами), здесь только сам выбор кандидата.
 */

export interface VoiceOrderEntry {
  /** Id вложения — то же значение, что ключ в `voice-playback-registry.ts`. */
  id: string;
  /**
   * Позиция в переписке: чем больше — тем позже по времени (ниже на экране).
   * Не обязано быть целым — вызывающая сторона обычно строит его из времени
   * создания сообщения плюс индекс вложения внутри него.
   */
  order: number;
}

/**
 * Следующий кандидат для автовоспроизведения.
 *
 * - Только ВПЕРЁД: кандидат обязан иметь `order` строго больше, чем у
 *   только что доигравшего — иначе автопереход мог бы вернуться к началу
 *   списка или запустить уже сыгранное сообщение выше по переписке.
 * - Только НЕПРОСЛУШАННОЕ: `heardIds` — всё, что уже целиком доиграло хотя
 *   бы раз (вручную или автопереходом) в этой сессии; такие пропускаются.
 * - Если подходящих несколько — берём ближайшее (наименьший `order` среди
 *   оставшихся), а не первое по порядку добавления в список.
 * - `finishedId`, которого нет среди `entries` (например, вложение уже
 *   размонтировано виртуализированным списком), — цепочку продолжить не с
 *   чем, `null`.
 */
export function pickNextUnheardVoiceId(
  entries: readonly VoiceOrderEntry[],
  finishedId: string,
  heardIds: ReadonlySet<string>,
): string | null {
  const finished = entries.find((entry) => entry.id === finishedId);
  if (!finished) return null;

  let best: VoiceOrderEntry | null = null;
  for (const entry of entries) {
    if (entry.id === finishedId) continue;
    if (entry.order <= finished.order) continue;
    if (heardIds.has(entry.id)) continue;
    if (!best || entry.order < best.order) best = entry;
  }
  return best?.id ?? null;
}
