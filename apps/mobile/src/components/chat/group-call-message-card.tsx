import type { ChatAttachmentDto } from '@vedamatch/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { groupCallCardView } from '@/lib/group-calls/group-call-card';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Карточка группового звонка в ленте: «Звонок начался · 2 из 4 · [Войти в
 * звонок]», после конца — «Звонок завершён · 12:05».
 *
 * Карточку пишет сервер, когда комната открывается, и правит, когда
 * закрывается. Живое (места, «Мест нет», «Вернуться») берётся у провайдера
 * по `conversationId` сообщения — тот же источник, что у плашки над
 * перепиской (`GroupCallStrip`), поэтому они не расходятся. Кнопка — тот же
 * `join`, «Вернуться» — тот же экран `group-call/[id]`.
 *
 * Своя подписка на контекст внутри мемоизированного пузыря — нарочно:
 * меняется состав комнаты — перерисовывается карточка, а не вся лента.
 */
export function GroupCallMessageCard({
  attachment,
  conversationId,
}: {
  attachment: ChatAttachmentDto;
  conversationId: string;
}) {
  const { colors } = useTheme();
  const calls = useGroupCalls();
  const view = groupCallCardView(attachment, {
    live: calls?.callInConversation(conversationId) ?? null,
    own: calls?.state.phase === 'active' ? (calls.state.call ?? null) : null,
    selfId: calls?.selfId ?? '',
    phase: calls?.state.phase ?? 'idle',
  });
  // Без провайдера кнопке некуда вести.
  const action = calls ? view.action : null;
  const detail = view.detail ? `Групповой звонок · ${view.detail}` : 'Групповой звонок';

  return (
    <View style={[styles.card, { borderColor: colors.glassBorder }]}>
      <View style={styles.row}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.icon, { backgroundColor: colors.bg1 }]}
        >
          <Svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke={view.live ? colors.cyan : colors.text1}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Circle cx={9} cy={8} r={3} />
            <Path d="M3 19a6 6 0 0 1 12 0" />
            <Path d="M16 6a3 3 0 0 1 0 6" />
            <Path d="M18.5 19a5.5 5.5 0 0 0-2.2-4.4" />
          </Svg>
          {view.live ? <View style={[styles.liveDot, { backgroundColor: colors.mint }]} /> : null}
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text0 }]}>{view.title}</Text>
          <Text style={[styles.detail, { color: colors.text1 }]}>{detail}</Text>
        </View>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.blocked }}
          disabled={action.blocked}
          onPress={() => {
            confirmTap();
            if (action.kind === 'return' && attachment.sourceId)
              router.push({ pathname: '/group-call/[id]', params: { id: attachment.sourceId } });
            else if (attachment.sourceId) void calls?.join(attachment.sourceId);
          }}
          android_ripple={action.blocked ? undefined : ripple(colors.onAccent)}
          style={({ pressed }) => [
            styles.button,
            action.blocked
              ? { borderColor: colors.glassBorder }
              : { backgroundColor: colors.magenta, borderColor: colors.magenta },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.action, { color: action.blocked ? colors.text1 : colors.onAccent }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.sm, padding: 10, gap: 10, minWidth: 220 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  liveDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4 },
  text: { flexShrink: 1, gap: 2 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  detail: { fontFamily: fonts.mono, fontSize: 12 },
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
