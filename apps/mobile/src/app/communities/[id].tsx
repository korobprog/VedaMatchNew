import type { ChatDiscoverItem, CommunityKind } from '@vedamatch/shared';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscoverItemRow } from '@/components/chat/discover-item-row';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { DiscoverListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { markJoined } from '@/lib/chat/discover-state';
import { COMMUNITY_KIND_LABELS } from '@/lib/communities/community-labels';
import { confirmTap } from '@/lib/feedback';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

const keyOf = (item: ChatDiscoverItem) => item.conversation.id;

/**
 * Список открытых бесед конкретной общины (`GET /chat/discover?communityId=`).
 * Название и вид общины берутся из параметров роута (переданы вкладкой
 * «Общины» из `CommunityBadgeDto`), отдельный запрос за общиной не нужен —
 * риск, отмеченный в spec.md VED-170.
 */
export default function CommunityDiscoverScreen() {
  const params = useLocalSearchParams<{ id: string; name: string; kind: string; city: string; isVerified: string }>();
  const communityId = String(params.id);
  const communityName = params.name ? String(params.name) : 'Община';
  const kindLabel = params.kind ? COMMUNITY_KIND_LABELS[params.kind as CommunityKind] : null;
  const city = params.city ? String(params.city) : null;

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const chatApi = useMemo(() => createChatApi(api), [api]);

  const [items, setItems] = useState<ChatDiscoverItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const state = await chatApi.discover({ communityId });
      if (request.current === id) {
        setItems(state.items);
        setLoadError(null);
      }
    } catch (e) {
      if (request.current === id) {
        setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить беседы общины');
      }
    } finally {
      if (request.current === id) setRefreshing(false);
    }
  }, [chatApi, communityId]);

  // Общину могли открыть заново с другого членства или список бесед
  // изменился на сайте — перечитываем при каждом возврате на экран.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const openConversation = useCallback((conversationId: string) => {
    router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
  }, []);

  const join = useCallback(
    async (item: ChatDiscoverItem) => {
      const id = item.conversation.id;
      confirmTap();
      setBusyId(id);
      setActionError(null);
      try {
        await chatApi.subscribe(id);
        openConversation(id);
        setItems((current) => (current ? markJoined(current, id) : current));
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Не получилось войти в беседу');
      } finally {
        setBusyId(null);
      }
    },
    [chatApi, openConversation],
  );

  const renderItem = useCallback<ListRenderItem<ChatDiscoverItem>>(
    ({ item }) => (
      <DiscoverItemRow
        item={item}
        busy={busyId === item.conversation.id}
        disabled={busyId !== null && busyId !== item.conversation.id}
        onOpen={openConversation}
        onJoin={join}
      />
    ),
    [busyId, openConversation, join],
  );

  const contextLine = [kindLabel, city].filter(Boolean).join(' · ');

  const header = (
    <View style={styles.headerBlock}>
      {contextLine ? <Text style={[styles.context, { color: colors.text1 }]}>{contextLine}</Text> : null}
      {actionError ? <InlineError message={actionError} /> : null}
      {loadError && items ? (
        <View style={[styles.bannerRow, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <Text accessibilityRole="alert" style={[styles.bannerText, { color: colors.text0 }]}>
            {loadError}
          </Text>
          <RetryButton onPress={() => void load()} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: communityName,
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
          headerShadowVisible: false,
        }}
      />
      {!items && loadError ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.empty, { color: colors.text1 }]}>
            {loadError}
          </Text>
          <RetryButton onPress={() => void load()} />
        </View>
      ) : !items ? (
        <View style={styles.list}>
          <DiscoverListSkeleton />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[styles.empty, styles.emptyBox, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              Открытых бесед пока нет. Общины откроют свои чаты и каналы — они появятся здесь.
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
  list: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  headerBlock: { gap: 12, marginBottom: 4 },
  context: { fontFamily: fonts.body, fontSize: 13 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyBox: { borderWidth: 1, borderRadius: radius.md, padding: 32, overflow: 'hidden', marginTop: 8 },
});
