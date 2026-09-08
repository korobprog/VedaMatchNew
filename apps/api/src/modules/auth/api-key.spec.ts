import {
  API_KEY_PREFIX,
  normalizeScopes,
  apiKeyHint,
  generateApiKey,
  hashApiKey,
  isApiKeyUsable,
  isRequestAllowed,
  looksLikeApiKey,
} from './api-key';

describe('generateApiKey', () => {
  it('выдаёт ключ с префиксом и его хеш', () => {
    const { token, hash } = generateApiKey();
    expect(token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(hash).toBe(hashApiKey(token));
  });

  it('два ключа подряд не совпадают', () => {
    expect(generateApiKey().token).not.toBe(generateApiKey().token);
  });

  it('сам ключ в хеше не проглядывает', () => {
    const { token, hash } = generateApiKey();
    expect(hash).not.toContain(token.slice(API_KEY_PREFIX.length));
    expect(hash).toHaveLength(64);
  });
});

describe('looksLikeApiKey', () => {
  it('отличает ключ от JWT', () => {
    expect(looksLikeApiKey(generateApiKey().token)).toBe(true);
    expect(looksLikeApiKey('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.sig')).toBe(
      false,
    );
  });
});

describe('apiKeyHint', () => {
  it('показывает только хвост', () => {
    expect(apiKeyHint('vm_abcdefgh9f3a')).toBe('vm_…9f3a');
  });
});

describe('isRequestAllowed', () => {
  it('чтение пускает GET своего сервиса', () => {
    expect(isRequestAllowed(['work:read'], 'GET', '/work/spaces')).toBe(true);
  });

  it('чтение не пускает запись', () => {
    expect(isRequestAllowed(['work:read'], 'POST', '/work/tasks')).toBe(false);
    expect(isRequestAllowed(['work:read'], 'PATCH', '/work/tasks/1')).toBe(
      false,
    );
    expect(isRequestAllowed(['work:read'], 'DELETE', '/work/tasks/1')).toBe(
      false,
    );
  });

  it('запись включает в себя чтение', () => {
    expect(isRequestAllowed(['work:write'], 'GET', '/work/spaces')).toBe(true);
    expect(isRequestAllowed(['work:write'], 'POST', '/work/tasks')).toBe(true);
  });

  it('ключ одного сервиса не дотягивается до чужого', () => {
    expect(isRequestAllowed(['work:write'], 'GET', '/chat/threads')).toBe(
      false,
    );
    expect(isRequestAllowed(['work:write'], 'GET', '/admin/users')).toBe(false);
  });

  it('несколько прав в одном ключе действуют вместе', () => {
    const scopes = ['work:write', 'notices:read'];
    expect(isRequestAllowed(scopes, 'POST', '/work/tasks')).toBe(true);
    expect(isRequestAllowed(scopes, 'GET', '/notices')).toBe(true);
    expect(isRequestAllowed(scopes, 'POST', '/notices')).toBe(false);
  });

  it('ключ без прав не пускает никуда', () => {
    expect(isRequestAllowed([], 'GET', '/work/spaces')).toBe(false);
  });

  it('корень не принадлежит ни одному сервису', () => {
    expect(isRequestAllowed(['work:write'], 'GET', '/')).toBe(false);
  });

  it('путь с ведущими слэшами и запросом разбирается так же', () => {
    expect(isRequestAllowed(['work:read'], 'GET', '//work/spaces')).toBe(true);
    expect(isRequestAllowed(['work:read'], 'GET', 'work?query=1')).toBe(true);
  });

  it('похожее имя сервиса не считается своим', () => {
    expect(isRequestAllowed(['work:read'], 'GET', '/workspaces')).toBe(false);
  });
});

describe('isApiKeyUsable', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('бессрочный непогашенный ключ годен', () => {
    expect(isApiKeyUsable({ revoked: false, expiresAt: null }, now)).toBe(true);
  });

  it('отозванный не годен, даже если срок не вышел', () => {
    expect(
      isApiKeyUsable({ revoked: true, expiresAt: new Date('2030-01-01') }, now),
    ).toBe(false);
  });

  it('просроченный не годен', () => {
    expect(
      isApiKeyUsable(
        { revoked: false, expiresAt: new Date('2026-09-08T11:59:59.000Z') },
        now,
      ),
    ).toBe(false);
  });
});

describe('normalizeScopes', () => {
  it('оставляет известные права', () => {
    expect(normalizeScopes(['work:read', 'work:write'])).toEqual([
      'work:read',
      'work:write',
    ]);
  });

  it('выбрасывает выдуманные и чужие', () => {
    expect(normalizeScopes(['work:read', 'admin:write', 'chat:read'])).toEqual([
      'work:read',
    ]);
  });

  it('схлопывает повторы и терпит мусор', () => {
    expect(normalizeScopes(['work:read', 'work:read', 42, null])).toEqual([
      'work:read',
    ]);
  });

  it('из ничего не выдумывает прав', () => {
    expect(normalizeScopes([])).toEqual([]);
  });
});
