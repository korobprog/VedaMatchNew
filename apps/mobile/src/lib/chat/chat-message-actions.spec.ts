import type { ChatMessageDto } from '@vedamatch/shared';
import { messageActionFlags } from './chat-message-actions';

const MY_ID = 'me';

function baseMessage(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'm1',
    conversationId: 'c1',
    author: { id: MY_ID, name: 'Я' },
    body: 'Текст',
    attachments: [],
    reactions: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('messageActionFlags', () => {
  it('своё текстовое сообщение — доступны все действия', () => {
    expect(messageActionFlags(baseMessage(), MY_ID)).toEqual({ reply: true, copy: true, edit: true, delete: true });
  });

  it('чужое текстовое сообщение — без изменить/удалить', () => {
    const message = baseMessage({ author: { id: 'other', name: 'Другой' } });
    expect(messageActionFlags(message, MY_ID)).toEqual({ reply: true, copy: true, edit: false, delete: false });
  });

  it('своё сообщение только с вложением — без копировать/изменить', () => {
    const message = baseMessage({ body: '' });
    expect(messageActionFlags(message, MY_ID)).toEqual({ reply: true, copy: false, edit: false, delete: true });
  });

  it('удалённое сообщение — ни одного действия', () => {
    const message = baseMessage({ deletedAt: new Date().toISOString() });
    expect(messageActionFlags(message, MY_ID)).toEqual({ reply: false, copy: false, edit: false, delete: false });
  });

  it('отправляющееся (pending) своё сообщение — без ответить', () => {
    const message = baseMessage({ id: 'pending:1' });
    expect(messageActionFlags(message, MY_ID).reply).toBe(false);
  });
});
