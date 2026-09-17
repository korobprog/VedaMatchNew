import { ADMIN_AUDIT_ACTIONS, ADMIN_SERVICE_SLUGS } from '@vedamatch/shared';
import { actionServiceSlug, actionsForServices } from './audit-action-scope';

describe('actionServiceSlug', () => {
  it('покрывает каждое действие из ADMIN_AUDIT_ACTIONS валидным результатом', () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      const slug = actionServiceSlug(action);
      expect(
        slug === null ||
          (ADMIN_SERVICE_SLUGS as readonly string[]).includes(slug),
      ).toBe(true);
    }
  });

  it('portal-действия без владельца-сервиса', () => {
    expect(actionServiceSlug('user.blocked')).toBeNull();
    expect(actionServiceSlug('billing.mode-changed')).toBeNull();
    expect(actionServiceSlug('broadcast.sent')).toBeNull();
    expect(actionServiceSlug('report.resolved')).toBeNull();
    expect(actionServiceSlug('verification.decided')).toBeNull();
    expect(actionServiceSlug('community.decided')).toBeNull();
    expect(actionServiceSlug('platform.registration-changed')).toBeNull();
  });

  it('каталог сервисов выглядит как префикс, но это портальный раздел, не сервис', () => {
    expect(actionServiceSlug('catalog.service-created')).toBeNull();
    expect(actionServiceSlug('catalog.service-updated')).toBeNull();
  });

  it('баллы — портальная механика поперёк сервисов, слага в ADMIN_SERVICE_SLUGS нет', () => {
    expect(actionServiceSlug('rewards.entry-revoked')).toBeNull();
    expect(actionServiceSlug('rewards.settings-changed')).toBeNull();
  });

  it('справочник людей переехал в chat/people — действия скоуплены на chat', () => {
    expect(actionServiceSlug('contacts.tag-created')).toBe('chat');
    expect(actionServiceSlug('contacts.profile-hidden')).toBe('chat');
  });

  it('легаси-строка «переписка в Знакомствах» скоуплена на нынешний модуль chat', () => {
    expect(actionServiceSlug('union.chat-viewed')).toBe('chat');
    expect(actionServiceSlug('chat.transcript-viewed')).toBe('chat');
  });

  it('обычные сервисные действия', () => {
    expect(actionServiceSlug('notices.notice-deleted')).toBe('notices');
    expect(actionServiceSlug('market.listing-hidden')).toBe('market');
    expect(actionServiceSlug('union.profile-hidden')).toBe('union');
    expect(actionServiceSlug('library.entry-removed')).toBe('library');
    expect(actionServiceSlug('astro.generation-resumed')).toBe('astro');
    expect(actionServiceSlug('assistant.settings-changed')).toBe('assistant');
  });
});

describe('actionsForServices', () => {
  it('пустой список сервисов — пустой список действий', () => {
    expect(actionsForServices([])).toEqual([]);
  });

  it('service-admin Объявлений видит только notices.*', () => {
    const actions = actionsForServices(['notices']);
    expect(actions).toEqual([
      'notices.report-resolved',
      'notices.notice-deleted',
    ]);
  });

  it('service-admin Общения видит свои действия и переехавший справочник людей', () => {
    const actions = actionsForServices(['chat']);
    expect(actions).toContain('chat.transcript-viewed');
    expect(actions).toContain('union.chat-viewed');
    expect(actions).toContain('contacts.tag-created');
    expect(actions).not.toContain('notices.notice-deleted');
    expect(actions).not.toContain('rewards.entry-revoked');
  });

  it('несколько сервисов объединяются', () => {
    const actions = actionsForServices(['notices', 'market']);
    expect(actions).toEqual(
      expect.arrayContaining([
        'notices.notice-deleted',
        'market.listing-hidden',
      ]),
    );
    expect(actions).not.toContain('union.profile-hidden');
  });

  it('сервис без записей в журнале (пока) даёт пустой список, а не ошибку', () => {
    expect(actionsForServices(['music'])).toEqual([]);
  });
});
