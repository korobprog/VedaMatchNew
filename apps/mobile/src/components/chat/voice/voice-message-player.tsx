import type { ChatAttachmentDto } from '@vedamatch/shared';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';
import { canonicalVoiceUrlKey, forgetLocalVoiceFile, getLocalVoiceFile } from '@/lib/chat/voice/voice-local-file-cache';
import { isRecordingActive } from '@/lib/chat/voice/voice-recording-guard';
import {
  markVoiceFinished,
  registerVoiceOrder,
  releaseVoicePlayback,
  requestVoicePlayback,
} from '@/lib/chat/voice/voice-playback-registry';
import { resolveVoicePlaybackSource } from '@/lib/chat/voice/voice-playback-source';
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
  /** Позиция в переписке для автоперехода (VED-289) — см. `message-bubble.tsx`. */
  order: number;
}

/**
 * Плеер голосового в пузыре сообщения. Источник грузится только по первому
 * нажатию «Слушать» (`player.replace`, не сразу при монтировании) — иначе
 * лента из десятка голосовых открыла бы столько же сетевых закачек разом.
 */
export function VoiceMessagePlayer({ attachment, interrupted, order }: Props) {
  const { colors } = useTheme();
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [loadRequested, setLoadRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(getCachedVoiceSpeed());
  // Короткая подсказка вместо немого отказа, когда тап по волне пришёлся на
  // время активной записи (`voice-recording-guard.ts`): панель записи и так
  // видна человеку, но тап по чужому/своему голосовому в это время не
  // должен выглядеть как ничего не делающая кнопка — тот же приём, что
  // `backgroundNotice` в `voice-recorder-control.tsx`.
  const [recordingHint, setRecordingHint] = useState(false);
  const recordingHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (recordingHintTimeoutRef.current) clearTimeout(recordingHintTimeoutRef.current);
    },
    [],
  );
  const finishedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Async-загрузка источника (`loadAndPlay`) может дозреть уже после
  // размонтирования (быстрый тап и уход с экрана) — без этого флага она бы
  // всё равно вызвала `setError` на отмонтированном компоненте.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  // Последняя версия `play` — для колбэка автоперехода, регистрируемого
  // отдельным эффектом ниже, который не должен перерегистрироваться при
  // каждом рендере (см. `registerVoiceOrder`).
  const playRef = useRef<() => void>(() => {});

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

  // Настоящая ошибка нативного плеера (`AudioStatus.error`, expo-audio) —
  // 403 от S3, битый контейнер, обрыв сети. До этого эффекта единственным
  // сигналом сбоя был слепой 12-секундный таймаут: любая причина, даже
  // мгновенный отказ, тонула в спиннере на все 12 секунд и приходила с
  // одной и той же надписью без единой зацепки в логе. Реагируем только
  // пока реально ждём загрузку (`loadRequested`) — на отмонтированном или
  // ещё не тронутом плеере это поле пустое само по себе.
  useEffect(() => {
    if (!loadRequested || !status.error || error) return;
    clearLoadTimeout();
    // eslint-disable-next-line no-console
    console.warn('[voice] ошибка плеера', { url: canonicalVoiceUrlKey(url), reason: status.error });
    setError('Не получилось загрузить запись');
  }, [status.error, loadRequested, error, url]);

  // Финал: перематываем в начало и отпускаем глобальный «микрофон одного плеера»,
  // иначе повторное нажатие «Слушать» продолжало бы играть с нулевой позиции,
  // считаясь при этом всё ещё активным. `markVoiceFinished` — автопереход
  // (VED-289): помечает голосовое прослушанным и, если ниже по переписке
  // есть непрослушанное, сам его запускает; `finishedRef` не даёт вызвать
  // это дважды на дребезг статуса плеера — заход в автопереход ровно один
  // раз на каждое реальное завершение.
  //
  // `player.pause()` ПЕРЕД `seekTo(0)` обязателен, не косметика: на Android
  // `AudioPlayer` (`expo-audio`/ExoPlayer) естественное завершение переводит
  // `playbackState` в `ENDED`, но НЕ трогает внутренний `playWhenReady` —
  // тот остаётся `true`, если до этого играли обычным `player.play()`.
  // `seekTo()` уводит плеер из `ENDED` обратно в `READY`, и раз
  // `playWhenReady` всё ещё `true` — ExoPlayer сам возобновляет
  // воспроизведение с нулевой позиции. Без явного `pause()` это давало
  // бесконечный цикл ДАЖЕ на единственном голосовом в переписке (без
  // соседей для автоперехода вообще) — живая проверка сборки 5003, Samsung
  // A51: один и тот же клип 0:04 перезапускался каждые ~5 секунд, `logcat`
  // показывал регулярный `AudioTrack: stop(...) delivered` → `Found a new
  // active media playback`. `pause()` сбрасывает `playWhenReady` в `false`,
  // и последующий `seekTo(0)` просто переставляет позицию, не запуская игру
  // заново.
  useEffect(() => {
    if (status.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      player.pause();
      releaseVoicePlayback(id);
      void player.seekTo(0).catch(() => undefined);
      markVoiceFinished(id);
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

  // Регистрация для автоперехода (VED-289): реестр хранит только ссылку на
  // «текущую» `play` через `playRef` — сама функция `play` пересоздаётся
  // каждый рендер (замыкает `loadRequested`/`speed`), а перерегистрировать
  // её в реестре при каждом рендере незачем.
  useEffect(() => {
    // Без адреса играть всё равно нечего («Голосовое недоступно» ниже) —
    // не подставляем автопереходу тупиковый номер в цепочке.
    if (!url) return undefined;
    return registerVoiceOrder(id, order, () => playRef.current());
  }, [id, order, url]);

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

  // Старт воспроизведения после того, как источник уже выставлен
  // (`player.replace`) — общий хвост что для первого нажатия (после
  // `loadAndPlay`), что для повторных (источник уже загружен).
  const startPlayback = () => {
    requestVoicePlayback(id, () => player.pause());
    // `replace()` может сбросить скорость к 1× вместе с источником (тот же
    // повод, что `defaultPlaybackRate` у сайта, `chat-voice-player.tsx`) —
    // выставляем ещё раз перед стартом, не полагаясь только на эффект.
    applyPlaybackRate(player, speed);
    player.play();
  };

  // Первая загрузка: своя только что записанная/отправленная запись играет
  // с диска, а не с сервера (VED-290) — источник решает
  // `resolveVoicePlaybackSource`, здесь только проверка существования файла
  // через `expo-file-system` (единственное несинхронное звено, сам выбор —
  // в чистом `voice-playback-source.ts`). Чужие записи и свои после
  // перезапуска приложения (локального файла уже нет в реестре процесса)
  // идут с сервера, как раньше.
  // `seekToSec` — только для первого тапа сразу по волне (`seek()` ниже):
  // источник грузится асинхронно, и без передачи цели сюда перемотка,
  // вызванная СРАЗУ следом в той же функции, ушла бы в `player` без
  // источника вообще (гонка — `replace()` из этой функции ещё не выполнился
  // к моменту, когда снаружи вызвали бы `seekTo`).
  const loadAndPlay = async (seekToSec?: number) => {
    const localUri = getLocalVoiceFile(url);
    const { source, isLocal } = await resolveVoicePlaybackSource(url, localUri, (uri) =>
      FileSystem.getInfoAsync(uri).then((info) => info.exists),
    );
    if (!mountedRef.current) return;
    if (localUri && !isLocal) {
      // eslint-disable-next-line no-console
      console.warn('[voice] локальный файл числился в реестре, но пропал с диска', { url: canonicalVoiceUrlKey(url) });
      forgetLocalVoiceFile(url); // числился в реестре, но физически пропал
    }
    if (!source) {
      setError('Не удалось открыть запись');
      return;
    }
    try {
      player.replace(source);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[voice] player.replace бросил исключение', { url: canonicalVoiceUrlKey(url), isLocal, error: e });
      setError('Не удалось открыть запись');
      return;
    }
    clearLoadTimeout();
    // Таймаут неудачи — только для сетевого источника: локальный файл не
    // ждёт сеть, вечный спиннер ему не грозит по этой причине вовсе. Ставим
    // ТОЛЬКО как подстраховку на случай, если сам плеер вообще не пришлёт ни
    // `isLoaded`, ни `error` (реальный сбой обычно ловит эффект выше на
    // `status.error`, быстрее и с настоящей причиной в логе).
    if (!isLocal) {
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.warn('[voice] загрузка не уложилась в таймаут', { url: canonicalVoiceUrlKey(url), timeoutMs: LOAD_TIMEOUT_MS });
        setError('Не получилось загрузить запись');
      }, LOAD_TIMEOUT_MS);
    }
    if (seekToSec !== undefined) void player.seekTo(seekToSec).catch(() => undefined);
    startPlayback();
  };

  // Повторный тап, пока первая загрузка ещё не дозрела (`waiting`), не
  // должен запускать вторую параллельную `loadAndPlay` — вторая гонка со
  // своим `player.replace()`/`seekTo()` поверх ещё не устаканившегося
  // источника путала бы состояние (нашли на быстром двойном тапе при
  // живой проверке). Кнопка ЛОВИТ этот тап (см. `onPress` ниже), просто
  // ничего не делает — спиннер и так сигналит, что происходит.
  // Короткая подсказка вместо немого отказа (не заводит `error`/`loadRequested`
  // — это не сбой загрузки, а обычный отказ стартовать, пока занят микрофон).
  const showRecordingHint = () => {
    setRecordingHint(true);
    if (recordingHintTimeoutRef.current) clearTimeout(recordingHintTimeoutRef.current);
    recordingHintTimeoutRef.current = setTimeout(() => setRecordingHint(false), 1500);
  };

  const play = () => {
    // Пока идёт запись, микрофон занят — тап по чужому/своему голосовому в
    // ленте не должен пытаться поднять плеер поверх активного рекордера
    // (симптом «записал — не воспроизводится» и наоборот). Останавливать
    // чужую запись тапом по никак не связанной с ней волне было бы
    // неожиданным — молча отказываемся стартовать, не трогая рекордер, но
    // подсказка вместо немого молчания.
    if (isRecordingActive()) {
      showRecordingHint();
      return;
    }
    if (waiting) return;
    setError(null);
    if (!loadRequested) {
      setLoadRequested(true);
      void loadAndPlay();
      return;
    }
    startPlayback();
  };
  playRef.current = play;

  const pause = () => {
    player.pause();
    releaseVoicePlayback(id);
  };

  const seek = (ratio: number) => {
    if (totalSec <= 0 || waiting) return;
    const target = timeFromRatio(ratio, totalSec);
    if (!loadRequested) {
      if (isRecordingActive()) {
        showRecordingHint();
        return;
      }
      setError(null);
      setLoadRequested(true);
      void loadAndPlay(target);
      return;
    }
    void player.seekTo(target).catch(() => undefined);
  };

  // Повтор по кнопке — одним тапом: раньше первый тап на ошибке только
  // сбрасывал `loadRequested`/`error`, а реальная перезагрузка ждала ВТОРОГО
  // тапа (человек видел, что кнопка стала «Слушать», и должен был нажать
  // ещё раз) — с явной жалобой «не воспроизводится» это выглядело так,
  // будто повтор вообще не работает.
  const retry = () => {
    setError(null);
    setLoadRequested(true);
    void loadAndPlay();
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
            retry();
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
      ) : recordingHint ? (
        // Не ошибка — обычный нейтральный `text1`, тот же приём, что у
        // «Запись остановлена» в `voice-recorder-control.tsx`. Панель записи
        // и так видна человеку — это просто объяснение, почему тап по волне
        // ничего не запустил, а не повод для тревожного цвета.
        <Text numberOfLines={2} style={[styles.errorInline, { color: colors.text1 }]}>
          Сначала закончите запись
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
  // Колонка справа от кнопки: волна сверху на всю ширину, мета — строкой
  // под ней. `paddingRight` — волна иначе упирается в правый край пузыря
  // (живая проверка сборки 1023, feedback-003).
  content: { flex: 1, minWidth: 0, gap: 6, paddingRight: 4 },
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
