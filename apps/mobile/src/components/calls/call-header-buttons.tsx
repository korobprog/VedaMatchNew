import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { ChatConversationDetail } from '@vedamatch/shared';
import { canStartCall, showCallButtons } from '@/lib/calls/call-permission';
import { useChatCalls } from '@/lib/calls/chat-calls-context';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { hitTarget } from '@/theme/tokens';

/**
 * Кнопки «Позвонить»/«Видео» в системной шапке личной переписки — перенос
 * `apps/web/src/components/chat/calls/call-buttons.tsx`. Только `headerRight`
 * (`chat/[id].tsx`), остальная шапка — зона стопки приложения
 * (координация сессий, `VedaMatchNew-mobile-coordination.md`).
 */
export function CallHeaderButtons({ conversation }: { conversation: ChatConversationDetail | null }) {
  const { colors } = useTheme();
  const calls = useChatCalls();

  if (!calls || !conversation || !showCallButtons(conversation)) return null;
  const disabled = !canStartCall(conversation) || calls.state.phase !== 'idle';

  const start = (kind: 'audio' | 'video') => {
    if (disabled) return;
    confirmTap();
    void calls.start(conversation.id, kind);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Аудиозвонок"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => start('audio')}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.button, pressedStyle(pressed), disabled && styles.disabled]}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text0} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </Svg>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Видеозвонок"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => start('video')}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.button, pressedStyle(pressed), disabled && styles.disabled]}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text0} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={7} width={13} height={10} rx={2} />
          <Path d="M16 11l5-3v8l-5-3" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
