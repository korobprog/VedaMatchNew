import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth/session';
import type { LoginProvider } from '@/lib/auth/login-flow';
import { WebPortalButton } from '@/components/web-portal-button';
import { buildStamp, buildStampLabel } from '@/config/build-stamp';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

/**
 * Экран входа. Кнопки открывают системный браузер на API нужного контура;
 * форма с паролем видна только в отладочной сборке и ходит в dev-login,
 * который в production выключен на сервере.
 */
export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signInDev, loginError } = useSession();
  const [busy, setBusy] = useState<LoginProvider | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stamp = buildStampLabel(buildStamp());
  // Ошибка, с которой вернул маршрут auth после неудачного входа через браузер.
  const params = useLocalSearchParams<{ error?: string }>();
  useEffect(() => {
    if (typeof params.error === 'string' && params.error) setError(params.error);
    else if (loginError) setError(loginError);
  }, [params.error, loginError]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function run(kind: LoginProvider | 'dev', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(screenErrorText('app/login', e, 'Не удалось войти'));
    } finally {
      setBusy(null);
    }
  }

  const buttonBase = [styles.button, { borderColor: colors.glassBorder, backgroundColor: colors.glass }];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {/* Выход в полную веб-версию портала: у корня нет своих отступов,
          поэтому угол считается от края экрана (`web-portal-button.tsx`). */}
      <WebPortalButton />
      <View style={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: colors.magenta }]}>VedaMatch</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
            Войти в свой аккаунт
          </Text>
          <Text style={[styles.hint, { color: colors.text1 }]}>
            {Platform.OS === 'web'
              ? 'Тот же аккаунт, что и на сайте VedaMatch. Вошли там — войдёте и здесь.'
              : 'Тот же аккаунт, что и на сайте. Откроется браузер, после входа вы вернётесь сюда.'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null}
            onPress={() => run('google', () => signIn('google'))}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [...buttonBase, pressedStyle(pressed)]}
          >
            {busy === 'google' ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.buttonText, { color: colors.text0 }]}>Войти через Google</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null}
            onPress={() => run('yandex', () => signIn('yandex'))}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [...buttonBase, pressedStyle(pressed)]}
          >
            {busy === 'yandex' ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.buttonText, { color: colors.text0 }]}>Войти через Яндекс</Text>}
          </Pressable>
          {stamp ? (
            <Text style={[styles.stamp, { color: colors.text2 }]} accessibilityRole="text">
              {stamp}
            </Text>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.magenta }]}>
              {error}
            </Text>
          ) : null}
        </View>

        {__DEV__ ? (
          <View style={[styles.dev, { borderColor: colors.glassBorder }]}>
            <Text style={[styles.devTitle, { color: colors.text2 }]}>Отладочный вход по паролю</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor={colors.text2}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="пароль"
              placeholderTextColor={colors.text2}
              secureTextEntry
              style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder }]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => run('dev', () => signInDev(email.trim(), password))}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.button, { backgroundColor: colors.magenta, borderColor: colors.magenta }, pressedStyle(pressed)]}
            >
              {busy === 'dev' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.buttonText, { color: colors.onAccent }]}>Войти</Text>}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, gap: 32 },
  header: { gap: 10 },
  brand: { fontFamily: fonts.displayBold, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 32 },
  hint: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  actions: { gap: 12 },
  button: {
    minHeight: hitTarget + 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 16 },
  error: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  stamp: { fontFamily: fonts.body, fontSize: 12, textAlign: 'center' },
  dev: { marginTop: 'auto', gap: 10, borderTopWidth: 1, paddingTop: 16 },
  devTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
});
