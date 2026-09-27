import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
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
  screenSharer,
  videoTiles,
  type Tile,
} from '@/lib/group-calls/group-video-state';
import { screenButtonState } from '@/lib/group-calls/screen-share';
import { splitStage, stageStrip, videoGridLayout } from '@/lib/group-calls/video-grid';
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
 *
 * Чужой показ экрана (VED-360) встаёт «сценой»: экран крупно и целиком,
 * остальные полосой; нажатие разворачивает его во весь экран телефона.
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
  const screen = screenButtonState(call, calls.selfId, {
    sharing: calls.screenOn,
    supported: calls.screenSupported,
  });
  const speaking = state.speaking;
  const sharer = ended ? null : screenSharer(call);
  // Перевернуть камеру во время показа нечего: в отправителе экран.
  const showFlip = calls.cameraOn && !calls.screenOn;
  // Пять круглых кнопок по 64 не помещаются в 360 точек ширины — тогда
  // кнопки чуть меньше и ближе, но не меньше 48 (`hitTarget`).
  const dense = 3 + (showFlip ? 1 : 0) + (screen.visible ? 1 : 0) > 4;

  const grid = (
    <VideoGrid
      participants={participants}
      selfId={calls.selfId}
      call={call}
      sendingVideo={calls.sendingVideo}
      sharingScreen={calls.screenOn}
      localStreamUrl={calls.localVideoStream?.toURL() ?? null}
      remoteStreams={calls.remoteStreams}
      remoteVideoOff={calls.remoteVideoOff}
      speaking={speaking}
      selfMuted={state.muted}
      peerStates={state.peerStates}
      wide={width > height}
      pip={calls.pipActive}
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
        {/* Долгое нажатие на заголовок — скрытая сводка видео по парам
            (`group-video-link.ts`): релизная сборка молчит в logcat, а
            чёрную плитку иначе не разобрать. Без имён и id собеседников. */}
        <Text
          style={[styles.title, { color: colors.text0 }]}
          onLongPress={() => {
            void calls
              .videoDiagnostics()
              .then((text) => Alert.alert('Видео по соединениям', text))
              .catch(() => undefined);
          }}
        >
          Групповой звонок
        </Text>
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
        {/* Начало чужого показа проговаривается: крупная плитка сама по
            себе скринридеру ничего не скажет. */}
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.sharing, { color: colors.text1 }]}
        >
          {sharer
            ? sharer.id === calls.selfId
              ? 'Вы показываете экран'
              : `${sharer.name} показывает экран`
            : ''}
        </Text>
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

      {calls.screenOn && !ended ? (
        <View style={styles.sharingBar}>
          <Text style={[styles.sharingBarText, { color: colors.text0 }]}>
            Остальные видят ваш экран
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              confirmTap();
              void calls.toggleScreenShare();
            }}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.sharingStop,
              { backgroundColor: colors.bg1, borderColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.sharingStopLabel, { color: colors.text0 }]}>
              Остановить показ
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.controls,
          dense ? styles.controlsDense : null,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
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
                dense ? styles.circleDense : styles.circle,
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
                // Во время показа экрана кнопка решает, вернётся ли камера
                // после него: в отправителе сейчас экран.
                calls.screenOn
                  ? calls.cameraOn
                    ? 'Не включать камеру после показа экрана'
                    : 'Включить камеру после показа экрана'
                  : camera.blocked
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
                dense ? styles.circleDense : styles.circle,
                { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                camera.blocked && !calls.screenOn ? styles.blocked : null,
                pressedStyle(pressed),
              ]}
            >
              <CameraIcon
                off={!calls.cameraOn}
                color={camera.blocked ? colors.text1 : colors.text0}
              />
            </Pressable>

            {showFlip ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Перевернуть камеру"
                onPress={() => {
                  confirmTap();
                  calls.switchCamera();
                }}
                android_ripple={ripple(colors.glassBorder, true)}
                style={({ pressed }) => [
                  dense ? styles.circleDense : styles.circle,
                  { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                  pressedStyle(pressed),
                ]}
              >
                <FlipIcon color={colors.text0} />
              </Pressable>
            ) : null}

            {/* Показ экрана (VED-360) — только Android 10+. Как и камера,
                погашенная кнопка остаётся нажимаемой и объясняет причину,
                но системное окно согласия при этом не открывается. */}
            {screen.visible ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  screen.blocked
                    ? `Показать экран нельзя: ${screen.blockedReason}`
                    : calls.screenOn
                      ? 'Остановить показ экрана'
                      : 'Показать экран'
                }
                accessibilityState={{ selected: calls.screenOn }}
                onPress={() => {
                  confirmTap();
                  void calls.toggleScreenShare();
                }}
                android_ripple={ripple(colors.glassBorder, true)}
                style={({ pressed }) => [
                  dense ? styles.circleDense : styles.circle,
                  {
                    backgroundColor: calls.screenOn ? colors.bg2 : colors.bg1,
                    borderColor: calls.screenOn ? colors.magenta : colors.glassBorder,
                  },
                  screen.blocked ? styles.blocked : null,
                  pressedStyle(pressed),
                ]}
              >
                <ScreenIcon
                  color={screen.blocked ? colors.text1 : colors.text0}
                  stop={calls.screenOn}
                />
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
                dense ? styles.circleDense : styles.circle,
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

