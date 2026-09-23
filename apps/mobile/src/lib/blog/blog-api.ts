import type {
  BlogAuthorFeedResponse,
  BlogFeedResponse,
  BlogHomeFeedResponse,
  BlogPostCreatedResponse,
  BlogPostDto,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { buildUploadFormPart, type UploadFormPart, type UploadSource } from '@/lib/upload/upload-form-part';
import { blogDraftFields, type BlogDraft } from './blog-draft';

/**
 * Клиент сервиса «Блог-лента» (VED-334) — те же ручки, что у сайта
 * (`apps/web/src/lib/blog-client-api.ts`), нового серверного кода под
 * приложение нет: `AuthGuard` принимает `Authorization: Bearer` наравне с
 * cookie, а публикация с картинками — обычный multipart.
 */

export type BlogFeedScope = 'current' | 'all';

/** Часть формы из локального файла. Подменяется в тестах. */
export type BuildPart = (source: UploadSource) => Promise<UploadFormPart>;

/**
 * Тело публикации с фотографиями. Файлы — поле `files` (так их ждёт
 * `FilesInterceptor('files')`), заголовок уходит, только если он есть: пустая
 * строка в multipart — это «заголовок из пустой строки», а не «без
 * заголовка», и разбирать это пришлось бы серверу.
 *
 * Части — байты из `buildUploadFormPart`, не `{uri,name,type}`: вторую форму
 * `expo`-fetch отвергает («Unsupported FormDataPart implementation»), разбор
 * — в `lib/upload/upload-form-part.ts`. Путь отправки файла в приложении один.
 */
export function buildBlogPostForm(fields: { title: string | null; text: string }, parts: readonly UploadFormPart[]): FormData {
  const form = new FormData();
  if (fields.title !== null) form.append('title', fields.title);
  form.append('text', fields.text);
  for (const part of parts) form.append('files', part as unknown as Blob);
  return form;
}

export function createBlogApi(api: ApiClient, buildPart: BuildPart = buildUploadFormPart) {
  return {
    /** Начало текущей ленты и сколько в ней всего — для полосы в «Чатах». */
    home: () => api.request<BlogHomeFeedResponse>('/blog/home'),

    /** `all` — вся лента с архивом: её же открывает виджет главной на сайте. */
    feed: (scope: BlogFeedScope, cursor?: string | null) => {
      const query = new URLSearchParams({ scope });
      if (cursor) query.set('cursor', cursor);
      return api.request<BlogFeedResponse>(`/blog/feed?${query.toString()}`);
    },

    /** Личный блог участника (VED-116): все его посты без учёта срока. */
    author: (authorId: string, cursor?: string | null) => {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return api.request<BlogAuthorFeedResponse>(`/blog/authors/${encodeURIComponent(authorId)}${query}`);
    },

    post: (id: string) => api.request<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}`),

    /**
     * Публикация. Без фотографий — обычный JSON, с ними — multipart одним
     * запросом: отдельного шага «дослать файлы» у сервиса нет, иначе каждая
     * оборванная загрузка оставляла бы в ленте пустую карточку.
     */
    create: async (draft: BlogDraft): Promise<BlogPostCreatedResponse> => {
      const fields = blogDraftFields(draft);
      if (draft.photos.length === 0) {
        return api.request<BlogPostCreatedResponse>('/blog/posts', { method: 'POST', body: fields });
      }
      const parts: UploadFormPart[] = [];
      for (const photo of draft.photos) {
        parts.push(await buildPart({ uri: photo.uri, name: photo.name, type: photo.type }));
      }
      return api.request<BlogPostCreatedResponse>('/blog/posts', {
        method: 'POST',
        body: buildBlogPostForm(fields, parts),
      });
    },

    /** Репост без своих слов — как кнопка «Репост» на сайте. */
    repost: (id: string) =>
      api.request<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}/repost`, { method: 'POST', body: { text: '' } }),

    remove: (id: string) => api.request<void>(`/blog/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}

export type BlogApi = ReturnType<typeof createBlogApi>;
