import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ChatConversationDetail } from '@vedamatch/shared';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { canStartGroupCall, groupCallButtonLabel } from '@/lib/group-calls/group-call-entry';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { hitTarget } from '@/theme/tokens';

/**
 * Кнопка группового звонка в шапке беседы — рядом с кнопками звонка один
 * на один (`call-header-buttons.tsx`), но для групп, а не личных диалогов.
 * Одна кнопка на оба случая: «начать» и «присоединиться» — это одна
 * операция на сервере, и две кнопки только путали бы.
 */
export function GroupCallHeaderButton({
  conversation,
}: {
  conversation: ChatConversationDetail | null;
}) {
  const { colors } = useTheme();
  const calls = useGroupCalls();
  const conversationId = conversation?.id ?? null;
  const watch = calls?.watchConversation;

  // Беседу открыли — спрашиваем, не идёт ли в ней звонок: он мог начаться,
  // пока приложение было закрыто, и события потока о нём не расскажут.
  useEffect(() => {
    if (conversationId && watch) watch(conversationId);
  }, [conversationId, watch]);

  if (!calls || !conversation || !canStartGroupCall(conversation)) return null;
  const ongoing = calls.callInConversation(conversation.id);
  const label = groupCallButtonLabel(ongoing, calls.state.phase);
  const disabled = label.disabled;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label.text}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          confirmTap();
          void calls.startOrJoin(conversation.id);
        }}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [
          styles.button,
          pressedStyle(pressed),
          disabled && styles.disabled,
        ]}
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke={ongoing ? colors.cyan : colors.text0}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx={9} cy={8} r={3} />
          <Path d="M3 19a6 6 0 0 1 12 0" />
          <Path d="M16 6a3 3 0 0 1 0 6" />
          <Path d="M18.5 19a5.5 5.5 0 0 0-2.2-4.4" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    width: hitTarget,
    height: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
