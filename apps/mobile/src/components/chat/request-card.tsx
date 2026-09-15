import type { ChatRequestSummary } from '@vedamatch/shared';
import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatChatStamp } from '@/lib/chat/chat-format';
import { requestPreview, startsHidden } from '@/lib/chat/chat-requests-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { ChatAvatar } from './chat-avatar';

interface Props {
  request: ChatRequestSummary;
  /** Действие по этой карточке в процессе: обе кнопки заняты. */
  busy: boolean;
  onAccept(request: ChatRequestSummary): void;
  onDecline(request: ChatRequestSummary): void;
}

/** Карточка запроса на переписку, как на сайте (`chat-requests-view.tsx`). */
function RequestCardImpl({ request, busy, onAccept, onDecline }: Props) {
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(!startsHidden(request));
  const preview = requestPreview(request);

  if (!revealed) {
    return (
      <View style={[styles.hidden, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
        <View style={styles.hiddenText}>
          <Text style={[styles.hiddenTitle, { color: colors.text0 }]}>Скрытый запрос</Text>
          <Text style={[styles.meta, { color: colors.text1 }]}>Профиль без фото и без общин</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Показывает имя и первое сообщение"
          onPress={() => setRevealed(true)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.secondary, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.secondaryText, { color: colors.text0 }]}>Показать</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <View style={styles.header}>
        <ChatAvatar id={request.from.id} name={request.from.name} uri={request.from.avatarUrl} size={44} />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
            {request.from.name}
          </Text>
          <Text style={[styles.meta, { color: colors.text1 }]}>Хочет написать вам</Text>
        </View>
        <Text style={[styles.stamp, { color: colors.text1 }]}>{formatChatStamp(request.createdAt)}</Text>
      </View>

      {preview ? (
        <Text selectable style={[styles.message, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          {preview}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Принять запрос от ${request.from.name}`}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => onAccept(request)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.mint, borderColor: colors.mint },
            busy ? styles.busy : pressedStyle(pressed),
          ]}
        >
          {busy ? <ActivityIndicator color={colors.onMint} /> : <Text style={[styles.primaryText, { color: colors.onMint }]}>Принять</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Отклонить запрос от ${request.from.name}`}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => onDecline(request)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.secondary,
            styles.grow,
            { borderColor: colors.glassBorder },
            busy ? styles.busy : pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.secondaryText, { color: colors.text0 }]}>Отклонить</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const RequestCard = memo(RequestCardImpl);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  stamp: { fontFamily: fonts.body, fontSize: 12, fontVariant: ['tabular-nums'] },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  busy: { opacity: 0.6 },
  hidden: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, padding: 14 },
  hiddenText: { flex: 1, gap: 2 },
  hiddenTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
