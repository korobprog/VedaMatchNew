import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatConferenceInviteDto } from '@vedamatch/shared';
import { useSession } from '@/lib/auth/session';
import { createConferenceApi } from '@/lib/chat/conference-api';
import {
  conferenceCallLine,
  conferenceScreenStep,
  conferenceSeatsLine,
  parseConferenceToken,
} from '@/lib/chat/conference-link';
import { pendingConference } from '@/lib/chat/conference-pending';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Экран короткой ссылки на конференцию: `vedamatch://j/<токен>` и
 * `https://vedamatch.ru/j/<токен>` (VED-360).
 *
 * Объявлен в корневом стеке ВНЕ охраны `Stack.Protected`: ссылку присылают
 * человеку, который может быть не только не в приложении, но и вовсе без
 * аккаунта. Гостю здесь показывают, кто зовёт и сколько мест, — и только
 * потом предлагают войти.
 *
 * Вошедшего экран не спрашивает ни о чём: карточка, вход в комнату, беседа.
 * Кнопок для него нет вовсе — обещание задачи звучало как «открыл ссылку и
 * оказался в комнате».
 *
 * Возврат после входа: на сайте его делает `?returnTo=`, здесь — намерение
 * в `conference-pending.ts`, которое подбирает `ConferenceReturn` в
 * корневом стеке. Путь одинаков и для входа, и для регистрации: в портале
 * первый вход и есть регистрация.
 */
export default function ConferenceLinkScreen() {
  const { colors } = useTheme();
  const { status, api } = useSession();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = parseConferenceToken(params.token ?? null);
  const conference = useMemo(() => createConferenceApi(api), [api]);

  const [invite, setInvite] = useState<ChatConferenceInviteDto | null>(null);
  const [error, setError] = useState<string | null>(
    token ? null : 'Такой конференции нет',
  );
  // Вход в комнату выполняется один раз: повторный POST при перерисовке —
  // лишний запрос и лишняя строка в логах.
  const entering = useRef(false);

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    conference
      .invite(token)
      .then((next) => {
        if (alive) setInvite(next);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(cause instanceof Error ? cause.message : 'Ссылка не открылась');
      });
    return () => {
      alive = false;
    };
  }, [conference, token]);

  const step = conferenceScreenStep({
    signedIn: status === 'signed',
    invite,
    error,
  });

  useEffect(() => {
    if (step.kind !== 'enter' || !token || entering.current) return;
    entering.current = true;
    conference
      .join(token)
      .then((room) =>
        router.replace({ pathname: '/chat/[id]', params: { id: room.conversationId } }),
      )
      .catch((cause: unknown) => {
        entering.current = false;
        setError(cause instanceof Error ? cause.message : 'Не получилось войти');
      });
  }, [step.kind, token, conference]);

  const goSignIn = useCallback(() => {
    confirmTap();
    // Куда человек шёл — запоминаем ДО входа: `vedamatch://auth` вернёт
    // управление, ничего не зная о конференции.
    pendingConference.remember(token);
    router.replace('/login');
  }, [token]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        {step.kind === 'loading' || step.kind === 'enter' ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.magenta} />
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              {step.kind === 'enter' ? step.note : 'Открываем приглашение…'}
            </Text>
          </View>
        ) : null}

        {step.kind === 'denied' ? (
          <>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              {step.title}
            </Text>
            <Text accessibilityRole="alert" style={[styles.body, { color: colors.text1 }]}>
              {step.text}
            </Text>
            <Pressable
              accessibilityRole="button"
              // Гостю вкладки закрыты охраной стека: `replace('/(tabs)')` у
              // него молча ничего не делал, и человек застревал на ошибке.
              onPress={() => router.replace(status === 'signed' ? '/(tabs)' : '/login')}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text0 }]}>Закрыть</Text>
            </Pressable>
          </>
        ) : null}

        {step.kind === 'sign-in' && invite ? (
          <>
            <Text style={[styles.kicker, { color: colors.text1 }]}>Вас зовут в конференцию</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              {invite.title}
            </Text>
            <Text style={[styles.body, { color: colors.text1 }]}>
              {invite.host.name} · {conferenceCallLine(invite)}
            </Text>
            <Text style={[styles.body, { color: colors.text1 }]}>
              {conferenceSeatsLine(invite)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Откроет вход, после которого вы окажетесь в конференции"
              onPress={goSignIn}
              android_ripple={ripple(colors.onMint)}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: colors.mint },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.primaryText, { color: colors.onMint }]}>{step.action}</Text>
            </Pressable>
            <Text style={[styles.note, { color: colors.text2 }]}>
              Отдельной регистрации нет: первый вход создаёт аккаунт и сразу возвращает
              вас в конференцию.
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 20, gap: 8 },
  waiting: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  kicker: { fontFamily: fonts.body, fontSize: 14 },
  title: { fontFamily: fonts.displayBold, fontSize: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  primaryText: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  secondaryText: { fontFamily: fonts.body, fontSize: 15 },
});
