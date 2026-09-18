import { checkFailureText, type CheckFailureKind } from './check-messages';

const ALL_KINDS: CheckFailureKind[] = ['not-configured', 'version-unknown', 'network', 'not-found', 'malformed'];

describe('checkFailureText', () => {
  it('адрес не зашит в сборку — прямо так и сказано, без «Повторить»', () => {
    expect(checkFailureText('not-configured')).toEqual({
      message: expect.stringContaining('Адрес обновлений не настроен в этой сборке'),
      retryable: false,
    });
  });

  it('версия приложения неизвестна — отдельный текст, без «Повторить»', () => {
    const text = checkFailureText('version-unknown');
    expect(text.message).toContain('версию установленного приложения');
    expect(text.retryable).toBe(false);
  });

  it('сеть, отсутствующий и битый манифест — повторяемые ошибки', () => {
    expect(checkFailureText('network').retryable).toBe(true);
    expect(checkFailureText('not-found').retryable).toBe(true);
    expect(checkFailureText('malformed').retryable).toBe(true);
    expect(checkFailureText('network').message).toContain('интернет');
    expect(checkFailureText('not-found').message).toContain('нет опубликованной версии');
    expect(checkFailureText('malformed').message).toContain('непонятный ответ');
  });

  it('у каждой причины свой текст — человек может отличить одну от другой', () => {
    const messages = ALL_KINDS.map((kind) => checkFailureText(kind).message);
    expect(new Set(messages).size).toBe(ALL_KINDS.length);
  });
});
