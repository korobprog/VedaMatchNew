import { appReturnPage, escapeHtml } from './app-return-page';

describe('escapeHtml', () => {
  it('экранирует всё, что ломает атрибут и разметку', () => {
    expect(escapeHtml(`<a href="x" data-y='z'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('appReturnPage', () => {
  it('ведёт кнопку на адрес приложения с кодом', () => {
    const html = appReturnPage('vedamatch://auth?code=abc&x=1', 'code');
    expect(html).toContain('href="vedamatch://auth?code=abc&amp;x=1"');
    expect(html).toContain('Вход выполнен');
    expect(html).toContain('Вернуться в VedaMatch');
  });

  it('при ошибке говорит, что причину покажет приложение', () => {
    const html = appReturnPage('vedamatch://auth?error=x', 'error');
    expect(html).toContain('Вход не удался');
    expect(html).toContain('Причину покажет приложение');
  });

  it('не даёт адресу вырваться из атрибута', () => {
    const html = appReturnPage(
      'vedamatch://auth?error="><script>x</script>',
      'error',
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('адрес не подставляется в скрипт напрямую', () => {
    const html = appReturnPage('vedamatch://auth?code=secret-code', 'code');
    const script = html.slice(html.indexOf('<script>'));
    expect(script).not.toContain('secret-code');
  });
});
