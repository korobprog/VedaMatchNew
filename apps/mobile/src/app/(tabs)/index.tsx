import type { ChatConversationSummary } from '@vedamatch/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationRow } from '@/components/chat/conversation-row';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { applyListEvent, sortConversations } from '@/lib/chat/chat-list-state';
import { useChatStream } from '@/lib/chat/chat-stream';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user } = useSession();
  const stream = useChatStream();
  const chatApi = useMemo(() => createChatApi(api), [api]);
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

  useEffect(() => {
    void load();
  }, [load]);

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

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Чаты
      </Text>
      {requestsCount > 0 ? (
        <Text style={[styles.requests, { color: colors.text1 }]}>
          Запросов на переписку: {requestsCount}. Ответить можно на сайте.
        </Text>
      ) : null}
    </View>
  );

  if (!conversations) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        {error ? (
          <View style={styles.center}>
            <Text style={[styles.empty, { color: colors.text1 }]}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={[styles.retry, { borderColor: colors.glassBorder }]}
            >
              <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator style={styles.center} color={colors.magenta} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })} />
        )}
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
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  requests: { fontFamily: fonts.body, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
