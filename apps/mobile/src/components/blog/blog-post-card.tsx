import type { BlogPostDto } from '@vedamatch/shared';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { blogDateLine, blogMetaLine, blogRepostLabel, blogSourceMetaLine, shownContent } from '@/lib/blog/blog-feed-state';
import { buildBlogTextPreview } from '@/lib/blog/blog-format';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { BlogImages } from './blog-images';

export interface BlogPostCardProps {
  post: BlogPostDto;
  now: Date;
  /**
   * `feed` — карточка ленты: текст свёрнут до трёх строк с «Далее», нажатие
   * на картинку или заголовок открывает этот пост. `full` — разворот поста:
   * шапка с автором, текст целиком.
   */
  variant: 'feed' | 'full';
  onOpenPost?: (id: string) => void;
  onOpenAuthor?: (authorId: string) => void;
  /** Бросает — карточка покажет текст ошибки рядом с кнопками. */
  onRepost: (post: BlogPostDto) => Promise<void>;
  onCopy: (post: BlogPostDto) => Promise<void>;
  onDelete: (post: BlogPostDto) => void;
}

/**
 * Пост блог-ленты (VED-334).
 *
 * Порядок — картинка, заголовок, тихая строка с автором и датой, текст,
 * кнопки: по чек-листу VED-238 в ленте «в первую очередь картинка крупным
 * планом, а также заголовок». Шапки с аватаром над картинкой в ленте нет —
 * заказчик просил не отдавать ей место на экране и оставить её в полном
 * развороте поста (`variant="full"`).
 *
 * Лайков и комментариев нет, потому что их нет и у сайта: сервис умеет
 * репост, копирование, удаление своего, а правку и закрепление — сайт.
 */
export const BlogPostCard = memo(function BlogPostCard({
  post,
  now,
  variant,
  onOpenPost,
  onOpenAuthor,
  onRepost,
  onCopy,
  onDelete,
}: BlogPostCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(variant === 'full');
  const [busy, setBusy] = useState<'repost' | 'copy' | null>(null);
  const [done, setDone] = useState<'repost' | 'copy' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = shownContent(post);
  const isRepost = post.repostOf !== null;
  // В развороте имя поделившегося уже в шапке — над оригиналом только слово.
  const repostLabel = isRepost ? (variant === 'full' ? 'Репост' : blogRepostLabel(post)) : null;
  const titleLabel = shown.title ?? 'Пост';
  const preview = buildBlogTextPreview(shown.text);
  const bodyText = expanded ? shown.text : preview.text;
  // Свои слова к репосту — отдельным абзацем под оригиналом.
  const comment = isRepost ? post.text.trim() : '';

  const run = useCallback(
    async (kind: 'repost' | 'copy', action: () => Promise<void>) => {
      setBusy(kind);
      setError(null);
      setDone(null);
      try {
        await action();
        setDone(kind);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось. Попробуйте ещё раз.');
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const open = variant === 'feed' && onOpenPost ? () => onOpenPost(post.id) : undefined;

  return (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      {variant === 'full' ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${post.author.name}. Открыть блог автора`}
          onPress={onOpenAuthor ? () => onOpenAuthor(post.author.id) : undefined}
          disabled={!onOpenAuthor}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.author, pressedStyle(pressed)]}
        >
          <ChatAvatar id={post.author.id} name={post.author.name} uri={post.author.avatarUrl} size={40} />
          <View style={styles.authorText}>
            <Text numberOfLines={1} style={[styles.authorName, { color: colors.text0 }]}>
              {post.author.name}
            </Text>
            <Text style={[styles.meta, { color: colors.text1 }]}>{blogDateLine(post, now)}</Text>
          </View>
        </Pressable>
      ) : null}

      {repostLabel ? <Text style={[styles.repostLabel, { color: colors.text1 }]}>{repostLabel}</Text> : null}

      {shown.images.length > 0 ? (
        open ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Открыть пост: ${titleLabel}`} onPress={open}>
            <BlogImages images={shown.images} label={titleLabel} />
          </Pressable>
        ) : (
          <BlogImages images={shown.images} label={titleLabel} />
        )
      ) : null}

      <View style={styles.body}>
        {shown.title && open ? (
          // Заголовок ведёт в пост так же, как картинка (VED-238, чек-лист:
          // «нажатие на картинку или на заголовок должно открывать данный
          // конкретный пост»). Строка в 22 px пальцу мала — зона по токену.
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Открыть пост: ${shown.title}`}
            onPress={open}
            style={({ pressed }) => [styles.titlePress, pressedStyle(pressed)]}
          >
            <Text numberOfLines={2} style={[styles.title, { color: colors.text0 }]}>
              {shown.title}
            </Text>
          </Pressable>
        ) : shown.title ? (
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
            {shown.title}
          </Text>
        ) : null}

        {variant === 'feed' ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.text1 }]}>
            {isRepost ? blogSourceMetaLine(post, now) : blogMetaLine(post, now)}
          </Text>
        ) : null}

        {bodyText.trim() !== '' ? (
          <Text selectable={variant === 'full'} style={[styles.text, { color: colors.text0 }]}>
            {bodyText}
          </Text>
        ) : null}

        {comment ? (
          <Text selectable={variant === 'full'} style={[styles.text, { color: colors.text0 }]}>
            {comment}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {variant === 'feed' && preview.truncated ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Свернуть текст' : 'Далее — показать текст целиком'}
            onPress={() => setExpanded((value) => !value)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.more, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.moreText, { color: colors.text0 }]}>{expanded ? 'Свернуть' : 'Далее'}</Text>
          </Pressable>
        ) : null}
        <ActionButton
          label={done === 'copy' ? 'Скопировано' : 'Копировать'}
          busy={busy === 'copy'}
          disabled={busy !== null}
          onPress={() => void run('copy', () => onCopy(post))}
        />
        <ActionButton
          label={done === 'repost' ? 'Репост готов' : shown === post && post.repostCount > 0 ? `Репост · ${post.repostCount}` : 'Репост'}
          busy={busy === 'repost'}
          disabled={busy !== null || done === 'repost'}
          onPress={() => void run('repost', () => onRepost(post))}
        />
        {post.canManage ? (
          <ActionButton label="Удалить" disabled={busy !== null} onPress={() => onDelete(post)} />
        ) : null}
      </View>

      {error ? (
        <View style={styles.error}>
          <InlineError message={error} />
        </View>
      ) : null}
    </View>
  );
});

function ActionButton({
  label,
  busy = false,
  disabled = false,
  onPress,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.action, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      {busy ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.actionText, { color: colors.text0 }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderTopWidth: 1, borderBottomWidth: 1, overflow: 'hidden' },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: hitTarget, paddingHorizontal: 16, paddingVertical: 10 },
  authorText: { flex: 1, minWidth: 0, gap: 2 },
  authorName: { fontFamily: fonts.bodyBold, fontSize: 15 },
  repostLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  titlePress: { minHeight: hitTarget, justifyContent: 'center' },
  title: { fontFamily: fonts.displayMedium, fontSize: 16, lineHeight: 22 },
  meta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  // «Далее» забирает свободную ширину ряда: крупная надпись, а не ещё одна
  // маленькая кнопка — «достаточно крупную кнопку-надпись» (VED-371).
  more: {
    flexGrow: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  moreText: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  action: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  error: { paddingHorizontal: 16, paddingBottom: 12 },
});
