#!/usr/bin/env node
// Явный отказ автора PR от карточки «ДОГНАТЬ» (VED-215) — строка
// `Затрагивает приложение: нет` в теле PR (см. CLAUDE.md,
// docs/service-module-contract.md). Молчание не освобождает от догона:
// строки нет вовсе → карточка заводится по умолчанию.

/** Первая строка `Затрагивает приложение: <значение>` в тексте PR. */
const AFFECTS_APP_LINE = /Затрагивает\s+приложение\s*:\s*(\S*)/i;

/**
 * @param {string} prBody — тело PR (у squash-мержа этого репозитория
 *   совпадает с текстом мержевого коммита, `git log -1 --format=%B`).
 * @returns {boolean} true — сервис явно помечен «нет», карточку не заводить.
 */
export function isOptedOut(prBody) {
  if (typeof prBody !== 'string' || prBody.length === 0) return false;

  const match = AFFECTS_APP_LINE.exec(prBody);
  if (!match) return false;

  // Только буквы значения, без пунктуации и остатка строки: «нет.», «нет —
  // …» и «нет,» распознаются, а латинское «net» (не отрицание, а просто
  // другое слово) — нет, как и «нет» без диакритики не путается с «нету».
  const letters = (match[1].toLowerCase().match(/^[a-zа-яё]+/) ?? [''])[0];
  return letters === 'нет' || letters === 'no';
}
