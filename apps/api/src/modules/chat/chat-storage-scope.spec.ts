import {
  conversationKeyPrefix,
  momentKeyPrefix,
} from './chat-storage-scope';

describe('пути файлов «Общения»', () => {
  it('папка беседы содержит её идентификатор', () => {
    expect(conversationKeyPrefix('abc')).toBe('chat/abc/');
  });

  it('папка моментов содержит автора', () => {
    expect(momentKeyPrefix('u1')).toBe('chat/moments/u1/');
  });

  it('папка моментов не совпадает с папкой беседы: id беседы — uuid', () => {
    // Совпадение было бы возможно у беседы с идентификатором `moments`;
    // uuid таким не бывает, и проверка ниже это фиксирует.
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(conversationKeyPrefix(uuid)).not.toBe('chat/moments/');
    expect(momentKeyPrefix(uuid).startsWith('chat/moments/')).toBe(true);
  });

  it('чужая папка моментов не является началом своей', () => {
    expect(momentKeyPrefix('u1').startsWith(momentKeyPrefix('u2'))).toBe(false);
  });
});
