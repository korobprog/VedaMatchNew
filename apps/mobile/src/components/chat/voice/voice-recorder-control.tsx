import type { ChatAttachmentInput } from '@vedamatch/shared';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { confirmTap } from '@/lib/feedback';
import { toVoiceAttachmentInput } from '@/lib/chat/chat-composer-state';
import { useChatCalls } from '@/lib/calls/chat-calls-context';
import { canRecordVoice, shouldInterruptForIncomingCall } from '@/lib/chat/voice/voice-call-guard';
import { VOICE_RECORDING_OPTIONS, VOICE_UPLOAD_FILE_NAME, VOICE_UPLOAD_MIME_TYPE } from '@/lib/chat/voice/voice-recording-options';
import {
  INITIAL_VOICE_RECORDER_STATE,
  reduceVoiceRecorder,
  VOICE_RECORD_MAX_SECONDS,
  type VoiceRecorderState,
} from '@/lib/chat/voice/voice-recording-machine';
import { downsampleWaveform, normalizeMeteringLevel } from '@/lib/chat/voice/voice-waveform';
import { formatVoiceTime } from '@/lib/chat/voice/voice-time';
import type { ChatApi } from '@/lib/chat/chat-api';
import { ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { VoiceWaveformBars } from './voice-waveform-bars';

interface Props {
  conversationId: string;
  chatApi: ChatApi;
  onSent(attachment: ChatAttachmentInput): void;
  /** Композер прячет текстовое поле и показывает таймер записи вместо него — приём с сайта. */
  onRecordingChange?(recording: boolean, elapsedSec: number): void;
}

/**
 * Кнопка микрофона в композере. Жест — тот же, что на сайте
 * (`apps/web/src/components/chat/chat-voice-recorder.tsx`): одно нажатие
 * начинает запись, дальше отдельные кнопки «Отмена» и «Стоп/Отправить», а не
 * удержание — удержание плохо ловится пальцем и не даёт передышки набрать
 * воздух посреди длинной фразы.
 */
export function VoiceRecorderControl({ conversationId, chatApi, onSent, onRecordingChange }: Props) {
  const { colors } = useTheme();
  const calls = useChatCalls();
  const callPhase = calls?.state.phase ?? 'idle';
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 150);
  const [state, setState] = useState<VoiceRecorderState>(INITIAL_VOICE_RECORDER_STATE);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const levelsRef = useRef<number[]>([]);
  const wasRecordingRef = useRef(false);
  // Кнопка «Стоп» и авто-остановка по потолку длительности могут дожать
  // `recorder.stop()` почти одновременно (наш вызов и опрос
  // `useAudioRecorderState` с интервалом 150 мс) — без защёлки обе ветки
  // позвали бы `finalizeAndSend()`, и голосовое отправилось бы дважды.
  const finalizingRef = useRef(false);

  useEffect(() => {
    onRecordingChange?.(state.phase === 'recording', state.elapsedSec);
  }, [state.phase, state.elapsedSec, onRecordingChange]);

  // Метраж записи (`durationMillis`) — источник таймера и триггер
  // авто-остановки по `VOICE_RECORD_MAX_SECONDS`; не заводим свой
  // `setInterval` поверх того, что и так тикает в `useAudioRecorderState`.
  useEffect(() => {
    if (state.phase !== 'recording') return;
    const elapsedSec = Math.floor(recorderState.durationMillis / 1000);
    if (recorderState.metering !== undefined) levelsRef.current.push(normalizeMeteringLevel(recorderState.metering));
    setState((current) => reduceVoiceRecorder(current, { type: 'tick', elapsedSec }));
  }, [recorderState.durationMillis, recorderState.metering, state.phase]);

  // Запись остановилась сама (потолок длительности из `record({ forDuration })`,
  // либо система прервала) — отправляем то, что успели записать, тем же
  // путём, что и по кнопке «Стоп».
  useEffect(() => {
    if (wasRecordingRef.current && !recorderState.isRecording && state.phase === 'recording') {
      void finalizeAndSend();
    }
    wasRecordingRef.current = recorderState.isRecording;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording]);

  // Входящий звонок посреди записи/отправки — обрывает без отправки:
  // говорить в микрофон одновременно с ответом на звонок нельзя.
  useEffect(() => {
    if (!shouldInterruptForIncomingCall(callPhase)) return;
    if (state.phase !== 'recording' && state.phase !== 'uploading') return;
    finalizingRef.current = true;
    void recorder.stop().catch(() => undefined);
    void restoreAudioMode();
    setState(() => reduceVoiceRecorder(state, { type: 'interrupt' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase]);

  async function applyRecordingAudioMode() {
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        // Запись должна слушать обычный микрофон, не разговорный — тот же
        // резон, что у плеера: это не звонок.
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
      });
    } catch {
      // Аудиосессия не поднялась — `recorder.record()` следом сам откажет понятной ошибкой.
    }
  }

  async function restoreAudioMode() {
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // Не мешаем остальному — сессия просто останется как есть до следующей настройки.
    }
  }

  async function start() {
    if (!canRecordVoice(callPhase) || state.phase !== 'idle') return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    levelsRef.current = [];
    finalizingRef.current = false;
    try {
      await applyRecordingAudioMode();
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_RECORD_MAX_SECONDS });
      confirmTap();
      setState(() => reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'start' }));
    } catch {
      await restoreAudioMode();
      setState(() => reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'failed', message: 'Микрофон недоступен' }));
    }
  }

  async function cancel() {
    if (state.phase !== 'recording') return;
    // Считается «уже обработанной остановкой» — авто-стоп ниже не должен
    // следом позвать `finalizeAndSend()` и отправить то, что только что отменили.
    finalizingRef.current = true;
    try {
      await recorder.stop();
    } catch {
      // Файл всё равно никуда не пойдёт — отмена не должна зависеть от этого.
    }
    await restoreAudioMode();
    setState((current) => reduceVoiceRecorder(current, { type: 'cancel' }));
  }

  async function finalizeAndSend() {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setState((current) => reduceVoiceRecorder(current, { type: 'stop' }));
    const durationSec = Math.max(1, Math.round(recorder.currentTime || recorderState.durationMillis / 1000));
    const waveform = downsampleWaveform(levelsRef.current);
    const uri = recorder.uri;
    await restoreAudioMode();
    if (!uri) {
      setState((current) => reduceVoiceRecorder(current, { type: 'failed', message: 'Запись не сохранилась' }));
      return;
    }
    try {
      const form = new FormData();
      form.append(
        'file',
        { uri, name: VOICE_UPLOAD_FILE_NAME, type: VOICE_UPLOAD_MIME_TYPE } as unknown as Blob,
      );
      const result = await chatApi.upload(conversationId, form);
      setState(() => reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'sent' }));
      onSent(toVoiceAttachmentInput(result, durationSec, waveform));
    } catch (e) {
      setState((current) =>
        reduceVoiceRecorder(current, {
          type: 'failed',
          message: e instanceof Error ? e.message : 'Голосовое не отправилось',
        }),
      );
    }
  }

  async function stopAndSend() {
    if (state.phase !== 'recording') return;
    try {
      await recorder.stop();
    } catch {
      // `finalizeAndSend` ниже проверит `recorder.uri` сам.
    }
    await finalizeAndSend();
  }

  if (permissionDenied) {
    return (
      <View style={[styles.denied, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
        <Text numberOfLines={2} style={[styles.deniedText, { color: colors.text1 }]}>
          Нет доступа к микрофону
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть настройки приложения"
          onPress={() => void Linking.openSettings()}
          android_ripple={ripple(colors.glassBorder, true)}
          style={styles.deniedButton}
        >
          <Text style={[styles.deniedButtonText, { color: colors.magenta }]}>Открыть настройки</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={[styles.denied, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
        <Text numberOfLines={2} style={[styles.deniedText, { color: colors.magenta }]}>
          {state.error}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Понятно"
          onPress={() => setState(() => INITIAL_VOICE_RECORDER_STATE)}
          android_ripple={ripple(colors.glassBorder, true)}
          style={styles.deniedButton}
        >
          <Text style={[styles.deniedButtonText, { color: colors.text0 }]}>Понятно</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase === 'recording') {
    const liveWaveform = downsampleWaveform(levelsRef.current.length > 0 ? levelsRef.current : [10]);
    return (
      <View style={styles.recordingRow}>
        <View style={[styles.timer, { borderColor: colors.magenta, backgroundColor: colors.glass }]}>
          <View style={[styles.dot, { backgroundColor: colors.magenta }]} />
          <Text style={[styles.timerText, { color: colors.magenta }]}>{formatVoiceTime(state.elapsedSec)}</Text>
          <View style={styles.timerWave}>
            <VoiceWaveformBars levels={liveWaveform} colorPlayed={colors.magenta} colorRest={colors.magenta} height={18} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить запись"
          onPress={() => void cancel()}
          android_ripple={ripple(colors.glassBorder, true)}
          style={[styles.roundButton, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
        >
          <TrashIcon color={colors.text1} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Остановить и отправить запись"
          onPress={() => void stopAndSend()}
          android_ripple={ripple(colors.magenta, true)}
          style={[styles.roundButton, { borderColor: 'transparent', backgroundColor: colors.magenta }]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.onAccent}>
            <Rect x={6} y={6} width={12} height={12} rx={2} />
          </Svg>
        </Pressable>
      </View>
    );
  }

  const disabled = !canRecordVoice(callPhase) || state.phase === 'uploading';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={!canRecordVoice(callPhase) ? 'Запись недоступна во время звонка' : 'Записать голосовое'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => void start()}
      android_ripple={ripple(colors.onMint, true)}
      style={[styles.roundButton, { borderColor: colors.mint, backgroundColor: colors.mint }, disabled && styles.micDisabled]}
    >
      {state.phase === 'uploading' ? (
        <ActivityIndicator size="small" color={colors.onMint} />
      ) : (
        <MicIcon color={colors.onMint} />
      )}
    </Pressable>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} stroke="none" />
      <Path d="M5.5 11a6.5 6.5 0 0013 0" />
      <Path d="M12 17.5V21" />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" />
      <Path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
      <Path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  roundButton: { width: hitTarget, height: hitTarget, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  micDisabled: { opacity: 0.5 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  timer: {
    flex: 1,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  timerText: { fontFamily: fonts.bodySemiBold, fontSize: 14, fontVariant: ['tabular-nums'] },
  timerWave: { flex: 1, height: 18 },
  denied: {
    flex: 1,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deniedText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
  deniedButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  deniedButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
});
