import type { ChatChannelCommunity, ChatUserSummary } from '@vedamatch/shared';
import { Stack, router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonPickRow } from '@/components/chat/person-pick-row';
import { InlineError } from '@/components/inline-error';
import { ChatKeyboardAvoidingView as KeyboardAvoidingView } from '@/components/keyboard-controller-web';
import { OptionChips, type ChipOption } from '@/components/option-chips';
import { RetryButton } from '@/components/retry-button';
import { ChatListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import {
  buildCreateRequest,
  canCreateChannel,
  CHAT_GROUP_DESCRIPTION_MAX_LENGTH,
  CHAT_GROUP_TITLE_MAX_LENGTH,
  communityOptions,
  defaultChannelCommunityId,
  emptyGroupDraft,
  existingChannelsHint,
  filterPeople,
  findNameCollision,
  inactiveCommunityNote,
  nameCollisionText,
  shouldCheckNameCollision,
  toggleMember,
  validateGroupDraft,
  type GroupDraft,
  type GroupDraftMode,
} from '@/lib/chat/group-draft';
import { createCommunitiesApi } from '@/lib/communities/communities-api';
import { withPlural } from '@/lib/chat/plural';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

const keyOf = (person: ChatUserSummary) => person.id;

/** Пауза перед запросом к справочнику общин — как у геокодера на форме общины. */
const NAME_CHECK_DEBOUNCE_MS = 350;

const MODE_OPTIONS: ChipOption<GroupDraftMode>[] = [
  { value: 'group', label: 'Группа' },
  { value: 'channel', label: 'Канал' },
];

/**
 * Новая групповая беседа или канал общины — то же, что форма
 * `/chat/new` на сайте (`chat-new-conversation.tsx`): название, община,
 * участники. Новых ручек на сервере не заводилось, все три запроса —
 * существующие `GET /chat/people`, `GET /chat/channel-communities`,
 * `POST /chat/conversations`.
 *
 * Счётная часть целиком в `lib/chat/group-draft.ts` — здесь только разметка
 * и состояния загрузки, ошибки и пустого списка.
 */
export default function NewConversationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { api } = useSession();
  const chatApi = useMemo(() => createChatApi(api), [api]);
  // Общины — портальная инфраструктура, а не чужой сервис: справочник
  // одинаково нужен и Чату, и вкладке «Общины».
  const communitiesApi = useMemo(() => createCommunitiesApi(api), [api]);

  const [people, setPeople] = useState<ChatUserSummary[] | null>(null);
  const [communities, setCommunities] = useState<ChatChannelCommunity[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Название группы совпало с чужой общиной, а община не выбрана: человек
  // мог принять текст за привязку. Предупреждаем заранее, а не молчим, пока
  // группа не потеряется без следа, — так уже случалось (см. сайт).
  const [nameCollision, setNameCollision] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // Оба списка нужны сразу: без общин не показать вкладку «Канал».
      const [peopleState, communitiesState] = await Promise.all([chatApi.people(), chatApi.channelCommunities()]);
      setPeople(peopleState.people);
      setCommunities(communitiesState.communities);
    } catch (e) {
      setLoadError(screenErrorText('app/chat/new', e, 'Не удалось загрузить список'));
    }
  }, [chatApi]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ждём, пока человек допишет название, и отменяем предыдущий запрос:
  // ответ на «Мин» не должен прийти после ответа на «Минская ятра».
  // Зависимости — три поля черновика, а не он сам: иначе отметка участника
  // перезапускала бы поиск по справочнику.
  const { mode, title: draftTitle, communityId } = draft;
  useEffect(() => {
    if (!shouldCheckNameCollision({ mode, title: draftTitle, communityId, description: '', memberIds: [] })) {
      setNameCollision(null);
      return;
    }
    const name = draftTitle.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      communitiesApi
        .search({ q: name, pageSize: 5 }, controller.signal)
        .then((found) => setNameCollision(findNameCollision(found.items, name)))
        // Справочник недоступен — молчим: это подсказка, а не проверка.
        .catch(() => setNameCollision(null));
    }, NAME_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, draftTitle, communityId, communitiesApi]);

  const setMode = useCallback(
    (mode: GroupDraftMode) => {
      setSubmitError(null);
      setDraft((current) => ({
        ...current,
        mode,
        // У канала община обязательна — подставляем первую живую, чтобы
        // человек не упёрся в «Выберите общину» на пустом месте.
        communityId: mode === 'channel' ? defaultChannelCommunityId(communities ?? []) : current.communityId,
      }));
    },
    [communities],
  );

  const onToggleMember = useCallback((userId: string) => {
    setDraft((current) => ({ ...current, memberIds: toggleMember(current.memberIds, userId) }));
  }, []);

  const submit = useCallback(async () => {
    const problem = validateGroupDraft(draft);
    if (problem) {
      setSubmitError(problem);
      return;
    }
    confirmTap();
    setBusy(true);
    setSubmitError(null);
    try {
      const conversation = await chatApi.create(buildCreateRequest(draft));
      // `replace`, а не `push`: назад из новой беседы — в список, а не в
      // форму, где можно случайно завести вторую такую же.
      router.replace({ pathname: '/chat/[id]', params: { id: conversation.id } });
    } catch (e) {
      setSubmitError(screenErrorText('app/chat/new', e, 'Беседа не создалась'));
      setBusy(false);
    }
  }, [chatApi, draft]);

  const visiblePeople = useMemo(() => (people ? filterPeople(people, query) : []), [people, query]);
  const options = useMemo(() => communityOptions(communities ?? []), [communities]);
  const communityChips = useMemo<ChipOption<string>[]>(() => {
    const list: ChipOption<string>[] = options.map((option) => ({
      value: option.id,
      // Неактивную общину выбрать нельзя — как `disabled` у `<option>` на
      // сайте: беседа в ней нигде не покажется, и молча заводить её незачем.
      label: option.active ? option.name : `${option.name} — не активна, беседы в ней не видны`,
      disabled: !option.active,
    }));
    return draft.mode === 'channel' ? list : [{ value: '', label: 'Без общины' }, ...list];
  }, [options, draft.mode]);

  const inactiveNote = inactiveCommunityNote(communities ?? []);
  const channelsHint = draft.mode === 'channel' ? existingChannelsHint(communities ?? [], draft.communityId) : null;
  const titleLeft = CHAT_GROUP_TITLE_MAX_LENGTH - draft.title.length;

  const screenHeader = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Новая беседа',
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );

  if (!people || !communities) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {screenHeader}
        {loadError ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.centerText, { color: colors.text1 }]}>
              {loadError}
            </Text>
            <RetryButton onPress={() => void load()} />
          </View>
        ) : (
          <ChatListSkeleton />
        )}
      </View>
    );
  }

  const form = (
    <View style={styles.form}>
      {canCreateChannel(communities) ? (
        <>
          <OptionChips label="Что заводим" options={MODE_OPTIONS} value={draft.mode} onChange={setMode} disabled={busy} />
          <Text style={[styles.hint, { color: colors.text1 }]}>
            {draft.mode === 'channel'
              ? 'Канал общины: пишет администрация, остальные читают.'
              : 'Группа: переписка на всех, кого вы позовёте.'}
          </Text>
        </>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text1 }]}>Название</Text>
        <TextInput
          value={draft.title}
          onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
          maxLength={CHAT_GROUP_TITLE_MAX_LENGTH}
          editable={!busy}
          placeholder={draft.mode === 'channel' ? 'Объявления Минской ятры' : 'Севаки на воскресную программу'}
          placeholderTextColor={colors.text1}
          accessibilityLabel="Название беседы"
          style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
        />
        <Text style={[styles.hint, { color: colors.text1 }]}>Осталось символов: {titleLeft}</Text>
        {nameCollision ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.notice, { color: colors.text0, borderColor: colors.gold, backgroundColor: colors.bg1 }]}
          >
            {nameCollisionText(nameCollision)}
          </Text>
        ) : null}
      </View>

      {communityChips.length > (draft.mode === 'channel' ? 0 : 1) ? (
        <View style={styles.field}>
          <OptionChips
            label={draft.mode === 'channel' ? 'Община канала' : 'Община'}
            options={communityChips}
            value={draft.communityId}
            onChange={(communityId) => setDraft((current) => ({ ...current, communityId }))}
            disabled={busy}
          />
          {inactiveNote ? <Text style={[styles.hint, { color: colors.text1 }]}>{inactiveNote}</Text> : null}
          {channelsHint ? <Text style={[styles.hint, { color: colors.text1 }]}>{channelsHint}</Text> : null}
        </View>
      ) : null}

      {draft.mode === 'channel' ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>О чём канал</Text>
          <TextInput
            value={draft.description}
            onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
            maxLength={CHAT_GROUP_DESCRIPTION_MAX_LENGTH}
            editable={!busy}
            multiline
            placeholder="Необязательно"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Описание канала"
            style={[styles.textarea, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>
      ) : (
        <View style={styles.field}>
          <Text accessibilityRole="header" style={[styles.label, { color: colors.text1 }]}>
            Участники
          </Text>
          <Text style={[styles.hint, { color: colors.text1 }]}>
            Позвать можно тех, с кем уже есть личная переписка. Отмечено: {withPlural(draft.memberIds.length, 'человек', 'человека', 'человек')}.
          </Text>
          {people.length > 4 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              editable={!busy}
              placeholder="Поиск по имени"
              placeholderTextColor={colors.text1}
              accessibilityLabel="Поиск по имени"
              style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
            />
          ) : null}
        </View>
      )}
    </View>
  );

  const renderItem: ListRenderItem<ChatUserSummary> = ({ item }) => (
    <PersonPickRow
      person={item}
      selected={draft.memberIds.includes(item.id)}
      onToggle={onToggleMember}
      disabled={busy}
    />
  );

  const emptyPeople = (
    <Text style={[styles.empty, { color: colors.text1 }]}>
      {people.length === 0
        ? 'Звать некого: приглашаются те, с кем уже есть личная переписка. Группу можно завести и пустой, а позвать позже.'
        : 'Никто не найден по этому имени.'}
    </Text>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {screenHeader}
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={headerHeight - insets.bottom}>
        <FlatList
          data={draft.mode === 'channel' ? [] : visiblePeople}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListHeaderComponent={form}
          ListEmptyComponent={draft.mode === 'channel' ? null : emptyPeople}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
        />
        <View style={[styles.footer, { borderTopColor: colors.glassBorder, backgroundColor: colors.bg0, paddingBottom: insets.bottom + 12 }]}>
          {submitError ? <InlineError message={submitError} /> : null}
          {/* Кнопка не гаснет от незаполненных полей — как на сайте: иначе
              человек жмёт погашенную кнопку и не понимает, чего не хватает,
              а текст отказа из `validateGroupDraft` не появляется никогда. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={draft.mode === 'channel' ? 'Завести канал' : 'Завести группу'}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void submit()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta, borderColor: colors.magenta },
              busy ? styles.busy : pressedStyle(pressed),
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                {draft.mode === 'channel' ? 'Завести канал' : 'Завести группу'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingBottom: 16 },
  form: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textarea: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  // Предупреждение, а не ошибка: обводка `gold` как знак «обрати внимание»,
  // сам текст — `text0` на `bg1`, уже проверенная пара (обводка —
  // декоративный элемент, её порог 3:1, а не 4.5:1, как у текста).
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, paddingHorizontal: 20, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  primary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  busy: { opacity: 0.6 },
});
