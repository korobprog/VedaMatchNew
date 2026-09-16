import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { companionOf } from '@/lib/calls/call-machine';
import { useChatCalls } from '@/lib/calls/call-provider';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Входящий звонок поверх любого экрана приложения — перенос
 * `apps/web/src/components/chat/calls/incoming-call-banner.tsx`. Баннер, а
 * не сразу полный экран: «ответить»/«отклонить» — два жеста, которым не
 * нужен весь экран до того, как решение принято (полный экран появляется
 * после ответа — `app/call/[id].tsx`, через `call-provider.tsx`).
 */
export function IncomingCallBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const calls = useChatCalls();

  if (!calls || calls.state.phase !== 'incoming' || !calls.state.call) return null;
  const { call } = calls.state;
  const from = companionOf(call, calls.selfId);

  const decline = () => {
    confirmTap();
    void calls.decline();
  };
  const accept = () => {
    confirmTap();
    void calls.accept();
  };

  return (
    <View
      style={[
        styles.root,
        { top: insets.top + 10, backgroundColor: colors.bg1, borderColor: colors.glassBorder },
      ]}
    >
      {/* `accessible` только на строке имени: она без интерактивных детей,
          и её можно безопасно схлопнуть в один элемент для читалки экрана.
          На весь баннер `accessible` нельзя — он спрятал бы кнопки ниже от
          TalkBack, у которых собственная роль. */}
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${call.kind === 'video' ? 'Входящий видеозвонок' : 'Входящий аудиозвонок'} от ${from.name}`}
        style={styles.row}
      >
        <ChatAvatar id={from.id} name={from.name} uri={from.avatarUrl} size={48} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
            {from.name}
          </Text>
          <Text style={[styles.kind, { color: colors.text1 }]}>
            {call.kind === 'video' ? 'Входящий видеозвонок' : 'Входящий аудиозвонок'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отклонить звонок"
          onPress={decline}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.button,
            { borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.text0 }]}>Отклонить</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ответить на звонок"
          onPress={accept}
          android_ripple={ripple(colors.onAccent, false)}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>Ответить</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    gap: 12,
    // На Android z-порядок сиблингов не гарантирует, что баннер ляжет поверх
    // навигатора со своей elevation (шапки экранов) — задаём с запасом.
    elevation: 32,
    zIndex: 1000,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.displayBold, fontSize: 16 },
  kind: { fontFamily: fonts.body, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minHeight: hitTarget,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
