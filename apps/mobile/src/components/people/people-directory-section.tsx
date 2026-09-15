import type { ContactsCardDto } from '@vedamatch/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import type { PeopleApi } from '@/lib/people/people-api';
import {
  PEOPLE_SEARCH_DEBOUNCE_MS,
  PEOPLE_SEARCH_PAGE_SIZE,
  appendNextPage,
  debounce,
  directoryEmptyMessage,
  isStaleSearch,
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
const SKELETON_WIDTHS = [58, 44, 62, 40, 50];

/**
 * Справочник людей: поиск по `q` с debounce и подгрузкой следующей страницы.
 * Поле поиска остаётся видимым и рабочим во всех четырёх состояниях списка.
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
  const requestSeq = useRef(0);

  const load = useCallback(
    async (q: string, targetPage: number, mode: LoadMode) => {
      const seq = (requestSeq.current += 1);
      if (mode === 'more') setLoadingMore(true);
      try {
        const response = await peopleApi.search({ q, page: targetPage, pageSize: PEOPLE_SEARCH_PAGE_SIZE });
        if (isStaleSearch(seq, requestSeq.current)) return;
        setAppliedQuery(q);
        setItems((current) => (mode === 'more' && current ? appendNextPage(current, response.items) : response.items));
        setPage(response.page);
        setHasMore(response.hasMore);
        setError(null);
      } catch (e) {
        if (isStaleSearch(seq, requestSeq.current)) return;
        setError(e instanceof Error ? e.message : 'Не удалось выполнить поиск');
      } finally {
        if (!isStaleSearch(seq, requestSeq.current)) {
          setLoadingMore(false);
          setRefreshing(false);
        }
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(appliedQuery, 1, 'refresh');
  }, [appliedQuery, load]);

  const onEndReached = useCallback(() => {
    if (!items || loadingMore || !hasMore) return;
    void load(appliedQuery, page + 1, 'more');
  }, [items, loadingMore, hasMore, appliedQuery, page, load]);

  const retry = useCallback(() => void load(query, 1, items ? 'refresh' : 'initial'), [load, query, items]);

  const renderItem = useCallback<ListRenderItem<ContactsCardDto>>(({ item }) => <PersonCardRow card={item} onPress={onOpenPerson} />, [onOpenPerson]);

  return (
    <View style={styles.root}>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Имя или город"
        placeholderTextColor={colors.text1}
        accessibilityLabel="Поиск по справочнику людей"
        returnKeyType="search"
        style={[styles.search, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
      />

      {!items && error ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.centerText, { color: colors.text1 }]}>
            {error}
          </Text>
          <RetryButton onPress={retry} />
        </View>
      ) : !items ? (
        <View style={styles.skeleton} accessible accessibilityLabel="Загружаем справочник" accessibilityRole="progressbar">
          {SKELETON_WIDTHS.map((width, index) => (
            <View key={index} style={styles.skeletonRow}>
              <View style={[styles.skeletonAvatar, { backgroundColor: colors.bg2 }]} />
              <View style={styles.skeletonLines}>
                <View style={[styles.skeletonLine, { width: `${width}%`, backgroundColor: colors.bg2 }]} />
                <View style={[styles.skeletonLine, styles.skeletonLineShort, { backgroundColor: colors.bg2 }]} />
              </View>
            </View>
          ))}
        </View>
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
            <Text style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              {directoryEmptyMessage(appliedQuery)}
            </Text>
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
  root: { flex: 1, gap: 12 },
  search: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
  list: { paddingBottom: 24, gap: 10 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, padding: 12, marginBottom: 10 },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center', borderWidth: 1, borderRadius: radius.md, padding: 32, overflow: 'hidden' },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  footerSpinner: { paddingVertical: 16 },
  skeleton: { gap: 10 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  skeletonAvatar: { width: 52, height: 52, borderRadius: 16 },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLine: { height: 14, borderRadius: 6 },
  skeletonLineShort: { width: '40%', height: 12 },
});
