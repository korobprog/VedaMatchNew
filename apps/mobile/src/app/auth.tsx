import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/lib/auth/session';
import { appAuthRedirect } from '@/config/app-variant';
import { WebPortalButton } from '@/components/web-portal-button';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Приёмник возврата из браузера: `vedamatch://auth?code=…` или `?error=…`
 * (у сборки разработчика — `vedamatch-dev://auth`).
 * Роутер открывает этот экран, когда Android отдаёт ссылку переходом, а не
 * результатом openAuthSessionAsync. Экран завершает вход и уходит на нужную
 * вкладку либо на экран входа с текстом ошибки.
 */
export default function AuthReturnScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { completeSignIn, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;
    const url = new URL(appAuthRedirect());
    if (typeof params.code === 'string') url.searchParams.set('code', params.code);
    if (typeof params.error === 'string') url.searchParams.set('error', params.error);
    completeSignIn(url.toString())
      .then(() => router.replace('/'))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : 'Не удалось войти';
        router.replace({ pathname: '/login', params: { error: message } });
      });
    // Один раз на вход: параметры маршрута после replace уже не важны.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {/* Тот же выход в портал, что и на экране входа: если завершение
          входа зависло без сети, экран не должен оставаться тупиком. */}
      <WebPortalButton />
      <View style={styles.center}>
        <ActivityIndicator color={colors.magenta} />
        <Text style={[styles.text, { color: colors.text1 }]}>Завершаем вход…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { fontFamily: fonts.body, fontSize: 15 },
});
