import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Системная шапка экранов поддержки (VED-336) с кнопкой «назад» — как у
 * «Новой общины» и ленты уведомлений: экраны открываются поверх вкладок, и
 * уйти с них должно быть чем, кроме жеста.
 */
export function SupportHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
