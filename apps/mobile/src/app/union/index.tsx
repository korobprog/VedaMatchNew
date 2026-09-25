import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UnionLoadFailed, UnionLoading, unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { useSession } from '@/lib/auth/session';
import { createProfileApi } from '@/lib/profile/profile-api';
import { describeUnionError } from '@/lib/union/union-error';
import { hasCompleteUnionLocation, unionEntry, type UnionEntry } from '@/lib/union/union-entry';
import { useTheme } from '@/theme/theme';

const ROUTES: Record<UnionEntry, '/union/location' | '/union/profile' | '/union/recommendations'> = {
  location: '/union/location',
  profile: '/union/profile',
  recommendations: '/union/recommendations',
};

/**
 * Вход в Знакомства — с карточки каталога, чипа быстрого доступа и пушей.
 * Своего вида у него нет: он решает, куда вести, тем же порядком, что
 * `/union` на сайте (`union-entry.ts`), — нет места жительства → место, нет
 * анкеты → анкета, иначе сразу подбор — и заменяет себя нужным экраном,
 * чтобы «назад» из подбора вело в каталог, а не сюда.
 */
export default function UnionEntryScreen() {
  const { colors } = useTheme();
  const { api } = useSession();
  const unionApi = useUnionApi();
  const profileApi = useMemo(() => createProfileApi(api), [api]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const decide = useCallback(async () => {
    setLoadError(null);
    try {
      const [me, state] = await Promise.all([profileApi.me(), unionApi.profileState()]);
      const entry = unionEntry({ hasLocation: hasCompleteUnionLocation(me), hasProfile: state.profile !== null });
      router.replace(ROUTES[entry]);
    } catch (e) {
      setLoadError(describeUnionError(e, 'Не удалось открыть Знакомства.'));
    }
  }, [profileApi, unionApi]);

  useFocusEffect(
    useCallback(() => {
      void decide();
    }, [decide]),
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Знакомства')} />
      {loadError ? (
        <UnionLoadFailed message={loadError} onRetry={() => void decide()} />
      ) : (
        <UnionLoading label="Открываем Знакомства" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
