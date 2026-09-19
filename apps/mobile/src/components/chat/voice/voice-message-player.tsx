import type { ChatAttachmentDto } from '@vedamatch/shared';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';
import { releaseVoicePlayback, requestVoicePlayback } from '@/lib/chat/voice/voice-playback-registry';
import { applyPlaybackRate } from '@/lib/chat/voice/voice-player-rate';
import { shouldPausePlaybackForAppState } from '@/lib/chat/voice/voice-app-state-guard';
import { formatVoiceSpeed, nextVoiceSpeed } from '@/lib/chat/voice/voice-speed';
import { getCachedVoiceSpeed, loadVoiceSpeed, setVoiceSpeed, subscribeVoiceSpeed } from '@/lib/chat/voice/voice-speed-store';
import { formatVoiceTime } from '@/lib/chat/voice/voice-time';
import { flatWaveform } from '@/lib/chat/voice/voice-waveform';
import { progressFromTime, timeFromRatio } from '@/lib/chat/voice/voice-progress';
import { VoiceWaveformBars } from './voice-waveform-bars';

/** Сколько ждать загрузку, прежде чем признать её неудачей — плеер не показывает вечный спиннер. */
const LOAD_TIMEOUT_MS = 12_000;

/** Визуальная высота волны; интерактивная зона касания шире — см. `hitSlop` в `VoiceWaveformBars`. */
const WAVEFORM_HEIGHT = 24;

interface Props {
  attachment: ChatAttachmentDto;
  /** Играет ли сейчас звонок — во время входящего плеер обязан замолчать (правило вынесено в экран). */
  interrupted?: boolean;
}

/**
 * Плеер голосового в пузыре сообщения. Источник грузится только по первому
 * нажатию «Слушать» (`player.replace`, не сразу при монтировании) — иначе
 * лента из десятка голосовых открыла бы столько же сетевых закачек разом.
 */
