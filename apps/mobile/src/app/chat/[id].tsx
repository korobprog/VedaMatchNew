import type { ChatConversationDetail, ChatMessageDto } from '@vedamatch/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { MessageBubble } from '@/components/chat/message-bubble';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { formatChatDivider, isNewDay } from '@/lib/chat/chat-format';
import {
  applyReadByOther,
  applyRoomEvent,
  buildPendingMessage,
  dropPendingMessage,
  prependOlder,
  settlePendingMessage,
} from '@/lib/chat/chat-room-state';
import { useChatStream } from '@/lib/chat/chat-stream';
import { withPlural } from '@/lib/chat/plural';
import { isOnline } from '@/lib/chat/presence';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Лимит длины сообщения, как на сервере (`CHAT_MESSAGE_MAX_LENGTH`). */
const MAX_LENGTH = 2000;
/** Не чаще раза в три секунды, как сайт: событие «печатает» живёт пять. */
const TYPING_THROTTLE_MS = 3_000;
const TYPING_VISIBLE_MS = 5_000;

type Row = { kind: 'message'; message: ChatMessageDto; divider: string | null };

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user } = useSession();
  const stream = useChatStream();
  const chatApi = useMemo(() => createChatApi(api), [api]);

  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [typingName, setTypingName] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const myId = user?.id ?? '';

  const markRead = useCallback(() => {
    chatApi.markRead(conversationId).catch(() => undefined);
  }, [chatApi, conversationId]);

  const load = useCallback(async () => {
    try {
      const next = await chatApi.detail(conversationId);
      setDetail(next);
      setMessages((current) => {
        // Черновики, ещё не получившие ответа, переживают перечитывание.
        const pending = current.filter((message) => message.id.startsWith('pending:'));
        return [...next.messages, ...pending];
      });
      setHasMore(next.hasMore);
      setError(null);
      markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть беседу');
    }
  }, [chatApi, conversationId, markRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offEvents = stream.subscribe((event) => {
      if (!('conversationId' in event) || event.conversationId !== conversationId) return;
      if (event.type === 'typing') {
        if (event.user.id === myId) return;
        setTypingName(event.user.name);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingName(null), TYPING_VISIBLE_MS);
        return;
      }
      if (event.type === 'read') {
        if (event.userId !== myId && detail?.kind === 'direct') {
          setMessages((current) => applyReadByOther(current, myId, event.lastReadAt));
        }
        return;
      }
      setMessages((current) => applyRoomEvent(current, event, conversationId));
      if (event.type === 'message.created' && event.message.author.id !== myId) {
        setTypingName(null);
        markRead();
      }
    });
    const offResync = stream.onResync(() => void load());
    return () => {
      offEvents();
      offResync();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [stream, conversationId, myId, detail?.kind, load, markRead]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((message) => !message.id.startsWith('pending:'));
    if (!hasMore || loadingOlder || !oldest) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.detail(conversationId, oldest.createdAt);
      setMessages((current) => prependOlder(current, page.messages));
      setHasMore(page.hasMore);
    } catch {
      // Следующая прокрутка вверх попробует снова.
    } finally {
      setLoadingOlder(false);
    }
  }, [chatApi, conversationId, hasMore, loadingOlder, messages]);

  const onChangeDraft = useCallback(
    (text: string) => {
      setDraft(text);
      const now = Date.now();
      if (text.trim() && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
        lastTypingSent.current = now;
        chatApi.typing(conversationId).catch(() => undefined);
      }
    },
    [chatApi, conversationId],
  );

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !user) return;
    const pending = buildPendingMessage({
      seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      body,
      now: new Date(),
    });
    setDraft('');
    setSendError(null);
    setMessages((current) => [...current, pending]);
    try {
      const saved = await chatApi.send(conversationId, { body });
      setMessages((current) => settlePendingMessage(current, pending.id, saved));
    } catch (e) {
      setMessages((current) => dropPendingMessage(current, pending.id));
      setDraft((current) => current || body);
      setSendError(e instanceof Error ? e.message : 'Сообщение не отправлено');
    }
  }, [chatApi, conversationId, draft, user]);

  // FlatList перевёрнут: новые снизу, данные в обратном порядке.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = messages.map((message, index) => ({
      kind: 'message',
      message,
      divider: isNewDay(messages[index - 1], message) ? formatChatDivider(message.createdAt) : null,
    }));
    return out.reverse();
  }, [messages]);

  const showAuthors = detail ? detail.kind !== 'direct' : false;
  const subtitle = detail
    ? detail.kind === 'direct'
      ? isOnline(detail.companion?.lastSeenAt)
        ? 'в сети'
        : ''
      : withPlural(detail.membersCount, detail.kind === 'channel' ? 'подписчик' : 'участник', detail.kind === 'channel' ? 'подписчика' : 'участника', detail.kind === 'channel' ? 'подписчиков' : 'участников')
    : '';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.glassBorder, backgroundColor: colors.bg0 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path d="m15 18-6-6 6-6" stroke={colors.text0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Pressable>
        {detail ? (
          <ChatAvatar
            id={detail.companion?.id ?? detail.id}
            name={detail.title}
            uri={detail.kind === 'direct' ? detail.companion?.avatarUrl : detail.avatarUrl}
            size={40}
          />
        ) : null}
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text0 }]}>
            {detail?.title ?? ' '}
          </Text>
          {typingName || subtitle ? (
            <Text numberOfLines={1} style={[styles.headerSub, { color: typingName ? colors.cyan : colors.text2 }]}>
              {typingName ? `${detail?.kind === 'direct' ? '' : `${typingName} `}печатает…` : subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {!detail ? (
          <View style={styles.center}>
            {error ? (
              <>
                <Text style={[styles.info, { color: colors.text1 }]}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void load()} style={[styles.retry, { borderColor: colors.glassBorder }]}>
                  <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colors.magenta} />
            )}
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(row) => row.message.id}
            renderItem={({ item }) => (
              <View>
                {item.divider ? (
                  <Text style={[styles.divider, { color: colors.text2, backgroundColor: colors.bg1 }]}>{item.divider}</Text>
                ) : null}
                <MessageBubble message={item.message} mine={item.message.author.id === myId} showAuthor={showAuthors} />
              </View>
            )}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.text2} /> : null}
            ListEmptyComponent={
              <Text style={[styles.info, styles.emptyInverted, { color: colors.text2 }]}>Сообщений пока нет. Напишите первым.</Text>
            }
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {detail ? (
          detail.canWrite ? (
            <View style={[styles.composer, { borderTopColor: colors.glassBorder, paddingBottom: insets.bottom + 8, backgroundColor: colors.bg0 }]}>
              {sendError ? (
                <Text accessibilityRole="alert" style={[styles.sendError, { color: colors.magenta }]}>
                  {sendError}
                </Text>
              ) : null}
              <View style={styles.composerRow}>
                <TextInput
                  value={draft}
                  onChangeText={onChangeDraft}
                  placeholder="Сообщение"
                  placeholderTextColor={colors.text2}
                  multiline
                  maxLength={MAX_LENGTH}
                  style={[styles.input, { color: colors.text0, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить"
                  disabled={!draft.trim()}
                  onPress={() => void send()}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { backgroundColor: draft.trim() ? colors.mint : colors.bg2 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path
                      d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                      stroke={draft.trim() ? colors.onMint : colors.text2}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[styles.readonly, { borderTopColor: colors.glassBorder, paddingBottom: insets.bottom + 12 }]}>
              <Text style={[styles.info, { color: colors.text2 }]}>
                {detail.state === 'request'
                  ? 'Запрос на переписку. Принять или отклонить можно на сайте.'
                  : detail.kind === 'channel'
                    ? 'В канал пишет администрация общины.'
                    : 'Писать в эту беседу нельзя.'}
              </Text>
            </View>
          )
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17 },
  headerSub: { fontFamily: fonts.body, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  info: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyInverted: { transform: [{ scaleY: -1 }], paddingTop: 40 },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  list: { paddingVertical: 12 },
  older: { paddingVertical: 12 },
  divider: {
    alignSelf: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginVertical: 10,
  },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: hitTarget,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  sendButton: { width: hitTarget + 2, height: hitTarget + 2, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sendError: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  readonly: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12 },
});
