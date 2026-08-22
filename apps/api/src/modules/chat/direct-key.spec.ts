import { directCompanionId, directKey } from './direct-key';

describe('directKey', () => {
  it('не зависит от порядка аргументов', () => {
    expect(directKey('b', 'a')).toBe(directKey('a', 'b'));
  });

  it('ставит меньший id первым', () => {
    expect(directKey('b', 'a')).toBe('a:b');
  });

  it('запрещает диалог с самим собой', () => {
    expect(() => directKey('a', 'a')).toThrow();
  });
});

describe('directCompanionId', () => {
  it('возвращает второго участника', () => {
    expect(directCompanionId('a:b', 'a')).toBe('b');
    expect(directCompanionId('a:b', 'b')).toBe('a');
  });

  it('возвращает null для постороннего', () => {
    expect(directCompanionId('a:b', 'c')).toBeNull();
  });

  it('возвращает null на испорченном ключе', () => {
    expect(directCompanionId('a', 'a')).toBeNull();
  });
});
