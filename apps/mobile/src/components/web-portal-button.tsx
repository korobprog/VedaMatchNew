import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { appVariant } from '@/config/app-variant';
import { openWebPortal, WEB_PORTAL_HINT, WEB_PORTAL_LABEL, webPortalUrl } from '@/lib/web-portal';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { InlineError } from './inline-error';

/** Контурная стрелка «наружу», сетка 24 — как у иконок вкладок. */
function ExternalIcon({ color }: { color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" {...stroke} />
      <Path d="M15 3h6v6" {...stroke} />
      <Path d="M10 14 21 3" {...stroke} />
    </Svg>
  );
}

/**
 * Кнопка «Открыть сайт» в правом верхнем углу экранов входа (`app/login.tsx`,
 * `app/auth.tsx`). Нативно сделана лишь часть сервисов: если человеку нужен
 * раздел, которого в приложении нет, он уходит в портал целиком одним
 * нажатием, не разыскивая адрес.
 *
 * Углом, а не в столбце действий, намеренно: главное действие экрана — вход,
 * кнопка не должна с ним спорить. Отсюда и вторичный вид — стекло с обводкой,
 * а не заливка акцентом.
 *
 * Ставится прямым потомком контейнера БЕЗ собственных отступов: положение
 * считается от края экрана плюс верхняя безопасная зона.
 */
export function WebPortalButton() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    const result = await openWebPortal(webPortalUrl(appVariant().webOrigin), {
      openBrowser: (url) => WebBrowser.openBrowserAsync(url),
      openLink: (url) => Linking.openURL(url),
    });
    if (result.kind === 'failed') setError(result.message);
  }

  return (
    <View style={[styles.corner, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={WEB_PORTAL_LABEL}
        accessibilityHint={WEB_PORTAL_HINT}
        onPress={() => {
          void open();
        }}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.button,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.label, { color: colors.text0 }]}>{WEB_PORTAL_LABEL}</Text>
        <ExternalIcon color={colors.text0} />
      </Pressable>
      {error ? (
        <View style={styles.error}>
          <InlineError message={error} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', right: 16, zIndex: 2, alignItems: 'flex-end', gap: 8 },
  button: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  error: { maxWidth: 260 },
});
