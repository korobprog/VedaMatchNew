import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon, type TabIconName } from '@/components/tab-icon';
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
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
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
  );
}
