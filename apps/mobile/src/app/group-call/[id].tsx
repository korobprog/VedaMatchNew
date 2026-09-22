import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { RTCView } from 'react-native-webrtc';
import type { ChatGroupCallParticipantDto } from '@vedamatch/shared';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { useElapsedLabel } from '@/lib/calls/use-elapsed-label';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { peopleLabel } from '@/lib/group-calls/group-call-banner-text';
import { peerStateLabel } from '@/lib/group-calls/group-call-state';
import {
  cameraButtonState,
  camerasOn,
  videoTiles,
} from '@/lib/group-calls/group-video-state';
import { videoGridLayout } from '@/lib/group-calls/video-grid';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Экран группового звонка (VED-293: этап 1 — звук, этап 4 — видео).
 *
 * Состояние — из `group-call-provider.tsx`, не своё; `id` в адресе только
 * чтобы системное «назад» после восстановления не открыло чужую комнату.
 * Как и у звонка один на один, «назад» СВОРАЧИВАЕТ звонок, а не завершает
 * его: разговор продолжается, вернуться можно плашкой (`GroupCallBanner`).
 * Выход из звонка — только кнопкой, её не нажимают случайно.
 *
 * Экран показывает одно из двух и переключается сам:
 *
 * - **сетка плиток**, когда в комнате включена хоть одна камера. Раскладка —
 *   `video-grid.ts` (там же обоснование, почему двое встают друг над другом,
 *   а не рядом); плитка без картинки — аватар, а не чёрный прямоугольник;
 * - **список строк**, пока разговор идёт голосом. Строка вмещает больше
 *   сведений (хозяин, кто говорит, состояние связи), и в звонке без видео
 *   она полезнее четырёх пустых плиток.
 *
 * Кнопка «камера» гаснет, когда мест под видео не осталось, но остаётся
 * нажимаемой и объясняет причину словами. Настоящее решение — за сервером,
 * он же присылает текст отказа (`group-call-video.ts`).
 */
