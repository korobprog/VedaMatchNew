import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useSession } from '@/lib/auth/session';
import { createChatCallsApi } from '@/lib/calls/chat-calls-client';
import { buildProbePlan, formatSummary, type ProbeStep, type StepOutcome, type StepResult } from '@/lib/calls/ice-probe';
import { runAnswererProbe, runLoopback, runStep, type AnswererProbeResult } from '@/lib/calls/ice-probe-runner';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

type Phase = 'idle' | 'loading' | 'running' | 'done' | 'error';

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  ok: 'доступен',
  fail: 'нет',
  pending: '…',
};

/**
 * Служебный экран «Проверка связи» (этап 0, VED-218): даёт замер «доля
 * relay» на Wi-Fi и LTE на живом телефоне — с какого транспорта эта сеть
 * дотягивается до нашего TURN. Вход скрыт (долгое нажатие на заголовок
 * вкладки «Звонки», см. `(tabs)/calls.tsx`), это инструмент команды, а не
 * продуктовая функция звонков.
 */
export default function CallsProbeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [turnConfigured, setTurnConfigured] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<ProbeStep[]>([]);
  const [results, setResults] = useState<StepResult[]>([]);
  const [loopback, setLoopback] = useState<StepOutcome>('pending');

  // «Проверка как у звонка» (VED-222, живая проверка BUG C) — отдельная от
  // основного прогона выше: тот строит `RTCPeerConnection` офферером
  // (`pc.createOffer()`), настоящий же звонок на приёме — ответчиком
  // (`setRemoteDescription` → `createAnswer`). Если здесь тоже только
  // `host` — дело не в конкретном offer'е сайта, а в самой связке «роль
  // ответчика + эти iceServers» на этом телефоне (см. `runAnswererProbe`).
  // Второй прогон (`addLocalTrackFirst`) — с микрофоном, добавленным ДО
  // `setRemoteDescription`, той же последовательностью, что
  // `call-provider.tsx#accept()` готовит настоящий `CallSession`: живая
  // проверка на прошлом круге показала, что ПРОСТАЯ проба (без трека)
  // уверенно получает host/srflx/relay, а настоящий звонок — только host,
  // и это единственная оставшаяся, ещё не проверенная разница.
  const [answererPhase, setAnswererPhase] = useState<'idle' | 'running' | 'error'>('idle');
  const [answererResult, setAnswererResult] = useState<AnswererProbeResult | null>(null);
  const [answererWithTrackResult, setAnswererWithTrackResult] = useState<AnswererProbeResult | null>(null);
  const [answererError, setAnswererError] = useState<string | null>(null);

  const runAnswerer = useCallback(async () => {
    setAnswererPhase('running');
    setAnswererError(null);
    setAnswererResult(null);
    setAnswererWithTrackResult(null);
    try {
      const callsApi = createChatCallsApi(api);
      const state = await callsApi.iceServers();
      setAnswererResult(await runAnswererProbe(state.iceServers));
      setAnswererWithTrackResult(await runAnswererProbe(state.iceServers, { addLocalTrackFirst: true }));
      setAnswererPhase('idle');
    } catch (e) {
      setAnswererError(e instanceof Error ? e.message : String(e));
      setAnswererPhase('error');
    }
  }, [api]);

  const run = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setResults([]);
    setLoopback('pending');
    try {
      const callsApi = createChatCallsApi(api);
      const state = await callsApi.iceServers();
      setTurnConfigured(state.turnConfigured);
      const steps = buildProbePlan(state.iceServers);
      setPlan(steps);
      setPhase('running');
      // Последовательно, а не параллельно: несколько одновременных
      // соединений к одному TURN размывают ответ на вопрос «какой
      // транспорт проходит».
      const collected: StepResult[] = [];
      for (const step of steps) {
        const result = await runStep(step);
        collected.push(result);
        setResults([...collected]);
      }
      setLoopback(state.turnConfigured ? await runLoopback(state.iceServers) : 'fail');
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [api]);

  const summary = formatSummary(results, loopback);
  const busy = phase === 'loading' || phase === 'running';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.glassBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path d="m15 18-6-6 6-6" stroke={colors.text0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Проверка связи
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.lead, { color: colors.text1 }]}>
          Проверяет, доходит ли эта сеть до TURN-сервера портала по UDP, TCP и TLS, и проходит ли через
          него трафик. Запустите с домашнего Wi-Fi и с мобильного интернета — строка итога ниже идёт в
          отчёт команды.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Проверка идёт' : 'Запустить проверку связи'}
          disabled={busy}
          onPress={() => void run()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.magenta },
            (pressed || busy) && { opacity: 0.7 },
          ]}
        >
          {busy ? <ActivityIndicator color={colors.onAccent} /> : null}
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>
            {busy ? 'Проверяем…' : 'Запустить проверку'}
          </Text>
        </Pressable>

        {turnConfigured === false ? (
          <Text style={[styles.note, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            TURN на сервере не настроен: проверится только STUN.
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={[styles.note, { color: colors.magenta, borderColor: colors.glassBorder }]}>
            Не удалось: {error}
          </Text>
        ) : null}

        {plan.length > 0 ? (
          <View style={[styles.table, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            {plan.map((step) => {
              const result = results.find((r) => r.transport === step.transport);
              const outcome: StepOutcome = result?.outcome ?? 'pending';
              return (
                <View key={step.transport} style={[styles.row, { borderTopColor: colors.glassBorder }]}>
                  <Text style={[styles.rowLabel, { color: colors.text0 }]}>{step.label}</Text>
                  <Text style={[styles.rowValue, { color: outcome === 'fail' ? colors.magenta : colors.text0 }]}>
                    {OUTCOME_LABEL[outcome]}
                    {result?.ms != null ? ` · ${result.ms} мс` : ''}
                  </Text>
                </View>
              );
            })}
            <View style={[styles.row, { borderTopColor: colors.glassBorder }]}>
              <Text style={[styles.rowLabel, { color: colors.text0 }]}>Данные через релей (петля)</Text>
              <Text style={[styles.rowValue, { color: loopback === 'fail' ? colors.magenta : colors.text0 }]}>
                {OUTCOME_LABEL[loopback]}
              </Text>
            </View>
          </View>
        ) : null}

        {phase === 'done' ? (
          <View style={styles.summaryBlock}>
            <Text style={[styles.summaryLabel, { color: colors.text2 }]}>
              Строка для отчёта (STUN | TURN UDP | TURN TCP | TURN TLS | петля):
            </Text>
            <Text selectable style={[styles.summary, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              {summary}
            </Text>
          </View>
        ) : null}

        <View style={[styles.note, { borderColor: colors.glassBorder, backgroundColor: colors.glass, gap: 10 }]}>
          <Text style={[styles.lead, { color: colors.text1 }]}>
            Проверка как у звонка: та же связка iceServers, но соединение играет роль ОТВЕЧАЮЩЕГО
            (`setRemoteDescription` → `createAnswer`), как настоящий входящий звонок — не офферера, как
            шаги выше. Запускает два прогона подряд: без трека и с микрофоном, добавленным ДО offer'а
            (как готовит настоящий звонок `accept()`).
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={answererPhase === 'running' ? 'Проверка идёт' : 'Запустить проверку как у звонка'}
            disabled={answererPhase === 'running'}
            onPress={() => void runAnswerer()}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.cyan },
              (pressed || answererPhase === 'running') && { opacity: 0.7 },
            ]}
          >
            {answererPhase === 'running' ? <ActivityIndicator color={colors.onAccent} /> : null}
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>
              {answererPhase === 'running' ? 'Проверяем…' : 'Проверка как у звонка (ответчик)'}
            </Text>
          </Pressable>
          {answererError ? (
            <Text accessibilityRole="alert" style={{ color: colors.magenta, fontFamily: fonts.body, fontSize: 13 }}>
              Не удалось: {answererError}
            </Text>
          ) : null}
          {answererResult ? (
            <Text selectable style={[styles.summary, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              Без трека — типы: {answererResult.candidateTypes.length > 0 ? answererResult.candidateTypes.join(', ') : 'ни одного'}
              {'\n'}Сбор: {answererResult.ms} мс{answererResult.timedOut ? ' (оборвано по таймауту 8с)' : ' (дошёл до конца)'}
            </Text>
          ) : null}
          {answererWithTrackResult ? (
            <Text selectable style={[styles.summary, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              С микрофоном до offer'а — типы: {answererWithTrackResult.candidateTypes.length > 0 ? answererWithTrackResult.candidateTypes.join(', ') : 'ни одного'}
              {'\n'}Сбор: {answererWithTrackResult.ms} мс
              {answererWithTrackResult.timedOut ? ' (оборвано по таймауту 8с)' : ' (дошёл до конца)'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bodyBold, fontSize: 17 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
  table: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  rowValue: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  summaryBlock: { gap: 6 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 12 },
  summary: { fontFamily: fonts.body, fontSize: 13, borderWidth: 1, borderRadius: radius.sm, padding: 12 },
});
