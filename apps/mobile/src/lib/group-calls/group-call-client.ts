import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatGroupCallSignalsResponse,
  ChatGroupCallState,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Клиент групповых звонков — маршруты `chat/group-calls/*`
 * (`apps/api/src/modules/chat/calls/group/chat-group-calls.controller.ts`).
 *
 * ICE-серверов здесь нет намеренно: TURN общий со звонком один на один,
 * учётки берутся тем же `GET /chat/calls/ice-servers` через
 * `chat-calls-client.ts`.
 */
export function createGroupCallsApi(api: ApiClient) {
  return {
    /** Идёт ли звонок в беседе; без `conversationId` — где мы сами сейчас. */
    active: (conversationId?: string) =>
      api.request<ChatGroupCallState>(
        conversationId
          ? `/chat/group-calls/active?conversationId=${encodeURIComponent(conversationId)}`
          : '/chat/group-calls/active',
      ),

    /** Начать или войти в идущий — на сервере это одна операция. */
    start: (conversationId: string) =>
      api.request<ChatGroupCallDto>('/chat/group-calls', {
        method: 'POST',
        body: { conversationId, kind: 'audio' },
      }),

    join: (callId: string) =>
      api.request<ChatGroupCallDto>(`/chat/group-calls/${callId}/join`, {
        method: 'POST',
      }),

    leave: (callId: string) =>
      api.request<ChatGroupCallDto>(`/chat/group-calls/${callId}/leave`, {
        method: 'POST',
      }),

    setMuted: (callId: string, muted: boolean) =>
      api.request<ChatGroupCallDto>(`/chat/group-calls/${callId}/state`, {
        method: 'POST',
        body: { muted },
      }),

    /**
     * Попросить место под камеру. Именно попросить: мест в комнате три, а
     * участников четыре, и включение может вернуть 409 с текстом отказа —
     * решает сервер (`group-call-video.ts`). В теле только `video`: запрос
     * меняет то, что в нём пришло, и микрофон трогать не должен.
     */
    setVideo: (callId: string, video: boolean) =>
      api.request<ChatGroupCallDto>(`/chat/group-calls/${callId}/state`, {
        method: 'POST',
        body: { video },
      }),

    /** «Я ещё здесь» — и заодно свежий состав комнаты. */
    heartbeat: (callId: string) =>
      api.request<ChatGroupCallDto>(`/chat/group-calls/${callId}/heartbeat`, {
        method: 'POST',
      }),

    signal: (
      callId: string,
      toUserId: string,
      signal: ChatCallSignal,
      clientSignalId?: string,
    ) =>
      api.request<void>(`/chat/group-calls/${callId}/signal`, {
        method: 'POST',
        body: { toUserId, signal, clientSignalId },
      }),

    signals: (callId: string, after: number) =>
      api.request<ChatGroupCallSignalsResponse>(
        `/chat/group-calls/${callId}/signals?after=${after}`,
      ),
  };
}

export type GroupCallsApi = ReturnType<typeof createGroupCallsApi>;
