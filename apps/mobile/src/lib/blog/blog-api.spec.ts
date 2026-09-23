import type { ApiClient, RequestOptions } from '@/lib/api/client';
import type { UploadFormPart, UploadSource } from '@/lib/upload/upload-form-part';
import { buildBlogPostForm, createBlogApi } from './blog-api';
import { EMPTY_BLOG_DRAFT, type BlogPhoto } from './blog-draft';

jest.mock('expo-file-system', () => ({ __esModule: true, File: class {} }));

function fakeApi() {
  const request = jest.fn(async (_path: string, _options?: RequestOptions) => ({}));
  return { client: { request } as unknown as ApiClient, request };
}

/**
 * Глобальный `FormData` под jest — не тот класс, что на телефоне: здесь он
 * из Node и превращает объект части в строку «[object Object]», а `_parts`
 * у него нет вовсе (то же замечание — в `voice-upload-part.spec.ts`).
 * Поэтому на время теста — запоминающая подмена: проверяем, ЧТО и в каком
 * порядке кладётся в форму, а не как её потом сериализует fetch.
 */
class RecordingFormData {
  readonly parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}

const realFormData = global.FormData;
beforeAll(() => {
  global.FormData = RecordingFormData as unknown as typeof FormData;
});
afterAll(() => {
  global.FormData = realFormData;
});

/** Части формы в порядке добавления — `[имя поля, значение]`. */
function entries(form: FormData): [string, unknown][] {
  return (form as unknown as RecordingFormData).parts;
}

function photo(key: string, type = 'image/jpeg'): BlogPhoto {
  return { key, uri: `file:///cache/${key}`, name: `${key}.jpg`, type, sizeBytes: 10 };
}

function fakePart(source: UploadSource): UploadFormPart {
  return { name: source.name, type: source.type, bytes: async () => new Uint8Array([1, 2, 3]) };
}

describe('чтение ленты', () => {
  it('вся лента — scope=all, без курсора в первой порции', async () => {
    const { client, request } = fakeApi();
    await createBlogApi(client).feed('all');
    expect(request).toHaveBeenCalledWith('/blog/feed?scope=all');
  });

  it('следующая порция несёт курсор как есть, закодированным', async () => {
    const { client, request } = fakeApi();
    await createBlogApi(client).feed('all', 'eyJwIjpmYWxzZX0=+/');
    const [path] = request.mock.calls[0];
    expect(new URLSearchParams(path.split('?')[1]).get('cursor')).toBe('eyJwIjpmYWxzZX0=+/');
  });

  it('полоса «Чатов», пост и блог автора — свои ручки', async () => {
    const { client, request } = fakeApi();
    const api = createBlogApi(client);
    await api.home();
    await api.post('p/1');
    await api.author('u 1');
    await api.author('u1', 'c=1');
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/blog/home',
      '/blog/posts/p%2F1',
      '/blog/authors/u%201',
      '/blog/authors/u1?cursor=c%3D1',
    ]);
  });
});

describe('публикация', () => {
  it('без фотографий — обычный JSON с уже нормализованными полями', async () => {
    const { client, request } = fakeApi();
    const buildPart = jest.fn(async (source: UploadSource) => fakePart(source));
    await createBlogApi(client, buildPart).create({ ...EMPTY_BLOG_DRAFT, title: '  ', text: ' Слова ' });
    expect(request).toHaveBeenCalledWith('/blog/posts', { method: 'POST', body: { title: null, text: 'Слова' } });
    expect(buildPart).not.toHaveBeenCalled();
  });

  it('с фотографиями — multipart: части собраны общим путём отправки файла, в порядке черновика', async () => {
    const { client, request } = fakeApi();
    const buildPart = jest.fn(async (source: UploadSource) => fakePart(source));
    await createBlogApi(client, buildPart).create({
      title: 'Киртан',
      text: 'Приходите',
      photos: [photo('a'), photo('b', 'image/png')],
    });

    // В строитель части уходит ровно `{uri,name,type}` фотографии — без
    // служебного ключа и размера.
    expect(buildPart.mock.calls.map(([source]) => source)).toEqual([
      { uri: 'file:///cache/a', name: 'a.jpg', type: 'image/jpeg' },
      { uri: 'file:///cache/b', name: 'b.jpg', type: 'image/png' },
    ]);

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/blog/posts');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(RecordingFormData);
    const fields = entries(options?.body as FormData);
    expect(fields.map(([name]) => name)).toEqual(['title', 'text', 'files', 'files']);
    expect(fields[0][1]).toBe('Киртан');
    expect(fields[1][1]).toBe('Приходите');
  });

  it('файл уходит байтами, а не `{uri,name,type}` — ту форму expo-fetch отвергает', async () => {
    const { client, request } = fakeApi();
    const buildPart = jest.fn(async (source: UploadSource) => fakePart(source));
    await createBlogApi(client, buildPart).create({ ...EMPTY_BLOG_DRAFT, photos: [photo('a')] });
    const files = entries(request.mock.calls[0][1]?.body as FormData).filter(([name]) => name === 'files');
    expect(files).toHaveLength(1);
    const part = files[0][1] as Record<string, unknown>;
    expect(typeof part.bytes).toBe('function');
    expect(part).not.toHaveProperty('uri');
  });

  it('пустой заголовок в форму не попадает: пустая строка — не «без заголовка»', () => {
    const form = buildBlogPostForm({ title: null, text: '' }, [fakePart({ uri: 'x', name: 'a.jpg', type: 'image/jpeg' })]);
    expect(entries(form).map(([name]) => name)).toEqual(['text', 'files']);
  });

  it('не прочитался файл — запрос не уходит, ошибка наверх', async () => {
    const { client, request } = fakeApi();
    const buildPart = jest.fn(async () => {
      throw new Error('file missing');
    });
    await expect(createBlogApi(client, buildPart).create({ ...EMPTY_BLOG_DRAFT, photos: [photo('a')] })).rejects.toThrow(
      'file missing',
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe('действия с постом', () => {
  it('репост — POST без своих слов, удаление — DELETE', async () => {
    const { client, request } = fakeApi();
    const api = createBlogApi(client);
    await api.repost('p1');
    await api.remove('p1');
    expect(request.mock.calls).toEqual([
      ['/blog/posts/p1/repost', { method: 'POST', body: { text: '' } }],
      ['/blog/posts/p1', { method: 'DELETE' }],
    ]);
  });
});