/**
 * Сетка плиток. Что в какой плитке, решает `group-video-state.ts`.
 *
 * Когда кто-то показывает экран (VED-360), раскладка — «сцена»
 * (`splitStage`): экран крупно и целиком (`contain`), остальные полосой
 * снизу или сбоку (`stageStrip`). Нажатие на сцену разворачивает экран во
 * весь экран телефона — там его можно повернуть боком.
 *
 * В «картинке в картинке» остаётся только сцена: в окошке размером с
 * марку полоса из трёх плиток превращается в три пятна.
 */
function VideoGrid({
  participants,
  call,
  selfId,
  sendingVideo,
  sharingScreen = false,
  localStreamUrl,
  remoteStreams,
  remoteVideoOff,
  speaking,
  selfMuted,
  peerStates,
  wide,
  pip = false,
}: {
  participants: ChatGroupCallParticipantDto[];
  call: Parameters<typeof videoTiles>[0]['call'];
  selfId: string;
  sendingVideo: boolean;
  sharingScreen?: boolean;
  localStreamUrl: string | null;
  remoteStreams: Record<string, { toURL: () => string }>;
  remoteVideoOff: Record<string, boolean>;
  speaking: string[];
  selfMuted: boolean;
  peerStates: Record<string, Parameters<typeof peerStateLabel>[0]>;
  wide: boolean;
  pip?: boolean;
}) {
  const tiles = videoTiles({
    call,
    selfId,
    sendingVideo,
    sharingScreen,
    remoteStreams: new Set(Object.keys(remoteStreams)),
    remoteVideoOff: new Set(
      Object.entries(remoteVideoOff)
        .filter(([, off]) => off)
        .map(([userId]) => userId),
    ),
  });
  const byId = new Map(participants.map((p) => [p.user.id, p]));
  const { stage, strip } = splitStage(tiles);

  const tileProps = (tile: Tile) => {
    const participant = byId.get(tile.userId);
    if (!participant) return null;
    return {
      tile,
      participant,
      url: tile.isSelf ? localStreamUrl : (remoteStreams[tile.userId]?.toURL() ?? null),
      muted: tile.isSelf ? selfMuted : participant.muted,
      speaking: speaking.includes(tile.userId),
      statusLine: tile.isSelf ? null : peerStateLabel(peerStates[tile.userId]),
    };
  };

  const stageProps = stage ? tileProps(stage) : null;
  if (stageProps)
    return (
      <StageLayout
        stage={stageProps}
        strip={strip.map(tileProps).filter((props): props is TileProps => props !== null)}
        stripAt={pip ? 'none' : stageStrip(strip.length, wide)}
      />
    );

  const layout = videoGridLayout(tiles.length, wide);
  return (
    <View accessibilityLabel="Кто в звонке" style={styles.grid}>
      {tiles.map((tile) => {
        const props = tileProps(tile);
        return props ? (
          <GridTile
            key={tile.userId}
            {...props}
            avatarSize={layout.rows > 2 ? 48 : 72}
            style={{
              width: `${100 / layout.columns}%`,
              height: `${100 / layout.rows}%`,
            }}
          />
        ) : null;
      })}
    </View>
  );
}

/**
 * Раскладка «сцена + полоса». Отдельным компонентом ради одного: состояние
 * «развёрнут во весь экран» живёт, только пока есть сцена. Показ кончился,
 * пока экран был развёрнут, — компонент уходит, окно закрывается само, и
 * следующий показ не распахнётся на весь экран без спроса.
 */
