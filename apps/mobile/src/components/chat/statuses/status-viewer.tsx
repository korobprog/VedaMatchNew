import type { ChatStatusAuthorDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatChatStamp } from '@/lib/chat/chat-format';
import type { StatusApi } from '@/lib/chat/status-api';
import {
  capturesDismissPan,
  firstUnseen,
  isDismissSwipe,
  progressFills,
  runsOnTimer,
  shouldMarkViewed,
  statusDurationMs,
  stepStatus,
  type StatusPosition,
} from '@/lib/chat/statuses/status-playback';
import { formatStatusDuration } from '@/lib/chat/statuses/status-upload-rules';
import { pressedStyle, ripple } from '@/theme/press';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import { ChatAvatar } from '../chat-avatar';
import { STATUS_VIDEO_INLINE, StatusVideo } from './status-video';

/** Шаг таймера показа: полоска прогресса обновляется десять раз в секунду. */
const TICK_MS = 100;

/**
 * Просмотр статусов (VED-129) во весь экран, как на сайте и в WhatsApp:
 * полоски прогресса сверху, тап справа — дальше, слева — назад, удержание —
 * пауза, свайп вниз, крестик или «назад» телефона — закрыть. Статус сам
 * сменяется следующим по таймеру (`status-playback.ts`).
 *
 * Открытый чужой статус отмечается просмотренным — его секция в кружке
 * гаснет. У своего видно число просмотров и есть «Удалить».
 *
 * Палитра — всегда тёмная (`dark` из токенов), в любой теме: фото и ролики
 * смотрятся на тёмном, как в любом мессенджере, а цвета остаются токенами.
 * При включённом скринридере статусы сами не листаются — дочитать подпись
 * и дойти до кнопок важнее автоматики.
 */
