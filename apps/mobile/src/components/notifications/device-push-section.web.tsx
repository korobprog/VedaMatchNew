import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { useSession } from '@/lib/auth/session';
import { detectWebPushEnvironment, enableWebPush } from '@/lib/push/web-push';
import { describeWebPushSection, type WebPushEnvironment } from '@/lib/push/web-push-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Уведомления на этом устройстве» на экране «Аккаунт» веб-версии
 * (`ios.vedamatch.com`, VED-313).
 *
 * Главное здесь — не кнопка, а объяснение. Safari доставляет веб-уведомления
 * только сайту, добавленному на домашний экран; во вкладке браузера подписка
 * либо не создаётся вовсе, либо создаётся и молчит. Поэтому на айфоне во
 * вкладке кнопки «включить» нет совсем: вместо неё — что именно сделать и
 * почему. Правило целиком в `describeWebPushSection`, у него своя `*.spec.ts`.
 *
 * Нативная сборка этот файл не видит: рядом лежит `device-push-section.tsx`,
 * который ничего не рисует, и Metro берёт его для Android и iOS.
 */
export function DevicePushSection() {
  const { colors } = useTheme();
  const { api } = useSession();
  // Среду читаем после монтирования: до него `navigator` может быть ещё не
  // тем, что нужно (медиазапрос про домашний экран), а первый кадр всё равно
  // рисуется без неё.
  const [environment, setEnvironment] = useState<WebPushEnvironment>({
    support: 'unsupported',
    standalone: false,
    ios: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEnvironment(detectWebPushEnvironment()), []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enableWebPush(api);
      if (result === 'failed') {
        setError('Не удалось включить уведомления. Попробуйте ещё раз позже.');
      }
    } finally {
      // Разрешение только что могло смениться — перечитываем, иначе кнопка
      // осталась бы на месте у того, кто уже нажал «Разрешить».
      setEnvironment(detectWebPushEnvironment());
      setBusy(false);
    }
  }, [api]);

  const section = describeWebPushSection(environment);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text1 }]}>
        Уведомления на этом устройстве
      </Text>
      <View
        style={[
          styles.row,
          // Кнопка с длинной подписью рядом с текстом сжимает его в узкую
          // колонку с переносами посреди слов — тогда карточка в столбец.
          section.showEnableButton ? styles.rowStacked : null,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
        ]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: colors.text0 }]}>Сообщения и звонки</Text>
          <Text style={[styles.rowNote, { color: colors.text1 }]}>{section.hint}</Text>
        </View>
        {section.showEnableButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void enable()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.rowButton,
              { backgroundColor: colors.magenta, borderColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.rowButtonText, { color: colors.onAccent }]}>
                Включить уведомления
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {section.steps.length > 0 ? (
        <View style={[styles.steps, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          {section.steps.map((step, index) => (
            // Номер — обычный текст рядом со строкой, а не заголовок: порядок
            // h1→h2→h3 для скринридера декоративная нумерация ломать не должна.
            // Цвет — `violet`, а не `magenta`: при 13px нужен контраст 4.5:1, а
            // магента на `bg1` даёт замеренные 4,24:1 в светлой теме (правило
            // из CLAUDE.md). Фиолетовый — 5,61:1 в светлой и 7,69:1 в тёмной.
            <View key={step} style={styles.step}>
              <Text style={[styles.stepNumber, { color: colors.violet }]}>{index + 1}</Text>
              <Text style={[styles.stepText, { color: colors.text0 }]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 4 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    minHeight: hitTarget,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  rowNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  rowButton: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  steps: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 10 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 19, minWidth: 14 },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
});
