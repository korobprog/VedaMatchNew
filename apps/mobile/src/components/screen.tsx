import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /**
   * Скрытый вход в служебный экран (например, «Проверка связи» —
   * apps/mobile/src/app/calls-probe.tsx): долгое нажатие на заголовок
   * вкладки, без визуальной подсказки — это инструмент команды, не
   * продуктовая функция.
   */
  onTitleLongPress?: () => void;
}

/** Каркас экрана вкладки: заголовок Unbounded и прокручиваемое тело. */
export function Screen({ title, subtitle, children, onTitleLongPress }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg0 }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
    >
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          onLongPress={onTitleLongPress}
          style={[styles.title, { color: colors.text0 }]}
        >
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.text1 }]}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  header: { gap: 6 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
