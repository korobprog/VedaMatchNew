import type { ContactsRequestDto, ContactsRequestsState } from '@vedamatch/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChatApi } from '@/lib/chat/chat-api';
import { confirmTap } from '@/lib/feedback';
import type { PeopleApi } from '@/lib/people/people-api';
import { showRemainingToday, type RequestAction } from '@/lib/people/people-requests-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { RequestRow } from './request-row';

interface Props {
  peopleApi: PeopleApi;
  chatApi: ChatApi;
}

/**
 * Запросы контакта: кто просит связи со мной и кого прошу я. Действия
 * обновляют список из ответа самого действия — сервер уже возвращает
 * пересчитанное состояние, повторный `GET /chat/people/requests` не нужен.
 */
export function PeopleRequestsSection({ peopleApi, chatApi }: Props) {
  const { colors } = useTheme();
  const [state, setState] = useState<ContactsRequestsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, RequestAction>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await peopleApi.requests());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить запросы');
    }
  }, [peopleApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const run = useCallback(async (requestId: string, action: RequestAction, task: () => Promise<ContactsRequestsState>) => {
    confirmTap();
    setBusy((current) => ({ ...current, [requestId]: action }));
    setActionError(null);
    try {
      setState(await task());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(({ [requestId]: _done, ...rest }) => rest);
    }
  }, []);

  const respond = useCallback(
    (request: ContactsRequestDto, accept: boolean) => run(request.id, accept ? 'accept' : 'decline', () => peopleApi.respond(request.id, { accept })),
    [peopleApi, run],
  );

  const cancel = useCallback((request: ContactsRequestDto) => run(request.id, 'cancel', () => peopleApi.cancelRequest(request.id)), [peopleApi, run]);

  const write = useCallback(
    async (request: ContactsRequestDto) => {
      setBusy((current) => ({ ...current, [request.id]: 'write' }));
      setActionError(null);
      try {
        const conversation = await chatApi.createDirect(request.user.userId);
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Не удалось открыть переписку');
      } finally {
        setBusy(({ [request.id]: _done, ...rest }) => rest);
      }
    },
    [chatApi],
  );

  const retry = useCallback(() => void load(), [load]);

  if (!state && loadError) {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="alert" style={[styles.centerText, { color: colors.text1 }]}>
          {loadError}
        </Text>
        <RetryButton onPress={retry} />
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.skeleton} accessible accessibilityLabel="Загружаем запросы" accessibilityRole="progressbar">
        {[0, 1, 2].map((key) => (
          <View key={key} style={[styles.skeletonRow, { backgroundColor: colors.bg2 }]} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
    >
      {actionError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.banner, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
        >
          {actionError}
        </Text>
      ) : null}

      {loadError ? (
        <View style={[styles.bannerRow, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.bannerText, { color: colors.text0 }]}>
            {loadError}
          </Text>
          <RetryButton onPress={retry} />
        </View>
      ) : null}

      {showRemainingToday(state.remainingToday) ? (
        <Text style={[styles.hint, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          Осталось запросов сегодня: {state.remainingToday}
        </Text>
      ) : null}

      <Section title="Входящие" count={state.incoming.length} empty="Входящих запросов пока нет.">
        {state.incoming.map((request) => (
          <RequestRow key={request.id} request={request} busyAction={busy[request.id] ?? null} onRespond={respond} onCancel={cancel} onWrite={write} />
        ))}
      </Section>

      <Section title="Исходящие" count={state.outgoing.length} empty="Вы пока никому не отправляли запрос контакта.">
        {state.outgoing.map((request) => (
          <RequestRow key={request.id} request={request} busyAction={busy[request.id] ?? null} onRespond={respond} onCancel={cancel} onWrite={write} />
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
        {title}
      </Text>
      {count === 0 ? (
        <Text style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>{empty}</Text>
      ) : (
        <View style={styles.sectionList}>{children}</View>
      )}
    </View>
  );
}

function RetryButton({ onPress }: { onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 20 },
  banner: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, borderWidth: 1, borderRadius: radius.sm, padding: 12, overflow: 'hidden' },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, borderWidth: 1, borderRadius: radius.sm, padding: 12, overflow: 'hidden' },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 17 },
  sectionList: { gap: 10 },
  empty: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, borderWidth: 1, borderRadius: radius.md, padding: 16, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  skeleton: { gap: 10, paddingTop: 4 },
  skeletonRow: { height: 96, borderRadius: radius.md },
});
