import type { ChatRequestSummary } from '@vedamatch/shared';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RequestCard } from '@/components/chat/request-card';
import { ChatListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { withoutHandled, withoutRequest, type RequestAction } from '@/lib/chat/chat-requests-state';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

const keyOf = (request: ChatRequestSummary) => request.conversation.id;

/**
 * Запросы на переписку: первое сообщение от незнакомого человека. Принять —
 * открыть переписку, отклонить — писать он больше не сможет. Поведение то же,
 * что на сайте (`chat-requests-view.tsx`).
 */
export default function ChatRequestsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const chatApi = useMemo(() => createChatApi(api), [api]);
  const [requests, setRequests] = useState<ChatRequestSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Занятость по каждой карточке: действия по двум карточкам не сбрасывают
  // друг другу крутилку.
  const [busy, setBusy] = useState<Record<string, RequestAction>>({});
  const handled = useRef(new Set<string>());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const state = await chatApi.requests();
      setRequests(withoutHandled(state.requests, handled.current));
      setLoadError(null);
    } catch (e) {
      setLoadError(screenErrorText('app/chat/requests', e, 'Не удалось загрузить запросы'));
    }
  }, [chatApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const accept = useCallback(
    async (request: ChatRequestSummary) => {
      const id = request.conversation.id;
      confirmTap();
      setBusy((current) => ({ ...current, [id]: 'accept' }));
      setActionError(null);
      try {
        await chatApi.accept(id);
        handled.current.add(id);
        setRequests((current) => (current ? withoutRequest(current, id) : current));
        // Вперёд, а не заменой: «назад» из переписки вернёт к остальным запросам.
        router.push({ pathname: '/chat/[id]', params: { id } });
      } catch (e) {
        // Запрос мог быть уже разобран в другом месте: повтор не поможет,
        // карточку убираем, а не оставляем сломанной.
        setActionError(screenErrorText('app/chat/requests', e, 'Не получилось принять запрос'));
        handled.current.add(id);
        setRequests((current) => (current ? withoutRequest(current, id) : current));
      } finally {
        setBusy(({ [id]: _done, ...rest }) => rest);
      }
    },
    [chatApi],
  );

  const decline = useCallback(
    async (request: ChatRequestSummary) => {
      const id = request.conversation.id;
      confirmTap();
      setBusy((current) => ({ ...current, [id]: 'decline' }));
      setActionError(null);
      try {
        await chatApi.decline(id);
        handled.current.add(id);
        setRequests((current) => (current ? withoutRequest(current, id) : current));
      } catch (e) {
        setActionError(screenErrorText('app/chat/requests', e, 'Не получилось отклонить запрос'));
      } finally {
        setBusy(({ [id]: _done, ...rest }) => rest);
      }
    },
    [chatApi],
  );

  const renderItem = useCallback<ListRenderItem<ChatRequestSummary>>(
    ({ item }) => (
      <RequestCard request={item} busyAction={busy[item.conversation.id] ?? null} onAccept={accept} onDecline={decline} />
    ),
    [busy, accept, decline],
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

  const header =
    actionError || (loadError && requests) || (requests && requests.length > 0) ? (
      <View style={styles.headerBlock}>
        {actionError ? (
          <Text accessibilityRole="alert" style={[styles.banner, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
            {actionError}
          </Text>
        ) : null}
        {loadError && requests ? (
          <View style={[styles.bannerRow, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
            <Text accessibilityRole="alert" style={[styles.bannerText, { color: colors.text0 }]}>
              {loadError}
            </Text>
            {retryButton}
          </View>
        ) : null}
        {requests && requests.length > 0 ? (
          <Text style={[styles.hint, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            Пока вы не ответили, человек может отправить только одно сообщение и не видит, прочитано ли оно.
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Запросы на переписку',
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
          headerShadowVisible: false,
        }}
      />
      {!requests && loadError ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.empty, { color: colors.text1 }]}>
            {loadError}
          </Text>
          {retryButton}
        </View>
      ) : !requests ? (
        <ChatListSkeleton />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[styles.empty, styles.emptyBox, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              Запросов нет. Здесь появляется первое сообщение от незнакомых людей.
            </Text>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  headerBlock: { gap: 12 },
  banner: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, borderWidth: 1, borderRadius: radius.sm, padding: 12, overflow: 'hidden' },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, borderWidth: 1, borderRadius: radius.sm, padding: 12, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyBox: { borderWidth: 1, borderRadius: radius.md, padding: 32, overflow: 'hidden' },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
