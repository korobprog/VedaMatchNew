import { ChatWelcomeListener } from './chat-welcome.listener';

function build(
  options: {
    greeter?: { id: string } | null;
    newcomer?: { name: string; spiritualName: string | null } | null;
  } = {},
) {
  const {
    greeter = { id: 'admin-1' },
    newcomer = { name: 'Мадхава', spiritualName: null },
  } = options;
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(greeter),
      findUnique: jest.fn().mockResolvedValue(newcomer),
    },
  };
  const conversations = {
    create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
  };
  const messages = { send: jest.fn().mockResolvedValue({}) };
  const listener = new ChatWelcomeListener(
    prisma as never,
    conversations as never,
    messages as never,
  );
  return { listener, prisma, conversations, messages };
}

/** Слушатель отвечает синхронно, письмо уходит следом — даём промисам дойти. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ChatWelcomeListener', () => {
  it('пишет новичку от имени администрации и обращается по имени', async () => {
    const { listener, conversations, messages } = build();

    listener.onUserRegistered({ userId: 'user-1' });
    await settle();

    // Диалог заводит администратор: тогда он и стоит у него в списке бесед,
    // а по правилам чата открывается сразу активным, без запроса.
    expect(conversations.create).toHaveBeenCalledWith('admin-1', {
      kind: 'direct',
      userId: 'user-1',
    });
    const [author, conversationId, dto, , options] = messages.send.mock
      .calls[0] as [
      string,
      string,
      { body: string },
      unknown,
      { silent: boolean },
    ];
    expect(author).toBe('admin-1');
    expect(conversationId).toBe('conv-1');
    expect(dto.body).toContain('Мадхава, добро пожаловать');
    // Колокольчик уже сказал «Добро пожаловать»: второй раз не звоним.
    expect(options.silent).toBe(true);
  });

  it('показывает духовное имя, если оно есть', async () => {
    const { listener, messages } = build({
      newcomer: { name: 'Максим', spiritualName: 'Маму Тхакур дас' },
    });

    listener.onUserRegistered({ userId: 'user-1' });
    await settle();

    expect((messages.send.mock.calls[0][2] as { body: string }).body).toContain(
      'Маму Тхакур дас, добро пожаловать',
    );
  });

  it('молчит, когда администратора в портале ещё нет', async () => {
    const { listener, conversations, messages } = build({ greeter: null });

    listener.onUserRegistered({ userId: 'user-1' });
    await settle();

    expect(conversations.create).not.toHaveBeenCalled();
    expect(messages.send).not.toHaveBeenCalled();
  });

  // Первым участником портала бывает сам администратор: себе он не пишет.
  it('не пишет сам себе', async () => {
    const { listener, conversations } = build({ greeter: { id: 'user-1' } });

    listener.onUserRegistered({ userId: 'user-1' });
    await settle();

    expect(conversations.create).not.toHaveBeenCalled();
  });

  it('человека уже нет — письма нет', async () => {
    const { listener, conversations } = build({ newcomer: null });

    listener.onUserRegistered({ userId: 'user-1' });
    await settle();

    expect(conversations.create).not.toHaveBeenCalled();
  });

  // Блокировка, лимит, отказ чата — приветствие не должно рвать регистрацию.
  it('отказ чата не выпускает ошибку наружу', async () => {
    const { listener, conversations } = build();
    conversations.create.mockRejectedValue(new Error('нельзя'));

    expect(() => listener.onUserRegistered({ userId: 'user-1' })).not.toThrow();
    await settle();
  });
});
