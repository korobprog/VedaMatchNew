import type { ContactsAshram, ContactsCardDto, ContactsFormat, ContactsRequestDto, SpiritualStage } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import type { ContactsDetailsValue } from '@/components/people/people-details';
import { PeopleDetails } from '@/components/people/people-details';
import { RetryButton } from '@/components/retry-button';
import { PersonCardSkeleton } from '@/components/skeleton';
import { PhotoVerifiedBadge, VerifiedBadge } from '@/components/verified-badge';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { confirmTap } from '@/lib/feedback';
import { createPeopleApi } from '@/lib/people/people-api';
import { CONTACTS_REQUEST_STATUS_LABELS, showRemainingToday } from '@/lib/people/people-requests-state';
import { visibleVerificationBadges } from '@/lib/people/verification';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Столько же, сколько принимает `people-requests.service.ts` на сервере. */
const CONTACTS_MAX_MESSAGE_LENGTH = 500;

const ASHRAM_LABELS: Record<ContactsAshram, string> = {
  brahmachari: 'Брахмачари',
  grihastha: 'Грихастха',
  vanaprastha: 'Ванапрастха',
  sannyasi: 'Санньяси',
};

const FORMAT_LABELS: Record<ContactsFormat, string | null> = {
  online: 'Онлайн',
  offline: 'Офлайн',
  any: null,
};

const STAGE_LABELS: Record<SpiritualStage, string> = {
  seeker: 'Ищущий',
  practitioner: 'Практикующий основы',
  yogi: 'Йог',
  devotee: 'Преданный',
};

/**
 * Подписанные пары «поле: значение», а не одна строка через точку — иначе
 * непонятно, что из «Брахмачари · Преданный · английский» ашрам, что этап, а
 * что язык (раунд оценки 004, дефект 10). Этап «Преданный» не повторяется,
 * если рядом уже стоит значок «Подтверждённый преданный» — это один и тот же
 * факт, а не два разных.
 */
function detailRows(card: ContactsCardDto): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (card.ashram) rows.push({ label: 'Ашрам', value: ASHRAM_LABELS[card.ashram] });
  if (FORMAT_LABELS[card.format]) rows.push({ label: 'Формат', value: FORMAT_LABELS[card.format]! });
  if (card.spiritualStage && !(card.isVerifiedDevotee && card.spiritualStage === 'devotee')) {
    rows.push({ label: 'Этап', value: STAGE_LABELS[card.spiritualStage] });
  }
  if (card.languages.length > 0) rows.push({ label: 'Языки', value: card.languages.join(', ') });
  return rows;
}

