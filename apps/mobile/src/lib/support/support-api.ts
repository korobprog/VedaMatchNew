import type {
  AddSupportMessageRequest,
  CreateSupportTicketRequest,
  CreateSupportTicketResponse,
  SupportTicketDto,
  SupportTicketListResponse,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Поддержка портала (VED-336) — те же ручки, что у сайта
 * (`apps/api/src/modules/support/support.controller.ts`), новых не заводилось.
 */
export function createSupportApi(api: ApiClient) {
  const listMine = () => api.request<SupportTicketListResponse>('/support/my/tickets');

  return {
    listMine,
    get: (id: string) => api.request<SupportTicketDto>(`/support/my/tickets/${encodeURIComponent(id)}`),
    reply: (id: string, body: string) =>
      api.request<SupportTicketDto>(`/support/my/tickets/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: { body } satisfies AddSupportMessageRequest,
      }),

    /**
     * Создать обращение и узнать его id.
     *
     * Два подвоха ручки создания, оба закрыты здесь, а не в экране:
     *
     * 1. Она под `OptionalAuthGuard`: просроченный токен там не даёт 401, а
     *    молча превращает человека в гостя — и сервер отвечает «оставьте
     *    email», хотя человек вошёл. Поэтому сначала идёт авторизованный
     *    `GET /support/my/tickets`: на просроченном токене он получит 401,
     *    клиент обновит токен, и создание уйдёт уже от имени человека.
     * 2. Ответ создания не содержит id — только номер. Id берётся из списка
     *    по номеру; не нашёлся (гонка, чужой аккаунт) — `null`, экран
     *    покажет список.
     */
    async create(request: CreateSupportTicketRequest): Promise<{ number: number; id: string | null }> {
      await listMine();
      const created = await api.request<CreateSupportTicketResponse>('/support/tickets', {
        method: 'POST',
        body: request,
      });
      try {
        const mine = await listMine();
        const found = mine.items.find((item) => item.number === created.number);
        return { number: created.number, id: found?.id ?? null };
      } catch {
        // Обращение уже создано — неудача второго чтения не повод говорить
        // «не отправлено» и толкать человека отправить его ещё раз.
        return { number: created.number, id: null };
      }
    },
  };
}

export type SupportApi = ReturnType<typeof createSupportApi>;
