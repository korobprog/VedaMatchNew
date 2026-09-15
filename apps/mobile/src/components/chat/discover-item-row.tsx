import type { ChatDiscoverItem } from '@vedamatch/shared';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { discoverActionLabel, discoverSubtitle } from '@/lib/chat/discover-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { ChatAvatar } from './chat-avatar';

interface Props {
  item: ChatDiscoverItem;
  /** Идёт `subscribe` именно по этой беседе. */
  busy: boolean;
  /** Идёт `subscribe` по другой беседе — эта кнопка временно не нажимается. */
  disabled: boolean;
  onOpen(conversationId: string): void;
  onJoin(item: ChatDiscoverItem): void;
}

/** Строка каталога открытых бесед общины: беседа + «Открыть»/«Подписаться»/«Вступить». */
function DiscoverItemRowImpl({ item, busy, disabled, onOpen, onJoin }: Props) {
  const { colors } = useTheme();
  const { conversation, joined } = item;
  const actionLabel = discoverActionLabel(conversation.kind);

  return (
    <View style={styles.row}>
      <ChatAvatar id={conversation.id} name={conversation.title} uri={conversation.avatarUrl} size={48} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text0 }]}>
          {conversation.title}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text1 }]}>
          {discoverSubtitle(conversation)}
        </Text>
      </View>

      {joined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть ${conversation.title}`}
          onPress={() => onOpen(conversation.id)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.button, styles.openButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.buttonText, { color: colors.text0 }]}>Открыть</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? `Вхожу в ${conversation.title}` : `${actionLabel}: ${conversation.title}`}
          accessibilityState={{ disabled: disabled || busy, busy }}
          disabled={disabled || busy}
          onPress={() => onJoin(item)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.mint },
            (disabled || busy) && styles.buttonDisabled,
            pressedStyle(pressed),
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onMint} size="small" />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onMint }]}>{actionLabel}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export const DiscoverItemRow = memo(DiscoverItemRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 68 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  title: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 15 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
  button: {
    minHeight: hitTarget,
    minWidth: 96,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  openButton: { borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'center' },
});
