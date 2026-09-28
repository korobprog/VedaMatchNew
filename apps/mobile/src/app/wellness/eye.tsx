import { CameraView, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraGate } from '@/components/wellness/camera-gate';
import { ScreenBack } from '@/components/wellness/screen-back';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { cameraAccess } from '@/lib/wellness/camera-access';
import {
  EYE_ERROR_GAP_MS,
  EYE_FRAME_QUALITY,
  EYE_IDLE_PHRASE,
  EYE_MIN_GAP_MS,
  EYE_MODES,
  EYE_RATES,
  EYE_REQUEST_TIMEOUT_MS,
  EYE_WELCOME,
  eyeCameraOn,
  eyeFailure,
  eyeFrameDataUrl,
  eyeModeInfo,
  failurePhrase,
  idlePauseDue,
  missingRussianVoice,
  nextRateIndex,
  nothingPhrase,
  phraseFontSize,
  pickEyeFrameSize,
  shouldSpeak,
  shouldSpeakFailure,
  type EyeFailure,
  type EyeMode,
  type SpokenPhrase,
} from '@/lib/wellness/eye';
import { availableVoices, hush, say } from '@/lib/wellness/eye-voice';
import { createWellnessApi } from '@/lib/wellness/wellness-api';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Третий глаз» — помощник для человека с плохим зрением (раздел «Здоровье»).
 *
 * Камера смотрит, телефон говорит. Три режима: «Транспорт» (номер маршрута
 * подъезжающего автобуса), «Магазин» (товар и цена на ценнике) и «Вокруг»
 * (что перед человеком — по кнопке). Решения экрана — `lib/wellness/eye.ts`,
 * голос — `lib/wellness/eye-voice.ts`, разбор кадра — сервер
 * (`POST wellness/eye/look`).
 *
 * Устройство экрана — под глаукому: поле зрения сужено, центр обычно
 * сохранён. Поэтому всё важное крупно, кнопки высокие, текст ответа — самым
 * крупным шрифтом на экране, а всё, что показано, ещё и произносится: экран —
 * подспорье, а не единственный канал.
 *
 * Весь видоискатель — одна большая кнопка «Спросить сейчас»: по ней не надо
 * целиться.
 */
const IS_WEB = Platform.OS === 'web';
const KEEP_AWAKE_TAG = 'wellness-eye';

