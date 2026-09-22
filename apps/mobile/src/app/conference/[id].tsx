import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ChatConferenceDto } from '@vedamatch/shared';
import { useSession } from '@/lib/auth/session';
import { createConferenceApi } from '@/lib/chat/conference-api';
import {
  conferenceSeatsLine,
  conferenceShareText,
} from '@/lib/chat/conference-link';
import {
  conferenceActionNote,
  conferenceCallCta,
  conferencePanelView,
} from '@/lib/chat/conference-panel';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Панель конференции — отдельным экраном поверх комнаты (VED-360).
 *
 * Почему экран, а не полоса в самой беседе. Место в шапке чата занято
 * звонками, а полоса над перепиской съедает ровно те строки, ради которых
 * человек в комнату и пришёл. Нужна панель редко (переслать ссылку тому,
 * кто не дошёл; закрыть вход, когда все собрались), а ошибиться в ней
 * дорого: «закрыть вход» необратимо без второй кнопки. Отдельный экран
 * даёт и место под объяснение, и паузу перед нажатием.
 *
 * Показан он полулистом (`formSheet`): комната остаётся видна за ним, и
 * закрывается панель свайпом вниз, как любая системная. Способ тот же,
 * каким в приложении сделаны остальные вспомогательные экраны стека.
 *
 * Тексты и видимость кнопок решает `lib/chat/conference-panel.ts` — там же
 * их таблица случаев. Здесь только вывод и три запроса.
 */
export default function ConferencePanelScreen() {
  const { colors } = useTheme();
  const { api } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';
  const conference = useMemo(() => createConferenceApi(api), [api]);
  const calls = useGroupCalls();

  const [room, setRoom] = useState<ChatConferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return undefined;
    let alive = true;
    conference
      .room(conversationId)
      .then((next) => {
        if (alive) setRoom(next);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : 'Ссылка не открылась',
          );
      });
    return () => {
      alive = false;
    };
  }, [conference, conversationId]);

  const run = useCallback(
    async (
      action: 'shared' | 'revoked' | 'rotated',
      task: () => Promise<ChatConferenceDto | void>,
    ) => {
      confirmTap();
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const result = await task();
        if (result) setRoom(result);
        setNote(conferenceActionNote(action));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const share = useCallback(
    (url: string) =>
      run('shared', async () => {
        await Share.share({
          message: conferenceShareText(url),
          url,
        }).catch(() => undefined);
      }),
    [run],
  );

  const view = room ? conferencePanelView(room) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg1 }]}>
      <Stack.Screen options={{ title: 'Ссылка конференции' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {!room && !error ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.text1} />
            <Text style={[styles.body, { color: colors.text1 }]}>
              Смотрим, что со ссылкой…
            </Text>
          </View>
        ) : null}

        {room && view ? (
          <>
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { color: view.tone === 'open' ? colors.text0 : colors.text1 },
              ]}
            >
              {view.title}
            </Text>
            <Text style={[styles.body, { color: colors.text1 }]}>
              {view.hint}
            </Text>
            <Text style={[styles.body, { color: colors.text2 }]}>
              {conferenceSeatsLine(room)}
            </Text>

            {view.showLink ? (
              <Text
                selectable
                style={[
                  styles.link,
                  { color: colors.text0, borderColor: colors.glassBorder },
                ]}
              >
                {room.url}
              </Text>
            ) : null}

            {view.showLink ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Отправить ссылку"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void share(room.url)}
                android_ripple={ripple(colors.onMint)}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.mint },
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.primaryText, { color: colors.onMint }]}>
                  Отправить ссылку
                </Text>
              </Pressable>
            ) : null}

            {calls ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={conferenceCallCta(room)}
                onPress={() => {
                  // Экран уходит: комната звонка открывается поверх, и
                  // возвращаться в панель после разговора незачем.
                  router.back();
                  void calls.startOrJoin(conversationId);
                }}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.secondaryText, { color: colors.text0 }]}>
                  {conferenceCallCta(room)}
                </Text>
              </Pressable>
            ) : null}

            {view.showRevoke ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть вход по ссылке"
                accessibilityHint="Новых по ссылке не пустят, те, кто уже в комнате, останутся"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() =>
                  void run('revoked', () => conference.revoke(conversationId))
                }
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.secondaryText, { color: colors.text0 }]}>
                  Закрыть вход
                </Text>
              </Pressable>
            ) : null}

            {view.showRotate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={view.rotateLabel}
                accessibilityHint="Прежняя ссылка перестанет работать"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() =>
                  void run('rotated', () => conference.rotate(conversationId))
                }
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.secondaryText, { color: colors.text0 }]}>
                  {view.rotateLabel}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {error ? (
          <Text
            accessibilityRole="alert"
            selectable
            style={[styles.body, { color: colors.text1 }]}
          >
            {error}
          </Text>
        ) : null}

        {/* Итог действия словами: кнопки подписи не меняют, и без этой
            строки «закрыть вход» выглядит как нажатие впустую. */}
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.body, { color: colors.text2 }]}
          >
            {note}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 8 },
  waiting: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  title: { fontFamily: fonts.displayBold, fontSize: 20 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  link: {
    fontFamily: fonts.mono,
    fontSize: 13,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  primaryText: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  secondaryText: { fontFamily: fonts.body, fontSize: 15 },
});
