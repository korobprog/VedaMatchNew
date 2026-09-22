import { resolveDisplayName, type Gender, type LineageId, type SpiritualStage } from '@vedamatch/shared';

/**
 * Что приложение берёт из `GET /users/me` и держит в сессии.
 *
 * Вынесено из `session.tsx` отдельным модулем, потому что складывается в трёх
 * местах: обычная сессия на токенах, сессия по cookie портала и сессия
 * мини-приложения Telegram (`session.web.tsx`). Пока сборка была скопирована
 * трижды, добавление поля означало три правки, и любая забытая давала экран,
 * который на одной платформе работает, а на другой молча видит `undefined`.
 */
export interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  spiritualName?: string | null;
  /** Что видят другие: духовное имя, если оно есть, иначе мирское. */
  displayName?: string;
  avatarUrl?: string | null;
  gender?: Gender | null;
  spiritualStage?: SpiritualStage | null;
  lineage?: LineageId | null;
}

export interface SessionUser {
  id: string;
  /** Мирское имя. Владельцу нужно для правки профиля — наружу идёт `displayName`. */
  name: string;
  /** Духовное имя; `null` — не заполнено. */
  spiritualName: string | null;
  /**
   * Имя, под которым человека видят все остальные: духовное, если оно
   * заполнено, иначе мирское (CLAUDE.md, «Имя пользователя наружу»). Всё,
   * что показывает человека людям, берёт именно его, а не `name`.
   */
  displayName: string;
  email: string;
  avatarUrl: string | null;
  /**
   * Пол, этап пути и духовная линия (VED-333). Лежат в сессии, а не
   * запрашиваются отдельно: по ним решается, вести ли новичка в онбординг, и
   * решение это нужно ровно в тот момент, когда `status` становится
   * `'signed'`. Второй запрос за тем же профилем дал бы мигание вкладок
   * перед экраном вопросов.
   */
  gender: Gender | null;
  spiritualStage: SpiritualStage | null;
  lineage: LineageId | null;
}

export function toSessionUser(profile: ProfileResponse): SessionUser {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    spiritualName: profile.spiritualName ?? null,
    // `displayName` считает сервер (`resolveDisplayName`), но подстраховка
    // на случай старого ответа — та же функция из общего пакета, а не
    // своё «если есть духовное»: правило одно на портал.
    displayName: profile.displayName ?? resolveDisplayName(profile),
    avatarUrl: profile.avatarUrl ?? null,
    gender: profile.gender ?? null,
    spiritualStage: profile.spiritualStage ?? null,
    lineage: profile.lineage ?? null,
  };
}
