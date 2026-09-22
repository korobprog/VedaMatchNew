import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import type { ChatGroupCallParticipantDto } from '@vedamatch/shared';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { useElapsedLabel } from '@/lib/calls/use-elapsed-label';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { peopleLabel } from '@/lib/group-calls/group-call-banner-text';
import { peerStateLabel } from '@/lib/group-calls/group-call-state';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Экран группового аудиозвонка (VED-293, этап 1).
 *
 * Состояние — из `group-call-provider.tsx`, не своё; `id` в адресе только
 * чтобы системное «назад» после восстановления не открыло чужую комнату.
 * Как и у звонка один на один, «назад» СВОРАЧИВАЕТ звонок, а не завершает
 * его: разговор продолжается, вернуться можно плашкой (`GroupCallBanner`).
 * Выход из звонка — только кнопкой, её не нажимают случайно.
 *
 * Видео здесь нет: этап 1 — только звук. Место под картинку в строке
 * участника оставлено аватаром — когда появится видео, меняется строка, а
 * не устройство экрана.
 */
export default function GroupCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const calls = useGroupCalls();

  const state = calls?.state;
  const call = state?.call ?? null;
  const matches = Boolean(call && call.id === id);
  const elapsed = useElapsedLabel(state?.phase === 'active' ? (state?.joinedAt ?? null) : null);

  // Провайдер сбросил фазу — экрану больше нечего показывать.
  useEffect(() => {
    if (!calls) return;
    if (matches && state?.phase !== 'idle') return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [calls, matches, state?.phase]);

  useEffect(() => {
    calls?.reportScreenMounted(true);
    return () => calls?.reportScreenMounted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls?.reportScreenMounted]);

  // «Назад» сворачивает звонок тем же путём, что обычный pop, — см. шапку.
  useEffect(() => {
    if (!calls || state?.phase !== 'active') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return true;
    });
    return () => subscription.remove();
  }, [calls, state?.phase]);

  if (!calls || !state) return null;

  const participants = call?.participants ?? [];
  const ended = state.phase === 'ended';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text0 }]}>Групповой звонок</Text>
        <Text style={[styles.subtitle, { color: colors.text1 }]}>
          {ended
            ? (state.error ?? 'Звонок завершён')
            : `${peopleLabel(participants.length)} · ${elapsed}`}
        </Text>
        {!ended && call ? (
          <Text style={[styles.limit, { color: colors.text2 }]}>
            {`Пока не больше ${call.maxParticipants} человек — звук идёт напрямую между телефонами`}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={participants}
        keyExtractor={(item) => item.user.id}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            isSelf={item.user.id === calls.selfId}
            muted={item.user.id === calls.selfId ? state.muted : item.muted}
            speaking={state.speaking.includes(item.user.id)}
            statusLine={
              item.user.id === calls.selfId
                ? null
                : peerStateLabel(state.peerStates[item.user.id])
            }
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.text1 }]}>
            {ended ? 'Все вышли из звонка' : 'Соединяемся…'}
          </Text>
        }
      />

      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        {ended ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={() => {
              confirmTap();
              calls.dismiss();
            }}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.wideButton,
              { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.wideLabel, { color: colors.text0 }]}>Закрыть</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.muted ? 'Включить микрофон' : 'Выключить микрофон'}
              accessibilityState={{ selected: state.muted }}
              onPress={() => {
                confirmTap();
                calls.toggleMute();
              }}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [
                styles.circle,
                { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <MicIcon off={state.muted} color={colors.text0} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Выйти из звонка"
              onPress={() => {
                confirmTap();
                void calls.leave();
              }}
              android_ripple={ripple(colors.onAccent, true)}
              style={({ pressed }) => [
                styles.circle,
                styles.leave,
                { backgroundColor: colors.magenta, borderColor: colors.magenta },
                pressedStyle(pressed),
              ]}
            >
              <Svg
                width={26}
                height={26}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.onAccent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                <Line x1={3} y1={21} x2={21} y2={3} />
              </Svg>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function ParticipantRow({
  participant,
  isSelf,
  muted,
  speaking,
  statusLine,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
}) {
  const { colors } = useTheme();
  const name = isSelf ? `${participant.user.name} (вы)` : participant.user.name;
  // Подпись для скринридера собирается словами, а не цветом кружка:
  // «говорит» и «микрофон выключен» иначе не читаются вовсе.
  const spoken = [
    name,
    participant.host ? 'хозяин звонка' : null,
    muted ? 'микрофон выключен' : null,
    speaking ? 'говорит' : null,
    statusLine,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[
        styles.row,
        {
          backgroundColor: colors.bg1,
          borderColor: speaking ? colors.cyan : colors.glassBorder,
        },
      ]}
    >
      <ChatAvatar id={participant.user.id} name={participant.user.name} uri={participant.user.avatarUrl} size={44} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.text1 }]}>
          {statusLine ?? (speaking ? 'Говорит' : participant.host ? 'Хозяин звонка' : 'В звонке')}
        </Text>
      </View>
      {muted ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={styles.micBadge}
        >
          <MicIcon off color={colors.text1} size={20} />
        </View>
      ) : null}
    </View>
  );
}

function MicIcon({ off, color, size = 26 }: { off: boolean; color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <Path d="M5 11a7 7 0 0 0 14 0" />
      <Line x1={12} y1={18} x2={12} y2={21} />
      {off ? <Line x1={3} y1={21} x2={21} y2={3} /> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, gap: 4 },
  title: { fontFamily: fonts.displayMedium, fontSize: 22 },
  subtitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, fontVariant: ['tabular-nums'] },
  limit: { fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  list: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: hitTarget + 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  micBadge: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.body, fontSize: 15, textAlign: 'center', paddingTop: 24 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingTop: 16,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leave: { borderWidth: 0 },
  wideButton: {
    minHeight: hitTarget,
    paddingHorizontal: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  wideLabel: { fontFamily: fonts.bodyBold, fontSize: 16 },
});
