import type { ContactsRequestDto } from '@vedamatch/shared';
import { canCancel, canRespond, canWrite, showRemainingToday } from './people-requests-state';

function request(overrides: Partial<Pick<ContactsRequestDto, 'direction' | 'status'>>): Pick<ContactsRequestDto, 'direction' | 'status'> {
  return { direction: 'incoming', status: 'pending', ...overrides };
}

describe('showRemainingToday', () => {
  it('показывает остаток только ниже порога', () => {
    expect(showRemainingToday(0)).toBe(true);
    expect(showRemainingToday(2)).toBe(true);
    expect(showRemainingToday(3)).toBe(false);
    expect(showRemainingToday(10)).toBe(false);
  });
});

describe('canRespond', () => {
  it('только входящий и pending', () => {
    expect(canRespond(request({ direction: 'incoming', status: 'pending' }))).toBe(true);
    expect(canRespond(request({ direction: 'outgoing', status: 'pending' }))).toBe(false);
    expect(canRespond(request({ direction: 'incoming', status: 'accepted' }))).toBe(false);
  });
});

describe('canCancel', () => {
  it('только исходящий и pending', () => {
    expect(canCancel(request({ direction: 'outgoing', status: 'pending' }))).toBe(true);
    expect(canCancel(request({ direction: 'incoming', status: 'pending' }))).toBe(false);
    expect(canCancel(request({ direction: 'outgoing', status: 'cancelled' }))).toBe(false);
  });
});

describe('canWrite', () => {
  it('только принятый запрос, направление не важно', () => {
    expect(canWrite({ status: 'accepted' })).toBe(true);
    expect(canWrite({ status: 'pending' })).toBe(false);
    expect(canWrite({ status: 'declined' })).toBe(false);
    expect(canWrite({ status: 'cancelled' })).toBe(false);
  });
});
