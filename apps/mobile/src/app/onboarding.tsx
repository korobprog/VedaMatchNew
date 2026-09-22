import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckRow } from '@/components/onboarding/check-row';
import { LineagePicker } from '@/components/onboarding/lineage-picker';
import { InlineError } from '@/components/inline-error';
import { OptionChips } from '@/components/option-chips';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { createOnboardingApi, submitOnboarding } from '@/lib/onboarding/onboarding-api';
import { useOnboardingGate } from '@/lib/onboarding/onboarding-gate';
import {
  FLAG_QUESTIONS,
  FOCUS_QUESTION,
  GENDER_OPTIONS,
  INTEREST_QUESTION,
  PRACTICE_QUESTION,
} from '@/lib/onboarding/onboarding-questions';
import {
  asksLineage,
  buildOnboardingSubmit,
  initialValues,
  onboardingSteps,
  stepError,
  type OnboardingStep,
  type OnboardingValues,
} from '@/lib/onboarding/onboarding-steps';
import { describeProfileError } from '@/lib/profile/profile-api';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Онбординг новичка (VED-333): первые минуты после входа в приложении.
 *
 * До него человек, зарегистрировавшийся с телефона, навсегда оставался без
 * самоопределения: развилок сайта — `/welcome` и выбор духовной линии — в
 * приложении не существовало вовсе, а от них зависит, что портал ему
 * показывает и видят ли его Знакомства.
 *
 * Два шага, не анкета: «Кто вы» (пол) и «Ваш путь» (вопросы
 * самоидентификации, следом линия, если ответы сложились в преданного).
 * Имени, города и фотографии здесь нет, хотя мастер сайта их спрашивает:
 * имя и фото правит экран «Профиль» (VED-332), и спрашивать их дважды
 * значило бы удлинять ровно ту анкету, из-за длины которой уходят.
 *
 * Серверного кода экран не добавил: `PATCH /profile` и
 * `POST /self-identification/submit` — те же ручки, которыми пользуется
 * мастер сайта.
 */
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user, reloadUser } = useSession();
  const gate = useOnboardingGate();

  const onboardingApi = useMemo(() => createOnboardingApi(api), [api]);
  // Набор шагов считается один раз: профиль обновится к концу отправки, и
  // пересчёт на лету убрал бы шаг из-под человека прямо во время ответа.
  const [steps] = useState<OnboardingStep[]>(() => onboardingSteps({ spiritualStage: user?.spiritualStage ?? null }));
  const [values, setValues] = useState<OnboardingValues>(() => initialValues({ gender: user?.gender ?? null }));
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[index] ?? 'Кто вы';
  const blocked = stepError(step, values);
  const last = index === steps.length - 1;
  const showLineage = asksLineage(steps, values.answers);

  const finish = useCallback(async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await submitOnboarding(onboardingApi, buildOnboardingSubmit(values, steps));
      // Профиль в сессии протух: по нему считается, нужен ли онбординг, и
      // без перечитывания следующий запуск спросил бы то же самое снова.
      // Упавшее перечитывание закрывать экран не мешает — ответы на сервере
      // уже лежат, а сессия догрузится сама.
      await reloadUser().catch(() => undefined);
      confirmTap();
      gate.complete();
    } catch (e) {
      setError(describeProfileError(e, 'Не удалось сохранить ответы.'));
      setSaving(false);
    }
  }, [gate, onboardingApi, reloadUser, saving, steps, values]);

  const next = useCallback(() => {
    setError(null);
    if (blocked) {
      setError(blocked);
      return;
    }
    if (last) {
      void finish();
      return;
    }
    setIndex((current) => current + 1);
  }, [blocked, finish, last]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Добро пожаловать',
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
          headerShadowVisible: false,
          // Назад из онбординга некуда: это единственный экран, пока на
          // вопросы не ответили. Выход — «Позже» внизу, осознанной кнопкой.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.progress, { color: colors.text1 }]}>
          Шаг {index + 1} из {steps.length} · {step}
        </Text>

        {step === 'Кто вы' ? (
          <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
              Немного о вас
            </Text>
            <Text style={[styles.cardHint, { color: colors.text1 }]}>
              По полу работает подбор в Знакомствах и обращения в текстах портала. Этот ответ пропустить
              нельзя — без него вас не покажут никому.
            </Text>
            <OptionChips
              label="Ваш пол"
              options={GENDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={values.gender}
              disabled={saving}
              onChange={(gender) => setValues((current) => ({ ...current, gender }))}
            />
            <Text style={[styles.footnote, { color: colors.text1 }]}>
              Имя и фотографию здесь не спрашиваем — они правятся на экране «Профиль», и он никуда не
              денется.
            </Text>
          </View>
        ) : null}

        {step === 'Ваш путь' ? (
          <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
              Где вы на пути
            </Text>
            <Text style={[styles.cardHint, { color: colors.text1 }]}>
              Этап определяется системой по ответам. Это не ранг, а текущий этап пути — по нему портал
              подбирает сервисы и материалы. Анкету можно пройти заново в любой момент.
            </Text>
            <OptionChips
              label={INTEREST_QUESTION.label}
              options={INTEREST_QUESTION.options}
              value={values.answers.interest}
              disabled={saving}
              onChange={(interest) =>
                setValues((current) => ({ ...current, answers: { ...current.answers, interest } }))
              }
            />
            <OptionChips
              label={PRACTICE_QUESTION.label}
              options={PRACTICE_QUESTION.options}
              value={values.answers.regularPractice}
              disabled={saving}
              onChange={(regularPractice) =>
                setValues((current) => ({ ...current, answers: { ...current.answers, regularPractice } }))
              }
            />
            <OptionChips
              label={FOCUS_QUESTION.label}
              options={FOCUS_QUESTION.options}
              value={values.answers.currentFocus}
              disabled={saving}
              onChange={(currentFocus) =>
                setValues((current) => ({ ...current, answers: { ...current.answers, currentFocus } }))
              }
            />
            <View style={styles.flags}>
              {FLAG_QUESTIONS.map((flag) => (
                <CheckRow
                  key={flag.key}
                  label={flag.label}
                  checked={values.answers[flag.key]}
                  disabled={saving}
                  onChange={(checked) =>
                    setValues((current) => ({ ...current, answers: { ...current.answers, [flag.key]: checked } }))
                  }
                />
              ))}
            </View>

            {showLineage ? (
              <View style={[styles.lineage, { borderTopColor: colors.glassBorder }]}>
                <LineagePicker
                  value={values.lineage}
                  disabled={saving}
                  onChange={(lineage) => setValues((current) => ({ ...current, lineage }))}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? <InlineError message={error} /> : null}

        <View style={styles.actions}>
          {index > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              disabled={saving}
              onPress={() => {
                setError(null);
                setIndex((current) => current - 1);
              }}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.secondary,
                { backgroundColor: colors.bg1, borderColor: colors.glassBorder },
                saving ? styles.busy : pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text0 }]}>Назад</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={last ? 'Готово' : 'Дальше'}
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={next}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta, borderColor: colors.magenta },
              saving ? styles.busy : pressedStyle(pressed),
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.primaryText, { color: colors.onAccent }]}>{last ? 'Готово' : 'Дальше'}</Text>
            )}
          </Pressable>
        </View>

        {/* «Позже» — до следующего запуска приложения, и так и написано.
            Сайт отложить не даёт вовсе; здесь послабление на одну ступень,
            потому что в приложение часто заходят из пуша ради одного
            сообщения. Насовсем отказаться нельзя: без самоопределения
            сервисы портала не знают, что человеку показывать. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ответить позже"
          accessibilityHint="Вопросы появятся снова при следующем запуске приложения"
          disabled={saving}
          onPress={gate.defer}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.later, saving ? styles.busy : pressedStyle(pressed)]}
        >
          <Text style={[styles.laterText, { color: colors.text1 }]}>
            Ответить позже — спросим при следующем запуске
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  progress: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 14 },
  cardTitle: { fontFamily: fonts.displayMedium, fontSize: 19, lineHeight: 26 },
  cardHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  footnote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  flags: { gap: 8 },
  lineage: { borderTopWidth: 1, paddingTop: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  primary: {
    flexGrow: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  later: { minHeight: hitTarget, justifyContent: 'center' },
  laterText: { fontFamily: fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' },
  busy: { opacity: 0.6 },
});
