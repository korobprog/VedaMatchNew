import type { ContactsCardDto } from '@vedamatch/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, RefreshControl, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { ChatListSkeleton } from '@/components/skeleton';
import { RetryButton } from '@/components/retry-button';
import type { PeopleApi } from '@/lib/people/people-api';
import {
  PEOPLE_SEARCH_DEBOUNCE_MS,
  PEOPLE_SEARCH_PAGE_SIZE,
  appendNextPage,
  canLoadMore,
  debounce,
  directoryEmptyMessage,
  isCurrentSearchGeneration,
  nextSearchGeneration,
} from '@/lib/people/people-search-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { PersonCardRow } from './person-card-row';

interface Props {
  peopleApi: PeopleApi;
  onOpenPerson(userId: string): void;
}

type LoadMode = 'initial' | 'search' | 'refresh' | 'more';

const keyOf = (card: ContactsCardDto) => card.userId;

/**
 * Справочник людей: поиск по `q` с debounce и подгрузкой следующей страницы.
 * Поле поиска остаётся видимым и рабочим во всех четырёх состояниях списка.
 *
 * Поиск и подгрузка страницы делят одно «поколение» (`people-search-state.ts`):
 * поколение меняется только запросом, меняющим сам поиск (`initial`/`search`/
 * `refresh`), а подгрузка страницы («more») лишь запоминает то поколение, на
 * котором она стартовала. Раньше общий счётчик заявок считал «устаревшим» и
 * отбрасывал ответ поиска только потому, что подгрузка старой страницы успела
 * уйти позже него — из-за этого при быстрой докрутке во время ввода нового
 * текста результат поиска мог не появиться вовсе (раунд оценки 004, дефект 3).
 */
export function PeopleDirectorySection({ peopleApi, onOpenPerson }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [items, setItems] = useState<ContactsCardDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    async (q: string, targetPage: number, mode: LoadMode) => {
      // Поколение растёт только у запросов, меняющих сам поиск — подгрузка
      // страницы («more») продолжает то поколение, на котором она стартовала.
      const gen = mode === 'more' ? generation.current : (generation.current = nextSearchGeneration(generation.current));
      if (mode === 'more') setLoadingMore(true);
      try {
        const response = await peopleApi.search({ q, page: targetPage, pageSize: PEOPLE_SEARCH_PAGE_SIZE });
        if (isCurrentSearchGeneration(gen, generation.current)) {
          setAppliedQuery(q);
          setItems((current) => (mode === 'more' && current ? appendNextPage(current, response.items) : response.items));
          setPage(response.page);
          setHasMore(response.hasMore);
          setError(null);
        }
      } catch (e) {
        if (isCurrentSearchGeneration(gen, generation.current)) {
          setError(e instanceof Error ? e.message : 'Не удалось выполнить поиск');
        }
      } finally {
        if (mode === 'more') setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [peopleApi],
  );

  // Только первая загрузка справочника — дальше запросы идут по вводу и обновлению.
  useEffect(() => {
    void load('', 1, 'initial');
  }, [load]);

  const debouncedSearch = useMemo(() => debounce((value: string) => void load(value, 1, 'search'), PEOPLE_SEARCH_DEBOUNCE_MS), [load]);
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const onChangeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  // Клавиша «Поиск» на клавиатуре не должна ждать оставшийся хвост debounce.
  const onSubmitEditing = useCallback(() => {
    debouncedSearch.cancel();
    void load(query, 1, 'search');
  }, [debouncedSearch, load, query]);

  const onClear = useCallback(() => {
    debouncedSearch.cancel();
    setQuery('');
    void load('', 1, 'search');
  }, [debouncedSearch, load]);

  // Обновление тянет актуальный текст поля, а не последний применённый запрос:
  // потянуть список вниз во время набора текста должно искать по набранному.
  const onRefresh = useCallback(() => {
    debouncedSearch.cancel();
    setRefreshing(true);
    void load(query, 1, 'refresh');
  }, [debouncedSearch, load, query]);

  const onEndReached = useCallback(() => {
    if (!items) return;
    if (!canLoadMore({ query, appliedQuery, hasMore, loadingMore })) return;
    void load(appliedQuery, page + 1, 'more');
  }, [items, query, appliedQuery, hasMore, loadingMore, page, load]);

  const retry = useCallback(() => void load(query, 1, items ? 'refresh' : 'initial'), [load, query, items]);

  const renderItem = useCallback<ListRenderItem<ContactsCardDto>>(({ item }) => <PersonCardRow card={item} onPress={onOpenPerson} />, [onOpenPerson]);

  // Текст в поле уже разошёлся с применённым запросом — идёт (или ждёт
  // debounce) новый поиск. Пока это так, не показываем «Ничего не нашлось»
  // по ещё не устаревшей выдаче (раунд оценки 004, дефект 9).
  const searching = query.trim() !== appliedQuery.trim();

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmitEditing}
          placeholder="Имя или город"
          placeholderTextColor={colors.text1}
          accessibilityLabel="Поиск по справочнику людей"
          returnKeyType="search"
          style={[styles.search, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
        />
        {searching ? (
          <ActivityIndicator style={styles.searchAccessory} color={colors.text1} accessibilityLabel="Идёт поиск" />
        ) : query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            onPress={onClear}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [styles.clearButton, pressedStyle(pressed)]}
          >
            <Text style={[styles.clearGlyph, { color: colors.text1 }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {!items && error ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.centerText, { color: colors.text1 }]}>
            {error}
          </Text>
          <RetryButton onPress={retry} />
        </View>
      ) : !items ? (
        <ChatListSkeleton />
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyOf}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            error ? (
              <View style={[styles.bannerRow, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.bannerText, { color: colors.text0 }]}>
                  {error}
                </Text>
                <RetryButton onPress={retry} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            searching ? null : (
              <Text style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                {directoryEmptyMessage(appliedQuery)}
              </Text>
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.magenta} /> : null}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12 },
  searchBox: { position: 'relative', justifyContent: 'center' },
  search: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingRight: hitTarget + 6, fontFamily: fonts.body, fontSize: 15 },
  searchAccessory: { position: 'absolute', right: 14 },
  clearButton: { position: 'absolute', right: 0, width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  clearGlyph: { fontSize: 16, fontFamily: fonts.bodySemiBold },
  list: { paddingBottom: 24, gap: 10 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12, marginBottom: 10 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', borderWidth: 1, borderRadius: radius.md, padding: 32, overflow: 'hidden' },
  footerSpinner: { paddingVertical: 16 },
});
