import type { UnionConnectionRequestDto, UnionConnectionRequestsState } from '@vedamatch/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { UnionNav } from '@/components/union/union-nav';
import {
  UnionButton,
  UnionEmpty,
  UnionLoadFailed,
  UnionLoading,
  unionHeaderOptions,
} from '@/components/union/union-screen-parts';
import { useIncomingPending, useUnionApi } from '@/components/union/use-union';
import { VerifiedDot } from '@/components/verified-badge';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { confirmTap } from '@/lib/feedback';
import { VERIFICATION_BADGE_LABELS } from '@/lib/people/verification';
import { describeUnionError } from '@/lib/union/union-error';
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_TABS,
  connectionLists,
  placeLine,
  shortDate,
  type ConnectionTab,
} from '@/lib/union/union-lists';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

type Busy = { requestId: string; action: 'accept' | 'decline' | 'write' } | null;

/**
 * Связи Знакомств: входящие и исходящие заявки и принятые знакомства
 * (`/union/connections` на сайте, `connections-panel.tsx`). Сюда же ведёт
 * пуш «Новая заявка» — поэтому по умолчанию открыты входящие.
 */
export default function UnionConnectionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const unionApi = useUnionApi();
  const chatApi = useMemo(() => createChatApi(api), [api]);
  const incomingPending = useIncomingPending(unionApi);
  const [state, setState] = useState<UnionConnectionRequestsState | null>(null);
  const [tab, setTab] = useState<ConnectionTab>('incoming');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      setLoadError(null);
      try {
        setState(await unionApi.connectionRequests());
      } catch (e) {
        setLoadError(describeUnionError(e, 'Не удалось загрузить связи.'));
      } finally {
        setRefreshing(false);
      }
    },
    [unionApi],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lists = useMemo(() => (state ? connectionLists(state) : null), [state]);

  const respond = useCallback(
    async (request: UnionConnectionRequestDto, action: 'accept' | 'decline') => {
      if (busy) return;
      if (action === 'accept') confirmTap();
      setBusy({ requestId: request.id, action });
      setActionError(null);
      try {
        await unionApi.respond(request.id, action);
        await load();
      } catch (e) {
        setActionError(describeUnionError(e, 'Не удалось выполнить действие.'));
      } finally {
        setBusy(null);
      }
    },
    [busy, load, unionApi],
  );

  /** «Открыть чат» — в «Чаты» приложения: переписка на портале одна. */
  const write = useCallback(
    async (request: UnionConnectionRequestDto) => {
      if (busy) return;
      confirmTap();
      setBusy({ requestId: request.id, action: 'write' });
      setActionError(null);
      try {
        const conversation = await chatApi.createDirect(request.user.id);
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
      } catch (e) {
        setActionError(describeUnionError(e, 'Не удалось открыть переписку.'));
      } finally {
        setBusy(null);
      }
    },
    [busy, chatApi],
  );

  const renderItem = useCallback<ListRenderItem<UnionConnectionRequestDto>>(
    ({ item }) => (
      <ConnectionRow
        request={item}
        busy={busy?.requestId === item.id ? busy.action : null}
        locked={busy !== null}
        onRespond={(action) => void respond(item, action)}
        onWrite={() => void write(item)}
      />
    ),
    [busy, respond, write],
  );

  const tabs = (
    <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.bg1 }]}>
      {CONNECTION_TABS.map((item) => {
        const selected = item.key === tab;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => setTab(item.key)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.tab, selected && { backgroundColor: colors.bg0 }, pressedStyle(pressed)]}
          >
            <Text style={[styles.tabText, { color: selected ? colors.text0 : colors.text1 }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Связи')} />
      {!lists ? (
        <>
          <UnionNav active="connections" incomingPending={incomingPending} />
          {loadError ? (
            <UnionLoadFailed message={loadError} onRetry={() => void load()} />
          ) : (
            <UnionLoading label="Загружаем связи" />
          )}
        </>
      ) : (
        <FlatList
          data={lists[tab]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.header}>
              <UnionNav active="connections" incomingPending={incomingPending} />
              {tabs}
              {actionError ? (
                <View style={styles.padded}>
                  <InlineError message={actionError} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={<UnionEmpty text={CONNECTION_TABS.find((item) => item.key === tab)?.empty ?? ''} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.magenta}
              colors={[colors.magenta]}
            />
          }
        />
      )}
    </View>
  );
}

function ConnectionRow({
  request,
  busy,
  locked,
  onRespond,
  onWrite,
}: {
  request: UnionConnectionRequestDto;
  busy: 'accept' | 'decline' | 'write' | null;
  locked: boolean;
  onRespond(action: 'accept' | 'decline'): void;
  onWrite(): void;
}) {
  const { colors } = useTheme();
  const { user: person } = request;
  const avatar = person.photos[0]?.thumbUrl ?? person.photos[0]?.url ?? person.avatarUrl;
  return (
    <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${person.name}, ${CONNECTION_STATUS_LABELS[request.status]}. Открыть анкету`}
        onPress={() => router.push({ pathname: '/union/users/[id]', params: { id: person.id } })}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [styles.person, pressedStyle(pressed)]}
      >
        <ChatAvatar id={person.id} name={person.name} uri={avatar} size={48} />
        <View style={styles.personText}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
              {person.name}
            </Text>
            {person.isVerifiedDevotee ? <VerifiedDot label={VERIFICATION_BADGE_LABELS.devotee} decorative /> : null}
          </View>
          <Text style={[styles.meta, { color: colors.text1 }]}>{placeLine(person)}</Text>
          <Text style={[styles.meta, { color: colors.text1 }]}>
            {CONNECTION_STATUS_LABELS[request.status]} · {shortDate(request.respondedAt ?? request.createdAt)}
          </Text>
        </View>
      </Pressable>

      {request.message ? (
        <Text style={[styles.message, { color: colors.text0, backgroundColor: colors.bg1 }]}>{request.message}</Text>
      ) : null}

      {request.status === 'pending' && request.direction === 'incoming' ? (
        <View style={styles.buttons}>
          <UnionButton
            grow
            kind="secondary"
            label="Отклонить"
            busy={busy === 'decline'}
            disabled={locked}
            onPress={() => onRespond('decline')}
          />
          <UnionButton grow label="Принять" busy={busy === 'accept'} disabled={locked} onPress={() => onRespond('accept')} />
        </View>
      ) : null}
      {request.status === 'accepted' ? (
        <UnionButton
          label="Открыть чат"
          accessibilityLabel={`Написать ${person.name}`}
          busy={busy === 'write'}
          disabled={locked}
          onPress={onWrite}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: 8, paddingBottom: 4 },
  padded: { paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: radius.md, padding: 4, gap: 4 },
  tab: {
    flex: 1,
    minHeight: hitTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: hitTarget, borderRadius: radius.sm, overflow: 'hidden' },
  personText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 15 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  message: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, borderRadius: radius.sm, padding: 10, overflow: 'hidden' },
  buttons: { flexDirection: 'row', gap: 10 },
});
