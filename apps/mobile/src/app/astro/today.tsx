import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { appCapabilities, appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import { logErrorDetails } from '@/lib/api/error-text';
import { createAstroApi } from '@/lib/astro/astro-api';
import {
  ASTRO_BIRTH_DATA_PATH,
  ASTRO_CHART_PATH,
  CHART_LINK_LABEL,
  NEEDS_BIRTH_DATA,
  SITE_LOGIN_NOTE,
  TODAY_DISCLAIMER,
  TODAY_TITLE,
  describeToday,
  todayStateOf,
  type TodayState,
} from '@/lib/astro/today-view';
import { useSession } from '@/lib/auth/session';
import { useReloadWhenOnline } from '@/lib/startup/connectivity';
import { openWebPortal } from '@/lib/web-portal';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Персональный день» Астрологии — единственный экран сервиса в приложении.
 *
 * Сюда ведёт уведомление «Персональный день» (`astro.transit.digest-ready`,
 * путь `/astro/chart`, см. `lib/notifications/notification-target.ts`) — и
 * пуш, и карточка в ленте. Раньше карточка открывала сайт во вкладке
 * браузера, куда сессия приложения не переносится: человек попадал на
 * лендинг гостем и прочитать свой день не мог.
 *
 * Весь сервис не переносился: карта, разборы, совместимость и форма данных
 * рождения остаются на сайте, и плитка «Астро» в каталоге ведёт туда же,
 * куда вела. Данные — та же ручка, что у сайта (`GET /astro/today`), и то
 * же содержание, что у его карточки (`components/astro/today-card.tsx`).
 *
 * Платного на экране нет ни в одном канале: факты бесплатны, текст дня
 * общий на портал (`astro-transit.service.ts`) — см. `lib/astro/today-view.ts`.
 */
export default function AstroTodayScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const astro = useMemo(() => createAstroApi(api), [api]);
  const { webOrigin } = appVariant();
  // Ссылки на бесплатные разделы сайта — решение таблицы возможностей
  // канала (`config/capabilities.ts`), а не экрана: сейчас они есть в обоих
  // каналах, но если витрина попросит их убрать, погаснут и здесь.
  const { siteServiceLinks } = appCapabilities();

  const [state, setState] = useState<TodayState>({ kind: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const request = useRef(0);
  /** Ушли на сайт заполнять данные рождения — по возвращении перечитать. */
  const fromSite = useRef(false);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const today = await astro.today();
      if (request.current === id) setState(todayStateOf({ kind: 'loaded', today }));
    } catch (error) {
      if (request.current !== id) return;
      logErrorDetails('astro/today', error);
      setState(todayStateOf({ kind: 'failed', error }));
    } finally {
      if (request.current === id) {
        setRetrying(false);
        setRefreshing(false);
      }
    }
  }, [astro]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setRetrying(true);
    void load();
  }, [load]);

  // Без сети экран с ошибкой перечитывает себя сам, когда сеть вернулась.
  useReloadWhenOnline(state.kind === 'error', retry);

  // Вернулись из браузера после формы данных рождения — день мог появиться.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !fromSite.current) return;
      fromSite.current = false;
      retry();
    });
    return () => subscription.remove();
  }, [retry]);

  const openSite = useCallback(
    (path: string) => {
      setOpenError(null);
      void openWebPortal(serviceUrl(webOrigin, path), {
        openBrowser: (target) => WebBrowser.openBrowserAsync(target),
        openLink: (target) => Linking.openURL(target),
      }).then((result) => {
        if (result.kind === 'failed') {
          fromSite.current = false;
          setOpenError(result.message);
        }
      });
    },
    [webOrigin],
  );

  const header = {
    headerShown: true,
    title: TODAY_TITLE,
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.text0,
    headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
  } as const;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={header} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          state.kind === 'loading' ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              colors={[colors.magenta]}
              tintColor={colors.magenta}
            />
          )
        }
      >
        {state.kind === 'loading' ? (
          <ActivityIndicator
            accessibilityLabel="Загружаем персональный день"
            color={colors.magenta}
            style={styles.loading}
          />
        ) : null}

        {state.kind === 'error' ? (
          <View style={styles.block}>
            <InlineError message={state.message} />
            <View style={styles.row}>
              <RetryButton onPress={retry} busy={retrying} />
            </View>
          </View>
        ) : null}

        {state.kind === 'needs-birth-data' ? (
          <View style={[styles.card, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
              {NEEDS_BIRTH_DATA.title}
            </Text>
            <Text style={[styles.body, { color: colors.text1 }]}>{NEEDS_BIRTH_DATA.body}</Text>
            {siteServiceLinks ? (
              <>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={NEEDS_BIRTH_DATA.action}
                  accessibilityHint={SITE_LOGIN_NOTE}
                  onPress={() => {
                    fromSite.current = true;
                    openSite(ASTRO_BIRTH_DATA_PATH);
                  }}
                  android_ripple={ripple(colors.onAccent)}
                  style={({ pressed }) => [
                    styles.primary,
                    { backgroundColor: colors.magenta },
                    pressedStyle(pressed),
                  ]}
                >
                  <Text style={[styles.primaryText, { color: colors.onAccent }]}>{NEEDS_BIRTH_DATA.action}</Text>
                </Pressable>
                <Text style={[styles.note, { color: colors.text1 }]}>{SITE_LOGIN_NOTE}</Text>
              </>
            ) : null}
            <View style={styles.row}>
              <RetryButton onPress={retry} busy={retrying} label={NEEDS_BIRTH_DATA.recheck} />
            </View>
          </View>
        ) : null}

        {state.kind === 'ready' ? (
          <TodayCard
            state={state}
            onOpenChart={siteServiceLinks ? () => openSite(ASTRO_CHART_PATH) : null}
          />
        ) : null}

        {openError ? <InlineError message={openError} /> : null}
      </ScrollView>
    </View>
  );
}

