import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { chooseAudioRoute, subscribeToAudioRouteChanges } from '@/lib/calls/audio-route-bridge';
import {
  currentRouteLabel,
  EMPTY_AUDIO_ROUTE_STATE,
  shouldShowRoutePicker,
  AUDIO_ROUTE_LABELS,
  type AudioRouteState,
  type CallAudioRoute,
} from '@/lib/calls/audio-route';
import { companionOf, endedLabel, roleIn } from '@/lib/calls/call-machine';
import { useChatCalls } from '@/lib/calls/call-provider';
import { backMinimizesCall } from '@/lib/calls/call-screen-return';
import { shouldKeepScreenAwake } from '@/lib/calls/keep-awake';
import { setCallScreenActive, setPipEligible, subscribeToPipModeChanges } from '@/lib/calls/native-call-bridge';
import { isPipEligible } from '@/lib/calls/pip-eligibility';
import { useElapsedLabel } from '@/lib/calls/use-elapsed-label';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Экран звонка — перенос `apps/web/src/components/chat/calls/call-overlay.tsx`
 * на маршрут expo-router (модаль на весь экран, `_layout.tsx`). Состояние —
 * из `call-provider.tsx`, не своё: `id` в адресе только для того, чтобы
 * системная кнопка «назад»/жест не открывали чужой звонок случайно после
 * восстановления состояния приложения.
 *
 * Системное «назад» на Android сворачивает звонок, а не завершает его
 * (`gan-harness/feedback/feedback-001.md`, блокирующий пункт 1):
 * `gestureEnabled: false` в `_layout.tsx` — свойство только для iOS
 * (`react-native-screens`), на Android хардварная «назад»/системный жест
 * штатно снимает экран сама. `CallSession` при этом продолжает жить в
 * `call-provider.tsx` — специально: разговор не обрывается, как у обычной
 * звонилки при уходе на рабочий стол. Чтобы это не выглядело потерей
 * звонка, экран (1) сам явно перехватывает «назад», пока звонок идёт
 * (`backMinimizesCall`), и уходит тем же путём, что обычно, и (2) сообщает
 * провайдеру о своей видимости (`reportCallScreenMounted`) — по ней
 * `ReturnToCallBanner` показывает плашку «вернуться» везде в приложении,
 * пока звонок жив, а этого экрана не видно.
 */
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const calls = useChatCalls();

  const state = calls?.state;
  const call = state?.call ?? null;
  const matches = Boolean(call && call.id === id);

  // Провайдер сбросил фазу (сам финал, ручное «Закрыть», чужой звонок) —
  // экрану здесь больше нечего показывать, уходим назад.
  useEffect(() => {
    if (!calls) return;
    if (matches && state?.phase !== 'idle') return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [calls, matches, state?.phase]);

  // Экран виден — провайдер это знает и не показывает плашку «вернуться»
  // (`ReturnToCallBanner`). Уход отсюда (в том числе через «назад» ниже)
  // сбрасывает видимость и, если звонок ещё жив, метку последней навигации
  // (`call-provider.tsx`, `reportCallScreenMounted`), чтобы было куда
  // вернуться.
  useEffect(() => {
    calls?.reportCallScreenMounted(true);
    return () => calls?.reportCallScreenMounted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls?.reportCallScreenMounted]);

  // Экран поверх блокировки и не гаснет, пока звонок открыт (VED-221, п.5):
  // могли ответить с заблокированного экрана, разговор должен остаться
  // виден, не требуя разблокировки. Снимается при уходе с экрана — обычный
  // разговор в приложении не должен держать телефон поверх блокировки
  // после того, как человек сам открыл его разблокированным.
  useEffect(() => {
    setCallScreenActive(true);
    return () => setCallScreenActive(false);
  }, []);

  // «Назад», пока идёт дозвон или разговор, не должно ни завершать звонок
  // молча, ни просто теряться в поведении по умолчанию модального
  // презентейшена react-native-screens на Android (там оно не всегда
  // надёжно эквивалентно обычному pop) — экран берёт это на себя явно и
  // уходит тем же путём, что и обычный pop; звонок продолжается, плашка
  // выше даёт дорогу назад.
  useEffect(() => {
    if (!calls || !state || !backMinimizesCall(state.phase)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return true;
    });
    return () => subscription.remove();
  }, [calls, state?.phase]);

  const isVideo = call?.kind === 'video';
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [audioRoute, setAudioRoute] = useState<AudioRouteState>(EMPTY_AUDIO_ROUTE_STATE);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);

  // Аудиомаршрутизация звонка (VED-222, п.2): `InCallManager.start()` сам
  // выбирает разговорный динамик по умолчанию для аудио и громкую связь для
  // видео, поднимает аудиофокус (`AUDIOFOCUS_GAIN_TRANSIENT`/
  // `MODE_IN_COMMUNICATION` — ставит на паузу музыку любого другого
  // приложения и плеер самого VedaMatch, если он играл), заводит Bluetooth
  // SCO и проводную гарнитуру, включает датчик приближения (гасит экран у
  // уха, только пока маршрут — разговорный динамик, не на громкой связи и не
  // на видео — решение и обоснование в `audio-route.ts`).
  //
  // «Не гасить экран» (VED-222, п.4) — отдельно от `InCallManager.start()`,
  // который сам всегда включает keep-screen-on: `shouldKeepScreenAwake`
  // перекрывает это значение сразу после старта, чтобы аудиозвонок не держал
  // экран принудительно (только датчик приближения решает, когда его
  // погасить), а видео — держало, пока этот экран открыт.
  useEffect(() => {
    if (!call) return;
    InCallManager.start({ media: call.kind });
    InCallManager.setKeepScreenOn(shouldKeepScreenAwake(call.kind));
    return () => {
      InCallManager.setKeepScreenOn(false);
      InCallManager.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  useEffect(() => {
    if (!call) return;
    return subscribeToAudioRouteChanges(setAudioRoute);
  }, [call?.id]);

  // Картинка в картинке (VED-222, п.5): пока этот экран открыт и разговор
  // подходит (видео, `active`) — разрешить автовход при уходе из приложения
  // (`isPipEligible`, `setPipEligible`), и запретить при любом отклонении от
  // этих условий (ушли «назад», разговор кончился, дозвон ещё идёт) — иначе
  // человек мог бы неожиданно провалиться в PiP на «Вызов…» без картинки.
  const [inPip, setInPip] = useState(false);
  useEffect(() => {
    const eligible = call && state ? isPipEligible(call.kind, state.phase, true) : false;
    setPipEligible(eligible);
    return () => setPipEligible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id, call?.kind, state?.phase]);
  useEffect(() => subscribeToPipModeChanges(setInPip), []);

  const showsRoutePicker = shouldShowRoutePicker(audioRoute);
  const routeLabel = currentRouteLabel(audioRoute, speakerOn);

  const toggleSpeaker = () => {
    confirmTap();
    setSpeakerOn((prev) => {
      const next = !prev;
      InCallManager.setForceSpeakerphoneOn(next);
      return next;
    });
  };

  const selectAudioRoute = (route: CallAudioRoute) => {
    confirmTap();
    chooseAudioRoute(route);
    setRouteMenuOpen(false);
  };

  const elapsed = useElapsedLabel(state?.phase === 'active' ? state.connectedAt : null);

  if (!calls || !call || !matches) return null;
  const role = roleIn(state!, calls.selfId);
  const companion = companionOf(call, calls.selfId);

  const statusLine =
    state!.phase === 'outgoing'
      ? 'Вызов…'
      : state!.phase === 'connecting'
        ? 'Соединение…'
        : state!.phase === 'ended'
          ? endedLabel(state!.endedStatus, role)
          : state!.reconnecting
            ? 'Переподключение…'
            : elapsed;

  const showsRemoteVideo = isVideo && calls.remoteStream && state!.phase === 'active';
  const showsLocalPreview = isVideo && calls.localStream && state!.phase !== 'ended';
  const permissionDenied = state!.phase === 'ended' && Boolean(state!.error?.includes('настройках'));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <View style={styles.stage}>
        {showsRemoteVideo ? (
          <RTCView
            streamURL={calls.remoteStream!.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : !inPip ? (
          <View style={styles.companion}>
            <ChatAvatar id={companion.id} name={companion.name} uri={companion.avatarUrl} size={112} />
            <Text style={[styles.companionName, { color: colors.text0 }]}>{companion.name}</Text>
          </View>
        ) : null}

        {showsLocalPreview && !inPip ? (
          <RTCView
            streamURL={calls.localStream!.toURL()}
            style={[
              styles.localPreview,
              { top: insets.top + 12, borderColor: colors.glassBorder, backgroundColor: colors.bg2 },
              state!.cameraOff ? styles.localPreviewHidden : null,
            ]}
            objectFit="cover"
            mirror
            zOrder={1}
          />
        ) : null}

        {calls.relayed && state!.phase === 'active' && !inPip ? (
          <View
            style={[styles.relayBadge, { top: insets.top + 12, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <Text style={[styles.relayText, { color: colors.text1 }]}>Через ретранслятор</Text>
          </View>
        ) : null}
      </View>

      {/* VED-222, п.5: в картинке-в-картинке — только видео собеседника, без
          статуса, кнопок и плашек (спека прямо требует «без кнопок»); окно
          PiP и так крошечное, любой текст в нём нечитаем. */}
      {!inPip ? (
      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: state!.phase === 'ended' ? colors.text0 : colors.text2 }]}>
          {statusLine}
          {state!.phase === 'ended' && state!.error ? ` · ${state!.error}` : ''}
        </Text>

        {permissionDenied ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть настройки приложения"
            onPress={() => void Linking.openSettings()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.settingsButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.settingsText, { color: colors.text0 }]}>Открыть настройки</Text>
          </Pressable>
        ) : null}

        {state!.phase === 'ended' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={() => calls.dismiss()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.closeButton,
              { borderColor: colors.glassBorder, backgroundColor: colors.glass },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.closeText, { color: colors.text0 }]}>Закрыть</Text>
          </Pressable>
        ) : (
          <>
            {showsRoutePicker && routeMenuOpen ? (
              <View
                accessibilityRole="menu"
                style={[styles.routeMenu, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
              >
                {audioRoute.available.map((route) => (
                  <Pressable
                    key={route}
                    accessibilityRole="menuitem"
                    accessibilityLabel={AUDIO_ROUTE_LABELS[route]}
                    accessibilityState={{ selected: audioRoute.selected === route }}
                    onPress={() => selectAudioRoute(route)}
                    android_ripple={ripple(colors.glassBorder)}
                    style={({ pressed }) => [styles.routeMenuItem, pressedStyle(pressed)]}
                  >
                    <Text
                      style={[
                        styles.routeMenuText,
                        { color: audioRoute.selected === route ? colors.magenta : colors.text0 },
                      ]}
                    >
                      {AUDIO_ROUTE_LABELS[route]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.controls}>
              <ControlButton
                label={state!.muted ? 'Включить микрофон' : 'Выключить микрофон'}
                active={state!.muted}
                onPress={() => {
                  confirmTap();
                  calls.toggleMute();
                }}
              >
                <MicIcon off={state!.muted} color={colors.text0} />
              </ControlButton>

              {showsRoutePicker ? (
                <ControlButton
                  label={`Звук: ${routeLabel} — выбрать устройство`}
                  active={routeMenuOpen}
                  onPress={() => {
                    confirmTap();
                    setRouteMenuOpen((open) => !open);
                  }}
                >
                  <SpeakerIcon on={audioRoute.selected === 'SPEAKER_PHONE'} color={colors.text0} />
                </ControlButton>
              ) : (
                <ControlButton label={`Громкая связь: ${speakerOn ? 'вкл' : 'выкл'}`} active={speakerOn} onPress={toggleSpeaker}>
                  <SpeakerIcon on={speakerOn} color={colors.text0} />
                </ControlButton>
              )}

              {isVideo ? (
              <ControlButton
                label={state!.cameraOff ? 'Включить камеру' : 'Выключить камеру'}
                active={state!.cameraOff}
                onPress={() => {
                  confirmTap();
                  calls.toggleCamera();
                }}
              >
                <CameraIcon off={state!.cameraOff} color={colors.text0} />
              </ControlButton>
            ) : null}

            {isVideo ? (
              <ControlButton
                label="Сменить камеру"
                active={false}
                onPress={() => {
                  confirmTap();
                  calls.switchCamera();
                }}
              >
                <SwitchCameraIcon color={colors.text0} />
              </ControlButton>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Завершить звонок"
              onPress={() => {
                confirmTap();
                void calls.hangUp();
              }}
              android_ripple={ripple(colors.onAccent, true)}
              style={({ pressed }) => [styles.hangUp, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
            >
              <HangUpIcon color={colors.onAccent} />
            </Pressable>
            </View>
          </>
        )}
      </View>
      ) : null}
    </View>
  );
}

function ControlButton({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder, true)}
      style={({ pressed }) => [
        styles.control,
        { borderColor: colors.glassBorder, backgroundColor: active ? colors.bg2 : colors.glass },
        pressedStyle(pressed),
      ]}
    >
      {children}
    </Pressable>
  );
}

function MicIcon({ off, color }: { off: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 3h6a3 3 0 0 1 0 6h-6a3 3 0 0 1 0-6z" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off ? <Path d="M4 4l16 16" /> : null}
    </Svg>
  );
}

function CameraIcon({ off, color }: { off: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7h13v10H3z" />
      <Path d="M16 11l5-3v8l-5-3" />
      {off ? <Path d="M4 4l16 16" /> : null}
    </Svg>
  );
}

function SwitchCameraIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8V6a2 2 0 0 1 2-2h2l1.5-2h5L16 4h2a2 2 0 0 1 2 2v2" />
      <Path d="M20 16v2a2 2 0 0 1-2 2h-2l-1.5 2h-5L8 20H6a2 2 0 0 1-2-2v-2" />
      <Path d="M8 12a4 4 0 0 1 7-2.6M16 12a4 4 0 0 1-7 2.6" />
      <Path d="M14.5 8.5 15.5 9.4 14.4 10.3" />
      <Path d="M9.5 15.5 8.5 14.6 9.6 13.7" />
    </Svg>
  );
}

/**
 * Выключено — обычный разговорный динамик (звук идёт, просто не на весь
 * телефон), не «звук выключен»: перечёркнутый конус раньше читался как
 * немой звонок, хотя на «Вызов…»/«Соединение…» он всегда выключен по
 * умолчанию у аудиозвонка — замечено при живой проверке. Включено —
 * тот же конус с дугами громкой связи, без зачёркивания.
 */
function SpeakerIcon({ on, color }: { on: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9v6h4l5 4V5L8 9H4z" />
      {on ? <Path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12" /> : null}
    </Svg>
  );
}

function HangUpIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 13c5-5 13-5 18 0l-2.5 2.5a1.5 1.5 0 0 1-1.8.3L14 14.5v-2.2a10 10 0 0 0-4 0v2.2l-2.7 1.3a1.5 1.5 0 0 1-1.8-.3z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  companion: { alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  companionName: { fontFamily: fonts.displayBold, fontSize: 22, textAlign: 'center' },
  localPreview: {
    position: 'absolute',
    right: 12,
    width: 108,
    height: 144,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  localPreviewHidden: { opacity: 0 },
  relayBadge: { position: 'absolute', left: 12, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  relayText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  footer: { alignItems: 'center', gap: 18, paddingHorizontal: 24, paddingTop: 12 },
  status: { fontFamily: fonts.bodySemiBold, fontSize: 14, textAlign: 'center' },
  settingsButton: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 18, justifyContent: 'center', overflow: 'hidden' },
  settingsText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  closeButton: { minHeight: hitTarget, borderWidth: 1, borderRadius: 999, paddingHorizontal: 24, justifyContent: 'center', overflow: 'hidden' },
  closeText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  routeMenu: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  routeMenuItem: { minHeight: hitTarget, minWidth: 160, justifyContent: 'center', paddingHorizontal: 18 },
  routeMenuText: { fontFamily: fonts.bodySemiBold, fontSize: 15, textAlign: 'center' },
  control: {
    width: hitTarget + 12,
    height: hitTarget + 12,
    borderRadius: (hitTarget + 12) / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hangUp: {
    width: hitTarget + 20,
    height: hitTarget + 20,
    borderRadius: (hitTarget + 20) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
