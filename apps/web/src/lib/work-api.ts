// API-клиент сервиса «Работа». См. docs/service-module-contract.md.
// Запросы идут из браузера: авторизация — той же cookie, что и у остальных
// сервисов, поэтому здесь только знание эндпоинтов, без работы с токенами.
import type {
  CreateWorkBoardRequest,
  CreateWorkChecklistItemRequest,
  CreateWorkColumnRequest,
  CreateWorkCommentRequest,
  CreateWorkInviteRequest,
  CreateWorkLabelRequest,
  CreateWorkSpaceRequest,
  CreateWorkTaskRequest,
  MoveWorkTaskRequest,
  UpdateWorkChecklistItemRequest,
  UpdateWorkColumnRequest,
  UpdateWorkSpaceRequest,
  UpdateWorkTaskRequest,
  WorkAgendaDto,
  WorkArchiveDto,
  WorkArchiveView,
  WorkBoardDto,
  WorkContactsDto,
  WorkInviteDto,
  WorkInvitePreviewDto,
  WorkLabelDto,
  WorkSpaceDto,
  WorkSpaceSummaryDto,
  WorkTaskDto,
  WorkTaskSearchResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class WorkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    // Бэкенд присылает готовый русский текст ошибки — он точнее кода статуса.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message[0] : body.message,
      )
      .catch(() => undefined);
    throw new WorkApiError(
      message ?? "Не получилось. Попробуйте ещё раз",
      res.status,
    );
  }
  // 204 у отзыва приглашения и выхода из среды: тела нет.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ===== Рабочие среды =====

export const listWorkSpaces = () =>
  request<WorkSpaceSummaryDto[]>("/work/spaces");

export const getWorkSpace = (spaceId: string) =>
  request<WorkSpaceDto>(`/work/spaces/${spaceId}`);

export const createWorkSpace = (body: CreateWorkSpaceRequest) =>
  send<WorkSpaceDto>("/work/spaces", "POST", body);

export const ensurePersonalWorkSpace = () =>
  send<WorkSpaceSummaryDto>("/work/spaces/personal", "POST");

export const updateWorkSpace = (
  spaceId: string,
  body: UpdateWorkSpaceRequest,
) => send<WorkSpaceDto>(`/work/spaces/${spaceId}`, "PATCH", body);

export const deleteWorkSpace = (spaceId: string) =>
  send<void>(`/work/spaces/${spaceId}`, "DELETE");

export const leaveWorkSpace = (spaceId: string, userId: string) =>
  send<void>(`/work/spaces/${spaceId}/members/${userId}`, "DELETE");

// ===== Приглашения =====

export const listWorkContacts = (spaceId: string, query?: string) =>
  request<WorkContactsDto>(
    `/work/spaces/${spaceId}/contacts${query ? `?query=${encodeURIComponent(query)}` : ""}`,
  );

export const listWorkInvites = (spaceId: string) =>
  request<WorkInviteDto[]>(`/work/spaces/${spaceId}/invites`);

export const createWorkInvite = (
  spaceId: string,
  body: CreateWorkInviteRequest = {},
) => send<WorkInviteDto>(`/work/spaces/${spaceId}/invites`, "POST", body);

export const revokeWorkInvite = (inviteId: string) =>
  send<void>(`/work/invites/${inviteId}`, "DELETE");

export const previewWorkInvite = (token: string) =>
  request<WorkInvitePreviewDto>(`/work/join/${token}`);

export const acceptWorkInvite = (token: string) =>
  send<{ spaceId: string }>(`/work/join/${token}`, "POST");

// ===== Доски, колонки, метки =====

export const getWorkBoard = (boardId: string) =>
  request<WorkBoardDto>(`/work/boards/${boardId}`);

/** Какие задачи доски подходят под запрос (VED-76). */
export const searchWorkBoardTasks = (boardId: string, query: string) =>
  request<WorkTaskSearchResponse>(
    `/work/boards/${boardId}/search?q=${encodeURIComponent(query)}`,
  );

