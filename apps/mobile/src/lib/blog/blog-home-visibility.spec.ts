import * as SecureStore from 'expo-secure-store';
import {
  BLOG_HOME_DEFAULT_VISIBLE,
  blogHomeKey,
  parseBlogHomeVisible,
  readBlogHomeVisible,
  serializeBlogHomeVisible,
  writeBlogHomeVisible,
} from './blog-home-visibility';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => undefined),
}));

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  getItem.mockReset();
  setItem.mockClear();
});

describe('полоса ленты в «Чатах»: показывать ли', () => {
  it('по умолчанию показана — карточка просит ленту на первом экране', async () => {
    expect(BLOG_HOME_DEFAULT_VISIBLE).toBe(true);
    getItem.mockResolvedValue(null);
    await expect(readBlogHomeVisible('u1')).resolves.toBe(true);
  });

  it('скрыл — скрыто, вернул — показано', async () => {
    getItem.mockResolvedValue('hidden');
    await expect(readBlogHomeVisible('u1')).resolves.toBe(false);
    getItem.mockResolvedValue('shown');
    await expect(readBlogHomeVisible('u1')).resolves.toBe(true);
  });

  it('выбор у каждого вошедшего свой — ключ несёт id человека', async () => {
    await writeBlogHomeVisible('u1', false);
    await writeBlogHomeVisible('u2', true);
    expect(setItem.mock.calls).toEqual([
      ['vm.blogHome.u1', 'hidden'],
      ['vm.blogHome.u2', 'shown'],
    ]);
    getItem.mockResolvedValue(null);
    await readBlogHomeVisible('u3');
    expect(getItem).toHaveBeenCalledWith('vm.blogHome.u3');
  });

  it('недопустимые для SecureStore знаки в id заменяются, а не роняют запись', () => {
    expect(blogHomeKey('a:b/c@d')).toBe('vm.blogHome.a_b_c_d');
  });

  it('хранилище не прочиталось — ленту показываем, а не прячем навсегда', async () => {
    getItem.mockRejectedValue(new Error('keystore'));
    await expect(readBlogHomeVisible('u1')).resolves.toBe(true);
  });

  it('мусор в значении — «выбора не было»', () => {
    expect(parseBlogHomeVisible('maybe')).toBeNull();
    expect(parseBlogHomeVisible(undefined)).toBeNull();
    expect(parseBlogHomeVisible(serializeBlogHomeVisible(false))).toBe(false);
    expect(parseBlogHomeVisible(serializeBlogHomeVisible(true))).toBe(true);
  });
});
