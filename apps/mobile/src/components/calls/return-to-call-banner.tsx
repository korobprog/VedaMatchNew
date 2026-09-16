import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shouldShowReturnBanner } from '@/lib/calls/call-screen-return';
import { useChatCalls } from '@/lib/calls/call-provider';
import { useElapsedLabel } from '@/lib/calls/use-elapsed-label';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Подстраховка от потери экрана звонка (`gan-harness/feedback/feedback-001.md`,
 * блокирующий пункт 1): системное «назад» на Android снимает
 * `app/call/[id].tsx` — экран не блокирует и не спрашивает подтверждения
 * (это чужое для звонка трение), а звонок продолжается: `CallSession` в
 * `call-provider.tsx` живёт дальше. Без этой плашки к нему было бы
 * физически не вернуться и не видно, что он ещё идёт (`call-screen-return.ts`
 * решает когда — чисто, со `spec`).
 */
export function ReturnToCallBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const calls = useChatCalls();
  const phase = calls?.state.phase ?? 'idle';
  const elapsed = useElapsedLabel(phase === 'active' ? (calls?.state.connectedAt ?? null) : null);

  if (!calls || !calls.state.call || !shouldShowReturnBanner(phase, calls.screenVisible)) return null;
  const { call } = calls.state;
  const statusLine = phase === 'active' ? elapsed : phase === 'connecting' ? 'Соединение…' : 'Вызов…';
  const label = `${call.kind === 'video' ? 'Видеозвонок' : 'Звонок'} · ${statusLine}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Звонок свёрнут, ${statusLine.toLowerCase()} — вернуться на экран звонка`}
      onPress={() => {
        confirmTap();
        router.push({ pathname: '/call/[id]', params: { id: call.id } });
      }}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.root,
        { top: insets.top + 10, backgroundColor: colors.bg1, borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.dot, { backgroundColor: colors.mint }]} />
      <Text numberOfLines={1} style={[styles.text, { color: colors.text0 }]}>
        {label}
      </Text>
      {/* Не magenta: на bg1 в светлой теме это ≈4.24:1, ниже порога 4.5:1
          (тот же вывод, что и у пункта «Удалить» в message-menu.tsx) — text0
          жирным даёт нужный акцент без риска для контраста. */}
      <Text style={[styles.action, { color: colors.text0 }]}>Вернуться</Text>
    </Pressable>
  );
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
    paddingHorizontal: 14,
    // См. incoming-call-banner.tsx — тот же запас на случай своей elevation
    // у навигатора под баннером.
    elevation: 32,
    zIndex: 1000,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  action: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
