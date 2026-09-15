import type { ChatConversationDetail, ChatMessageDto } from '@vedamatch/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessagesSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { formatChatDivider, isNewDay, officialNotifyLabel, readonlyNotice } from '@/lib/chat/chat-format';
import {
  applyReadByOther,
  applyRoomEvent,
  buildPendingMessage,
  dropPendingMessage,
  prependOlder,
  settlePendingMessage,
} from '@/lib/chat/chat-room-state';
import { useChatStream } from '@/lib/chat/chat-stream';
import { setActiveConversation } from '@/lib/push/active-chat';
import { withPlural } from '@/lib/chat/plural';
import { isOnline } from '@/lib/chat/presence';
import { confirmTap, longPressTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
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
  const { width } = useWindowDimensions();
  const { api, user } = useSession();
  const stream = useChatStream();
  const chatApi = useMemo(() => createChatApi(api), [api]);

  // Пока беседа на экране, пуши о её сообщениях не показываются.
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);

  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [typingName, setTypingName] = useState<string | null>(null);
  const [mutedBusy, setMutedBusy] = useState(false);
  const [mutedError, setMutedError] = useState<string | null>(null);
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
    confirmTap();
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

  /** Уведомления официального канала выключены по умолчанию и включаются только здесь. */
  const toggleMuted = useCallback(async () => {
    if (!detail) return;
    const next = !detail.muted;
    confirmTap();
    setMutedBusy(true);
    setMutedError(null);
    try {
      const result = await chatApi.setMuted(conversationId, next);
      setDetail((current) => (current ? { ...current, muted: result.muted } : current));
    } catch {
      setMutedError('Не получилось, попробуйте ещё раз');
    } finally {
      setMutedBusy(false);
    }
  }, [chatApi, conversationId, detail]);

  const showAuthors = detail ? detail.kind !== 'direct' : false;

  // Пока единственное действие — копирование. Ответы и реакции (VED-167)
  // встанут в это же меню.
  const onMessageLongPress = useCallback((message: ChatMessageDto) => {
    longPressTap();
    // Начало текста под заголовком: видно, что именно скопируется.
    const preview = message.body.length > 140 ? `${message.body.slice(0, 140).trimEnd()}…` : message.body;
    Alert.alert('Сообщение', preview, [
      { text: 'Копировать текст', onPress: () => void Clipboard.setStringAsync(message.body) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }, []);

  const renderRow = useCallback<ListRenderItem<Row>>(
    ({ item }) => (
      <View>
        {item.divider ? (
          <Text style={[styles.divider, { color: colors.text1, backgroundColor: colors.bg1 }]}>{item.divider}</Text>
        ) : null}
        <MessageBubble
          message={item.message}
          mine={item.message.author.id === myId}
          showAuthor={showAuthors}
          onLongPress={item.message.body ? onMessageLongPress : undefined}
        />
      </View>
    ),
    [colors, myId, showAuthors, onMessageLongPress],
  );
  const subtitle = detail
    ? detail.kind === 'direct'
      ? isOnline(detail.companion?.lastSeenAt)
        ? 'в сети'
        : ''
      : withPlural(detail.membersCount, detail.kind === 'channel' ? 'подписчик' : 'участник', detail.kind === 'channel' ? 'подписчика' : 'участника', detail.kind === 'channel' ? 'подписчиков' : 'участников')
    : '';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {/* Системная шапка: стрелка «назад» и жест платформы, а не нарисованные
          вручную. Аватар и имя — содержимое заголовка. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={[detail?.title, typingName ? 'печатает' : subtitle].filter(Boolean).join(', ')}
              style={[styles.headerTitleRow, { maxWidth: width - 96 }]}
            >
              {detail ? (
                <ChatAvatar
                  id={detail.companion?.id ?? detail.id}
                  name={detail.title}
                  uri={detail.kind === 'direct' ? detail.companion?.avatarUrl : detail.avatarUrl}
                  size={36}
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
          ),
        }}
      />

      {/* Поле ввода идёт за клавиатурой кадр в кадр. Высота клавиатуры на
          Android уже включает системную панель, а у поля ввода свой отступ
          под неё: offset убирает двойной зазор. */}
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
        {!detail && error ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" style={[styles.info, { color: colors.text1 }]}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
            >
              <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
            </Pressable>
          </View>
        ) : !detail ? (
          <MessagesSkeleton />
        ) : rows.length === 0 ? (
          // Пустая беседа — вне перевёрнутого списка: на Android пустой
          // элемент такого списка отображался зеркально.
          <View style={[styles.center, styles.emptyChat]}>
            <Text style={[styles.info, { color: colors.text1 }]}>Сообщений пока нет. Напишите первым.</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(row) => row.message.id}
            renderItem={renderRow}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.text1} /> : null}
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
                  placeholderTextColor={colors.text1}
                  multiline
                  maxLength={MAX_LENGTH}
                  style={[styles.input, { color: colors.text0, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить"
                  disabled={!draft.trim()}
                  onPress={() => void send()}
                  android_ripple={ripple(colors.glassBorder, true)}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { backgroundColor: draft.trim() ? colors.mint : colors.bg2 },
                    pressedStyle(pressed),
                  ]}
                >
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path
                      d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                      stroke={draft.trim() ? colors.onMint : colors.text1}
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
              <Text style={[styles.info, { color: colors.text2 }]}>{readonlyNotice(detail)}</Text>
              {detail.official ? (
                <>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !detail.muted, busy: mutedBusy }}
                    disabled={mutedBusy}
                    onPress={() => void toggleMuted()}
                    android_ripple={ripple(colors.glassBorder)}
                    style={({ pressed }) => [
                      styles.notify,
                      detail.muted
                        ? { backgroundColor: colors.mint, borderColor: colors.mint }
                        : { borderColor: colors.glassBorder },
                      mutedBusy && { opacity: 0.7 },
                      pressedStyle(pressed),
                    ]}
                  >
                    <Text style={[styles.notifyText, { color: detail.muted ? colors.onMint : colors.text0 }]}>
                      {officialNotifyLabel(detail.muted)}
                    </Text>
                  </Pressable>
                  {mutedError ? (
                    <Text accessibilityRole="alert" style={[styles.info, { color: colors.magenta }]}>
                      {mutedError}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          )
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17 },
  headerSub: { fontFamily: fonts.body, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  info: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyChat: { justifyContent: 'flex-end', paddingBottom: 40 },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
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
  sendButton: { width: hitTarget + 2, height: hitTarget + 2, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendError: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  readonly: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  notify: {
    alignSelf: 'center',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  notifyText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
