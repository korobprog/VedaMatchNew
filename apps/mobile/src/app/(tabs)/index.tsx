import type { ChatConversationSummary } from '@vedamatch/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlogHomeStrip } from '@/components/blog/blog-home-strip';
import { ConversationRow } from '@/components/chat/conversation-row';
import { QuickConferenceRow } from '@/components/chat/quick-conference-row';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ChatListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { applyListEvent, sortConversations } from '@/lib/chat/chat-list-state';
import { useChatStream } from '@/lib/chat/chat-stream';
import { createInboxApi } from '@/lib/notifications/inbox-api';
import { setUnreadCount } from '@/lib/notifications/unread-store';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const keyOf = (item: ChatConversationSummary) => item.id;

function openConversation(id: string) {
  router.push({ pathname: '/chat/[id]', params: { id } });
}

export default function ChatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user } = useSession();
  const stream = useChatStream();
  const chatApi = useMemo(() => createChatApi(api), [api]);
  const inboxApi = useMemo(() => createInboxApi(api), [api]);
  const [conversations, setConversations] = useState<ChatConversationSummary[] | null>(null);
  const [requestsCount, setRequestsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const state = await chatApi.list();
      setConversations(sortConversations(state.conversations));
      setRequestsCount(state.requestsCount);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить беседы');
    }
  }, [chatApi]);

  // При каждом возврате на вкладку: счётчик запросов мог измениться на экране
  // запросов, а поток событий о нём не сообщает.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Значок на колокольчике (VED-330). Отдельный лёгкий запрос, как на сайте:
  // число нужно и тому, кто в ленту не заходил. Молча глохнет при ошибке —
  // ради значка показывать человеку баннер поверх списка бесед незачем, а
  // следующий возврат на вкладку попробует снова.
  useFocusEffect(
    useCallback(() => {
      void inboxApi
        .unreadCount()
        .then((response) => setUnreadCount(response.unreadCount))
        .catch(() => undefined);
    }, [inboxApi]),
  );

  useEffect(() => {
    const myId = user?.id ?? '';
    const offEvents = stream.subscribe((event) => {
      setConversations((current) => (current ? applyListEvent(current, event, myId) : current));
    });
    const offResync = stream.onResync(() => void load());
    return () => {
      offEvents();
      offResync();
    };
  }, [stream, user?.id, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback<ListRenderItem<ChatConversationSummary>>(
    ({ item }) => <ConversationRow conversation={item} onPress={openConversation} />,
    [],
  );

  const retryButton = (
    <Pressable
      accessibilityRole="button"
      onPress={() => void load()}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
    </Pressable>
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Чаты
        </Text>
        {/* Колокольчик уведомлений (VED-330) — здесь, а не шестой вкладкой
            внизу: «Чаты» открываются при запуске, значок непрочитанного
            попадается на глаза сам. Обоснование целиком — у компонента. */}
        <NotificationBell />
        {/* Завести группу или канал общины (VED-292) — то же, что кнопка
            «Новая группа» в шапке списка бесед на сайте. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Новая беседа"
          accessibilityHint="Открывает форму новой группы или канала"
          onPress={() => router.push('/chat/new')}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.newButton,
            { borderColor: colors.glassBorder, backgroundColor: colors.glass },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.newButtonText, { color: colors.text0 }]}>Новая</Text>
        </Pressable>
      </View>
      {/* Быстрая конференция (VED-360) — строкой под заголовком, а не
          значком в ряду: у неё есть что сказать словами, включая потолок
          в четыре человека, а значок этого не скажет. */}
      <QuickConferenceRow />
      {/* Блог-лента (VED-334): первое, что видно на главной сайта, — здесь
          начало ленты полосой над беседами. Почему в «Чатах», а не шестой
          вкладкой, — у компонента. Скрытая полоса не оставляет ничего. */}
      <BlogHomeStrip />
      {requestsCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Запросов на переписку: ${requestsCount}`}
          accessibilityHint="Открывает список запросов"
          onPress={() => router.push('/chat/requests')}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.requestsRow, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, pressedStyle(pressed)]}
        >
          <Text style={[styles.requests, { color: colors.text0 }]}>Запросов на переписку: {requestsCount}</Text>
          <Text style={[styles.requestsChevron, { color: colors.text1 }]}>›</Text>
        </Pressable>
      ) : null}
      {/* Обновление не удалось, а список уже есть: он остаётся, ошибка — рядом. */}
      {error && conversations ? (
        <View style={[styles.banner, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <Text accessibilityRole="alert" style={[styles.bannerText, { color: colors.text0 }]}>
            {error}
          </Text>
          {retryButton}
        </View>
      ) : null}
    </View>
  );

  if (!conversations) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        {error ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" style={[styles.empty, { color: colors.text1 }]}>
              {error}
            </Text>
            {retryButton}
          </View>
        ) : (
          <ChatListSkeleton />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <FlatList
        data={conversations}
        keyExtractor={keyOf}
        ListHeaderComponent={header}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.text1, paddingHorizontal: 20 }]}>
            Бесед пока нет. Найти людей и общины можно на соседних вкладках.
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 24 },
  newButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  newButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    marginTop: 4,
    overflow: 'hidden',
  },
  requests: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  requestsChevron: { fontFamily: fonts.bodyBold, fontSize: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12, marginTop: 4 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retry: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
