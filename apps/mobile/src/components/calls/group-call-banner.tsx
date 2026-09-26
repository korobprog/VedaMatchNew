import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { overlayTopOffset } from '@/lib/calls/call-overlay-position';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { confirmTap } from '@/lib/feedback';
import { ownCallBanner } from '@/lib/group-calls/group-call-banner-text';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Плавающая плашка «Вы в звонке · 2 из 4 · Вернуться в звонок» — путь назад
 * к своему групповому звонку, когда его экран свёрнут системным «назад»
 * (как `ReturnToCallBanner` у звонка один на один).
 *
 * Приглашение «идёт звонок, войти» здесь больше не живёт: плавающая строка
 * закрывала первые сообщения беседы, и в конференции её не замечали. Теперь
 * вход стоит в потоке экрана беседы над перепиской (`GroupCallStrip`) и
 * карточкой в ленте (`GroupCallMessageCard`). По той же причине в беседе
 * самого звонка эта плашка молчит — там её заменяет строка над перепиской с
 * тем же текстом. Тексты — в чистом `group-call-banner-text.ts`.
 */
export function GroupCallBanner({ visible }: { visible: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const calls = useGroupCalls();

  const own = calls?.state.phase === 'active' ? (calls?.state.call ?? null) : null;
  if (!calls || !visible || !own) return null;
  if (conversationIdFromPath(pathname) === own.conversationId) return null;
  const banner = ownCallBanner(own);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${banner.title}. ${banner.action}`}
      onPress={() => {
        confirmTap();
        router.push({ pathname: '/group-call/[id]', params: { id: banner.callId } });
      }}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.root,
        {
          top: overlayTopOffset(pathname, insets.top) + 10,
          backgroundColor: colors.bg1,
          borderColor: colors.glassBorder,
        },
        pressedStyle(pressed),
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.dot, { backgroundColor: colors.mint }]}
      />
      <Text numberOfLines={1} style={[styles.text, { color: colors.text0 }]}>
        {banner.title}
      </Text>
      <Text style={[styles.action, { color: colors.text0 }]}>{banner.action}</Text>
    </Pressable>
  );
}

/** `/chat/<id>` → `<id>`: в беседе своего звонка плашку заменяет строка над перепиской. */
function conversationIdFromPath(pathname: string): string | null {
  const match = /^\/chat\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    elevation: 32,
    zIndex: 1000,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  action: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
