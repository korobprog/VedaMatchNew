import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/**
 * Лёгкая вибрация на важных действиях: отправка, долгое нажатие, переключение
 * уведомлений. Только на действиях, а не на каждом касании, иначе она
 * перестаёт что-то значить. Вибрация никогда не единственный отклик: у
 * элемента всегда есть и видимый. Телефон без вибромотора — не ошибка.
 *
 * На Android — системные эффекты отклика (`performAndroidHapticsAsync`): они
 * идут через движок телефона, а не через вибромотор напрямую, и не требуют
 * разрешения VIBRATE. `impactAsync` на Android именно вибромотор.
 */
const isAndroid = Platform.OS === 'android';

export function confirmTap(): void {
  const done = isAndroid
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  done.catch(() => undefined);
}

/** Долгое нажатие: системный эффект долгого нажатия, на iOS чуть сильнее касания. */
export function longPressTap(): void {
  const done = isAndroid
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  done.catch(() => undefined);
}

/**
 * Вибрация входящего звонка (`lib/calls/ringtone.ts`) — единственное
 * исключение из правила «вибрация — отклик на разовое действие, не сама по
 * себе»: входящий вызов длится, пока на него не ответили или не отклонили,
 * и непрерывный сигнал здесь ожидаем, как у обычного звонка. `Vibration` —
 * не системные эффекты `Haptics`, а вибромотор напрямую: только так его
 * можно держать циклом произвольной длины. `VIBRATE` на Android не требует
 * разрешения в манифесте.
 *
 * Пауза, вибрация, пауза, вибрация, долгая пауза — двойной «дзынь-дзынь»,
 * как звук рингтона (`ringtone.ts`).
 */
export const RING_VIBRATION_PATTERN_MS = [0, 500, 250, 500, 1000];

export function startRingingVibration(): void {
  Vibration.vibrate(RING_VIBRATION_PATTERN_MS, true);
}

export function stopRingingVibration(): void {
  Vibration.cancel();
}
