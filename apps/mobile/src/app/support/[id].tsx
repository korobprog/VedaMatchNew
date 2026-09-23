import type { SupportTicketDto } from '@vedamatch/shared';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { RetryButton } from '@/components/retry-button';
import { SupportHeader } from '@/components/support/support-header';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { SUPPORT_MESSAGE_MAX } from '@/lib/support/device-report';
import { createSupportApi } from '@/lib/support/support-api';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  acceptsReplies,
  formatTicketTime,
  messageAuthor,
} from '@/lib/support/support-copy';
import { describeSupportError, type SupportFailure } from '@/lib/support/support-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Переписка по обращению (VED-336) — то же, что `/support/<id>` на сайте:
 * сообщения человека и ответы поддержки по порядку и поле ответа внизу.
 * Сюда же ведёт пуш «Ответ поддержки» (`support.ticket.replied`,
 * `lib/notifications/notification-target.ts`).
 *
 * Перечитывается при возврате на экран: ответ мог прийти, пока человек был
 * в другом месте, а живого канала у поддержки нет и на сайте.
 */
export default function SupportTicketScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const support = useMemo(() => createSupportApi(api), [api]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [ticket, setTicket] = useState<SupportTicketDto | null>(null);
  const [failure, setFailure] = useState<SupportFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const current = (request.current += 1);
    try {
      const response = await support.get(id);
      if (request.current !== current) return;
      setTicket(response);
      setFailure(null);
    } catch (error) {
      if (request.current === current) setFailure(describeSupportError(error, 'load'));
    } finally {
      if (request.current === current) setRetrying(false);
    }
  }, [id, support]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const send = useCallback(async () => {
    const body = reply.trim();
    if (!id || !body || sending) return;
    confirmTap();
    setSending(true);
    setSendError(null);
    try {
      const updated = await support.reply(id, body);
      // Ответ сервера — обращение целиком: новый статус и сообщение сразу,
      // без второго запроса.
      request.current += 1;
      setTicket(updated);
      setReply('');
    } catch (error) {
      // Текст в поле остаётся — повторить можно тем же нажатием.
      setSendError(describeSupportError(error, 'reply').message);
    } finally {
      setSending(false);
    }
  }, [id, reply, sending, support]);

  const title = ticket ? `Обращение №${ticket.number}` : 'Обращение';

  if (!ticket) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.bg0 }]}>
        <SupportHeader title={title} />
        {failure ? (
          <>
            <InlineError message={failure.message} />
            {failure.retryable ? (
              <RetryButton
                busy={retrying}
                onPress={() => {
                  setRetrying(true);
                  void load();
                }}
              />
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.magenta} />
        )}
      </View>
    );
  }

  const open = acceptsReplies(ticket.status);
  const now = new Date();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <SupportHeader title={title} />
      <KeyboardAwareScrollView
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text selectable accessibilityRole="header" style={[styles.subject, { color: colors.text0 }]}>
            {ticket.subject}
          </Text>
          <Text style={[styles.meta, { color: colors.text1 }]}>
            {TICKET_STATUS_LABELS[ticket.status]} · {TICKET_CATEGORY_LABELS[ticket.category]} · создано{' '}
            {formatTicketTime(ticket.createdAt, now)}
          </Text>
          {!ticket.firstResponseAt ? (
            <Text style={[styles.meta, { color: colors.text1 }]}>
              Поддержка ещё не ответила. Ответ придёт сюда и уведомлением.
            </Text>
          ) : null}
        </View>

        {failure ? <InlineError message={failure.message} /> : null}

        {ticket.messages.map((message) => {
          const fromSupport = message.authorType === 'admin';
          const author = messageAuthor(message);
          const time = formatTicketTime(message.createdAt, now);
          return (
            <View
              key={message.id}
              accessible
              accessibilityLabel={`${author}, ${time}: ${message.body}`}
              style={[
                styles.message,
                fromSupport
                  ? { backgroundColor: colors.glass, borderColor: colors.cyan }
                  : { backgroundColor: colors.bg2, borderColor: colors.glassBorder },
              ]}
            >
              <View style={styles.messageTop}>
                <Text style={[styles.author, { color: colors.text0 }]}>{author}</Text>
                <Text style={[styles.time, { color: colors.text1 }]}>{time}</Text>
              </View>
              <Text selectable style={[styles.body, { color: colors.text0 }]}>
                {message.body}
              </Text>
            </View>
          );
        })}

        {open ? (
          <View style={styles.replyBlock}>
            <TextInput
              value={reply}
              onChangeText={(next) => {
                setReply(next);
                setSendError(null);
              }}
              editable={!sending}
              multiline
              maxLength={SUPPORT_MESSAGE_MAX}
              textAlignVertical="top"
              placeholder="Ваше сообщение"
              placeholderTextColor={colors.text1}
              accessibilityLabel="Ответ в обращение"
              style={[styles.input, { color: colors.text0, backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}
            />
            {sendError ? <InlineError message={sendError} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: sending, disabled: sending || !reply.trim() }}
              disabled={sending || !reply.trim()}
              onPress={() => void send()}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: colors.magenta },
                sending || !reply.trim() ? styles.muted : pressedStyle(pressed),
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>Отправить</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.closed, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            Обращение закрыто. Если вопрос вернулся — напишите новое.
          </Text>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  card: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 14, gap: 6 },
  subject: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 23 },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  message: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 12, gap: 6 },
  messageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  author: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  time: { fontFamily: fonts.mono, fontSize: 12 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  replyBlock: { gap: 10, marginTop: 4 },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
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
  muted: { opacity: 0.5 },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  closed: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    overflow: 'hidden',
  },
});
