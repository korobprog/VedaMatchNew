import type {
  ChatChannelCommunity,
  ChatUserSummary,
  CreateChatConversationRequest,
} from '@vedamatch/shared';

/**
 * Черновик новой групповой беседы или канала — та же форма, что на сайте
 * (`apps/web/src/components/chat/chat-new-conversation.tsx`), но вся счётная
 * часть вынесена сюда: экран только рисует.
 *
 * Ограничения повторяют сервер (`chat-conversations.service.ts`):
 * название режется до 80 символов в `updateConversation`, описание — до 300.
 * Правим их здесь до отправки, а не надеемся на молчаливое обрезание.
 */
export const CHAT_GROUP_TITLE_MAX_LENGTH = 80;
export const CHAT_GROUP_DESCRIPTION_MAX_LENGTH = 300;

export type GroupDraftMode = 'group' | 'channel';

export interface GroupDraft {
  mode: GroupDraftMode;
  title: string;
  description: string;
  /** Пустая строка — личная группа без общины (у канала так нельзя). */
  communityId: string;
  memberIds: string[];
}

export function emptyGroupDraft(): GroupDraft {
  return { mode: 'group', title: '', description: '', communityId: '', memberIds: [] };
}

/** Тап по человеку в списке: был отмечен — снимаем, не был — добавляем в конец. */
export function toggleMember(selected: readonly string[], userId: string): string[] {
  return selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId];
}

/**
 * Что не так с черновиком: текст для пользователя или `null`. Формулировки —
 * ровно те же, что отдаёт сервер, чтобы человек не увидел два разных текста
 * про одну и ту же ошибку.
 */
export function validateGroupDraft(draft: GroupDraft): string | null {
  if (!draft.title.trim()) {
    return draft.mode === 'channel' ? 'У канала должно быть название' : 'У группы должно быть название';
  }
  if (draft.mode === 'channel' && !draft.communityId) return 'Выберите общину';
  return null;
}

export function canSubmitGroupDraft(draft: GroupDraft, busy: boolean): boolean {
  return !busy && validateGroupDraft(draft) === null;
}

export function buildCreateRequest(draft: GroupDraft): CreateChatConversationRequest {
  const title = draft.title.trim().slice(0, CHAT_GROUP_TITLE_MAX_LENGTH);
  if (draft.mode === 'channel') {
    const description = draft.description.trim().slice(0, CHAT_GROUP_DESCRIPTION_MAX_LENGTH);
    return {
      kind: 'channel',
      title,
      communityId: draft.communityId,
      ...(description ? { description } : {}),
    };
  }
  return {
    kind: 'group',
    title,
    memberIds: draft.memberIds,
    ...(draft.communityId ? { communityId: draft.communityId } : {}),
  };
}

export interface CommunityOption {
  id: string;
  name: string;
  /** Община не `active`: беседу в ней завести можно, но её нигде не будет видно. */
  active: boolean;
}

/**
 * Общины, где смотрящий вправе завести беседу. Сервер уже отдаёт только те,
 * где он владелец или администратор (`GET /chat/channel-communities`), —
 * здесь остаётся разложить их в плоский список и сохранить признак `active`:
 * молчаливая пропажа беседы хуже честного предупреждения в форме.
 */
export function communityOptions(communities: readonly ChatChannelCommunity[]): CommunityOption[] {
  return communities.map((item) => ({
    id: item.community.id,
    name: item.community.name,
    active: item.community.status === 'active',
  }));
}

/** Канал заводится только в живой общине — в неактивной его никто не найдёт. */
export function defaultChannelCommunityId(communities: readonly ChatChannelCommunity[]): string {
  return communityOptions(communities).find((option) => option.active)?.id ?? '';
}

/** Канал можно заводить, только если есть хоть одна подходящая община. */
export function canCreateChannel(communities: readonly ChatChannelCommunity[]): boolean {
  return communities.length > 0;
}

/**
 * Предупреждение «здесь уже есть канал» — второй такой же обычно заводят по
 * невнимательности. `null`, когда община не выбрана или каналов в ней нет.
 */
export function existingChannelsHint(
  communities: readonly ChatChannelCommunity[],
  communityId: string,
): string | null {
  if (!communityId) return null;
  const found = communities.find((item) => item.community.id === communityId);
  if (!found || found.channels.length === 0) return null;
  const titles = found.channels.map((channel) => `«${channel.title}»`).join(', ');
  return `В этой общине уже есть канал: ${titles}. Второй такой же обычно не нужен.`;
}

/** Предупреждение о неактивной общине — показывается рядом с выбором. */
export function inactiveCommunityHint(
  communities: readonly ChatChannelCommunity[],
  communityId: string,
): string | null {
  if (!communityId) return null;
  const option = communityOptions(communities).find((item) => item.id === communityId);
  if (!option || option.active) return null;
  return 'Община не активна — беседы в ней не видны, пока её не подтвердит администрация портала.';
}

/** Поиск по списку людей: без учёта регистра, пустой запрос — весь список. */
export function filterPeople(people: readonly ChatUserSummary[], query: string): ChatUserSummary[] {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return [...people];
  return people.filter((person) => person.name.toLocaleLowerCase('ru').includes(needle));
}
