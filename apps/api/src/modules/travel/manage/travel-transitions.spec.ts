import { canManagerMove, MANAGER_TRANSITIONS } from './travel-manage.service';

describe('canManagerMove', () => {
  it('новую заявку принимают или отклоняют', () => {
    expect(canManagerMove('new_request', 'accepted')).toBe(true);
    expect(canManagerMove('new_request', 'declined')).toBe(true);
  });

  it('заселить можно только принятую', () => {
    expect(canManagerMove('accepted', 'checked_in')).toBe(true);
    expect(canManagerMove('new_request', 'checked_in')).toBe(false);
  });

  it('завершить можно только заселённую', () => {
    expect(canManagerMove('checked_in', 'completed')).toBe(true);
    expect(canManagerMove('accepted', 'completed')).toBe(false);
  });

  it('принятую можно отклонить: планы у хозяина меняются', () => {
    expect(canManagerMove('accepted', 'declined')).toBe(true);
  });

  it('отменённую гостем хозяин не оживляет', () => {
    expect(MANAGER_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('отклонённая и завершённая — тупики: чтобы передумать, заводят новую', () => {
    expect(MANAGER_TRANSITIONS.declined).toHaveLength(0);
    expect(MANAGER_TRANSITIONS.completed).toHaveLength(0);
  });

  it('заявку не переводят саму в себя', () => {
    for (const [from, targets] of Object.entries(MANAGER_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  it('хозяин не отменяет заявку за гостя', () => {
    for (const targets of Object.values(MANAGER_TRANSITIONS)) {
      expect(targets).not.toContain('cancelled');
    }
  });
});
