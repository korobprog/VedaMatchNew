import { lazy, Suspense, type ComponentProps } from 'react';
import { View } from 'react-native';
import type { ServiceIcon as ServiceIconImpl } from './service-icons-impl';

/**
 * Веб-сторона (веха «Скорость», доп. заход): иллюстрации каталога сервисов
 * — ~33 КБ несжатого JS (`react-native-svg`-разметка на 13 сервисов,
 * `service-icons-impl.tsx`) — нужны только на вкладке «Сервисы» после
 * входа, экран входа их не показывает никогда. Грузим отдельным чанком по
 * требованию; пока чанк не пришёл, `Suspense` держит место иконки пустым
 * `View` того же размера — карточка сервиса не прыгает по высоте.
 */

const LazyServiceIcon = lazy(() =>
  import('./service-icons-impl').then((m) => ({ default: m.ServiceIcon })),
);

type Props = ComponentProps<typeof ServiceIconImpl>;

export function ServiceIcon({ size = 28, ...rest }: Props) {
  return (
    <Suspense fallback={<View style={{ width: size, height: size }} />}>
      <LazyServiceIcon size={size} {...rest} />
    </Suspense>
  );
}