export default function GroupCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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
  const showsGrid = !ended && camerasOn(call) > 0;
  const camera = cameraButtonState(call, calls.selfId, calls.cameraOn);
  const speaking = state.speaking;

  const grid = (
    <VideoGrid
      participants={participants}
      selfId={calls.selfId}
      call={call}
      sendingVideo={calls.sendingVideo}
      localStreamUrl={calls.localVideoStream?.toURL() ?? null}
      remoteStreams={calls.remoteStreams}
      remoteVideoOff={calls.remoteVideoOff}
      speaking={speaking}
      selfMuted={state.muted}
      peerStates={state.peerStates}
      wide={width > height}
    />
  );

  // «Картинка в картинке» — маленькое окошко поверх чужого приложения: в
  // нём остаются только плитки. Кнопки там всё равно не нажимаются, а
  // заголовок с таймером не читается.
  if (calls.pipActive)
    return <View style={[styles.root, { backgroundColor: colors.bg0 }]}>{grid}</View>;

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
            {`Не больше ${call.maxParticipants} человек и ${call.maxVideoParticipants} камер — всё идёт напрямую между телефонами`}
          </Text>
        ) : null}
      </View>

      {showsGrid ? (
        grid
      ) : (
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
              speaking={speaking.includes(item.user.id)}
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
      )}

      {state.actionError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${state.actionError}. Нажмите, чтобы закрыть`}
          accessibilityLiveRegion="polite"
          onPress={calls.clearActionError}
          style={({ pressed }) => [
            styles.actionError,
            { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.actionErrorText, { color: colors.text0 }]}>
            {state.actionError}
          </Text>
        </Pressable>
      ) : null}

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

            {/* Кнопка остаётся НАЖИМАЕМОЙ, даже когда мест нет: иначе
                четвёртый жмёт в мёртвую кнопку и не понимает, почему.
                Нажатие объясняет причину словами — их присылает сервер. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                camera.blocked
                  ? `Включить камеру нельзя: ${camera.blockedReason}`
                  : calls.cameraOn
                    ? 'Выключить камеру'
                    : 'Включить камеру'
              }
              accessibilityState={{ selected: calls.cameraOn }}
              onPress={() => {
                confirmTap();
                void calls.toggleCamera();
              }}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [
                styles.circle,
                { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                camera.blocked ? styles.blocked : null,
                pressedStyle(pressed),
              ]}
            >
              <CameraIcon
                off={!calls.cameraOn}
                color={camera.blocked ? colors.text1 : colors.text0}
              />
            </Pressable>

            {calls.cameraOn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Перевернуть камеру"
                onPress={() => {
                  confirmTap();
                  calls.switchCamera();
                }}
                android_ripple={ripple(colors.glassBorder, true)}
                style={({ pressed }) => [
                  styles.circle,
                  { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <FlipIcon color={colors.text0} />
              </Pressable>
            ) : null}

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

/** Сетка плиток. Что в какой плитке, решает `group-video-state.ts`. */
function VideoGrid({
  participants,
  call,
  selfId,
  sendingVideo,
  localStreamUrl,
  remoteStreams,
  remoteVideoOff,
  speaking,
  selfMuted,
  peerStates,
  wide,
}: {
  participants: ChatGroupCallParticipantDto[];
  call: Parameters<typeof videoTiles>[0]['call'];
  selfId: string;
  sendingVideo: boolean;
  localStreamUrl: string | null;
  remoteStreams: Record<string, { toURL: () => string }>;
  remoteVideoOff: Record<string, boolean>;
  speaking: string[];
  selfMuted: boolean;
  peerStates: Record<string, Parameters<typeof peerStateLabel>[0]>;
  wide: boolean;
}) {
  const { colors } = useTheme();
  const tiles = videoTiles({
    call,
    selfId,
    sendingVideo,
    remoteStreams: new Set(Object.keys(remoteStreams)),
    remoteVideoOff: new Set(
      Object.entries(remoteVideoOff)
        .filter(([, off]) => off)
        .map(([userId]) => userId),
    ),
  });
  const layout = videoGridLayout(tiles.length, wide);
  const byId = new Map(participants.map((p) => [p.user.id, p]));

  return (
    <View accessibilityLabel="Кто в звонке" style={styles.grid}>
      {tiles.map((tile) => {
        const participant = byId.get(tile.userId);
        if (!participant) return null;
        const muted = tile.isSelf ? selfMuted : participant.muted;
        const url = tile.isSelf ? localStreamUrl : (remoteStreams[tile.userId]?.toURL() ?? null);
        return (
          <View
            key={tile.userId}
            accessible
            accessibilityLabel={spokenLabel({
              participant,
              isSelf: tile.isSelf,
              muted,
              speaking: speaking.includes(tile.userId),
              statusLine: tile.isSelf ? null : peerStateLabel(peerStates[tile.userId]),
              cameraOff: tile.view === 'avatar',
            })}
            style={[
              styles.tile,
              {
                width: `${100 / layout.columns}%`,
                height: `${100 / layout.rows}%`,
                backgroundColor: colors.bg1,
                borderColor: speaking.includes(tile.userId)
                  ? colors.cyan
                  : colors.glassBorder,
              },
            ]}
          >
            {tile.view === 'video' && url ? (
              <RTCView
                streamURL={url}
                style={StyleSheet.absoluteFill}
                objectFit="cover"
                // Свою камеру показываем зеркально: человек привык видеть
                // себя таким, каким его показывает зеркало.
                mirror={tile.isSelf}
              />
            ) : (
              <View style={styles.tilePlaceholder}>
                <ChatAvatar
                  id={participant.user.id}
                  name={participant.user.name}
                  uri={participant.user.avatarUrl}
                  size={layout.rows > 2 ? 48 : 72}
                />
              </View>
            )}
            <View style={[styles.tileBar, { backgroundColor: colors.glass }]}>
              <Text numberOfLines={1} style={[styles.tileName, { color: colors.text0 }]}>
                {tile.isSelf ? `${participant.user.name} (вы)` : participant.user.name}
              </Text>
              {muted ? <MicIcon off color={colors.text1} size={18} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Подпись для скринридера собирается словами, а не цветом рамки и не
 * значком: «говорит», «микрофон выключен», «камера выключена» иначе не
 * читаются вовсе.
 */
function spokenLabel({
  participant,
  isSelf,
  muted,
  speaking,
  statusLine,
  cameraOff,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
  cameraOff: boolean;
}): string {
  return [
    isSelf ? `${participant.user.name} (вы)` : participant.user.name,
    participant.host ? 'хозяин звонка' : null,
    cameraOff ? 'камера выключена' : null,
    muted ? 'микрофон выключен' : null,
    speaking ? 'говорит' : null,
    statusLine,
  ]
    .filter(Boolean)
    .join(', ');
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

  return (
    <View
      accessible
      accessibilityLabel={spokenLabel({
        participant,
        isSelf,
        muted,
        speaking,
        statusLine,
        cameraOff: false,
      })}
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

function CameraIcon({ off, color, size = 26 }: { off: boolean; color: string; size?: number }) {
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
      <Rect x={2} y={6} width={13} height={12} rx={3} />
      <Path d="M15 10.5 21 7v10l-6-3.5z" />
      {off ? <Line x1={3} y1={21} x2={21} y2={3} /> : null}
    </Svg>
  );
}

function FlipIcon({ color, size = 26 }: { color: string; size?: number }) {
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
      <Path d="M3 12a9 9 0 0 1 14.5-7.1M21 12a9 9 0 0 1-14.5 7.1" />
      <Path d="M17 2v4h-4M7 22v-4h4" />
      <Circle cx={12} cy={12} r={2.5} />
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
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 14 },
  tile: {
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tilePlaceholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tileName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13 },
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
  actionError: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: hitTarget,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  actionErrorText: { fontFamily: fonts.body, fontSize: 14 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
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
  /** Недоступная кнопка гаснет прозрачностью, но остаётся нажимаемой. */
  blocked: { opacity: 0.6 },
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
