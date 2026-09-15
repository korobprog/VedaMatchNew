import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

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
