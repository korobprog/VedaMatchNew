import { storageKeyOf } from './chat-uploads.service';

const PREFIX = 'https://s3.example/vedamatch/';

describe('storageKeyOf — что можно скопировать в пост канала', () => {
  it('картинка новости нашего бакета — её ключ', () => {
    expect(storageKeyOf(`${PREFIX}announcements/abc.webp`, PREFIX)).toBe(
      'announcements/abc.webp',
    );
  });

  it('чужой адрес — ничего: чужой сервер узнавал бы IP читателей канала', () => {
    expect(storageKeyOf('https://evil.example/a.webp', PREFIX)).toBeNull();
  });

  it('файл чужой переписки через пост не вытащить', () => {
    expect(storageKeyOf(`${PREFIX}chat/other/secret.webp`, PREFIX)).toBeNull();
  });

  it('обход папок и пустой ключ отвергаются', () => {
    expect(storageKeyOf(`${PREFIX}announcements/../chat/x`, PREFIX)).toBeNull();
    expect(storageKeyOf(PREFIX, PREFIX)).toBeNull();
    expect(storageKeyOf(`${PREFIX}%E0%A4%A`, PREFIX)).toBeNull();
  });

  it('запрос и якорь в адресе в ключ не попадают', () => {
    expect(storageKeyOf(`${PREFIX}announcements/a.webp?v=2#x`, PREFIX)).toBe(
      'announcements/a.webp',
    );
  });
});
