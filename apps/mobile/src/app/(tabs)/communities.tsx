import type { CommunityBadgeDto, MyCommunitiesResponse } from '@vedamatch/shared';
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityBadgeRow } from '@/components/communities/community-badge-row';
import { RetryButton } from '@/components/retry-button';
import { CommunityListSkeleton } from '@/components/skeleton';
import { appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import { useSession } from '@/lib/auth/session';
import { createCommunitiesApi } from '@/lib/communities/communities-api';
import { sortMemberships } from '@/lib/communities/communities-list-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { useScreenTopInset } from '@/components/quick-bar/screen-top-inset';
import { screenErrorText } from '@/lib/api/error-text';
import { useReloadWhenOnline } from '@/lib/startup/connectivity';

function openCommunity(community: CommunityBadgeDto) {
  router.push({
    pathname: '/communities/[id]',
    params: {
      id: community.id,
      name: community.name,
      kind: community.kind,
      city: community.city ?? '',
      isVerified: community.isVerified ? '1' : '',
    },
  });
}

/**
 * Вкладка «Общины»: общины, где состоит участник, и его заявки на
 * рассмотрении. Вступление в новую общину и поиск по каталогу — только на
 * сайте (`SitePlaceholder`, ссылка в пустом состоянии) — в приложении не
 * дублируется, спека VED-170.
 */
export default function CommunitiesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Под панелью быстрого доступа вырез уже занят ею (VED-385).
  const topInset = useScreenTopInset();
  const { api } = useSession();
  const { webOrigin } = appVariant();
  const communitiesApi = useMemo(() => createCommunitiesApi(api), [api]);

  const [data, setData] = useState<MyCommunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Несколько триггеров загрузки (фокус вкладки, «Повторить», pull-to-refresh)
  // могут перекрыться по времени — засчитывается только самый свежий запрос.
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const response = await communitiesApi.mine();
      if (request.current === id) {
        setData(response);
        setError(null);
      }
    } catch (e) {
      if (request.current === id) {
        setError(screenErrorText('app/(tabs)/communities', e, 'Не удалось загрузить общины'));
      }
    } finally {
      if (request.current === id) setRefreshing(false);
    }
  }, [communitiesApi]);

  // Сеть вернулась, а экран в ошибке — перечитать самим, как «Повторить».
  useReloadWhenOnline(error !== null, () => void load());

  // Членство могло измениться на сайте (приняли в общину, разобрали заявку) —
  // перечитываем при каждом возврате на вкладку, а не только при первом монтировании.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const openOnSite = useCallback(() => {
    void WebBrowser.openBrowserAsync(serviceUrl(webOrigin, '/communities'));
  }, [webOrigin]);

  // Заголовок — отдельный от прокручиваемого содержимого блок с собственным
  // горизонтальным отступом: раньше он лежал то прямо в корне (скелетон,
  // полноэкранная ошибка, без отступа), то внутри `ScrollView` с отступом
  // `body` (список) — заголовок прыгал при появлении данных (раунд оценки
  // 006, дефект 2). Теперь он всегда одна и та же строка вне `body`.
  const header = (
    <View style={[styles.titleRow, { paddingTop: topInset + 16 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Общины
      </Text>
      {/* Завести свою ятру, храм или нама-хатту (VED-292): та же форма и та
          же портальная ручка, что у «Завести общину» на сайте. Поиск по
          чужим общинам по-прежнему только там. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Завести общину"
        accessibilityHint="Открывает форму новой общины"
        onPress={() => router.push('/communities/new')}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.newButton,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.newButtonText, { color: colors.text0 }]}>Завести</Text>
      </Pressable>
    </View>
  );

  if (!data && error) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.center}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.centerText, { color: colors.text1 }]}>
            {error}
          </Text>
          <RetryButton onPress={() => void load()} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.body}>
          {/* Плашка раздела уже здесь, в том же месте, что и у настоящего
              контента ниже — строки скелетона не сдвигаются вниз, когда
              появляются данные (раунд оценки 006, дефект 2). */}
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
            Мои общины
          </Text>
          <CommunityListSkeleton />
        </View>
      </View>
    );
  }

  const memberships = sortMemberships(data.memberships);
  const pending = sortMemberships(data.pending);
  const isEmpty = memberships.length === 0 && pending.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} progressViewOffset={topInset} />
        }
      >
        {error ? (
          <View style={[styles.banner, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.bannerText, { color: colors.text0 }]}>
              {error}
            </Text>
            <RetryButton onPress={() => void load()} />
          </View>
        ) : null}

        {isEmpty ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              Вы пока не состоите ни в одной общине. Найти свою и вступить можно на сайте.
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityHint="Открывает поиск общин на сайте в браузере"
              onPress={openOnSite}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.siteButton,
                { borderColor: colors.glassBorder, backgroundColor: colors.glass },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.siteButtonText, { color: colors.text0 }]}>Найти общину на сайте</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {memberships.length > 0 ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
                  Мои общины
                </Text>
                {memberships.map((community) => (
                  <CommunityBadgeRow key={community.id} community={community} onPress={openCommunity} />
                ))}
              </View>
            ) : null}

            {pending.length > 0 ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
                  Заявки на рассмотрении
                </Text>
                <Text style={[styles.sectionHint, { color: colors.text1 }]}>
                  Пока заявку не разберёт администрация общины, войти в её беседы нельзя.
                </Text>
                {pending.map((community) => (
                  <CommunityBadgeRow key={community.id} community={community} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 24 },
  newButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  newButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  body: { paddingHorizontal: 20, gap: 8 },
  section: { gap: 2, marginTop: 12 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  sectionHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 4,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyWrap: { gap: 14, marginTop: 12 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 32,
    overflow: 'hidden',
  },
  siteButton: {
    alignSelf: 'flex-start',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  siteButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
