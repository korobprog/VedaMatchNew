import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { overlayTopOffset } from '@/lib/calls/call-overlay-position';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { confirmTap } from '@/lib/feedback';
import { groupCallBannerLabel } from '@/lib/group-calls/group-call-banner-text';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Плашка «идёт групповой звонок» — она же «входящий групповой».
 *
 * Группового дозвона с рингтоном на этом этапе нет намеренно: комната
 * открыта постоянно, входят и выходят по ходу, и звонить всей беседе по
 * каждому входу — это будильник, а не приглашение. Человек видит строку с
 * составом и кнопкой, как в общем голосовом чате Телеграма.
 *
 * Та же плашка служит возвратом к своему звонку, когда экран свёрнут
 * системным «назад» (`ReturnToCallBanner` у звонка один на один) — тексты
 * и то, какое из двух состояний показывать, решает чистый
 * `group-call-banner-text.ts`.
 */
export function GroupCallBanner({ visible }: { visible: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const calls = useGroupCalls();

  const own = calls?.state.phase === 'active' ? (calls?.state.call ?? null) : null;
  const conversationId = conversationIdFromPath(pathname);
  const inConversation = conversationId
    ? (calls?.callInConversation(conversationId) ?? null)
    : null;
  const banner = groupCallBannerLabel(own, inConversation, calls?.selfId ?? '');

  if (!calls || !visible || !banner) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${banner.title}. ${banner.action}`}
      onPress={() => {
        confirmTap();
        if (banner.kind === 'own')
          router.push({ pathname: '/group-call/[id]', params: { id: banner.callId } });
        else void calls.join(banner.callId);
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

/** `/chat/<id>` → `<id>`. Плашку «войти» показываем только в той беседе. */
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
