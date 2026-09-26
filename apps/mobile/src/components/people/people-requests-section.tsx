import type { ContactsRequestDto, ContactsRequestsState } from '@vedamatch/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RequestCardSkeleton } from '@/components/skeleton';
import { RetryButton } from '@/components/retry-button';
import type { ChatApi } from '@/lib/chat/chat-api';
import { confirmTap } from '@/lib/feedback';
import type { PeopleApi } from '@/lib/people/people-api';
import { showRemainingToday, type RequestAction } from '@/lib/people/people-requests-state';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';
import { RequestRow } from './request-row';
import { screenErrorText } from '@/lib/api/error-text';
import { useReloadWhenOnline } from '@/lib/startup/connectivity';

interface Props {
  peopleApi: PeopleApi;
  chatApi: ChatApi;
  /** Секция сейчас видна пользователю: сегмент «Запросы» выбран во вкладке. */
  active: boolean;
}

/**
 * Запросы контакта: кто просит связи со мной и кого прошу я. Действия
 * обновляют список из ответа самого действия — сервер уже возвращает
 * пересчитанное состояние, повторный `GET /chat/people/requests` не нужен
 * сразу после мутации, но список всё равно перечитывается при возврате на
 * вкладку/сегмент, потому что отправка запроса с карточки человека меняет
 * исходящие мимо этого экрана (раунд оценки 004, дефект 2).
 */
export function PeopleRequestsSection({ peopleApi, chatApi, active }: Props) {
  const { colors } = useTheme();
  const [state, setState] = useState<ContactsRequestsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, RequestAction>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  // Версия состояния: растёт и на каждый новый `GET`, и на каждую успешную
  // мутацию. Ответ `GET`, пришедший позже, чем более свежая мутация, не
  // применяется — иначе он перезаписал бы её результат старым снимком
  // (раунд оценки 004, дефект 13).
  const version = useRef(0);

  const load = useCallback(async () => {
    const seq = (version.current += 1);
    try {
      const next = await peopleApi.requests();
      if (version.current !== seq) return;
      setState(next);
      setLoadError(null);
    } catch (e) {
      if (version.current !== seq) return;
      setLoadError(screenErrorText('components/people/people-requests-section', e, 'Не удалось загрузить запросы'));
    } finally {
      // Безусловно: если пока этот `GET` летел, прошла мутация (`version`
      // сдвинулся), его данные отбрасываются выше — но крутилку
      // pull-to-refresh снять обязаны в любом случае, иначе она виснет
      // навсегда (раунд оценки 005, дефект 2).
      setRefreshing(false);
    }
  }, [peopleApi]);

  // Первая загрузка секции — независимо от того, активна она сейчас или скрыта:
  // данные готовы заранее, до переключения на сегмент «Запросы».
  useEffect(() => {
    void load();
  }, [load]);

  // Перечитать при возврате на вкладку «Люди» (пуш карточки человека назад)
  // и при переключении сегмента «Справочник» → «Запросы»: `useFocusEffect`
  // срабатывает сразу, если экран уже в фокусе и зависимость `active` только
  // что стала `true`, и повторно — при каждом возврате фокуса, пока `active`.
  useFocusEffect(
    useCallback(() => {
      if (active) void load();
    }, [active, load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const run = useCallback(async (requestId: string, action: RequestAction, task: () => Promise<ContactsRequestsState>) => {
    confirmTap();
    setBusy((current) => ({ ...current, [requestId]: action }));
    setErrors(({ [requestId]: _drop, ...rest }) => rest);
    try {
      const next = await task();
      version.current += 1;
      setState(next);
    } catch (e) {
      setErrors((current) => ({ ...current, [requestId]: screenErrorText('components/people/people-requests-section', e, 'Не удалось выполнить действие') }));
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
      confirmTap();
      setBusy((current) => ({ ...current, [request.id]: 'write' }));
      setErrors(({ [request.id]: _drop, ...rest }) => rest);
      try {
        const conversation = await chatApi.createDirect(request.user.userId);
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
      } catch (e) {
        setErrors((current) => ({ ...current, [request.id]: screenErrorText('components/people/people-requests-section', e, 'Не удалось открыть переписку') }));
      } finally {
        setBusy(({ [request.id]: _done, ...rest }) => rest);
      }
    },
    [chatApi],
  );

  const retry = useCallback(() => void load(), [load]);
  // Сеть вернулась, а экран в ошибке — перечитать самим, как «Повторить».
  useReloadWhenOnline(loadError !== null, retry);

  const renderRow = useCallback(
    (request: ContactsRequestDto) => (
      <RequestRow
        key={request.id}
        request={request}
        busyAction={busy[request.id] ?? null}
        error={errors[request.id] ?? null}
        onRespond={respond}
        onCancel={cancel}
        onWrite={write}
      />
    ),
    [busy, errors, respond, cancel, write],
  );

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
    return <RequestCardSkeleton />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
    >
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
        {state.incoming.map(renderRow)}
      </Section>

      <Section title="Исходящие" count={state.outgoing.length} empty="Вы пока никому не отправляли запрос контакта.">
        {state.outgoing.map(renderRow)}
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

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 20 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, borderWidth: 1, borderRadius: radius.sm, padding: 12, overflow: 'hidden' },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 17 },
  sectionList: { gap: 10 },
  empty: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, borderWidth: 1, borderRadius: radius.md, padding: 16, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