/**
 * Карточка дня: текст и факты, под ней — оговорка и ссылка на карту рождения
 * на сайте (туда уведомление вело раньше; `null` — ссылок на сайт в этой
 * сборке нет).
 */
function TodayCard({
  state,
  onOpenChart,
}: {
  state: Extract<TodayState, { kind: 'ready' }>;
  onOpenChart: (() => void) | null;
}) {
  const { colors } = useTheme();
  const view = describeToday(state.today);
  return (
    <View style={styles.block}>
      <View style={[styles.card, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}>
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
          Сегодня
        </Text>
        {/* Замена тексту дня — вторичным цветом: это не прогноз, а «ещё нет». */}
        <Text style={[view.pending ? styles.body : styles.text, { color: view.pending ? colors.text1 : colors.text0 }]}>
          {view.text}
        </Text>
        {view.facts.length > 0 ? (
          <View style={[styles.facts, { borderTopColor: colors.glassBorder }]}>
            {view.facts.map((fact) => (
              <View
                key={fact.label}
                accessible
                accessibilityLabel={`${fact.label}: ${fact.value}`}
                style={styles.fact}
              >
                <Text style={[styles.factLabel, { color: colors.text1 }]}>{fact.label}</Text>
                <Text style={[styles.factValue, { color: colors.text0 }]}>{fact.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Text style={[styles.note, { color: colors.text1 }]}>{TODAY_DISCLAIMER}</Text>

      {onOpenChart ? (
        <View style={styles.linkBlock}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={CHART_LINK_LABEL}
            accessibilityHint={SITE_LOGIN_NOTE}
            onPress={onOpenChart}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>{CHART_LINK_LABEL}</Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.text1 }]}>{SITE_LOGIN_NOTE}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  loading: { marginTop: 32 },
  block: { gap: 12 },
  linkBlock: { gap: 8 },
  row: { flexDirection: 'row' },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontFamily: fonts.displayMedium, fontSize: 18 },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  fact: { gap: 2 },
  factLabel: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  factValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  secondary: {
    minHeight: hitTarget,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
