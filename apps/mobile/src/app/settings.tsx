import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeSectionsSettings } from '@/components/settings/home-sections-settings';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * «Настройки» приложения. Первый раздел — что показывать на главной
 * («Чаты»): блог-лента там по умолчанию выключена и включается здесь.
 *
 * Маршрут корневого стека, как «Аккаунт», а не вкладка: заходят сюда редко.
 * Вход — строкой «Настройки» во вкладке «Сервисы». Уведомления и способы
 * входа живут в «Аккаунте», потому что хранятся на сервере и общие с
 * сайтом; здесь — то, что хранится на этом телефоне.
 */
export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Настройки',
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.bg0 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
      >
        <HomeSectionsSettings />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 12, gap: 20 },
});
