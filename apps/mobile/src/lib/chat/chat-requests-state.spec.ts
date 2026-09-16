import type { ChatRequestSummary } from '@vedamatch/shared';
import { requestPreview, startsHidden, withoutHandled, withoutRequest } from './chat-requests-state';

function request(id: string, overrides: Partial<ChatRequestSummary> = {}): ChatRequestSummary {
  return {
    conversation: { id } as ChatRequestSummary['conversation'],
    from: { id: `u-${id}`, name: 'Гопал' },
    message: { body: 'Харе Кришна' } as ChatRequestSummary['message'],
    createdAt: '2026-09-15T10:00:00.000Z',
    lowTrust: false,
    ...overrides,
  };
}

describe('withoutRequest', () => {
  it('убирает только карточку этой беседы', () => {
    const list = [request('a'), request('b'), request('c')];
    expect(withoutRequest(list, 'b').map((r) => r.conversation.id)).toEqual(['a', 'c']);
  });

  it('неизвестный id ничего не меняет', () => {
    const list = [request('a')];
    expect(withoutRequest(list, 'zzz')).toEqual(list);
  });
});

describe('requestPreview', () => {
  it('текст первого сообщения', () => {
    expect(requestPreview(request('a'))).toBe('Харе Кришна');
  });

  it('вложение без подписи и пустой запрос', () => {
    expect(requestPreview(request('a', { message: { body: '  ' } as ChatRequestSummary['message'] }))).toBe('Вложение');
    expect(requestPreview(request('a', { message: null }))).toBeNull();
  });
});

describe('startsHidden', () => {
  it('свёрнут только запрос с низким доверием', () => {
    expect(startsHidden(request('a', { lowTrust: true }))).toBe(true);
    expect(startsHidden(request('a'))).toBe(false);
  });
});

describe('withoutHandled', () => {
  it('не возвращает разобранные карточки из запоздавшего ответа', () => {
    const list = [request('a'), request('b')];
    expect(withoutHandled(list, new Set(['a'])).map((r) => r.conversation.id)).toEqual(['b']);
  });

  it('без разобранных отдаёт тот же массив', () => {
    const list = [request('a')];
    expect(withoutHandled(list, new Set())).toBe(list);
  });
});
