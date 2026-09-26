import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { OFFLINE_BANNER_TEXT } from '@/lib/startup/startup-decision';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Плашка «Нет соединения» над всеми экранами вошедшего, пока нет сети.
 *
 * Плашка сама занимает вырез под статус-баром, поэтому экранам под ней
 * верхний отступ выреза отдаётся нулём: все экраны берут его из
 * `useSafeAreaInsets` (а тот — из `SafeAreaInsetsContext`), и без подмены
 * отступ удвоился бы. Без сети — ничего не подменяется, дерево то же.
 *
 * Появляется и исчезает без анимации: «уменьшить движение» соблюдается
 * тем, что двигаться нечему.
 */
export function OfflineBannerFrame({ visible, children }: { visible: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.frame}>
      {visible ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.banner,
            { paddingTop: insets.top + 8, backgroundColor: colors.bg1, borderBottomColor: colors.glassBorder },
          ]}
        >
          <Text style={[styles.text, { color: colors.text0 }]}>{OFFLINE_BANNER_TEXT}</Text>
        </View>
      ) : null}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        <View style={styles.frame}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  banner: { paddingHorizontal: 20, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
});