export default function WellnessEyeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const wellness = useMemo(() => createWellnessApi(api), [api]);

  const [permission, requestPermission] = useCameraPermissions();
  const access = cameraAccess(permission);

  const camera = useRef<CameraView>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<EyeMode>('transport');
  const [paused, setPaused] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [looking, setLooking] = useState(false);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [rateIndex, setRateIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  const info = eyeModeInfo(mode);
  const cameraOn =
    !IS_WEB &&
    access === 'granted' &&
    eyeCameraOn({ focused, appActive, paused, live: info.live });

  /*
   * Живой цикл работает на таймерах и промисах, а они видят состояние на
   * момент своего создания. Поэтому всё, что цикл читает, зеркалится в ref
   * при каждом рендере, а поколение (`generation`) отменяет ответы,
   * пришедшие после смены режима или паузы: такой ответ — про старое.
   */
  const current = useRef({ mode, paused, cameraOn, ready, rate: 1 });
  current.current = { mode, paused, cameraOn, ready, rate: EYE_RATES[rateIndex].rate };
  const busy = useRef(false);
  const speaking = useRef(false);
  const generation = useRef(0);
  const lastSpoken = useRef<SpokenPhrase | null>(null);
  const lastFailure = useRef<EyeFailure | null>(null);
  const lastFoundAt = useRef(Date.now());
  const askPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomed = useRef(false);
  /** Номер последней фразы: флаг «говорю» снимает только она. */
  const speechToken = useRef(0);
  /** Номер включения камеры: готовность от прошлого экземпляра не в счёт. */
  const cameraMount = useRef(0);
  const tickRef = useRef<() => void>(() => undefined);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Экран не гаснет, пока помощник открыт: на остановке телефон держат в
      // руке без касаний, и через полминуты система погасила бы экран, а с
      // ним и камеру — посреди ожидания автобуса.
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      return () => {
        setFocused(false);
        generation.current += 1;
        hush();
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
      if (next !== 'active') {
        generation.current += 1;
        hush();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (IS_WEB) return;
    void availableVoices().then((voices) => setVoiceMissing(missingRussianVoice(voices)));
  }, []);

  // Камера включилась или отпущена — это другой экземпляр `CameraView`, и
  // ему снова ждать своей готовности. Номер включения отсекает запоздалый
  // `onCameraReady` от прошлого экземпляра: иначе после быстрой паузы цикл
  // снимал бы кадр с камеры, которая ещё не запустилась.
  useEffect(() => {
    cameraMount.current += 1;
    setReady(false);
  }, [cameraOn]);

  /**
   * Сказать фразу. Новая обрывает прежнюю (`say` зовёт `Speech.stop()`), и
   * промис прежней разрешается сразу — поэтому флаг «говорю» снимает только
   * последняя фраза, иначе цикл решил бы, что тихо, и заговорил поверх.
   */
  const speak = useCallback(async (text: string) => {
    const token = ++speechToken.current;
    setPhrase(text);
    speaking.current = true;
    try {
      await say(text, current.current.rate);
    } finally {
      if (token === speechToken.current) speaking.current = false;
    }
  }, []);

  const schedule = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      tickRef.current();
    }, delay);
  }, []);

  /** Один кадр: снять → спросить сервер → решить, говорить ли → сказать. */
  const look = useCallback(
    async (asked: boolean) => {
      const state = current.current;
      const view = camera.current;
      if (!state.cameraOn) return;
      if (!state.ready || !view) {
        // Камера ещё прогревается. Прямой вопрос не теряем: человек нажал и
        // ждёт ответа — спросим, как только камера будет готова.
        if (asked) {
          askPending.current = true;
          schedule(300);
        }
        return;
      }
      busy.current = true;
      const gen = generation.current;
      const lookMode = state.mode;
      setLooking(true);
      let gap = EYE_MIN_GAP_MS;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), EYE_REQUEST_TIMEOUT_MS);
      try {
        let dataUrl: string | null = null;
        try {
          const picture = await view.takePictureAsync({
            quality: EYE_FRAME_QUALITY,
            base64: true,
            imageType: 'jpg',
            // Щелчок затвора каждые две секунды заглушал бы голос.
            shutterSound: false,
          });
          dataUrl = picture?.base64 ? eyeFrameDataUrl(picture.base64) : null;
        } catch {
          dataUrl = null;
        }
        if (!dataUrl) throw new ApiError(400, 'Кадр не получился', null);

        const answer = await wellness.look(
          {
            mode: lookMode,
            imageDataUrl: dataUrl,
            previous: lastSpoken.current?.text ?? null,
          },
          controller.signal,
        );
        if (gen !== generation.current) return;
        lastFailure.current = null;
        if (answer.nothing) {
          if (asked) await speak(nothingPhrase(lookMode));
        } else {
          const at = Date.now();
          lastFoundAt.current = at;
          if (
            shouldSpeak({
              speech: answer.speech,
              last: lastSpoken.current,
              now: at,
              repeatAfterMs: eyeModeInfo(lookMode).repeatAfterMs,
              asked,
            })
          ) {
            lastSpoken.current = { text: answer.speech, at };
            // Вибрация — «нашёл», ещё до первого слова: в шуме улицы её
            // почувствуешь раньше, чем расслышишь голос.
            confirmTap();
            await speak(answer.speech);
          }
        }
      } catch (error) {
        if (gen !== generation.current) return;
        gap = EYE_ERROR_GAP_MS;
        const failure = eyeFailure(error instanceof ApiError ? error.status : 0);
        if (asked || shouldSpeakFailure(failure, lastFailure.current)) {
          lastFailure.current = failure;
          await speak(failurePhrase(failure));
        }
      } finally {
        clearTimeout(timeout);
        busy.current = false;
        setLooking(false);
      }
      if (gen === generation.current) schedule(gap);
    },
    [schedule, speak, wellness],
  );

  tickRef.current = () => {
    const state = current.current;
    // Идёт кадр или говорит голос — ждём. Новая фраза не обрывает
    // недосказанную: номер маршрута надо дослушать.
    if (busy.current || speaking.current) {
      schedule(300);
      return;
    }
    if (askPending.current) {
      askPending.current = false;
      void look(true);
      return;
    }
    if (!eyeModeInfo(state.mode).live || state.paused || !state.cameraOn) return;
    if (idlePauseDue({ lastFoundAt: lastFoundAt.current, now: Date.now() })) {
      generation.current += 1;
      setPaused(true);
      void speak(EYE_IDLE_PHRASE);
      return;
    }
    void look(false);
  };

  // Живой режим запускается, как только камера готова и не на паузе.
  useEffect(() => {
    if (!cameraOn || !ready) return;
    if (!welcomed.current) {
      welcomed.current = true;
      // Предупреждение звучит, но на экране остаётся только подсказка режима:
      // длинный текст в карточке съедал видоискатель.
      void speak(`${EYE_WELCOME} ${info.announce}`).then(() =>
        setPhrase((shown) => (shown.startsWith(EYE_WELCOME) ? info.announce : shown)),
      );
    }
    if (info.live && !paused) schedule(300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [cameraOn, ready, info.live, info.announce, paused, schedule, speak]);

  const onCameraReady = useCallback(async () => {
    const mount = cameraMount.current;
    try {
      const sizes = await camera.current?.getAvailablePictureSizesAsync();
      setPictureSize(pickEyeFrameSize(sizes ?? []) ?? undefined);
    } catch {
      setPictureSize(undefined);
    }
    if (mount === cameraMount.current) setReady(true);
  }, []);

  /** Сбросить всё, что относится к прошлому режиму или прошлому разговору. */
  const restart = useCallback(() => {
    generation.current += 1;
    askPending.current = false;
    lastSpoken.current = null;
    lastFailure.current = null;
    lastFoundAt.current = Date.now();
    hush();
  }, []);

  const switchMode = useCallback(
    (next: EyeMode) => {
      restart();
      setMode(next);
      setPaused(false);
      void speak(eyeModeInfo(next).announce);
    },
    [restart, speak],
  );

  const togglePause = useCallback(() => {
    restart();
    setPaused(!paused);
    void speak(paused ? 'Продолжаю.' : 'Пауза.');
  }, [paused, restart, speak]);

  /** «Спросить сейчас»: ответ вслух будет в любом случае, даже «не вижу». */
  const ask = useCallback(() => {
    if (info.live && paused) {
      togglePause();
      return;
    }
    hush();
    askPending.current = true;
    schedule(0);
  }, [info.live, paused, schedule, togglePause]);

  const cycleRate = useCallback(() => {
    const next = nextRateIndex(rateIndex);
    setRateIndex(next);
    current.current = { ...current.current, rate: EYE_RATES[next].rate };
    void speak(EYE_RATES[next].title);
  }, [rateIndex, speak]);

  if (IS_WEB || access !== 'granted') {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg0 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <ScreenBack />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Третий глаз
        </Text>
        <Text style={[styles.body, { color: colors.text1 }]}>
          Помощник для тех, кто плохо видит: камера смотрит, телефон говорит вслух — номер
          автобуса на остановке, товар и цену в магазине, что перед вами. Подсказывает, но не
          заменяет трость и не годится для перехода дороги.
        </Text>
        {IS_WEB ? (
          <Text style={[styles.body, { color: colors.text1 }]}>
            Помощник работает в приложении для Android.
          </Text>
        ) : (
          <CameraGate access={access} purpose="eye" onRequest={() => void requestPermission()} />
        )}
      </ScrollView>
    );
  }

  const primaryLabel = info.live
    ? paused
      ? 'Продолжить'
      : 'Пауза'
    : looking
      ? 'Смотрю…'
      : 'Что вокруг?';
  const status = paused ? 'на паузе' : looking ? 'смотрю' : info.live ? 'слушаю' : 'жду кнопку';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {cameraOn ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          active
          animateShutter={false}
          pictureSize={pictureSize}
          onCameraReady={() => void onCameraReady()}
          onMountError={() =>
            void speak('Камера не запустилась. Закройте экран и откройте снова.')
          }
        />
      ) : null}
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View
          style={[styles.phraseCard, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}
        >
          <Text style={[styles.status, { color: colors.text1 }]}>
            {info.title} · {status}
          </Text>
          {/* Без live region намеренно: фразу уже произнёс наш голос, и
              TalkBack повторил бы её вторым голосом поверх. */}
          <ScrollView style={styles.phraseScroll} contentContainerStyle={styles.phraseScrollBody}>
            <Text
              style={[
                styles.phrase,
                phraseFontSize(phrase || info.announce),
                { color: colors.text0 },
              ]}
            >
              {phrase || info.announce}
            </Text>
          </ScrollView>
        </View>

        {voiceMissing ? (
          <View style={[styles.warnCard, { backgroundColor: colors.bg1, borderColor: colors.warning }]}>
            <Text style={[styles.body, { color: colors.text0 }]}>
              На телефоне нет русского голоса — ответы могут звучать с акцентом или не звучать
              вовсе. Установите русский язык в настройках синтеза речи.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() =>
                  Linking.openSettings(),
                )
              }
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text0 }]}>
                Настройки синтеза речи
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Весь видоискатель — кнопка: по ней не надо целиться. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Спросить сейчас"
          accessibilityHint="Скажу вслух, что видит камера"
          onPress={ask}
          style={styles.tapArea}
        />

        <View style={[styles.sheet, { backgroundColor: colors.bg1, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modes}>
            {EYE_MODES.map((item) => {
              const selected = item.mode === mode;
              return (
                <Pressable
                  key={item.mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Режим ${item.title}`}
                  onPress={() => switchMode(item.mode)}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [
                    styles.mode,
                    selected
                      ? { backgroundColor: colors.text0, borderColor: colors.text0 }
                      : { backgroundColor: colors.bg0, borderColor: colors.glassBorder },
                    pressedStyle(pressed),
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[styles.modeText, { color: selected ? colors.bg0 : colors.text0 }]}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: !info.live && looking }}
            onPress={info.live ? togglePause : ask}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>{primaryLabel}</Text>
          </Pressable>

          <View style={styles.row}>
            <SmallButton label="Назад" onPress={() => router.back()} />
            <SmallButton
              label="Повторить"
              hint="Ещё раз последняя фраза"
              onPress={() => {
                if (phrase) void speak(phrase);
              }}
            />
            <SmallButton
              label="Темп"
              hint={`Сейчас: ${EYE_RATES[rateIndex].title.toLowerCase()}`}
              onPress={cycleRate}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function SmallButton({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.small,
        { borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.secondaryText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  phraseCard: {
    maxHeight: '34%',
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 6,
  },
  status: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  // Самый крупный текст экрана: при глаукоме центр поля зрения обычно
  // сохранён, и фразу можно дочитать глазами, если её не расслышали.
  phrase: { fontFamily: fonts.bodyBold },
  // Карточка не выше трети экрана: под ней видоискатель и есть кнопка
  // «Спросить сейчас». Длинный ответ прокручивается, а не обрезается.
  phraseScroll: { flexGrow: 0 },
  phraseScrollBody: { flexGrow: 0 },
  warnCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
  },
  tapArea: { flex: 1 },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  modes: { flexDirection: 'row', gap: 8 },
  mode: {
    flex: 1,
    minHeight: hitTarget + 20,
    borderWidth: 2,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  modeText: { fontFamily: fonts.bodyBold, fontSize: 18 },
  primary: {
    minHeight: hitTarget * 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 24 },
  row: { flexDirection: 'row', gap: 8 },
  small: {
    flex: 1,
    minHeight: hitTarget + 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
});
