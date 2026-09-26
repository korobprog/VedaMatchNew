import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { conversationCallStrip } from '@/lib/group-calls/group-call-banner-text';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';

/**
 * Плашка над перепиской: «Идёт звонок · 2 из 4 · [Войти]», а если мы уже
 * внутри — «Вы в звонке · 2 из 4 · [Вернуться в звонок]».
 *
 * Стоит в потоке экрана беседы под шапкой, а не плавает поверх, как
 * прежняя `GroupCallBanner`: та закрывала первые сообщения, и в конференции
 * вход в звонок не замечали (жалоба «сделать понятнее вход»). Кнопка — тот
 * же `join` провайдера, что и в шапке, второго пути подключения нет. Что
 * написать и можно ли нажать, решает чистый `group-call-banner-text.ts`.
 */
export function GroupCallStrip({ conversationId }: { conversationId: string }) {
  const { colors } = useTheme();
  const calls = useGroupCalls();
  if (!calls) return null;

  const own = calls.state.phase === 'active' ? calls.state.call : null;
  const strip = conversationCallStrip(
    conversationId,
    own,
    calls.callInConversation(conversationId),
    calls.selfId,
    calls.state.phase,
  );
  if (!strip) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg1, borderBottomColor: colors.glassBorder }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.dot, { backgroundColor: colors.mint }]}
      />
      {/* Живая область: о начавшемся звонке TalkBack скажет сам, без
          поиска по экрану. Без `numberOfLines` — «Идёт звонок · 2 из 4»
          рядом с кнопкой на узком экране лучше перенести, чем обрезать. */}
      <Text accessibilityLiveRegion="polite" style={[styles.title, { color: colors.text0 }]}>
        {strip.title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strip.action}
        accessibilityState={{ disabled: strip.blocked }}
        disabled={strip.blocked}
        onPress={() => {
          confirmTap();
          if (strip.kind === 'own')
            router.push({ pathname: '/group-call/[id]', params: { id: strip.callId } });
          else void calls.join(strip.callId);
        }}
        android_ripple={strip.blocked ? undefined : ripple(colors.onAccent)}
        style={({ pressed }) => [
          styles.button,
          strip.blocked
            ? { borderColor: colors.glassBorder }
            : { backgroundColor: colors.magenta, borderColor: colors.magenta },
          pressedStyle(pressed),
        ]}
      >
        {/* Погасшая кнопка оставляет причину на себе («Мест нет»): «войти
            нельзя» без объяснения — худший вариант. */}
        <Text style={[styles.action, { color: strip.blocked ? colors.text1 : colors.onAccent }]}>
          {strip.action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  button: {
    minHeight: hitTarget,
    paddingHorizontal: 16,
    borderRadius: hitTarget / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
