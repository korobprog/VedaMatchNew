import type { ChatIceServersState } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Клиент звонков — пока только `GET /chat/calls/ice-servers` для экрана
 * «Проверка связи» (этап 0, VED-218). Остальные маршруты (`chat/calls`,
 * `/accept`, `/decline`, `/signal`, `/end`, `/history`) переносятся на
 * этапе 1 вместе с `call-machine.ts`, по образцу
 * `apps/web/src/lib/chat-calls-client.ts`.
 */
export function createChatCallsApi(api: ApiClient) {
  return {
    iceServers: () => api.request<ChatIceServersState>('/chat/calls/ice-servers'),
  };
}

export type ChatCallsApi = ReturnType<typeof createChatCallsApi>;