/**
 * Карточка человека из справочника «Люди» + форма запроса контакта. Своя
 * карточка (`userId === viewerId`) формы не показывает — запрос самому себе
 * сервер отбивает, а предлагать форму нечестно (тот же приём, что на сайте,
 * `people-request-button.tsx`).
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, user } = useSession();
  const peopleApi = useMemo(() => createPeopleApi(api), [api]);
  const chatApi = useMemo(() => createChatApi(api), [api]);

  const [card, setCard] = useState<ContactsCardDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<ContactsRequestDto | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  // Пока не пришёл ответ `requests()`, неизвестно, есть ли уже исходящий
  // запрос на этого человека — форма/блок статуса не показываются, чтобы не
  // мигнуть активной кнопкой, которая сервер тут же отобьёт 400 (раунд
  // оценки 004, дефект 7).
  const [hintLoading, setHintLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    try {
      const result = await peopleApi.card(userId);
      setCard(result);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось открыть карточку');
    }
  }, [peopleApi, userId]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  useEffect(() => {
    let alive = true;
    peopleApi
      .requests()
      .then((state) => {
        if (!alive) return;
        setOutgoing(state.outgoing.find((request) => request.user.userId === userId) ?? null);
        setRemainingToday(state.remainingToday);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setHintLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [peopleApi, userId]);

  const send = useCallback(async () => {
    if (sending) return;
    confirmTap();
    setSending(true);
    setSendError(null);
    try {
      const state = await peopleApi.createRequest({ toUserId: userId, message: message.trim() || null });
      setOutgoing(state.outgoing.find((request) => request.user.userId === userId) ?? null);
      setRemainingToday(state.remainingToday);
      setMessage('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Не удалось отправить запрос');
    } finally {
      setSending(false);
    }
  }, [sending, peopleApi, userId, message]);

  const write = useCallback(async () => {
    if (writeBusy) return;
    confirmTap();
    setWriteBusy(true);
    setWriteError(null);
    try {
      const conversation = await chatApi.createDirect(userId);
      router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Не удалось открыть переписку');
    } finally {
      setWriteBusy(false);
    }
  }, [writeBusy, chatApi, userId]);

  const isSelf = user?.id === userId;
  const left = CONTACTS_MAX_MESSAGE_LENGTH - message.length;
  const limitReached = remainingToday === 0;
  // Способы связи открывает действующее раскрытие — оно приходит либо прямо
  // в карточке (её владелец уже открыл контакты именно мне), либо в исходящем
  // запросе. Раньше это читалось только по статусу «принят», и сами контакты
  // не показывались вовсе (раунд оценки 004, дефект 4).
  const contacts: ContactsDetailsValue | null = card?.contacts ?? outgoing?.contacts ?? null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: card?.name ?? 'Люди',
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
          headerShadowVisible: false,
        }}
      />

      {!card && loadError ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={[styles.centerText, { color: colors.text1 }]}>
            {loadError}
          </Text>
          <RetryButton onPress={() => void loadCard()} />
        </View>
      ) : !card ? (
        <PersonCardSkeleton />
      ) : (
        // `bottomOffset` держит под фокусом не только сам инпут, но и то, что
        // сразу под ним (подсказка + кнопка «Отправить запрос»): без него
        // прокрутка поднимала поле ровно по верх клавиатуры, а кнопка ниже
        // оставалась частично перекрыта до ручной докрутки (раунд оценки
        // 005, дефект 3).
        <KeyboardAwareScrollView
          bottomOffset={160}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
              <ChatAvatar id={card.userId} name={card.name} uri={card.avatarUrl} size={72} />
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: colors.text0 }]}>{card.name}</Text>
                {card.headline ?? card.statusLine ? (
                  <Text style={[styles.headline, { color: colors.text1 }]}>{card.headline ?? card.statusLine}</Text>
                ) : null}
                {[card.city, card.country].filter(Boolean).join(', ') ? (
                  <Text style={[styles.headline, { color: colors.text1 }]}>{[card.city, card.country].filter(Boolean).join(', ')}</Text>
                ) : null}
              </View>
            </View>

            {visibleVerificationBadges(card).length > 0 ? (
              <View style={styles.badges}>
                {card.isVerifiedDevotee ? <VerifiedBadge variant="inline" /> : null}
                {card.isPhotoVerified ? <PhotoVerifiedBadge variant="inline" /> : null}
              </View>
            ) : null}

            {detailRows(card).length > 0 ? (
              <View style={styles.detailRows}>
                {detailRows(card).map((row) => (
                  <Text key={row.label} style={[styles.detail, { color: colors.text1 }]}>
                    <Text style={[styles.detailLabel, { color: colors.text1 }]}>{row.label}: </Text>
                    {row.value}
                  </Text>
                ))}
              </View>
            ) : null}

            {card.about ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
                  О себе
                </Text>
                <Text selectable style={[styles.sectionText, { color: colors.text1 }]}>
                  {card.about}
                </Text>
              </View>
            ) : null}

            {card.offers ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
                  Чем может помочь
                </Text>
                <Text selectable style={[styles.sectionText, { color: colors.text1 }]}>
                  {card.offers}
                </Text>
              </View>
            ) : null}

            {card.tags.length > 0 ? (
              <View style={styles.tags}>
                {card.tags.map((tag) => (
                  <View key={tag.id} style={[styles.tag, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
                    <Text style={[styles.tagText, { color: colors.text1 }]}>{tag.nameRu}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {isSelf ? (
              <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
                  Это ваша карточка
                </Text>
                <Text style={[styles.cardText, { color: colors.text1 }]}>Так вас видят другие участники справочника.</Text>
              </View>
            ) : hintLoading ? (
              // Пока не пришёл ответ requests() — ни формы, ни блока статуса:
              // им сначала нужно знать, есть ли уже исходящий запрос.
              <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <View style={styles.hintLoadingRow}>
                  <ActivityIndicator color={colors.text1} />
                  <Text style={[styles.cardText, { color: colors.text1 }]}>Проверяем, отправляли ли вы запрос…</Text>
                </View>
              </View>
            ) : contacts ? (
              <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
                  {CONTACTS_REQUEST_STATUS_LABELS.accepted}
                </Text>
                <PeopleDetails contacts={contacts} />
                {writeError ? <InlineError message={writeError} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Написать ${card.name}`}
                  accessibilityState={{ busy: writeBusy, disabled: writeBusy }}
                  disabled={writeBusy}
                  onPress={() => void write()}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.primary, { backgroundColor: colors.magenta, borderColor: colors.magenta }, writeBusy ? styles.busy : pressedStyle(pressed)]}
                >
                  {writeBusy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>Написать</Text>}
                </Pressable>
              </View>
            ) : outgoing?.status === 'pending' ? (
              <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
                  Запрос отправлен, ждём ответа
                </Text>
                <Text style={[styles.cardText, { color: colors.text1 }]}>Человек сам решает, открывать ли контакты. Отозвать запрос можно на вкладке «Запросы».</Text>
              </View>
            ) : (
              <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
                  Запросить контакт
                </Text>
                <Text style={[styles.cardText, { color: colors.text1 }]}>
                  Способы связи откроются, только если человек согласится. Коротко напишите, зачем вы обращаетесь.
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  maxLength={CONTACTS_MAX_MESSAGE_LENGTH}
                  multiline
                  editable={!limitReached && !sending}
                  placeholder="Например: ищу повара на программу в Москве 20 сентября"
                  placeholderTextColor={colors.text1}
                  accessibilityLabel="Сообщение к запросу контакта"
                  style={[styles.messageInput, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
                />
                <Text style={[styles.hint, { color: colors.text1 }]}>Необязательно. Осталось символов: {left}</Text>

                {limitReached ? <Text style={[styles.hint, { color: colors.text1 }]}>Лимит запросов на сегодня исчерпан. Попробуйте завтра.</Text> : null}

                {sendError ? <InlineError message={sendError} /> : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить запрос контакта"
                  accessibilityState={{ busy: sending, disabled: sending || limitReached }}
                  disabled={sending || limitReached}
                  onPress={() => void send()}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [
                    styles.primary,
                    { backgroundColor: colors.magenta, borderColor: colors.magenta },
                    sending || limitReached ? styles.busy : pressedStyle(pressed),
                  ]}
                >
                  {sending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>Отправить запрос</Text>}
                </Pressable>

                {remainingToday !== null && !limitReached && showRemainingToday(remainingToday) ? (
                  <Text style={[styles.hint, { color: colors.text1 }]}>Сегодня можно отправить ещё {remainingToday}.</Text>
                ) : null}
              </View>
            )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.displayBold, fontSize: 20 },
  headline: { fontFamily: fonts.body, fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailRows: { gap: 2 },
  detail: { fontFamily: fonts.body, fontSize: 13 },
  detailLabel: { fontFamily: fonts.bodySemiBold },
  section: { gap: 4 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  sectionText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: fonts.body, fontSize: 12 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 10 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  cardText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  hintLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  messageInput: { minHeight: 80, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.body, fontSize: 14, textAlignVertical: 'top' },
  hint: { fontFamily: fonts.body, fontSize: 12 },
  primary: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, alignSelf: 'flex-start', overflow: 'hidden' },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  busy: { opacity: 0.6 },
});
