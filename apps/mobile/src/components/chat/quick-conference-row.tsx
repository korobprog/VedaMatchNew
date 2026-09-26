import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { ChatConferenceDto } from '@vedamatch/shared';
import { useSession } from '@/lib/auth/session';
import { createConferenceApi } from '@/lib/chat/conference-api';
import { conferenceSeatsLine, conferenceShareText } from '@/lib/chat/conference-link';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

/**
 * «Быстрая конференция» в шапке списка чатов.
 *
 * То же место и та же роль, что у кнопки на сайте: конференция — это
 * разговор, а разговоры живут здесь. Нажатие сразу заводит комнату и
 * открывает системное «Поделиться»: на телефоне ссылку не копируют в
 * буфер, а отправляют в тот мессенджер, где сидят те, кого зовут.
 *
 * Про потолок сказано в самой кнопке, до нажатия: «до четырёх человек».
 * Это единственное место, где человек узнаёт предел заранее, а не отказом
 * пятому — см. решение по mesh'у от 2026-09-21.
 */
export function QuickConferenceRow() {
  const { colors } = useTheme();
  const { api } = useSession();
  const conference = useMemo(() => createConferenceApi(api), [api]);
  const [room, setRoom] = useState<ChatConferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = useCallback(
    async (created: ChatConferenceDto) => {
      await Share.share({
        message: conferenceShareText(created.url),
        url: created.url,
      }).catch(() => undefined);
    },
    [],
  );

  const open = useCallback(async () => {
    confirmTap();
    setBusy(true);
    setError(null);
    try {
      const created = await conference.create();
      setRoom(created);
      await share(created);
    } catch (cause) {
      setError(
        screenErrorText('components/chat/quick-conference-row', cause, 'Не удалось открыть конференцию'),
      );
    } finally {
      setBusy(false);
    }
  }, [conference, share]);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Быстрая конференция"
        accessibilityHint="Заводит комнату и предлагает отправить ссылку на неё"
        onPress={() => void open()}
        disabled={busy}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          pressedStyle(pressed),
        ]}
      >
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text0 }]}>
            {busy ? 'Открываем комнату…' : 'Быстрая конференция'}
          </Text>
          <Text style={[styles.note, { color: colors.text1 }]}>
            Ссылка, по которой входят сразу. До четырёх человек.
          </Text>
        </View>
      </Pressable>

      {room ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отправить ссылку ещё раз"
            onPress={() => void share(room)}
            android_ripple={ripple(colors.onMint)}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.mint },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.actionText, { color: colors.onMint }]}>
              Отправить ссылку
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть комнату конференции"
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: room.conversationId } })
            }
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.action,
              { borderWidth: 1, borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.actionText, { color: colors.text0 }]}>Открыть комнату</Text>
          </Pressable>
        </View>
      ) : null}

      {room ? (
        <Text style={[styles.note, { color: colors.text2 }]}>{conferenceSeatsLine(room)}</Text>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.text1 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  text: { gap: 2 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    minHeight: hitTarget,
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
