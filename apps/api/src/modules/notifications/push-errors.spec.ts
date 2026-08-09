import { classifyPushError } from './push-errors';

describe('classifyPushError', () => {
  it('считает подписку мёртвой на 404 и 410', () => {
    expect(classifyPushError(404)).toBe('gone');
    expect(classifyPushError(410)).toBe('gone');
  });

  it('считает мёртвой и подписку с битыми ключами (400)', () => {
    expect(classifyPushError(400)).toBe('gone');
  });

  it('не удаляет подписку при 429 — это временный лимит', () => {
    expect(classifyPushError(429)).toBe('rate-limited');
  });

  it('всё остальное считает временным сбоем', () => {
    expect(classifyPushError(500)).toBe('transient');
    expect(classifyPushError(undefined)).toBe('transient');
  });
});