export const createWorkBoard = (
  spaceId: string,
  body: CreateWorkBoardRequest,
) => send<WorkBoardDto>(`/work/spaces/${spaceId}/boards`, "POST", body);

export const createWorkColumn = (
  boardId: string,
  body: CreateWorkColumnRequest,
) => send<WorkBoardDto>(`/work/boards/${boardId}/columns`, "POST", body);

export const updateWorkColumn = (
  columnId: string,
  body: UpdateWorkColumnRequest,
) => send<WorkBoardDto>(`/work/columns/${columnId}`, "PATCH", body);

export const deleteWorkColumn = (columnId: string) =>
  send<WorkBoardDto>(`/work/columns/${columnId}`, "DELETE");

export const createWorkLabel = (
  spaceId: string,
  body: CreateWorkLabelRequest,
) => send<WorkLabelDto>(`/work/spaces/${spaceId}/labels`, "POST", body);

// ===== Задачи =====

export const createWorkTask = (boardId: string, body: CreateWorkTaskRequest) =>
  send<WorkTaskDto>(`/work/boards/${boardId}/tasks`, "POST", body);

export const getWorkTask = (taskId: string) =>
  request<WorkTaskDto>(`/work/tasks/${taskId}`);

export const updateWorkTask = (taskId: string, body: UpdateWorkTaskRequest) =>
  send<WorkTaskDto>(`/work/tasks/${taskId}`, "PATCH", body);

export const moveWorkTask = (taskId: string, body: MoveWorkTaskRequest) =>
  send<WorkTaskDto>(`/work/tasks/${taskId}/move`, "POST", body);

export const archiveWorkTask = (taskId: string) =>
  send<void>(`/work/tasks/${taskId}`, "DELETE");

/** Архив доски (VED-61): выполненные или убранные карточки. */
export const getWorkBoardArchive = (boardId: string, view: WorkArchiveView) =>
  request<WorkArchiveDto>(`/work/boards/${boardId}/archive?view=${view}`);

/** Вернуть карточку из архива на её колонку. */
export const restoreWorkTask = (taskId: string) =>
  send<WorkTaskDto>(`/work/tasks/${taskId}/restore`, "POST");

/** Стереть карточку насовсем (VED-6): архив её уже не вернёт. */
export const deleteWorkTaskForever = (taskId: string) =>
  send<void>(`/work/tasks/${taskId}/forever`, "DELETE");

export const commentWorkTask = (
  taskId: string,
  body: CreateWorkCommentRequest,
) => send<WorkTaskDto>(`/work/tasks/${taskId}/comments`, "POST", body);

export const addWorkChecklistItem = (
  taskId: string,
  body: CreateWorkChecklistItemRequest,
) => send<WorkTaskDto>(`/work/tasks/${taskId}/checklist`, "POST", body);

export const updateWorkChecklistItem = (
  itemId: string,
  body: UpdateWorkChecklistItemRequest,
) => send<WorkTaskDto>(`/work/checklist/${itemId}`, "PATCH", body);

export const removeWorkChecklistItem = (itemId: string) =>
  send<WorkTaskDto>(`/work/checklist/${itemId}`, "DELETE");

/**
 * Вложение уезжает формой, а не JSON: `Content-Type` браузер ставит сам
 * вместе с границей multipart, и задать его руками — верный способ получить
 * на сервере пустой файл.
 */
export const attachWorkFile = (taskId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<WorkTaskDto>(`/work/tasks/${taskId}/attachments`, {
    method: "POST",
    body: form,
  });
};

export const removeWorkAttachment = (attachmentId: string) =>
  send<WorkTaskDto>(`/work/attachments/${attachmentId}`, "DELETE");

export const getWorkAgenda = () => request<WorkAgendaDto>("/work/agenda");
