import { isAutonomousApproval } from './autonomous-approval';

const base = {
  origin: 'user',
  moderationMode: 'autonomous',
  lastApprovalAction: 'ai_approve',
};

describe('isAutonomousApproval', () => {
  it('пропускает пользовательский пост, одобренный ИИ в автономном режиме', () => {
    expect(isAutonomousApproval(base)).toBe(true);
  });

  it('оставляет человеку редакционные посты', () => {
    expect(isAutonomousApproval({ ...base, origin: 'editorial' })).toBe(false);
    expect(isAutonomousApproval({ ...base, origin: null })).toBe(false);
  });

  it.each(['assist', 'off'])('в режиме «%s» ждёт администратора', (mode) => {
    expect(isAutonomousApproval({ ...base, moderationMode: mode })).toBe(false);
  });

  it('если текст одобрил человек, он остаётся в цепочке и дальше', () => {
    // Иначе получилось бы странно: администратор вмешался на тексте, а
    // следующий этап проехал мимо него.
    expect(
      isAutonomousApproval({ ...base, lastApprovalAction: 'approve_text' }),
    ).toBe(false);
  });

  it('пост администратора публикуется без второго одобрения', () => {
    // Ради этого правило и расширяли: администратор не должен отправлять
    // афоризм на одобрение самому себе.
    expect(
      isAutonomousApproval({
        origin: 'user',
        moderationMode: 'assist',
        lastApprovalAction: 'approve_text',
        authorIsAdmin: true,
      }),
    ).toBe(true);
  });

  it('права автора сильнее выключенной модерации и редакционного origin', () => {
    // Админ пишет руками из админки: origin там редакционный, режим может быть
    // любым — человек в цепочке уже был.
    expect(
      isAutonomousApproval({
        origin: 'editorial',
        moderationMode: 'off',
        lastApprovalAction: null,
        authorIsAdmin: true,
      }),
    ).toBe(true);
  });

  it('без прав администратора признак ничего не меняет', () => {
    expect(isAutonomousApproval({ ...base, authorIsAdmin: false })).toBe(true);
    expect(
      isAutonomousApproval({
        ...base,
        moderationMode: 'assist',
        authorIsAdmin: false,
      }),
    ).toBe(false);
  });

  it('без записи об одобрении не решает за человека', () => {
    expect(isAutonomousApproval({ ...base, lastApprovalAction: null })).toBe(
      false,
    );
    expect(
      isAutonomousApproval({ ...base, lastApprovalAction: undefined }),
    ).toBe(false);
  });
});
