import { createContext, use } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenTopInset } from '@/lib/services/quick-bar-placement';
import { useQuickPins } from '@/lib/services/quick-pins-store';

/**
 * Стоит ли экран под панелью быстрого доступа. Правду знает только
 * раскладка вкладок — она и ставит `true`; у экранов корневого стека
 * значение по умолчанию `false`, и отступ у них остаётся под вырез.
 */
export const QuickBarSlot = createContext(false);

/**
 * Верхний отступ под вырез для экрана вкладки: ноль, когда вырез уже занят
 * панелью (`quick-bar-placement.ts`, `screenTopInset`).
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  const underBar = use(QuickBarSlot);
  const pins = useQuickPins();
  return screenTopInset(insets.top, underBar && pins.length > 0);
}