function StageLayout({
  stage,
  strip,
  stripAt,
}: {
  stage: TileProps;
  strip: TileProps[];
  stripAt: 'side' | 'bottom' | 'none';
}) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <View style={[styles.stageLayout, { flexDirection: stripAt === 'side' ? 'row' : 'column' }]}>
      <StageTile {...stage} onExpand={() => setFullscreen(true)} />
      {stripAt !== 'none' ? (
        <View
          accessibilityLabel="Остальные в звонке"
          style={[styles.strip, stripAt === 'side' ? styles.stripSide : styles.stripBottom]}
        >
          {strip.map((props) => (
            <GridTile key={props.tile.userId} {...props} avatarSize={40} style={styles.stripTile} />
          ))}
        </View>
      ) : null}
      <ScreenFullscreen
        visible={fullscreen}
        url={stage.url}
        name={stage.participant.user.name}
        onClose={() => setFullscreen(false)}
      />
    </View>
  );
}

interface TileProps {
  tile: Tile;
  participant: ChatGroupCallParticipantDto;
  url: string | null;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
}

/** Плитка сетки или полосы: картинка или аватар, подпись с именем. */
function GridTile({
  tile,
  participant,
  url,
  muted,
  speaking,
  statusLine,
  avatarSize,
  style,
}: TileProps & { avatarSize: number; style: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={spokenLabel({
        participant,
        isSelf: tile.isSelf,
        muted,
        speaking,
        statusLine,
        cameraOff: tile.view === 'avatar',
        screen: tile.screen,
      })}
      style={[
        styles.tile,
        style,
        {
          backgroundColor: colors.bg1,
          borderColor: speaking ? colors.cyan : colors.glassBorder,
        },
      ]}
    >
      {tile.isSelf && tile.screen ? (
        // Свой экран живым превью не рисуется: телефон показывает весь
        // экран, и его копия внутри него самого — бесконечный коридор
        // отражений, а не полезная картинка.
        <View style={[styles.tilePlaceholder, styles.stagePlaceholder]}>
          <ScreenIcon color={colors.text1} size={avatarSize > 48 ? 36 : 24} />
          <Text style={[styles.stageHint, { color: colors.text1 }]}>Вы показываете экран</Text>
        </View>
      ) : tile.view === 'video' && url ? (
        <RTCView
          streamURL={url}
          style={StyleSheet.absoluteFill}
          // Лицо — `cover` (плитка заполнена), экран — `contain`: обрезанный
          // край слайда — потерянный текст.
          objectFit={tile.screen ? 'contain' : 'cover'}
          // Свою камеру показываем зеркально: человек привык видеть себя
          // таким, каким его показывает зеркало. Экран — никогда.
          mirror={tile.isSelf && !tile.screen}
        />
      ) : (
        <View style={styles.tilePlaceholder}>
          <ChatAvatar
            id={participant.user.id}
            name={participant.user.name}
            uri={participant.user.avatarUrl}
            size={avatarSize}
          />
        </View>
      )}
      <TileCaption
        name={tile.isSelf ? `${participant.user.name} (вы)` : participant.user.name}
        muted={muted}
        screen={tile.screen}
      />
    </View>
  );
}

/**
 * Чужой экран на сцене. Вся плитка — кнопка «развернуть во весь экран»:
 * попасть пальцем в маленький значок в углу на ходу труднее, чем в
 * половину экрана.
 */
