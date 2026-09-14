// API-клиент сервиса «Общение». См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  ChatOfficialChannelStats,
  AdminChatCallsState,
  AdminChatConversationsState,
  AdminChatReportsState,
  AdminChatStats,
  ChatColorTemplatesState,
  ChatConversationDetail,
  ChatConversationThemeState,
  ChatListState,
  ChatChannelCommunitiesState,
  ChatDiscoverState,
  ChatFavoriteEmojisDto,
  ChatMapState,
  ChatPublicMapState,
  ChatRequestsState,
  ChatUnreadState,
  ChatUserSummary,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к чату с access_token из cookie. null — не авторизован. */
async function chatGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function getChatList(): Promise<ChatListState | null> {
  return chatGet<ChatListState>("/chat/conversations");
}

/** Непрочитанное во всём сервисе — для значка на плитке главной. */
export function getChatUnread(): Promise<ChatUnreadState | null> {
  return chatGet<ChatUnreadState>("/chat/unread");
}

/** Карта общин: точки и число их открытых бесед. */
export function getChatMap(): Promise<ChatMapState | null> {
  return chatGet<ChatMapState>("/chat/map");
}

/**
 * Та же карта для публичной страницы сервиса: без cookie, потому что гость
 * запрашивает её до входа. Городов в ответе нет — см. ChatPublicMapState.
 */
export async function getChatPublicMap(): Promise<ChatPublicMapState | null> {
  const res = await fetch(`${API_URL}/chat/public-map`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ChatPublicMapState;
}

/** Каталог открытых бесед — витрина общин. */
export function getChatDiscover(
  query?: string,
  communityId?: string,
): Promise<ChatDiscoverState | null> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (communityId) params.set("communityId", communityId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return chatGet<ChatDiscoverState>(`/chat/discover${suffix}`);
}

export function getChatRequests(): Promise<ChatRequestsState | null> {
  return chatGet<ChatRequestsState>("/chat/requests");
}

/** С кем можно собрать группу: собеседники личных диалогов. */
export function getChatPeople(): Promise<{ people: ChatUserSummary[] } | null> {
  return chatGet<{ people: ChatUserSummary[] }>("/chat/people");
}

/** Общины, где можно завести канал: пусто — заводить негде. */
export function getChatChannelCommunities(): Promise<ChatChannelCommunitiesState | null> {
  return chatGet<ChatChannelCommunitiesState>("/chat/channel-communities");
}

export function getChatConversation(
  id: string,
): Promise<ChatConversationDetail | null> {
  return chatGet<ChatConversationDetail>(
    `/chat/conversations/${encodeURIComponent(id)}`,
  );
}

export function getAdminChatReports(
  status?: string,
): Promise<AdminChatReportsState | null> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return chatGet<AdminChatReportsState>(`/admin/chat/reports${query}`);
}

export function getAdminChatConversations(
  query?: string,
): Promise<AdminChatConversationsState | null> {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return chatGet<AdminChatConversationsState>(
    `/admin/chat/conversations${suffix}`,
  );
}

export function getAdminChatStats(): Promise<AdminChatStats | null> {
  return chatGet<AdminChatStats>("/admin/chat/stats");
}

/** Раздел админки «Звонки»: тумблер, сводка за период и последние звонки. */
export function getAdminChatCalls(): Promise<AdminChatCallsState | null> {
  return chatGet<AdminChatCallsState>("/admin/chat/calls");
}

/** Раздел админки «Смайлики»: набор «Избранных» по умолчанию (VED-123). */
export function getAdminChatEmoji(): Promise<ChatFavoriteEmojisDto | null> {
  return chatGet<ChatFavoriteEmojisDto>("/admin/chat/emoji");
}

/** Сводка официального канала VedaMatch для админки. */
export function getAdminOfficialChannel(): Promise<ChatOfficialChannelStats | null> {
  return chatGet<ChatOfficialChannelStats>("/admin/chat/official");
}

/** Шаблоны цвета — для серверного рендера страницы /chat/appearance. */
export function getChatColorTemplates(): Promise<ChatColorTemplatesState | null> {
  return chatGet<ChatColorTemplatesState>("/chat/color-templates");
}

export function getChatConversationTheme(
  conversationId: string,
): Promise<ChatConversationThemeState | null> {
  return chatGet<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
  );
}
