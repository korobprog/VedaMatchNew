import { Platform, type PressableAndroidRippleConfig } from 'react-native';

/**
 * Отклик на касание по правилам платформы: на Android — ripple Material, на
 * iOS — приглушение. Ripple на iOS и приглушение на Android выглядят чужими.
 */
const isAndroid = Platform.OS === 'android';

/** Ripple поверх содержимого: иначе заливка строки его перекрывает. */
export function ripple(color: string, borderless = false): PressableAndroidRippleConfig | undefined {
  return isAndroid ? { color, borderless, foreground: true } : undefined;
}

/** Приглушение нажатого элемента, только на iOS. */
export function pressedStyle(pressed: boolean): { opacity: number } | null {
  return !isAndroid && pressed ? { opacity: 0.7 } : null;
}