export function VoiceMessagePlayer({ attachment, interrupted }: Props) {
  const { colors } = useTheme();
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [loadRequested, setLoadRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(getCachedVoiceSpeed());
  const finishedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const id = attachment.id;
  const url = attachment.url;
  const savedDurationSec = attachment.durationSec ?? 0;
  const waveform = attachment.waveform && attachment.waveform.length > 0 ? attachment.waveform : flatWaveform();

  useEffect(() => {
    void loadVoiceSpeed().then(setSpeed);
    return subscribeVoiceSpeed(() => setSpeed(getCachedVoiceSpeed()));
  }, []);

  useEffect(() => {
    // `player.playbackRate = speed` роняло экран переписки: в expo-audio 57
    // на Android это свойство только для чтения (см. `voice-player-rate.ts`).
    applyPlaybackRate(player, speed);
  }, [player, speed]);

  // Уход в фон — пауза, не остановка: вернувшись, можно продолжить с того же
  // места. `player`/`id` не меняются за жизнь компонента (один плеер на
  // вложение), поэтому подписка не рискует протухнуть на устаревшем значении.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (!shouldPausePlaybackForAppState(next)) return;
      player.pause();
      releaseVoicePlayback(id);
    });
    return () => subscription.remove();
  }, [player, id]);

  const clearLoadTimeout = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (status.isLoaded) clearLoadTimeout();
  }, [status.isLoaded]);

  // Финал: перематываем в начало и отпускаем глобальный «микрофон одного плеера»,
  // иначе повторное нажатие «Слушать» продолжало бы играть с нулевой позиции,
  // считаясь при этом всё ещё активным.
  useEffect(() => {
    if (status.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      releaseVoicePlayback(id);
      void player.seekTo(0).catch(() => undefined);
    } else if (!status.didJustFinish) {
      finishedRef.current = false;
    }
  }, [status.didJustFinish, id, player]);

  useEffect(() => {
    if (!interrupted) return;
    player.pause();
    releaseVoicePlayback(id);
  }, [interrupted, id, player]);

  useEffect(() => () => {
    clearLoadTimeout();
    releaseVoicePlayback(id);
  }, [id]);

  if (!url) {
    return (
      <View style={[styles.wrap, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
        <Text style={[styles.errorText, { color: colors.text1 }]}>Голосовое недоступно</Text>
      </View>
    );
  }

  const totalSec = status.duration > 0 ? status.duration : savedDurationSec;
  const showElapsed = status.isLoaded && (status.playing || status.currentTime > 0);
  const timeLabel = formatVoiceTime(showElapsed ? status.currentTime : totalSec);
  const progress = progressFromTime(status.currentTime, totalSec);
  const waiting = loadRequested && !status.isLoaded && !error;

  const play = () => {
    setError(null);
    if (!loadRequested) {
      setLoadRequested(true);
      try {
        player.replace(url);
      } catch {
        setError('Не удалось открыть запись');
        return;
      }
      clearLoadTimeout();
      timeoutRef.current = setTimeout(() => setError('Не получилось загрузить запись'), LOAD_TIMEOUT_MS);
    }
    requestVoicePlayback(id, () => player.pause());
    // `replace()` выше может сбросить скорость к 1× вместе с источником
    // (тот же повод, что `defaultPlaybackRate` у сайта, `chat-voice-player.tsx`) —
    // выставляем ещё раз перед стартом, не полагаясь только на эффект.
    applyPlaybackRate(player, speed);
    player.play();
  };

  const pause = () => {
    player.pause();
    releaseVoicePlayback(id);
  };

  const seek = (ratio: number) => {
    if (totalSec <= 0) return;
    if (!loadRequested) play();
    void player.seekTo(timeFromRatio(ratio, totalSec)).catch(() => undefined);
  };

  const cycleSpeed = () => {
    void setVoiceSpeed(nextVoiceSpeed(speed));
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={error ? 'Повторить загрузку записи' : status.playing ? 'Пауза' : 'Слушать'}
        accessibilityState={{ busy: waiting }}
        onPress={() => {
          if (error) {
            setLoadRequested(false);
            setError(null);
            return;
          }
          if (status.playing) pause();
          else play();
        }}
        android_ripple={ripple(colors.onMint, true)}
        style={[styles.playButton, { backgroundColor: error ? colors.glass : colors.mint, borderColor: error ? colors.glassBorder : colors.mint }]}
      >
        {waiting ? (
          <ActivityIndicator size="small" color={colors.onMint} />
        ) : (
          <PlayPauseIcon playing={status.playing} error={Boolean(error)} color={error ? colors.text1 : colors.onMint} />
        )}
      </Pressable>

      {error ? (
        // `text0`, не `magenta`: подложка тут — цвет пузыря сообщения (`bg2`
        // у своего, `glass` у чужого), а `magenta` на `bg2` в светлой теме
        // даёт только 3.85:1 (feedback-001, п.3) — `text0` уже проверен на
        // обеих поверхностях (`contrast.spec.ts`). Иконка повтора слева и так
        // показывает, что это ошибка, не обычный текст.
        <Text numberOfLines={2} style={[styles.errorInline, { color: colors.text0 }]}>
          {error}
        </Text>
      ) : (
        // Волна — своей строкой на всю ширину, время и скорость — СТРОКОЙ
        // НИЖЕ, не сбоку от неё: в один ряд с [play] «0:46»/«1×» рисовались
        // поверх волны в узком пузыре (~530px из 1080, feedback-002, п.3) —
        // при трёх элементах во флекс-ряду RN не сжимает соседей волны
        // (`flexShrink` по умолчанию 0, не 1, как в вебе). Двухэтажная
        // раскладка не может наложиться в принципе — волна и строка меты
        // никогда не делят горизонталь.
        <View style={styles.content}>
          <VoiceWaveformBars
            levels={waveform}
            playedRatio={progress}
            colorPlayed={colors.cyan}
            colorRest={colors.text2}
            onSeek={seek}
            height={WAVEFORM_HEIGHT}
          />

          <View style={styles.metaRow}>
            <Text style={[styles.time, { color: colors.text1 }]}>{timeLabel}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Скорость ${formatVoiceSpeed(speed)}, сменить`}
              onPress={cycleSpeed}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              android_ripple={ripple(colors.glassBorder, true)}
              style={[styles.speedChip, { borderColor: colors.glassBorder }]}
            >
              <Text style={[styles.speedText, { color: colors.text0 }]}>{formatVoiceSpeed(speed)}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function PlayPauseIcon({ playing, error, color }: { playing: boolean; error: boolean; color: string }) {
  if (error)
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 12a9 9 0 1 1 3 6.7" />
        <Path d="M3 21v-5h5" />
      </Svg>
    );
  if (playing)
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
        <Rect x={6} y={5} width={4} height={14} rx={1} />
        <Rect x={14} y={5} width={4} height={14} rx={1} />
      </Svg>
    );
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5l11 7-11 7z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontFamily: fonts.body, fontSize: 13 },
  // Минимальная ширина всего плеера — под круглую кнопку и разумный минимум
  // волны/меты, не «сколько-нибудь помещающихся элементов в один ряд»
  // (было 220 у плоского ряда, отсюда и наложение при узком пузыре).
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 176, paddingVertical: 2 },
  playButton: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Колонка справа от кнопки: волна сверху на всю ширину, мета — строкой под ней.
  content: { flex: 1, minWidth: 0, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  // `fonts.mono` (IBM Plex Mono, как `--font-mono` на сайте) — табличные
  // цифры, ширина знака не меняется между «0:04» и «0:46»/«1:23».
  time: { fontFamily: fonts.mono, fontSize: 12, fontVariant: ['tabular-nums'] },
  errorInline: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  speedChip: {
    minHeight: 28,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  speedText: { fontFamily: fonts.monoSemiBold, fontSize: 11 },
});
