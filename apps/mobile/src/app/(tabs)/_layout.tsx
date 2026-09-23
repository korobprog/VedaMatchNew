import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaTabBar } from '@/components/media/media-tab-bar';
import { QuickBar } from '@/components/quick-bar/quick-bar';
import { QuickBarSlot } from '@/components/quick-bar/screen-top-inset';
import { TabIcon, type TabIconName } from '@/components/tab-icon';
import { useQuickPinsLoaded } from '@/lib/services/quick-pins-store';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: 'Чаты', icon: 'chats' },
  { name: 'calls', title: 'Звонки', icon: 'calls' },
  { name: 'people', title: 'Люди', icon: 'people' },
  { name: 'communities', title: 'Общины', icon: 'communities' },
  { name: 'services', title: 'Сервисы', icon: 'services' },
];

/**
 * В нижнем меню только связь, всё остальное живёт во вкладке «Сервисы».
 *
 * Активная вкладка отмечена иконкой в magenta и подписью в text-0, а не
 * подписью в magenta: 11 px magenta на светлой теме даёт 4.46:1, ниже порога.
 *
 * Над вкладками — панель быстрого доступа к закреплённым сервисам (VED-385).
 * Она здесь, а не в корневом стеке, намеренно: так она есть на всех пяти
 * вкладках и её структурно нет на экранах поверх них — в переписке, звонке,
 * сканере (`lib/services/quick-bar-placement.ts`). Панель занимает вырез
 * сама, поэтому экраны вкладок берут верхний отступ из `useScreenTopInset`,
 * а не из `insets.top` напрямую.
 *
 * Пока хранилище закреплённого не прочитано, вкладки не рисуются: иначе
 * первый кадр вышел бы без панели и экран съехал бы вниз следом. Чтение
 * запущено ещё при восстановлении сессии и к этому моменту обычно готово.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pinsLoaded = useQuickPinsLoaded();

  if (!pinsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg0 }} />;

  return (
    <QuickBarSlot value>
      <View style={{ flex: 1, backgroundColor: colors.bg0 }}>
        <QuickBar />
        <Tabs
          // Мини-плеер Медиатеки над вкладками, пока выбрана запись (VED-331).
          tabBar={(props) => <MediaTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.text0,
            tabBarInactiveTintColor: colors.text2,
            tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
            tabBarStyle: {
              backgroundColor: colors.bg0,
              elevation: 0,
              borderTopColor: colors.glassBorder,
              height: 60 + insets.bottom,
              paddingTop: 6,
            },
            sceneStyle: { backgroundColor: colors.bg0 },
          }}
        >
          {TABS.map((tab) => (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: tab.title,
                tabBarIcon: ({ focused }) => (
                  <TabIcon name={tab.icon} color={focused ? colors.magenta : colors.text2} />
                ),
              }}
            />
          ))}
        </Tabs>
      </View>
    </QuickBarSlot>
  );
}
