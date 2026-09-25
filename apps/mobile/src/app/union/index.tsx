import * as WebBrowser from 'expo-web-browser';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { UnionButton, UnionLoadFailed, UnionLoading, unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { appCapabilities, appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import { useSession } from '@/lib/auth/session';
import { createProfileApi } from '@/lib/profile/profile-api';
import { describeUnionError } from '@/lib/union/union-error';
import { hasCompleteUnionLocation, unionEntry, type UnionEntry } from '@/lib/union/union-entry';
import { openWebPortal } from '@/lib/web-portal';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

const STEPS: Record<Exclude<UnionEntry, 'recommendations'>, { title: string; text: string; path: string }> = {
  location: {
    title: 'Укажите страну и город',
    text: 'Место нужно для подбора людей рядом и для фильтров Знакомств. Мы храним только выбранный город и примерные координаты.',
    path: '/union/location',
  },
  profile: {
    title: 'Заполните анкету',
    text: 'Без анкеты подбирать не по чему: совместимость считается по целям, ценностям и образу жизни.',
    path: '/union/profile',
  },
};

/**
 * Вход в Знакомства — с карточки каталога, чипа быстрого доступа и пушей.
 * Решает, куда вести, тем же порядком, что `/union` на сайте
 * (`union-entry.ts`): нет места — сначала место, нет анкеты — анкета, иначе
 * сразу подбор.
 *
 * Анкета и место пока заполняются на сайте: их экраны в приложении — вторая
 * часть переноса. Поэтому здесь честное объяснение и кнопка на сайт, а
 * вернувшись, человек попадает сразу в подбор: экран перечитывает состояние
 * при каждом возвращении.
 */
export default function UnionEntryScreen() {
  const { colors } = useTheme();
  const { api } = useSession();
  const unionApi = useUnionApi();
  const profileApi = useMemo(() => createProfileApi(api), [api]);
  const { siteServiceLinks } = appCapabilities();
  const [entry, setEntry] = useState<UnionEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const decide = useCallback(async () => {
    setLoadError(null);
    try {
      const [me, state] = await Promise.all([profileApi.me(), unionApi.profileState()]);
      const next = unionEntry({ hasLocation: hasCompleteUnionLocation(me), hasProfile: state.profile !== null });
      if (next === 'recommendations') {
        router.replace('/union/recommendations');
        return;
      }
      setEntry(next);
    } catch (e) {
      setLoadError(describeUnionError(e, 'Не удалось открыть Знакомства.'));
    }
  }, [profileApi, unionApi]);

  useFocusEffect(
    useCallback(() => {
      void decide();
    }, [decide]),
  );

  const openSite = (path: string) => {
    setOpenError(null);
    void openWebPortal(serviceUrl(appVariant().webOrigin, path), {
      openBrowser: (target) => WebBrowser.openBrowserAsync(target),
      openLink: (target) => Linking.openURL(target),
    }).then((result) => {
      if (result.kind === 'failed') setOpenError(result.message);
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Знакомства')} />
      {entry && entry !== 'recommendations' ? (
        <View style={styles.content}>
          <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              {STEPS[entry].title}
            </Text>
            <Text style={[styles.text, { color: colors.text1 }]}>{STEPS[entry].text}</Text>
            {siteServiceLinks ? (
              <>
                <Text style={[styles.text, { color: colors.text1 }]}>
                  В приложении этот шаг пока недоступен — сделайте его на сайте и возвращайтесь.
                </Text>
                <UnionButton
                  label="Открыть на сайте"
                  accessibilityHint="Откроется сайт VedaMatch в браузере"
                  onPress={() => openSite(STEPS[entry].path)}
                />
              </>
            ) : (
              <Text style={[styles.text, { color: colors.text1 }]}>
                В приложении этот шаг пока недоступен — сделайте его на сайте VedaMatch и возвращайтесь.
              </Text>
            )}
            {openError ? <InlineError message={openError} /> : null}
            <UnionButton kind="secondary" label="Проверить ещё раз" onPress={() => void decide()} />
          </View>
        </View>
      ) : loadError ? (
        <UnionLoadFailed message={loadError} onRetry={() => void decide()} />
      ) : (
        <UnionLoading label="Открываем Знакомства" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 20, gap: 12 },
  title: { fontFamily: fonts.displayBold, fontSize: 20 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
