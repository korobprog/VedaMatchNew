import type { Palette } from '@/theme/tokens';

export interface ConfirmButtonPalette {
  border: string;
  text: string;
}

/**
 * Цвет кнопки подтверждения `ConfirmDialog` в зависимости от `destructive`:
 * обычное действие — нейтральная обводка/текст, опасное («Удалить») —
 * акцент `magenta`, тот же, что у `InlineError`. Вынесено из компонента,
 * чтобы протестировать без рендера (в репозитории нет `react-test-renderer`
 * для `.spec.tsx`, только чистая логика получает тест).
 */
export function confirmButtonPalette(
  destructive: boolean,
  colors: Pick<Palette, 'magenta' | 'text0' | 'glassBorder'>,
): ConfirmButtonPalette {
  return destructive
    ? { border: colors.magenta, text: colors.magenta }
    : { border: colors.glassBorder, text: colors.text0 };
}
