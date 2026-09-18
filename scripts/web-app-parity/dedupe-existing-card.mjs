#!/usr/bin/env node
// Поиск уже существующей карточки «ДОГНАТЬ» для сервиса (VED-215) — чтобы
// повторный PR по тому же сервису дописывал комментарий, а не заводил
// вторую карточку.

import { buildCardTitle } from './card-content.mjs';

/**
 * @param {{id: string; title: string}[]} cards — открытые (не архивные)
 *   карточки колонки «VedaMath-Native» (`GET /work/boards/:id`, `columns`
 *   отдаёт только неархивные задачи).
 * @param {string} service — слаг сервиса.
 * @returns {{id: string} | null}
 *
 * Сравнение — по точному префиксу заголовка, тому же, что строит
 * `buildCardTitle` для новой карточки (гарантия, что дедуп не разойдётся с
 * генерацией заголовка), а не по вхождению подстроки: «ДОГНАТЬ. Market:» и
 * «ДОГНАТЬ. Marketplace:» — разные префиксы, несмотря на общий кусок
 * «Market», и не путаются друг с другом.
 */
export function findExistingCard(cards, service) {
  const prefix = buildCardTitle(service);
  const match = (cards ?? []).find(
    (card) => typeof card?.title === 'string' && card.title.startsWith(prefix),
  );
  return match ? { id: match.id } : null;
}
