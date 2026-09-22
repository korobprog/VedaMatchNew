import { parseNotificationMark } from './notification-mark';

describe('parseNotificationMark', () => {
  it('принимает известные коды', () => {
    expect(parseNotificationMark('done')).toBe('done');
    expect(parseNotificationMark('in_progress')).toBe('in_progress');
  });

  it('старую или чужую строку из базы гасит в null', () => {
    expect(parseNotificationMark('backlog')).toBeNull();
    expect(parseNotificationMark(null)).toBeNull();
    expect(parseNotificationMark(undefined)).toBeNull();
  });
});
