import * as Haptics from 'expo-haptics';

/**
 * Лёгкая вибрация на важных действиях: отправка, долгое нажатие, переключение
 * уведомлений. Только на действиях, а не на каждом касании, иначе она
 * перестаёт что-то значить. Телефон без вибромотора — не ошибка.
 */
export function confirmTap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Долгое нажатие: чуть заметнее обычного касания. */
export function longPressTap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}
