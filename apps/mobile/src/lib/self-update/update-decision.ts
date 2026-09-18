import { isNewerVersion } from './version-compare';
import type { AppManifest } from './manifest-validation';

/**
 * Решение «показывать ли предложение обновиться» (VED-176) — чистая функция,
 * без единого сетевого вызова: всё, что ей нужно, вызывающий код (хук
 * `use-self-update.ts`) уже собрал из `appVariant()`, ответа сети и
 * хранилища отклонённых версий.
 *
 * `now`/`manifestFetchedAt` в контракте входа зарезервированы под будущую
 * тихую фоновую проверку (см. `spec.md`, «Риски и открытые вопросы» —
 * решение генератора, не обязательное для приёмки): сейчас решение зависит
 * только от канала, версий и отметки «Не сейчас», без давности ответа сети.
 */
export interface UpdateDecisionInput {
  selfUpdate: boolean;
  currentVersionCode: number;
  manifest: AppManifest | null;
  dismissedUntilVersionCode: number | null;
  now: Date;
  manifestFetchedAt: Date | null;
}

export type UpdateDecision =
  /** Канал не `site`, либо манифест не пришёл/не разобрался — секции вовсе нет. */
  | { kind: 'hidden' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; manifest: AppManifest }
  /** Новее текущей, но человек уже нажал «Не сейчас» именно на эту версию (или новее). */
  | { kind: 'dismissed'; manifest: AppManifest };

export function decideUpdate(input: UpdateDecisionInput): UpdateDecision {
  const { selfUpdate, currentVersionCode, manifest, dismissedUntilVersionCode } = input;

  // Политика магазинов — самый жёсткий из констрейнтов задачи: канал не
  // `site` скрывает секцию целиком, независимо от того, что в манифесте.
  if (!selfUpdate) return { kind: 'hidden' };
  if (!manifest) return { kind: 'hidden' };

  if (!isNewerVersion(manifest.versionCode, currentVersionCode)) {
    return { kind: 'up-to-date' };
  }

  if (dismissedUntilVersionCode != null && dismissedUntilVersionCode >= manifest.versionCode) {
    return { kind: 'dismissed', manifest };
  }

  return { kind: 'available', manifest };
}
