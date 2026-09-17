/**
 * Типы для глубокого импорта мимо баррела `react-native-gesture-handler`
 * (см. комментарий в `src/components/root-shell.web.tsx`, зачем он нужен) —
 * у пакета нет отдельного `.d.ts` под этот путь, форма компонента такая же,
 * как у именованного экспорта `GestureHandlerRootView` из корня пакета.
 */
declare module 'react-native-gesture-handler/lib/module/components/GestureHandlerRootView' {
  import type { ComponentType } from 'react';
  import type { ViewProps } from 'react-native';

  const GestureHandlerRootView: ComponentType<ViewProps>;
  export default GestureHandlerRootView;
}
