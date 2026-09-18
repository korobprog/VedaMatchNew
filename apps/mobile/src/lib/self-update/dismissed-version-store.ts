import * as SecureStore from 'expo-secure-store';

/**
 * «Не сейчас» на карточке обновления (VED-176) — запоминает versionCode,
 * который человек отклонил, чтобы не показывать баннер повторно для той же
 * версии (`update-decision.ts` сравнивает эту метку с манифестом). Не
 * секрет, но переживает переустановку данных не должен — `SecureStore`
 * взят ради единообразия с остальными настройками приложения
 * (`token-store.ts`), а не из-за чувствительности значения.
 */
const DISMISSED_KEY = 'vm.selfUpdate.dismissedUntilVersionCode';

export async function readDismissedUntilVersionCode(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(DISMISSED_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Не удалось прочитать — считаем, что ничего не отклонено (безопасная
    // сторона: лучше показать баннер лишний раз, чем скрыть его навсегда).
    return null;
  }
}

export async function writeDismissedUntilVersionCode(versionCode: number): Promise<void> {
  await SecureStore.setItemAsync(DISMISSED_KEY, String(versionCode));
}
