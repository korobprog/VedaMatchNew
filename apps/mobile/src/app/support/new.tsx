import type { SupportTicketCategory } from '@vedamatch/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { OptionChips, type ChipOption } from '@/components/option-chips';
import { SupportHeader } from '@/components/support/support-header';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { readDeviceFacts } from '@/lib/support/device-facts';
import {
  SUPPORT_SUBJECT_MAX,
  deviceReportLines,
  deviceReportText,
  messageRoom,
  parseSupportOrigin,
} from '@/lib/support/device-report';
import { createSupportApi } from '@/lib/support/support-api';
import { TICKET_CATEGORY_LABELS, TICKET_CATEGORY_ORDER } from '@/lib/support/support-copy';
import { checkSupportDraft, initialSupportDraft, type SupportDraft } from '@/lib/support/support-draft';
import { describeSupportError } from '@/lib/support/support-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const CATEGORY_OPTIONS: ChipOption<SupportTicketCategory>[] = TICKET_CATEGORY_ORDER.map((value) => ({
  value,
  label: TICKET_CATEGORY_LABELS[value],
}));

/**
 * Новое обращение в поддержку (VED-336) — та же ручка `POST /support/tickets`,
 * что у формы на сайте, и те же поля: тема, категория, текст.
 *
 * Сведения об устройстве сервер отдельными полями не принимает, поэтому они
 * дописываются абзацем в конец текста. Человек видит этот абзац слово в
 * слово до отправки и выключает его одним переключателем: «что отправится»
 * здесь не обещание, а показанный текст.
 *
 * Если форму открыли из состояния ошибки (`?from=chat`), экран назван в
 * абзаце, а тема подставлена — её можно переписать.
 */
export default function NewSupportTicketScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const support = useMemo(() => createSupportApi(api), [api]);
  const params = useLocalSearchParams<{ from?: string }>();
  const origin = parseSupportOrigin(params.from);

  const report = useMemo(() => deviceReportText(deviceReportLines(readDeviceFacts(), origin)), [origin]);
  const [draft, setDraft] = useState<SupportDraft>(() => initialSupportDraft(origin));
  const [problem, setProblem] = useState<{ field: 'subject' | 'message' | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const room = messageRoom(draft.attachDevice ? report : '');
  const length = draft.message.trim().length;

  const update = useCallback((patch: Partial<SupportDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  }, []);

  const submit = useCallback(async () => {
    const check = checkSupportDraft(draft, report);
    if (!check.ok) {
      setProblem({ field: check.field, message: check.error });
      return;
    }
    confirmTap();
    setBusy(true);
    setProblem(null);
    try {
      const created = await support.create(check.request);
      // Форма уступает место самому обращению — «назад» из него ведёт в
      // список, а не обратно в уже отправленную форму.
      if (created.id) router.replace({ pathname: '/support/[id]', params: { id: created.id } });
      else router.replace('/support');
    } catch (error) {
      // Черновик остаётся как был: отправить снова можно тем же нажатием.
      setProblem({ field: null, message: describeSupportError(error, 'create').message });
      setBusy(false);
    }
  }, [draft, report, support]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <SupportHeader title="Новое обращение" />
      <KeyboardAwareScrollView
        bottomOffset={120}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <OptionChips
          label="О чём"
          options={CATEGORY_OPTIONS}
          value={draft.category}
          onChange={(category) => update({ category })}
          disabled={busy}
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Тема</Text>
          <TextInput
            value={draft.subject}
            onChangeText={(subject) => update({ subject })}
            maxLength={SUPPORT_SUBJECT_MAX}
            editable={!busy}
            placeholder="Коротко о вопросе"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Тема обращения"
            style={[
              styles.input,
              {
                color: colors.text0,
                backgroundColor: colors.bg1,
                borderColor: problem?.field === 'subject' ? colors.magenta : colors.glassBorder,
              },
            ]}
          />
          {problem?.field === 'subject' ? <InlineError message={problem.message} /> : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Что случилось</Text>
          <TextInput
            value={draft.message}
            onChangeText={(message) => update({ message })}
            editable={!busy}
            multiline
            textAlignVertical="top"
            placeholder="Что делали, что ожидали, что произошло"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Текст обращения"
            style={[
              styles.textarea,
              {
                color: colors.text0,
                backgroundColor: colors.bg1,
                borderColor: problem?.field === 'message' ? colors.magenta : colors.glassBorder,
              },
            ]}
          />
          {/* Счётчик появляется ближе к пределу: на коротком тексте он шум. */}
          {length > room - 500 ? (
            <Text style={[styles.hint, { color: length > room ? colors.text0 : colors.text1 }]}>
              {length} из {room} знаков
            </Text>
          ) : null}
          {problem?.field === 'message' ? <InlineError message={problem.message} /> : null}
        </View>

        {report ? (
          <View style={[styles.attach, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={styles.attachRow}>
              <Text style={[styles.attachTitle, { color: colors.text0 }]}>
                Приложить сведения о приложении
              </Text>
              <Switch
                value={draft.attachDevice}
                onValueChange={(attachDevice) => update({ attachDevice })}
                disabled={busy}
                accessibilityLabel="Приложить сведения о приложении"
                trackColor={{ false: colors.glassBorder, true: colors.cyan }}
                thumbColor={colors.onAccent}
              />
            </View>
            <Text style={[styles.hint, { color: colors.text1 }]}>
              {draft.attachDevice
                ? 'Допишется в конец текста ровно так — поддержке не придётся переспрашивать:'
                : 'Не отправится. Если поддержка спросит версию — метка сборки есть внизу экрана «Аккаунт».'}
            </Text>
            {draft.attachDevice ? (
              <Text selectable style={[styles.report, { color: colors.text0, backgroundColor: colors.bg1 }]}>
                {report}
              </Text>
            ) : null}
          </View>
        ) : null}

        {problem && problem.field === null ? <InlineError message={problem.message} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void submit()}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.magenta },
            busy ? styles.busy : pressedStyle(pressed),
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>Отправить</Text>
          )}
        </Pressable>
        <Text style={[styles.hint, { color: colors.text1 }]}>
          Ответ придёт в «Поддержку» на экране «Аккаунт» и уведомлением. Обращение видно и на сайте.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textarea: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  attach: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 14, gap: 10 },
  attachRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: hitTarget },
  attachTitle: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  report: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    borderRadius: radius.sm,
    padding: 10,
    overflow: 'hidden',
  },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  busy: { opacity: 0.7 },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
});
