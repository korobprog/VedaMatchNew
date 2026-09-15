import type { ServiceCard as ServiceCardDto } from '@vedamatch/shared';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { ServiceGridSkeleton } from '@/components/skeleton';
import { ServiceCard } from '@/components/services/service-card';
import { appVariant } from '@/config/app-variant';
import { FALLBACK_SERVICES, serviceUrl } from '@/config/services';
import { useSession } from '@/lib/auth/session';
import { createServicesApi } from '@/lib/services/services-api';
import { visibleServices } from '@/lib/services/services-list';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Вкладка «Сервисы» (VED-174): настоящий каталог с `GET /services`, а не
 * хардкод шести латинских названий, как было в `config/services.ts` до этой
 * задачи. Названия и описания — те же, что на сайте под тем же аккаунтом:
 * их правит администратор из админки, и переписывать их здесь текстом
 * второй раз означало бы разойтись с сайтом при следующей правке каталога.
 * «Общение» из списка убрано — его уже покрывает нативная вкладка «Чаты»
 * (правило сторов: список сервисов второстепенный, дублировать то, что уже
 * есть в приложении, нельзя).
 */
export default function ServicesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user, signOut } = useSession();
  const { webOrigin } = appVariant();
  const servicesApi = useMemo(() => createServicesApi(api), [api]);

  const [data, setData] = useState<ServiceCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Несколько триггеров загрузки (фокус вкладки, «Повторить», pull-to-refresh)
  // могут перекрыться по времени — засчитывается только самый свежий запрос.
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const response = await servicesApi.list();
      if (request.current === id) {
        setData(response);
        setError(null);
      }
    } catch (e) {
      if (request.current === id) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить сервисы');
      }
    } finally {
      if (request.current === id) setRefreshing(false);
    }
  }, [servicesApi]);

  // Каталог мог поменяться в админке (новый сервис, смена статуса на
  // «скоро»/«активен») — перечитываем при каждом возврате на вкладку, а не
  // только при первом монтировании.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const openService = useCallback(
    (service: ServiceCardDto) => {
      void WebBrowser.openBrowserAsync(serviceUrl(webOrigin, service.url));
    },
    [webOrigin],
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Сервисы
      </Text>
      <Text style={[styles.subtitle, { color: colors.text1 }]}>Открываются на сайте VedaMatch в браузере.</Text>
    </View>
  );

  // Первая загрузка ещё без ответа сети — скелетон вместо крутилки, форма
  // совпадает с настоящей сеткой карточек.
  if (!data && !error) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.body}>
          <ServiceGridSkeleton />
        </View>
      </View>
    );
  }

  // Ни одного успешного ответа ещё не было (первый запуск офлайн, сервер
  // недоступен) — небольшой резерв из `FALLBACK_SERVICES` вместо пустого
  // экрана; «Повторить» тянет настоящий каталог, как только появится сеть, и
  // экран больше не возвращается к резерву после первого успеха.
  const usingFallback = !data;
  const list = visibleServices(data ?? FALLBACK_SERVICES);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.magenta]} />}
      >
        {header}

        {error ? (
          <View style={styles.errorBlock}>
            <InlineError
              message={usingFallback ? `${error}. Показан ограниченный список без сети.` : error}
            />
            <RetryButton onPress={() => void load()} />
          </View>
        ) : null}

        {list.length === 0 ? (
          <Text
            style={[styles.empty, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
          >
            Сервисы временно недоступны.
          </Text>
        ) : (
          <View style={styles.grid}>
            {list.map((service) => (
              <ServiceCard key={service.id} service={service} onPress={openService} />
            ))}
          </View>
        )}

        <View style={[styles.profile, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={[styles.profileName, { color: colors.text0 }]}>
              {user?.name ?? 'Аккаунт'}
            </Text>
            {user?.email ? (
              <Text numberOfLines={1} style={[styles.profileEmail, { color: colors.text1 }]}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.logout, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.logoutText, { color: colors.text0 }]}>Выйти</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, gap: 6, marginBottom: 12 },
  body: { paddingHorizontal: 20, gap: 12 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  errorBlock: { gap: 8, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.md, padding: 16, marginTop: 8 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  profileName: { fontFamily: fonts.bodyBold, fontSize: 16 },
  profileEmail: { fontFamily: fonts.body, fontSize: 12 },
  logout: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 16, justifyContent: 'center', overflow: 'hidden' },
  logoutText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
