import { BottomTabBar, type BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { View } from 'react-native';
import { MiniPlayer } from './mini-player';

/**
 * Нижняя панель вкладок с мини-плеером Медиатеки над ней (VED-331).
 *
 * Мини-плеер — часть панели, а не слой поверх экрана: навигатор вкладок
 * меряет панель целиком и отдаёт экрану остаток высоты, поэтому конец
 * списка чатов не прячется под полосой плеера. Сама панель — штатная
 * `BottomTabBar` (из сборки `expo-router`, где она лежит; прямой импорт
 * `@react-navigation/*` в SDK 56+ запрещён), со всеми настройками вкладок.
 */
export function MediaTabBar(props: BottomTabBarProps) {
  return (
    <View>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}