export function StatusViewer({
  authors,
  startAuthor,
  viewerId,
  statusApi,
  onClose,
  onChanged,
}: {
  authors: ChatStatusAuthorDto[];
  startAuthor: number;
  viewerId: string;
  statusApi: StatusApi;
  onClose(): void;
  /** Что-то отметили или удалили — ленте и кружкам пора перечитать себя. */
  onChanged(): void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [at, setAt] = useState<StatusPosition>(() => ({
    author: startAuthor,
    status: authors[startAuthor] ? firstUnseen(authors[startAuthor]) : 0,
  }));
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [progress, setProgress] = useState(0);
  // Каждый шаг перезапускает таймер — и «назад» с первого статуса, где
  // сам статус не меняется, а показ начинается сначала.
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef(0);
  const sent = useRef(new Set<string>());
  const changed = useRef(false);
  const dragY = useRef(new Animated.Value(0)).current;

  const author = authors[at.author];
  const status = author?.statuses[at.status];
  const own = author?.user.id === viewerId;
  const paused = holding || confirming || screenReader;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (alive) setScreenReader(on);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const finish = useCallback(() => {
    if (changed.current) onChanged();
    onClose();
  }, [onChanged, onClose]);

  const step = useCallback(
    (delta: 1 | -1) => {
      const next = stepStatus(authors, at, delta);
      if (next) {
        setAt(next);
        setError(null);
      } else if (delta === 1) {
        finish();
        return;
      }
      progressRef.current = 0;
      setProgress(0);
      setEpoch((value) => value + 1);
    },
    [authors, at, finish],
  );

  // Просмотр отмечается один раз на статус и только у чужих.
  useEffect(() => {
    if (!status || !shouldMarkViewed(status, own, sent.current)) return;
    sent.current.add(status.id);
    changed.current = true;
    void statusApi.view(status.id).catch(() => undefined);
  }, [status, own, statusApi]);

  // Таймер фото и текста. Ролик ведёт себя сам (`status-video`). После
  // паузы показ продолжается с того же места — отсюда доля в ref.
  useEffect(() => {
    if (!status || paused || !runsOnTimer(status)) return;
    const total = statusDurationMs(status);
    const started = Date.now() - progressRef.current * total;
    const timer = setInterval(() => {
      const share = (Date.now() - started) / total;
      if (share >= 1) {
        clearInterval(timer);
        step(1);
      } else {
        progressRef.current = share;
        setProgress(share);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, paused, step, epoch]);

  // Свайп вниз. При «уменьшить движение» экран за пальцем не едет —
  // решение принимается по отпусканию, без анимации возврата.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) => capturesDismissPan(gesture.dx, gesture.dy),
        onPanResponderGrant: () => setHolding(true),
        onPanResponderMove: (_event, gesture) => {
          if (!reducedMotion) dragY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          setHolding(false);
          if (isDismissSwipe(gesture.dy, gesture.vy)) {
            finish();
            return;
          }
          if (reducedMotion) dragY.setValue(0);
          else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          setHolding(false);
          dragY.setValue(0);
        },
      }),
    [dragY, finish, reducedMotion],
  );

  async function remove() {
    if (!status) return;
    setDeleting(true);
    try {
      await statusApi.remove(status.id);
      changed.current = true;
      setConfirming(false);
      finish();
    } catch (cause) {
      setConfirming(false);
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить статус');
    } finally {
      setDeleting(false);
    }
  }

  async function openVideo(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setError('Не удалось открыть видео');
    }
  }

  if (!author || !status) return null;

  const fills = progressFills(author.statuses.length, at.status, progress);
  const name = own ? 'Мой статус' : author.user.name;
  const media = status.media;
  const mediaLabel = status.text ?? (media?.kind === 'video' ? 'Видео статуса' : 'Фото статуса');

  return (
    <Modal
      visible
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={finish}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View
        accessibilityViewIsModal
        style={[styles.root, { backgroundColor: dark.bg0, transform: [{ translateY: dragY }] }]}
        {...pan.panHandlers}
      >
        <View
          style={[styles.bars, { paddingTop: insets.top + 8 }]}
          accessible
          accessibilityLabel={`Статус ${at.status + 1} из ${author.statuses.length}`}
        >
          {fills.map((fill, index) => (
            <View key={author.statuses[index].id} style={[styles.bar, { backgroundColor: dark.text2 }]}>
              <View style={[styles.barFill, { width: `${Math.round(fill * 100)}%`, backgroundColor: dark.text0 }]} />
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <ChatAvatar id={author.user.id} name={author.user.name} uri={author.user.avatarUrl} size={36} />
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={[styles.name, { color: dark.text0 }]}>
              {name}
            </Text>
            <Text style={[styles.time, { color: dark.text1 }]}>{formatChatStamp(status.createdAt)}</Text>
          </View>
          {own ? (
            <>
              <View
                accessible
                accessibilityLabel={`Просмотров: ${status.viewCount ?? 0}`}
                style={styles.views}
              >
                <EyeIcon color={dark.text1} />
                <Text style={[styles.viewsText, { color: dark.text1 }]}>{status.viewCount ?? 0}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Удалить статус"
                onPress={() => setConfirming(true)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.iconButton, pressedStyle(pressed)]}
              >
                <TrashIcon color={dark.text0} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={finish}
            android_ripple={ripple(dark.glassBorder, true)}
            style={({ pressed }) => [styles.iconButton, pressedStyle(pressed)]}
          >
            <CloseIcon color={dark.text0} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          {media?.kind === 'photo' ? (
            <Image
              key={status.id}
              source={{ uri: media.url }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel={mediaLabel}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          {media?.kind === 'video' ? (
            <StatusVideo
              key={status.id}
              media={media}
              label={mediaLabel}
              paused={paused}
              onProgress={setProgress}
              onEnded={() => step(1)}
            />
          ) : null}
          {!media ? (
            <Text style={[styles.textOnly, { color: dark.text0 }]}>{status.text}</Text>
          ) : null}

          {/* Трети экрана — назад и дальше, как на сайте. Удержание — пауза:
              долгое нажатие забирает касание, и «дальше» после него не
              срабатывает. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Предыдущий статус"
            onPress={() => step(-1)}
            onLongPress={() => setHolding(true)}
            onPressOut={() => setHolding(false)}
            delayLongPress={220}
            style={[styles.zone, styles.zonePrev]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Следующий статус"
            onPress={() => step(1)}
            onLongPress={() => setHolding(true)}
            onPressOut={() => setHolding(false)}
            delayLongPress={220}
            style={[styles.zone, styles.zoneNext]}
          />

          {media?.kind === 'video' && !STATUS_VIDEO_INLINE ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Смотреть видео"
              accessibilityHint="Открывает ролик во встроенном браузере"
              onPress={() => void openVideo(media.url)}
              android_ripple={ripple(dark.glassBorder)}
              style={({ pressed }) => [
                styles.play,
                { backgroundColor: dark.bg1, borderColor: dark.sheetBorder },
                pressedStyle(pressed),
              ]}
            >
              <PlayIcon color={dark.text0} />
              <Text style={[styles.playText, { color: dark.text0 }]}>
                Смотреть видео{media.durationSec ? ` · ${formatStatusDuration(media.durationSec)}` : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {media && status.text ? (
          <Text style={[styles.caption, { color: dark.text0, backgroundColor: dark.bg1 }]}>{status.text}</Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: dark.text0, borderColor: dark.magenta }]}>
            {error}
          </Text>
        ) : null}
        <View style={{ height: insets.bottom + 8 }} />
      </Animated.View>

      <ConfirmDialog
        visible={confirming}
        title="Удалить статус?"
        message="Его больше никто не увидит, просмотры тоже пропадут."
        confirmLabel="Удалить"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </Modal>
  );
}

const iconStroke = (color: string) => ({
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M18 6 6 18M6 6l12 12" {...iconStroke(color)} />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" {...iconStroke(color)} />
    </Svg>
  );
}

function EyeIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" {...iconStroke(color)} />
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" {...iconStroke(color)} />
    </Svg>
  );
}

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M7 4v16l13-8Z" fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: 12 },
  bar: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15 },
  time: { fontFamily: fonts.body, fontSize: 12 },
  views: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  viewsText: { fontFamily: fonts.bodySemiBold, fontSize: 13, fontVariant: ['tabular-nums'] },
  iconButton: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textOnly: {
    fontFamily: fonts.displayMedium,
    fontSize: 22,
    lineHeight: 32,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  zonePrev: { left: 0, width: '33%' },
  zoneNext: { right: 0, width: '67%' },
  play: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: hitTarget,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  playText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  caption: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 10,
    textAlign: 'center',
  },
});
