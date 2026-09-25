import type { UserReportReason } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { OptionChips } from '@/components/option-chips';
import { UnionButton, unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { confirmTap } from '@/lib/feedback';
import { describeUnionError } from '@/lib/union/union-error';
import { REPORT_COMMENT_MAX, REPORT_REASONS, reportComment } from '@/lib/union/union-extras';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

/**
 * Жалоба на человека из Знакомств (`report-block-menu.tsx` на сайте). На
 * сайте форма раскрывается строкой под анкетой; на телефоне это свой экран:
 * поле ввода над клавиатурой и ни одного случайного нажатия по соседним
 * кнопкам анкеты.
 *
 * Жалоба уходит администрации, человек о ней не узнает. Блокировку отсюда
 * не предлагаем: она стоит рядом с «Пожаловаться» на самой анкете, и
 * решение это отдельное.
 */
export default function UnionReportScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const userId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unionApi = useUnionApi();
  const [reason, setReason] = useState<UserReportReason>('spam');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (sending) return;
    confirmTap();
    setSending(true);
    setError(null);
    try {
      await unionApi.report(userId, { reason, comment: reportComment(comment) });
      setDone(true);
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось отправить жалобу.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Жалоба')} />
      <KeyboardAwareScrollView
        bottomOffset={120}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {done ? (
          <>
            <Text accessibilityRole="alert" style={[styles.title, { color: colors.text0 }]}>
              Жалоба отправлена
            </Text>
            <Text style={[styles.text, { color: colors.text1 }]}>
              Администрация её рассмотрит. Человек не узнает, кто пожаловался.
            </Text>
            <UnionButton label="Вернуться" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              {name ? `Жалоба на ${name}` : 'Жалоба'}
            </Text>
            <OptionChips<UserReportReason> label="Что случилось" options={REPORT_REASONS} value={reason} onChange={setReason} disabled={sending} />
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text1 }]}>Подробности — по желанию</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                maxLength={REPORT_COMMENT_MAX}
                multiline
                editable={!sending}
                placeholder="Что произошло?"
                placeholderTextColor={colors.text1}
                accessibilityLabel="Комментарий к жалобе"
                style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
              />
              <Text style={[styles.hint, { color: colors.text1 }]}>Осталось символов: {REPORT_COMMENT_MAX - comment.length}</Text>
            </View>
            {error ? <InlineError message={error} /> : null}
            <UnionButton label="Отправить жалобу" busy={sending} onPress={() => void send()} />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  title: { fontFamily: fonts.displayBold, fontSize: 20 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.body, fontSize: 12 },
});
