import type { ChatConversationSummary } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { conversationA11yLabel, formatChatStamp, previewOf, unreadLabel } from '@/lib/chat/chat-format';
import { isOnline } from '@/lib/chat/presence';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';
import { ChatAvatar } from './chat-avatar';

interface Props {
  conversation: ChatConversationSummary;
  /** Id вместо замыкания: колбэк один на весь список, и memo строки не сбрасывается. */
  onPress(id: string): void;
}

const KIND_LABEL: Record<ChatConversationSummary['kind'], string | null> = {
  direct: null,
  group: 'Группа',
  channel: 'Канал',
};

function ConversationRowImpl({ conversation, onPress }: Props) {
  const { colors } = useTheme();
  const companion = conversation.companion;
  const avatarId = companion?.id ?? conversation.id;
  const avatarUri = conversation.kind === 'direct' ? companion?.avatarUrl : conversation.avatarUrl;
  const unread = conversation.unreadCount > 0;
  const online = conversation.kind === 'direct' && isOnline(companion?.lastSeenAt);
  // У официального канала своя плашка, а «без звука» — его обычное состояние,
  // о котором нет смысла напоминать в каждой строке.
  const kindLabel = conversation.official ? 'Официальный' : KIND_LABEL[conversation.kind];
  const showMuted = conversation.muted && !conversation.official;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={conversationA11yLabel(conversation, online)}
      accessibilityHint={previewOf(conversation)}
      onPress={() => onPress(conversation.id)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <ChatAvatar id={avatarId} name={conversation.title} uri={avatarUri} online={online} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text0 }]}>
            {conversation.title}
          </Text>
          {kindLabel ? (
            <Text
              style={[
                styles.kind,
                conversation.official
                  ? { color: colors.onMint, backgroundColor: colors.mint, borderColor: colors.mint }
                  : { color: colors.text2, borderColor: colors.glassBorder },
              ]}
            >
              {kindLabel}
            </Text>
          ) : null}
          <Text style={[styles.stamp, { color: colors.text2 }]}>{formatChatStamp(conversation.lastMessageAt)}</Text>
        </View>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[styles.preview, { color: unread ? colors.text0 : colors.text1 }]}>
            {previewOf(conversation)}
          </Text>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: conversation.muted ? colors.bg2 : colors.mint }]}>
              <Text style={[styles.badgeText, { color: conversation.muted ? colors.text1 : colors.onMint }]}>
                {unreadLabel(conversation.unreadCount)}
              </Text>
            </View>
          ) : showMuted ? (
            <Text style={[styles.muted, { color: colors.text2 }]}>без звука</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Строка перерисовывается, только когда пришла новая версия её беседы. */
export const ConversationRow = memo(ConversationRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 76,
  },
  body: { flex: 1, gap: 4, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 16 },
  kind: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stamp: { marginLeft: 'auto', fontFamily: fonts.body, fontSize: 12, fontVariant: ['tabular-nums'] },
  preview: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, fontVariant: ['tabular-nums'] },
  muted: { fontFamily: fonts.body, fontSize: 12 },
});

export const conversationRowRadius = radius.md;
