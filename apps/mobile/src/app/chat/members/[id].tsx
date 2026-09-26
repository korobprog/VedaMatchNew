import type { ChatConversationDetail, ChatConversationVisibility, ChatMemberDto, ChatMemberRole, ChatUserSummary } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemberRow } from '@/components/chat/member-row';
import { PersonPickRow } from '@/components/chat/person-pick-row';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InlineError } from '@/components/inline-error';
import { ChatKeyboardAvoidingView as KeyboardAvoidingView } from '@/components/keyboard-controller-web';
import { OptionChips, type ChipOption } from '@/components/option-chips';
import { RetryButton } from '@/components/retry-button';
import { ChatListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import {
  CHAT_GROUP_DESCRIPTION_MAX_LENGTH,
  CHAT_GROUP_TITLE_MAX_LENGTH,
  filterPeople,
} from '@/lib/chat/group-draft';
import {
  canDeleteConversation,
  canEditConversation,
  canInvite,
  canRemoveMember,
  canSetRole,
  inviteCandidates,
  leaveLabel,
} from '@/lib/chat/member-rights';
import {
  describeMemberAction,
  memberIdsOf,
  sortMembers,
  withoutMember,
  withRole,
  type PendingMemberAction,
} from '@/lib/chat/members-state';
import { withPlural } from '@/lib/chat/plural';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

const VISIBILITY_OPTIONS: ChipOption<ChatConversationVisibility>[] = [
  { value: 'private', label: 'По приглашению' },
  { value: 'public', label: 'Открыто для всех' },
];

const keyOf = (member: ChatMemberDto) => member.user.id;

/**
 * Участники группы или канала: кто внутри, кого позвать, кому раздать права
 * и как называется беседа — то же, что экран `/chat/[id]/members` на сайте
 * (`chat-members-view.tsx`). Ручки существующие, новых не заводилось.
 *
 * Обложку беседы здесь не меняют: загрузка картинки осталась за рамками
 * VED-292, см. «Что осталось» в описании PR.
 */
export default function ConversationMembersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { api, user } = useSession();
  const chatApi = useMemo(() => createChatApi(api), [api]);
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [members, setMembers] = useState<ChatMemberDto[]>([]);
  const [people, setPeople] = useState<ChatUserSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ChatConversationVisibility>('private');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMemberAction | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const conversation = await chatApi.detail(conversationId);
      setDetail(conversation);
      setMembers(sortMembers(conversation.members));
      setTitle(conversation.title);
      setDescription(conversation.description ?? '');
      setVisibility(conversation.visibility);
      // Список «кого позвать» нужен только тем, кто вправе звать: лишний
      // запрос рядовому участнику ни к чему.
      if (canInvite(conversation.kind, conversation.myRole)) {
        const peopleState = await chatApi.people();
        setPeople(peopleState.people);
      }
    } catch (e) {
      setLoadError(screenErrorText('app/chat/members/[id]', e, 'Не удалось загрузить участников'));
    }
  }, [chatApi, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!detail) return;
    if (!title.trim()) {
      setFormError('Название не может быть пустым');
      return;
    }
    confirmTap();
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      const updated = await chatApi.updateConversation(detail.id, {
        title: title.trim().slice(0, CHAT_GROUP_TITLE_MAX_LENGTH),
        description: description.trim().slice(0, CHAT_GROUP_DESCRIPTION_MAX_LENGTH),
        visibility,
      });
      setDetail({ ...detail, title: updated.title, visibility: updated.visibility });
      setSaved(true);
    } catch (e) {
      setFormError(screenErrorText('app/chat/members/[id]', e, 'Не получилось сохранить'));
    } finally {
      setSaving(false);
    }
  }, [chatApi, detail, title, description, visibility]);

  const invite = useCallback(
    async (userId: string) => {
      if (!detail || busyId) return;
      confirmTap();
      setBusyId(userId);
      setActionError(null);
      try {
        await chatApi.addMembers(detail.id, [userId]);
        const invited = people.find((person) => person.id === userId);
        if (invited) {
          setMembers((current) =>
            sortMembers([...current, { user: invited, role: 'member', joinedAt: new Date().toISOString() }]),
          );
        }
      } catch (e) {
        setActionError(screenErrorText('app/chat/members/[id]', e, 'Не получилось позвать'));
      } finally {
        setBusyId(null);
      }
    },
    [chatApi, detail, people, busyId],
  );

  const setRole = useCallback(
    async (userId: string, role: Exclude<ChatMemberRole, 'owner'>) => {
      if (!detail || busyId) return;
      confirmTap();
      setBusyId(userId);
      setActionError(null);
      try {
        await chatApi.setMemberRole(detail.id, userId, role);
        setMembers((current) => sortMembers(withRole(current, userId, role)));
      } catch (e) {
        setActionError(screenErrorText('app/chat/members/[id]', e, 'Не получилось сменить права'));
      } finally {
        setBusyId(null);
      }
    },
    [chatApi, detail, busyId],
  );

  const runPending = useCallback(async () => {
    if (!detail || !pending) return;
    setPendingBusy(true);
    setActionError(null);
    try {
      if (pending.kind === 'remove') {
        await chatApi.removeMember(detail.id, pending.userId);
        setMembers((current) => withoutMember(current, pending.userId));
      } else if (pending.kind === 'leave') {
        await chatApi.leave(detail.id);
        router.dismissAll();
        router.replace('/(tabs)');
      } else {
        await chatApi.removeConversation(detail.id);
        router.dismissAll();
        router.replace('/(tabs)');
      }
      setPending(null);
    } catch (e) {
      setActionError(screenErrorText('app/chat/members/[id]', e, 'Не получилось'));
      setPending(null);
    } finally {
      setPendingBusy(false);
    }
  }, [chatApi, detail, pending]);

  const onRemovePress = useCallback((userId: string, name: string) => {
    setPending({ kind: 'remove', userId, name });
  }, []);

  const screenHeader = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Участники',
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );

  if (!detail) {
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

  const myId = user?.id ?? '';
  const editable = canEditConversation(detail.kind, detail.myRole);
  const mayInvite = canInvite(detail.kind, detail.myRole);
  const mayDelete = canDeleteConversation(detail.kind, detail.myRole);
  const candidates = filterPeople(inviteCandidates(people, memberIdsOf(members)), query);

  const header = (
    <View style={styles.block}>
      {editable ? (
        <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text0 }]}>
            {detail.kind === 'channel' ? 'О канале' : 'О группе'}
          </Text>
          <TextInput
            value={title}
            onChangeText={(next) => {
              setTitle(next);
              setSaved(false);
            }}
            maxLength={CHAT_GROUP_TITLE_MAX_LENGTH}
            editable={!saving}
            accessibilityLabel="Название беседы"
            placeholder="Название"
            placeholderTextColor={colors.text1}
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
          <TextInput
            value={description}
            onChangeText={(next) => {
              setDescription(next);
              setSaved(false);
            }}
            maxLength={CHAT_GROUP_DESCRIPTION_MAX_LENGTH}
            editable={!saving}
            multiline
            accessibilityLabel="Описание беседы"
            placeholder="Описание (необязательно)"
            placeholderTextColor={colors.text1}
            style={[styles.textarea, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
          <OptionChips
            label="Кто может войти"
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={(next) => {
              setVisibility(next);
              setSaved(false);
            }}
            disabled={saving}
          />
          {formError ? <InlineError message={formError} /> : null}
          {saved ? (
            <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.text1 }]}>
              Сохранено.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сохранить"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={() => void save()}
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
              <Text style={[styles.primaryText, { color: colors.onAccent }]}>Сохранить</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {actionError ? (
        <View style={styles.inset}>
          <InlineError message={actionError} />
        </View>
      ) : null}

      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
        {withPlural(members.length, 'участник', 'участника', 'участников')}
      </Text>
    </View>
  );

  const renderMember: ListRenderItem<ChatMemberDto> = ({ item }) => (
    <MemberRow
      member={item}
      isMe={item.user.id === myId}
      canSetRole={canSetRole(detail.myRole, item.role)}
      canRemove={canRemoveMember({
        kind: detail.kind,
        myRole: detail.myRole,
        targetRole: item.role,
        isMe: item.user.id === myId,
      })}
      busy={busyId === item.user.id}
      onSetRole={(userId, role) => void setRole(userId, role)}
      onRemove={onRemovePress}
    />
  );

  const footer = (
    <View style={styles.block}>
      {mayInvite ? (
        <View style={styles.inviteBlock}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
            Позвать
          </Text>
          {people.length > 4 ? (
            <View style={styles.inset}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск по имени"
                placeholderTextColor={colors.text1}
                accessibilityLabel="Поиск по имени"
                style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
              />
            </View>
          ) : null}
          {candidates.length === 0 ? (
            <Text style={[styles.empty, { color: colors.text1 }]}>
              {people.length === 0
                ? 'Звать некого: приглашаются те, с кем уже есть личная переписка.'
                : 'Все, с кем есть переписка, уже здесь.'}
            </Text>
          ) : (
            candidates.map((person) => (
              <PersonPickRow
                key={person.id}
                person={person}
                selected={false}
                busy={busyId === person.id}
                disabled={busyId !== null && busyId !== person.id}
                onToggle={(userId) => void invite(userId)}
              />
            ))
          )}
        </View>
      ) : null}

      <View style={[styles.inset, styles.danger]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={leaveLabel(detail.kind)}
          onPress={() => setPending({ kind: 'leave' })}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.secondary, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.secondaryText, { color: colors.text0 }]}>{leaveLabel(detail.kind)}</Text>
        </Pressable>
        {mayDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Удалить беседу"
            onPress={() => setPending({ kind: 'delete' })}
            android_ripple={ripple(colors.magenta)}
            style={({ pressed }) => [styles.secondary, { borderColor: colors.magenta }, pressedStyle(pressed)]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>Удалить беседу</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const confirmText = pending ? describeMemberAction(pending, detail.kind) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {screenHeader}
      {/* Список участников — и есть область прокрутки экрана: форма сверху
          и приглашение снизу идут его шапкой и подвалом. Вкладывать список
          в ScrollView нельзя — две области прокрутки дерутся за жест, а
          виртуализация в этом случае отключается вовсе. */}
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={headerHeight - insets.bottom}>
        <FlatList
          data={members}
          keyExtractor={keyOf}
          renderItem={renderMember}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      </KeyboardAvoidingView>
      {confirmText ? (
        <ConfirmDialog
          visible
          title={confirmText.title}
          message={confirmText.message}
          confirmLabel={confirmText.confirmLabel}
          destructive
          busy={pendingBusy}
          onConfirm={() => void runPending()}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { gap: 12, paddingTop: 16 },
  inset: { paddingHorizontal: 20 },
  card: { marginHorizontal: 20, borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 12 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
  },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textarea: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, paddingHorizontal: 20 },
  inviteBlock: { gap: 8 },
  danger: { gap: 10, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
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
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  busy: { opacity: 0.6 },
});
