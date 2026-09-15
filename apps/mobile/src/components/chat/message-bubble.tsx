import type { ChatMessageDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { attachmentLabel, formatTime } from '@/lib/chat/chat-format';
import { isPendingMessage } from '@/lib/chat/chat-room-state';
import { ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

interface Props {
  message: ChatMessageDto;
  mine: boolean;
  /** Имя автора над пузырём: в группах и каналах для чужих сообщений. */
  showAuthor: boolean;
  /** Долгое нажатие: меню действий, задел под ответы и реакции (VED-167). */
  onLongPress?(message: ChatMessageDto): void;
}

function MessageBubbleImpl({ message, mine, showAuthor, onLongPress }: Props) {
  const { colors } = useTheme();
  const pending = isPendingMessage(message);
  const deleted = Boolean(message.deletedAt);
  const images = message.attachments.filter((attachment) => attachment.kind === 'image' && (attachment.previewUrl || attachment.url));
  const others = message.attachments.filter((attachment) => !images.includes(attachment));
  const status = mine ? (pending ? ' · отправляется' : message.readByOthers ? ' · прочитано' : '') : '';

  return (
    <View style={[styles.wrap, mine ? styles.mine : styles.theirs]}>
      <Pressable
        onLongPress={onLongPress && !pending && !deleted ? () => onLongPress(message) : undefined}
        delayLongPress={350}
        // Удержание видно сразу: вибрация на многих телефонах тихая, а 350 мс
        // без отклика выглядят как зависание.
        android_ripple={onLongPress && !pending && !deleted ? ripple(colors.glassBorder) : undefined}
        accessibilityActions={onLongPress && !pending && !deleted ? [{ name: 'longpress', label: 'Действия с сообщением' }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') onLongPress?.(message);
        }}
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.bg2, borderColor: colors.bg2 }
            : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
          pending && { opacity: 0.6 },
        ]}
      >
        {showAuthor && !mine ? (
          <Text numberOfLines={1} style={[styles.author, { color: colors.violet }]}>
            {message.author.name}
          </Text>
        ) : null}
        {message.forwardedFrom ? (
          <Text style={[styles.meta, { color: colors.text1 }]}>Переслано · {message.forwardedFrom}</Text>
        ) : null}
        {message.replyTo && !deleted ? (
          <View style={[styles.reply, { borderLeftColor: colors.magenta }]}>
            <Text numberOfLines={1} style={[styles.replyAuthor, { color: colors.text1 }]}>
              {message.replyTo.authorName}
            </Text>
            <Text numberOfLines={1} style={[styles.replyBody, { color: colors.text1 }]}>
              {message.replyTo.body || (message.replyTo.attachmentKind ? attachmentLabel(message.replyTo.attachmentKind) : '')}
            </Text>
          </View>
        ) : null}
        {deleted ? (
          <Text style={[styles.deleted, { color: colors.text1 }]}>Сообщение удалено</Text>
        ) : (
          <>
            {images.map((image) => (
              <Image
                key={image.id}
                source={{ uri: image.previewUrl ?? image.url ?? undefined }}
                style={[
                  styles.image,
                  { backgroundColor: colors.bg1, aspectRatio: image.width && image.height ? image.width / image.height : 4 / 3 },
                ]}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                recyclingKey={image.id}
                accessibilityLabel={image.title ?? 'Фото'}
              />
            ))}
            {others.map((attachment) => (
              <View key={attachment.id} style={[styles.chip, { borderColor: colors.glassBorder }]}>
                <Text numberOfLines={1} style={[styles.chipText, { color: colors.text1 }]}>
                  {attachment.title || attachmentLabel(attachment.kind)}
                </Text>
              </View>
            ))}
            {message.body ? <Text style={[styles.body, { color: colors.text0 }]}>{message.body}</Text> : null}
          </>
        )}
        <Text style={[styles.meta, styles.time, { color: colors.text1 }]}>
          {message.editedAt && !deleted ? 'изменено · ' : ''}
          {formatTime(new Date(message.createdAt))}
          {status}
        </Text>
      </Pressable>
      {message.reactions.length > 0 && !deleted ? (
        <View style={[styles.reactions, mine ? styles.mine : styles.theirs]}>
          {message.reactions.map((reaction) => (
            <View
              key={reaction.emoji}
              style={[
                styles.reaction,
                { borderColor: reaction.mine ? colors.magenta : colors.glassBorder, backgroundColor: colors.glass },
              ]}
            >
              <Text style={[styles.reactionText, { color: colors.text0 }]}>
                {reaction.emoji} {reaction.count}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, marginVertical: 3, maxWidth: '100%' },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '84%', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 4, overflow: 'hidden' },
  author: { fontFamily: fonts.bodyBold, fontSize: 13 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  deleted: { fontFamily: fonts.body, fontSize: 14, fontStyle: 'italic' },
  meta: { fontFamily: fonts.body, fontSize: 11 },
  time: { alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  reply: { borderLeftWidth: 3, paddingLeft: 8, gap: 1 },
  replyAuthor: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  replyBody: { fontFamily: fonts.body, fontSize: 12 },
  image: { width: 240, maxWidth: '100%', borderRadius: radius.sm },
  chip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  reaction: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2 },
  reactionText: { fontFamily: fonts.body, fontSize: 12 },
});
