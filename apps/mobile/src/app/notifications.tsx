import type { NotificationItemDto } from '@vedamatch/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { InboxSearchBox } from '@/components/notifications/inbox-search-box';
import { NotificationCard } from '@/components/notifications/notification-card';
import { RetryButton } from '@/components/retry-button';
import { SupportLink } from '@/components/support/support-link';
import { ChatListSkeleton } from '@/components/skeleton';
import { appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import { useSession } from '@/lib/auth/session';
import { createInboxApi } from '@/lib/notifications/inbox-api';
import { describeInboxError, describeInboxMoreError } from '@/lib/notifications/inbox-error';
import {
  buildInboxSections,
  markAllItemsRead,
  markItemRead,
  mergeInboxPages,
  reloadSize,
  unreadSectionCount,
} from '@/lib/notifications/inbox-state';
import { inboxDestination } from '@/lib/notifications/notification-target';
import { decreaseUnreadCount, setUnreadCount } from '@/lib/notifications/unread-store';
import { openWebPortal } from '@/lib/web-portal';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const keyOf = (item: NotificationItemDto) => item.id;

/**
 * Пауза перед запросом при наборе. Меньше — сервер получает запрос на каждую
 * букву; больше — поиск начинает казаться сломанным. То же значение, что на
 * сайте (`notification-list.tsx`).
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Куда ведёт «Что нового» (VED-330, раунд оценки 001, дефект 4).
 *
 * Нативного экрана новостей разработки в приложении нет и не заводилось:
 * это раздел сайта, и делать под него второй экран ради списка постов —
 * работа не этой карточки. Но дорога к нему нужна здесь по той же причине,
 * что и на сайте: уведомление живёт неделю и исчезает, а новости остаются,
 * и другого пути к ним, кроме набранного руками адреса, нет. Особенно это
 * видно на пустой ленте, где с экрана вообще некуда деться.
 */
const NEWS_PATH = '/updates/news';

/**
 * Лента уведомлений (VED-330).
 *
 * До неё в приложении не было ничего: пуш про Рынок, объявление, блог или
 * «Работу» приземлялся на список чатов, и человек не узнавал, что произошло
 * (`lib/push/push-url.ts`). Экран отдельным маршрутом в корневом стеке, а не
 * шестой вкладкой внизу — почему именно так, написано у колокольчика
 * (`components/notifications/notification-bell.tsx`).
 *
 * Порядок тот же, что на сайте: сверху секция «Новое» целиком, ниже
 * прочитанное по дням. Прочитанное не исчезает сразу — оно лежит неделю,
 * пока его не уберёт `notification-purge-worker` на сервере.
 *
 * Прочитанным помечается только то, что человек открыл. Гасить всё разом
 * при входе нельзя: сайт так когда-то делал, и уведомления, до которых не
 * дошли руки, исчезали на глазах. Погасить всё разом можно кнопкой.
 */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const inboxApi = useMemo(() => createInboxApi(api), [api]);
  const { webOrigin } = appVariant();

  const [items, setItems] = useState<NotificationItemDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Всё непрочитанное человека — число от сервера, а не длина порции. */
  const [unreadTotal, setUnreadTotal] = useState(0);
  /** Что набрано в поле; в запрос уходит `applied` — после паузы. */
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Несколько загрузок могут перекрыться по времени (возврат на экран,
  // «Повторить», pull-to-refresh) — засчитывается только самая свежая.
  // Тот же приём, что на вкладке «Сервисы».
  const request = useRef(0);
  // Время одно на всю отрисовку: иначе соседние карточки считают «5 мин
  // назад» от разных моментов, а секции — от разных суток.
  const [now, setNow] = useState(() => new Date());

  /**
   * Первая порция: при входе на экран, при возврате на него и на каждый
   * новый запрос поиска. Список при этом не гасится в скелетон — иначе он
   * мигал бы на каждой букве; вместо этого рядом с полем появляется «Ищем…».
   */
  const load = useCallback(
    async (search: string, limit?: number) => {
      const id = (request.current += 1);
      try {
        const page = await inboxApi.inbox({ query: search, limit });
        if (request.current !== id) return;
        setItems(page.items);
        setNextCursor(page.nextCursor ?? null);
        setUnreadTotal(page.unreadCount);
        setUnreadCount(page.unreadCount);
        setNow(new Date());
        setLoadError(null);
        setMoreError(null);
      } catch (e) {
        // По-русски, а не `e.message`: в офлайне оттуда приходило
        // `java.net.UnknownHostException` прямо на экран.
        if (request.current === id) setLoadError(describeInboxError(e));
      } finally {
        if (request.current === id) {
          setRefreshing(false);
          setSearching(false);
        }
      }
    },
    [inboxApi],
  );

  // Пауза перед запросом при наборе: меньше — запрос на каждую букву,
  // больше — поиск начинает казаться сломанным.
  useEffect(() => {
    if (query === applied) return;
    const timer = setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, applied]);

  // Перечитываем при каждом возврате на экран: пока человек смотрел
  // объявление, могло прийти новое уведомление, а пуш ленту не обновляет.
  // Тот же эффект отрабатывает и смену запроса поиска.
  useFocusEffect(
    useCallback(() => {
      void load(applied);
    }, [load, applied]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(applied);
  }, [load, applied]);

  /** Набор в поле: запрос уйдёт после паузы, а «Ищем…» видно сразу. */
  const changeQuery = useCallback(
    (next: string) => {
      setQuery(next);
      if (next.trim() !== applied.trim()) setSearching(true);
    },
    [applied],
  );

  /**
   * Следующая порция (VED-267). Курсор помнит и поток, и строку, поэтому
   * дописывать порцию можно только в конец и только к тому же списку —
   * отсюда сверка `request.current`: после перезагрузки ленты прежний курсор
   * указывает уже не туда.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const id = request.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      // Запрос поиска повторяется и в продолжении: курсор считан внутри
      // выдачи этого запроса, и без `q` сервер продолжил бы другую ленту.
      const page = await inboxApi.inbox({ cursor: nextCursor, query: applied });
      if (request.current !== id) return;
      setItems((current) => mergeInboxPages(current ?? [], page.items));
      setNextCursor(page.nextCursor ?? null);
      setUnreadTotal(page.unreadCount);
      setUnreadCount(page.unreadCount);
    } catch (e) {
      if (request.current === id) setMoreError(describeInboxMoreError(e));
    } finally {
      if (request.current === id) setLoadingMore(false);
    }
  }, [inboxApi, nextCursor, loadingMore, applied]);

  /**
   * Открыть путь сайта. `openWebPortal` сам пробует Chrome Custom Tabs,
   * потом системный браузер и только потом признаёт неудачу, назвав адрес
   * словами, — молчащая кнопка хуже честного текста.
   */
  const openSite = useCallback(
    (path: string) => {
      setOpenError(null);
      void openWebPortal(serviceUrl(webOrigin, path), {
        openBrowser: (target) => WebBrowser.openBrowserAsync(target),
        openLink: (target) => Linking.openURL(target),
      }).then((result) => {
        if (result.kind === 'failed') setOpenError(result.message);
      });
    },
    [webOrigin],
  );

  /**
   * Открыть уведомление.
   *
   * Отметка о прочтении ставится в состоянии сразу и ответа сервера не
   * ждёт: переход уводит с экрана, и ответу некуда было бы прийти.
   */
  const open = useCallback(
    (item: NotificationItemDto) => {
      setOpenError(null);
      if (item.readAt === null) {
        setItems((current) => (current ? markItemRead(current, item.id, new Date()) : current));
        decreaseUnreadCount();
        void inboxApi.markRead([item.id]).catch(() => undefined);
      }

      const destination = inboxDestination(item.url);
      if (destination.kind === 'route') {
        router.push(
          destination.params
            ? // `as never`: `Href` у expo-router — union литералов маршрутов,
              // а путь приходит из чистого модуля, который карты маршрутов
              // знать не должен (см. `routeOfTarget`).
              ({ pathname: destination.pathname, params: destination.params } as never)
            : (destination.pathname as never),
        );
        return;
      }

      // Раздела в приложении нет — открываем сайт.
      openSite(destination.path);
    },
    [inboxApi, openSite],
  );

  /**
   * Погасить всё, включая то, до чего человек не долистал. Следом лента
   * перечитывается: строки переехали из потока непрочитанного в поток
   * прочитанного, и прежний курсор показывает уже не туда.
   */
  const markAll = useCallback(() => {
    // Сколько было показано — столько и просим обратно, иначе человек,
    // долиставший до сотни, возвращается к двадцати и теряет место.
    const shown = reloadSize(items?.length ?? 0);
    setItems((current) => (current ? markAllItemsRead(current, new Date()) : current));
    setUnreadTotal(0);
    setUnreadCount(0);
    void inboxApi
      .markRead()
      .then(() => load(applied, shown))
      .catch(() => undefined);
  }, [inboxApi, load, items, applied]);

  const sections = useMemo(
    () => (items ? buildInboxSections(items, now) : []),
    [items, now],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItemDto }) => (
      <NotificationCard
        item={item}
        now={now}
        opensSite={inboxDestination(item.url).kind === 'site'}
        onPress={open}
      />
    ),
    [now, open],
  );

  const header = {
    headerShown: true,
    title: 'Уведомления',
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.text0,
    headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
    headerShadowVisible: false,
  } as const;

  // Первая загрузка: пустое состояние не показываем, пока лента не пришла.
  if (!items) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        <Stack.Screen options={header} />
        {loadError ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" style={[styles.message, { color: colors.text1 }]}>
              {loadError}
            </Text>
            <RetryButton onPress={() => void load(applied)} />
            <SupportLink from="notifications" />
          </View>
        ) : (
          <ChatListSkeleton />
        )}
      </View>
    );
  }

  const searchActive = applied.trim().length > 0;
  // Число берётся от сервера: порция — двадцать, и при двадцати одном
  // непрочитанном колокольчик показывал 21, а заголовок 20.
  const unreadHere = unreadSectionCount({ items, total: unreadTotal, searchActive });
  const searchBox = <InboxSearchBox value={query} onChange={changeQuery} busy={searching} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={header} />
      <SectionList
        sections={sections}
        keyExtractor={keyOf}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text
              accessibilityRole="header"
              style={[
                styles.sectionTitle,
                { color: section.unread ? colors.text0 : colors.text1 },
              ]}
            >
              {section.unread ? `${section.title} · ${unreadHere}` : section.title}
            </Text>
            {section.unread && !searchActive ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Отметить все прочитанными"
                onPress={markAll}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [
                  styles.markAll,
                  { borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.markAllText, { color: colors.text0 }]}>Прочитать все</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.banners}>
            {searchBox}
            {/* Обновление не удалось, а лента уже есть: она остаётся,
                ошибка — рядом с ней, а не вместо неё. */}
            {loadError ? <InlineError message={loadError} /> : null}
            {openError ? <InlineError message={openError} /> : null}
          </View>
        }
        ListEmptyComponent={
          <View
            style={[
              styles.empty,
              { borderColor: colors.glassBorder, backgroundColor: colors.glass },
            ]}
          >
            {searchActive ? (
              <>
                <Text style={[styles.emptyTitle, { color: colors.text0 }]}>Ничего не нашлось</Text>
                <Text style={[styles.message, { color: colors.text1 }]}>
                  По запросу «{applied}» в ваших уведомлениях пусто. Ищем по заголовку и тексту —
                  попробуйте другое слово.
                </Text>
                <RetryButton onPress={() => changeQuery('')} label="Показать все" />
              </>
            ) : (
              <>
                <Text style={[styles.emptyTitle, { color: colors.text0 }]}>Уведомлений нет</Text>
                <Text style={[styles.message, { color: colors.text1 }]}>
                  Здесь появляются сообщения, заявки, отклики на объявления и ответы поддержки.
                  Прочитанные остаются на неделю — успеете вернуться.
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {nextCursor ? (
              <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator color={colors.magenta} />
              ) : moreError ? (
                <>
                  <InlineError message={moreError} />
                  <RetryButton onPress={() => void loadMore()} label="Показать ещё" />
                </>
              ) : (
                  <RetryButton onPress={() => void loadMore()} label="Показать ещё" />
                )}
              </View>
            ) : null}
            {/* Дорога к новостям разработки — единственная, кроме адреса,
                набранного руками. Нативного экрана новостей нет, поэтому
                открывается сайт; о том, что уйдём в браузер, кнопка
                предупреждает заранее. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Что нового"
              accessibilityHint="Откроется раздел новостей на сайте в браузере"
              onPress={() => openSite(NEWS_PATH)}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.news,
                { borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.newsText, { color: colors.text0 }]}>
                Объявления и новости разработки целиком — «Что нового»
              </Text>
            </Pressable>
          </View>
        }
        // Подгружаем заранее, но кнопка остаётся: `onEndReached` не
        // срабатывает, когда порция не заполнила экран, и без кнопки
        // продолжение стало бы недостижимым.
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  banners: { gap: 8, paddingBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
  },
  sectionTitle: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  markAll: {
    minHeight: hitTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  markAllText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  empty: {
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: 24,
    paddingVertical: 40,
    overflow: 'hidden',
  },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  footer: { alignItems: 'center', gap: 10, paddingTop: 12 },
  news: {
    minHeight: hitTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  newsText: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'center' },
});
