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

  it('без записи об одобрении не решает за человека', () => {
    expect(isAutonomousApproval({ ...base, lastApprovalAction: null })).toBe(
      false,
    );
    expect(
      isAutonomousApproval({ ...base, lastApprovalAction: undefined }),
    ).toBe(false);
  });
});
