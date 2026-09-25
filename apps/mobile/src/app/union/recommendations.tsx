import type { UnionIntentionCounts, UnionRecommendation, UnionRecommendationFilters } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { IntentionFilter } from '@/components/union/intention-filter';
import { RecommendationTile } from '@/components/union/recommendation-tile';
import { SwipeDeck } from '@/components/union/swipe-deck';
import { DeckIcon, GridIcon } from '@/components/union/union-icons';
import { UnionNav } from '@/components/union/union-nav';
import {
  UnionButton,
  UnionEmpty,
  UnionGridSkeleton,
  UnionLoadFailed,
  unionHeaderOptions,
} from '@/components/union/union-screen-parts';
import { useIncomingPending, useUnionApi } from '@/components/union/use-union';
import {
  DEFAULT_DENSITY,
  EVERYTHING_FILTERS,
  UNION_PAGE_SIZE,
  countNarrowingFilters,
  densityLabel,
  emptyStateActions,
  mergeRecommendationPages,
  nextDensity,
  tileSize,
  type GridDensity,
} from '@/lib/union/recommendations-query';
import { collectionByKey } from '@/lib/union/union-collections';
import { readDensity, writeDensity } from '@/lib/union/union-device-prefs';
import { describeUnionError, isNotFound } from '@/lib/union/union-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const GRID_PADDING = 16;
const GRID_GAP = 8;

interface Feed {
  items: UnionRecommendation[];
  total: number;
  page: number;
  totalPages: number;
  intentionCounts: UnionIntentionCounts | null;
  /** Сколько нашлось бы вместе с отсмотренными — считается только на пустой выдаче. */
  viewedMatchCount: number;
}

/**
 * Подбор Знакомств: сетка плиток и колода свайпов (`/union/recommendations`
 * на сайте).
 *
 * Как на сайте с телефона, колода открывается сама при входе — ради неё
 * сюда и приходят; закрыл — видна сетка, тап по плитке открывает колоду с
 * этой анкеты. Страницы выдачи подгружаются сами при прокрутке сетки и по
 * мере того, как колода подходит к концу, — перелистывания «Далее →» нет.
 */
