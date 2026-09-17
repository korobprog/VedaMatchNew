import { lazy, Suspense, type ComponentProps } from 'react';
import { ScrollView, View } from 'react-native';
import type { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/**
 * Веб-сторона обёртки (веха «Скорость», доп. заход): `react-native-keyboard-
 * controller` тянет `react-native-reanimated` целиком (~700 КБ несжатого JS
 * в бандле — почти треть первого экрана, см. `gan-harness/perf-after.md`) —
 * не из-за размера самих компонентов, а потому что `KeyboardProvider`,
 * `KeyboardAvoidingView` и `KeyboardAwareScrollView` импортируют `Reanimated`
 * на уровне модуля не глядя, используется он или нет. Экран входа (гость)
 * не открывает ни чат, ни карточку анкеты — единственные два места
 * приложения, где эти компоненты вообще участвуют, — поэтому для веба грузим
 * их отдельным чанком по требованию через `import()`, а не в первом бандле.
 *
 * Пока чанк не пришёл, `Suspense` показывает обычный `View`/`ScrollView` с
 * теми же детьми — раскладка не ломается и её не «выключает» пустой экран
 * ожидания: анимация под клавиатуру появляется на пару сотен миллисекунд
 * позже первого кадра экрана чата/анкеты, не раньше.
 */

const LazyKeyboardAvoidingView = lazy(() =>
  import('react-native-keyboard-controller').then((m) => ({ default: m.KeyboardAvoidingView })),
);
const LazyKeyboardAwareScrollView = lazy(() =>
  import('react-native-keyboard-controller').then((m) => ({ default: m.KeyboardAwareScrollView })),
);

type ChatKeyboardAvoidingViewProps = ComponentProps<typeof KeyboardAvoidingView>;

export function ChatKeyboardAvoidingView({ children, style, ...rest }: ChatKeyboardAvoidingViewProps) {
  return (
    <Suspense fallback={<View style={style}>{children}</View>}>
      <LazyKeyboardAvoidingView style={style} {...rest}>
        {children}
      </LazyKeyboardAvoidingView>
    </Suspense>
  );
}

type PersonKeyboardAwareScrollProps = ComponentProps<typeof KeyboardAwareScrollView>;

export function PersonKeyboardAwareScroll({ children, contentContainerStyle, ...rest }: PersonKeyboardAwareScrollProps) {
  return (
    <Suspense fallback={<ScrollView contentContainerStyle={contentContainerStyle}>{children}</ScrollView>}>
      <LazyKeyboardAwareScrollView contentContainerStyle={contentContainerStyle} {...rest}>
        {children}
      </LazyKeyboardAwareScrollView>
    </Suspense>
  );
}
