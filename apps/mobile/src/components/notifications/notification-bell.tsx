import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { badgeLabel } from '@/lib/notifications/inbox-state';
import { subscribeUnreadCount, unreadCount } from '@/lib/notifications/unread-store';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Контурный колокольчик, сетка 24, линия 2 — как иконки вкладок. */
function BellIcon({ color }: { color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...stroke} />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0" {...stroke} />
    </Svg>
  );
}

/**
 * Колокольчик со счётчиком непрочитанных — вход в ленту уведомлений (VED-330).
 *
 * Почему в шапке «Чатов», а не шестой вкладкой внизу. Вкладок уже пять, и
 * шестая на телефоне ужимает подписи до нечитаемого; при этом уведомления —
 * не раздел, в котором живут, а то, что проверяют и закрывают. «Чаты» —
 * якорный экран приложения (`unstable_settings.anchor` в `app/_layout.tsx`):
 * он открывается при запуске и на него же ведёт системная «назад», то есть
 * колокольчик и значок попадаются на глаза без всякого поиска. Ровно так же
 * лента устроена на сайте — колокольчиком в шапке портала.
 *
 * Счётчик читается из общего хранилища (`unread-store.ts`), а не из своего
 * запроса: лента, погасив уведомление, уменьшает число сразу, и значок не
 * ждёт возврата на вкладку.
 */
export function NotificationBell() {
  const { colors } = useTheme();
  const count = useSyncExternalStore(subscribeUnreadCount, unreadCount, unreadCount);
  const badge = badgeLabel(count);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        badge ? `Уведомления, непрочитанных: ${count}` : 'Уведомления'
      }
      accessibilityHint="Открывает ленту уведомлений"
      onPress={() => router.push('/notifications')}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.glassBorder, backgroundColor: colors.glass },
        pressedStyle(pressed),
      ]}
    >
      <BellIcon color={colors.text0} />
      {badge ? (
        // Число уже названо в `accessibilityLabel` кнопки — второй раз
        // скринридеру его читать не надо.
        <View
          style={[styles.badge, { backgroundColor: colors.mint, borderColor: colors.bg0 }]}
          importantForAccessibility="no"
        >
          <Text style={[styles.badgeText, { color: colors.onMint }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // `tabular-nums`: счётчик не должен прыгать по ширине при смене цифр.
  badgeText: { fontFamily: fonts.monoSemiBold, fontSize: 11, fontVariant: ['tabular-nums'] },
});
