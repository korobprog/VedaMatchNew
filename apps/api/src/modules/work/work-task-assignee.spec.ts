import { resolveWorkAssignee } from './work-task-assignee';

describe('resolveWorkAssignee (VED-320)', () => {
  it('выбранный исполнитель остаётся', () => {
    expect(resolveWorkAssignee('u-2', 'u-1')).toBe('u-2');
  });

  it('пустой исполнитель — это составивший задачу', () => {
    expect(resolveWorkAssignee(undefined, 'u-1')).toBe('u-1');
    expect(resolveWorkAssignee(null, 'u-1')).toBe('u-1');
    expect(resolveWorkAssignee('', 'u-1')).toBe('u-1');
  });

  it('составивший неизвестен — пусто', () => {
    expect(resolveWorkAssignee(null, null)).toBeNull();
  });
});