export default function UnionRecommendationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const unionApi = useUnionApi();
  const incomingPending = useIncomingPending(unionApi);

  // Подборка (`union/collections`) приезжает ключом в адресе экрана, фильтр
  // берётся из списка подборок: чужой ключ — обычный подбор.
  const { collection } = useLocalSearchParams<{ collection?: string }>();
  const [preset] = useState(() => collectionByKey(collection));
  const [collectionTitle, setCollectionTitle] = useState<string | null>(preset?.title ?? null);
  const [filters, setFilters] = useState<UnionRecommendationFilters>(() => preset?.filters ?? {});
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [density, setDensity] = useState<GridDensity>(DEFAULT_DENSITY);

  // Колода: открыта ли, с какой анкеты, и «поколение» — новый круг или
  // смена фильтров начинают колоду заново, а не с прежней позиции.
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckIndex, setDeckIndex] = useState(0);
  const [deckGeneration, setDeckGeneration] = useState(0);
  const autoOpened = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    void readDensity().then(setDensity);
  }, []);

  const load = useCallback(
    async (next: UnionRecommendationFilters, mode: 'initial' | 'refresh' = 'initial') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      setLoadError(null);
      setMoreError(null);
      try {
        const page = await unionApi.recommendations({ ...next, page: 1, pageSize: UNION_PAGE_SIZE });
        // Сколько подходящих скрыто историей показов — только на пустой
        // выдаче: один лишний запрос в редком случае даёт точное число на
        // кнопке вместо догадки.
        const viewedMatchCount =
          page.items.length === 0 && !next.includeSwiped && !next.showAll
            ? ((await unionApi
                .recommendations({ ...next, includeSwiped: true, page: 1, pageSize: 1 })
                .catch(() => null))?.total ?? 0)
            : 0;
        if (id !== requestId.current) return;
        setFeed({
          items: page.items,
          total: page.total,
          page: page.page,
          totalPages: page.totalPages,
          intentionCounts: page.intentionCounts,
          viewedMatchCount,
        });
        setDeckGeneration((value) => value + 1);
        if (!autoOpened.current && page.items.length > 0) {
          autoOpened.current = true;
          setDeckIndex(0);
          setDeckOpen(true);
        }
      } catch (e) {
        if (id !== requestId.current) return;
        // Анкеты нет — подбирать не по чему; вход в раздел решит, куда вести.
        if (isNotFound(e)) {
          router.replace('/union');
          return;
        }
        setLoadError(describeUnionError(e, 'Не удалось загрузить анкеты.'));
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [unionApi],
  );

  useEffect(() => {
    void load(filters);
    // Фильтры меняются только через `applyFilters`, он и перезагружает.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(
    (next: UnionRecommendationFilters) => {
      setFilters(next);
      setFeed(null);
      // Колода, если открыта, начинается с первой анкеты новой выдачи.
      setDeckIndex(0);
      void load(next);
    },
    [load],
  );

  /** Последний выход с пустой выдачи: без фильтров, истории и подборки. */
  const showEveryone = useCallback(() => {
    setCollectionTitle(null);
    applyFilters(EVERYTHING_FILTERS);
  }, [applyFilters]);

  const hasMore = Boolean(feed && feed.page < feed.totalPages);
  const loadMore = useCallback(async () => {
    if (!feed || loadingMore || feed.page >= feed.totalPages) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await unionApi.recommendations({ ...filters, page: feed.page + 1, pageSize: UNION_PAGE_SIZE });
      if (id !== requestId.current) return;
      setFeed((current) =>
        current
          ? {
              ...current,
              items: mergeRecommendationPages(current.items, page.items),
              page: page.page,
              totalPages: page.totalPages,
              total: page.total,
            }
          : current,
      );
    } catch (e) {
      if (id === requestId.current) setMoreError(describeUnionError(e, 'Не удалось загрузить ещё анкеты.'));
    } finally {
      setLoadingMore(false);
    }
  }, [feed, filters, loadingMore, unionApi]);

  // Системное «назад» закрывает колоду, а не уводит из раздела.
  useEffect(() => {
    if (!deckOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDeckOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [deckOpen]);

  const openDeck = useCallback((index: number) => {
    setDeckIndex(index);
    setDeckGeneration((value) => value + 1);
    setDeckOpen(true);
  }, []);

  const chooseDensity = () => {
    const next = nextDensity(density);
    setDensity(next);
    void writeDensity(next);
  };

  const size = tileSize(width, density, GRID_PADDING, GRID_GAP);
  const renderItem = useCallback<ListRenderItem<UnionRecommendation>>(
    ({ item, index }) => <RecommendationTile item={item} size={size} onOpen={() => openDeck(index)} />,
    [openDeck, size],
  );

  const empty = useMemo(() => {
    if (!feed || feed.items.length > 0) return null;
    return emptyStateActions({
      narrowingFilterCount: countNarrowingFilters(filters),
      includeSwiped: Boolean(filters.includeSwiped || filters.showAll),
      viewedMatchCount: feed.viewedMatchCount,
    });
  }, [feed, filters]);

  const header = (
    <View style={styles.header}>
      <UnionNav active="recommendations" incomingPending={incomingPending} />
      <IntentionFilter
        selected={filters.intentions ?? []}
        counts={feed?.intentionCounts ?? null}
        onChange={(intentions) => applyFilters({ ...filters, intentions: intentions.length > 0 ? intentions : undefined })}
      />
      {collectionTitle || filters.showAll || filters.includeSwiped ? (
        <View style={[styles.notice, { backgroundColor: colors.bg1 }]}>
          <Text style={[styles.noticeText, { color: colors.text1 }]}>
            {filters.showAll
              ? 'Показаны все анкеты, включая уже отсмотренные и не подходящие по вашей анкете.'
              : filters.includeSwiped
                ? 'Показаны и уже отсмотренные анкеты.'
                : `Подборка «${collectionTitle}».`}
          </Text>
          <UnionButton
            kind="secondary"
            label="Как обычно"
            onPress={() => {
              setCollectionTitle(null);
              applyFilters({});
            }}
          />
        </View>
      ) : null}
      {feed && feed.items.length > 0 ? (
        <View style={styles.toolbar}>
          <ToolButton label="Свайпами" onPress={() => openDeck(0)}>
            <DeckIcon color={colors.text0} />
          </ToolButton>
          <Text style={[styles.found, { color: colors.text1 }]}>Найдено: {feed.total}</Text>
          <ToolButton label={densityLabel(density)} onPress={chooseDensity}>
            <GridIcon color={colors.text0} cells={density === 2 ? 3 : 2} />
          </ToolButton>
        </View>
      ) : null}
      {loadError && feed ? <InlineError message={loadError} /> : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Знакомства', !deckOpen)} />
      {!feed ? (
        loadError ? (
          <UnionLoadFailed message={loadError} onRetry={() => void load(filters)} />
        ) : (
          <View>
            {header}
            <UnionGridSkeleton size={size} columns={density} />
          </View>
        )
      ) : (
        <FlatList
          key={`grid-${density}`}
          data={feed.items}
          keyExtractor={(item) => item.user.id}
          renderItem={renderItem}
          numColumns={density}
          columnWrapperStyle={styles.columns}
          ListHeaderComponent={header}
          ListEmptyComponent={
            empty ? (
              <UnionEmpty
                text={
                  empty.nothingHelps
                    ? 'Вы посмотрели всех, кто сейчас подходит. Новые анкеты появятся — загляните позже.'
                    : 'Сейчас подходящих анкет нет.'
                }
              >
                {empty.viewedToShow !== null ? (
                  <UnionButton
                    label={`Показать уже отсмотренных (${empty.viewedToShow})`}
                    onPress={() => applyFilters({ ...filters, includeSwiped: true })}
                  />
                ) : null}
                {empty.canResetFilters ? (
                  <>
                    <UnionButton
                      kind="secondary"
                      label="Сбросить фильтры"
                      onPress={() => {
                        setCollectionTitle(null);
                        applyFilters({});
                      }}
                    />
                    {/* Сброс фильтров не снимает историю показов, а «показать
                        отсмотренных» сохраняет фильтры. Когда пусто из-за
                        обоих сразу — это последний выход. */}
                    <UnionButton kind="secondary" label="Показать вообще всех" onPress={showEveryone} />
                  </>
                ) : null}
              </UnionEmpty>
            ) : null
          }
          ListFooterComponent={
            moreError ? (
              <View style={styles.footer}>
                <InlineError message={moreError} />
                <UnionButton kind="secondary" label="Повторить" onPress={() => void loadMore()} />
              </View>
            ) : hasMore ? (
              <View style={styles.footer}>
                <UnionButton kind="secondary" label="Показать ещё" busy={loadingMore} onPress={() => void loadMore()} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (!moreError) void loadMore();
          }}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: GRID_GAP }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(filters, 'refresh')}
              tintColor={colors.magenta}
              colors={[colors.magenta]}
            />
          }
        />
      )}

      {deckOpen && feed ? (
        <SwipeDeck
          key={`deck-${deckGeneration}`}
          items={feed.items}
          initialIndex={deckIndex}
          unionApi={unionApi}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onNeedMore={() => void loadMore()}
          onExit={() => setDeckOpen(false)}
          onNewCycle={() => {
            autoOpened.current = true;
            setDeckIndex(0);
            void load(filters);
          }}
          onShowEveryone={showEveryone}
        />
      ) : null}
    </View>
  );
}

/**
 * Квадратная кнопка со значком и мелкой подписью — как на сайте: подпись
 * обещает результат нажатия («Плотнее»), а не текущее состояние.
 */
function ToolButton({ label, onPress, children }: { label: string; onPress(): void; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.tool, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      {children}
      <Text style={[styles.toolText, { color: colors.text1 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: 8, paddingBottom: 8 },
  columns: { gap: GRID_GAP, paddingHorizontal: GRID_PADDING },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GRID_PADDING },
  found: { flex: 1, fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  tool: {
    minWidth: 64,
    minHeight: hitTarget + 12,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  toolText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  notice: { marginHorizontal: GRID_PADDING, borderRadius: radius.md, padding: 12, gap: 10 },
  noticeText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: GRID_PADDING, paddingTop: 12, gap: 10 },
});
