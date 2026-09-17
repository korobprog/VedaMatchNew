import type {
  ChatActiveCallState,
  ChatCallDto,
  ChatCallKind,
  ChatCallSignal,
  ChatIceServersState,
  EndChatCallRequest,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Клиент звонков — все маршруты `chat/calls/*`
 * (`apps/api/src/modules/chat/calls/chat-calls.controller.ts`), перенос
 * `apps/web/src/lib/chat-calls-client.ts` на общий `ApiClient` приложения:
 * тот ходит `Authorization: Bearer` вместо cookie и сам обновляет токен —
 * здесь не нужен свой разбор ошибок, `ApiError` уже даёт его `lib/api/client.ts`.
 *
 * Ответы второй стороны (принял, положил трубку, SDP и ICE) приходят не
 * отсюда, а через общий поток `chat-stream.tsx`.
 */
export function createChatCallsApi(api: ApiClient) {
  return {
    iceServers: () => api.request<ChatIceServersState>('/chat/calls/ice-servers'),

    /** История звонков человека — вкладка «Звонки». */
    history: () => api.request<ChatCallDto[]>('/chat/calls/history'),

    /** Звонок, в котором человек прямо сейчас — восстановление после перезапуска. */
    active: () => api.request<ChatActiveCallState>('/chat/calls/active'),

    start: (conversationId: string, kind: ChatCallKind) =>
      api.request<ChatCallDto>('/chat/calls', {
        method: 'POST',
        body: { conversationId, kind },
      }),

    accept: (callId: string) =>
      api.request<ChatCallDto>(`/chat/calls/${callId}/accept`, { method: 'POST' }),

    decline: (callId: string) =>
      api.request<ChatCallDto>(`/chat/calls/${callId}/decline`, { method: 'POST' }),

    end: (callId: string, body: EndChatCallRequest = {}) =>
      api.request<ChatCallDto>(`/chat/calls/${callId}/end`, { method: 'POST', body }),

    signal: (callId: string, signal: ChatCallSignal) =>
      api.request<void>(`/chat/calls/${callId}/signal`, {
        method: 'POST',
        body: { signal },
      }),
  };
}

export type ChatCallsApi = ReturnType<typeof createChatCallsApi>;