function StageTile({
  tile,
  participant,
  url,
  muted,
  speaking,
  statusLine,
  onExpand,
}: TileProps & { onExpand: () => void }) {
  const { colors } = useTheme();
  const name = participant.user.name;
  const live = tile.view === 'video' && Boolean(url);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${spokenLabel({
        participant,
        isSelf: false,
        muted,
        speaking,
        statusLine,
        cameraOff: tile.view === 'avatar',
        screen: true,
      })}. Развернуть во весь экран`}
      accessibilityState={{ disabled: !live }}
      disabled={!live}
      onPress={() => {
        confirmTap();
        onExpand();
      }}
      style={[
        styles.tile,
        styles.stage,
        {
          backgroundColor: colors.bg1,
          borderColor: speaking ? colors.cyan : colors.glassBorder,
        },
      ]}
    >
      {live && url ? (
        <RTCView streamURL={url} style={StyleSheet.absoluteFill} objectFit="contain" mirror={false} />
      ) : (
        // Поток ещё не доехал — аватар с подписью, а не чёрное поле.
        <View style={[styles.tilePlaceholder, styles.stagePlaceholder]}>
          <ChatAvatar id={participant.user.id} name={name} uri={participant.user.avatarUrl} size={72} />
          <Text style={[styles.stageHint, { color: colors.text1 }]}>Готовим показ экрана…</Text>
        </View>
      )}
      {live ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.expandBadge, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}
        >
          <ExpandIcon color={colors.text0} />
        </View>
      ) : null}
      <TileCaption name={name} muted={muted} screen />
    </Pressable>
  );
}

/**
 * Экран во весь экран телефона: отдельное окно поверх звонка, картинка
 * целиком (`contain`). Закрывается кнопкой «Свернуть» и системным «назад»
 * — «назад» здесь сворачивает только экран, а не весь звонок.
 */
function ScreenFullscreen({
  visible,
  url,
  name,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  name: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        accessibilityViewIsModal
        accessibilityLabel={`Экран, который показывает ${name}`}
        style={[styles.fullscreen, { backgroundColor: colors.bg0 }]}
      >
        {url ? (
          <RTCView streamURL={url} style={StyleSheet.absoluteFill} objectFit="contain" mirror={false} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Свернуть экран"
          onPress={() => {
            confirmTap();
            onClose();
          }}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.fullscreenClose,
            {
              top: insets.top + 12,
              right: insets.right + 12,
              backgroundColor: colors.bg1,
              borderColor: colors.glassBorder,
            },
            pressedStyle(pressed),
          ]}
        >
          <ExpandIcon color={colors.text0} collapse />
          <Text style={[styles.fullscreenCloseLabel, { color: colors.text0 }]}>Свернуть</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function TileCaption({ name, muted, screen }: { name: string; muted: boolean; screen: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tileBar, { backgroundColor: colors.glass }]}>
      {screen ? <ScreenIcon color={colors.text1} size={16} /> : null}
      <Text numberOfLines={1} style={[styles.tileName, { color: colors.text0 }]}>
        {screen ? `Экран · ${name}` : name}
      </Text>
      {muted ? <MicIcon off color={colors.text1} size={18} /> : null}
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
  screen = false,
}: {
  participant: ChatGroupCallParticipantDto;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  statusLine: string | null;
  cameraOff: boolean;
  screen?: boolean;
}): string {
  return [
    isSelf ? `${participant.user.name} (вы)` : participant.user.name,
    participant.host ? 'хозяин звонка' : null,
    screen ? 'показывает экран' : cameraOff ? 'камера выключена' : null,
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

function ScreenIcon({
  color,
  size = 26,
  stop = false,
}: {
  color: string;
  size?: number;
  /** Крестик на экране — «остановить показ». */
  stop?: boolean;
}) {
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
      <Rect x={2.5} y={4} width={19} height={13} rx={2.5} />
      <Path d="M8 21h8M12 17v4" />
      {stop ? <Path d="M9.5 8l5 5M14.5 8l-5 5" /> : null}
    </Svg>
  );
}

function ExpandIcon({ color, collapse = false }: { color: string; collapse?: boolean }) {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path
        d={
          collapse
            ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
            : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
        }
      />
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
  sharing: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
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
  stageLayout: { flex: 1, gap: 8, paddingHorizontal: 10, paddingTop: 14 },
  /** Сцена забирает всё, что не отдано полосе. */
  stage: { flex: 1 },
  stagePlaceholder: { gap: 12, paddingHorizontal: 16 },
  stageHint: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  strip: { gap: 8 },
  /** Снизу — строка плиток высотой с крупный палец и подпись. */
  stripBottom: { flexDirection: 'row', height: 120 },
  /** Сбоку (телефон боком) — столбец в треть ширины. */
  stripSide: { flexDirection: 'column', width: '30%' },
  stripTile: { flex: 1 },
  expandBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreen: { flex: 1 },
  fullscreenClose: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: hitTarget,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: hitTarget / 2,
  },
  fullscreenCloseLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
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
  /** Пять кнопок в ряд — 56 точек, всё ещё крупнее `hitTarget`. */
  circleDense: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsDense: { gap: 12 },
  sharingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  sharingBarText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  sharingStop: {
    minHeight: hitTarget,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: hitTarget / 2,
  },
  sharingStopLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
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
