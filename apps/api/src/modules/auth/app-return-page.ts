/**
 * Страница возврата из браузера в приложение после входа.
 *
 * Мгновенный редирект на `vedamatch://auth` Chrome на Android молча
 * отбрасывает, если навигация дошла до колбэка без касания человека: так
 * ведёт себя, например, окно разрешения доступа Яндекс ID при первом входе.
 * Человек остаётся в браузере без единой подсказки. Страница пробует открыть
 * приложение сама и держит на виду кнопку: нажатие — жест, его Chrome
 * пропускает всегда.
 *
 * Цвета повторяют токены портала из `apps/web/src/app/globals.css`. Текст
 * кнопки — цвет фона: на `--vm-magenta` он даёт 4.6:1 в светлой теме и 6.2:1
 * в тёмной, белый в тёмной теме дал бы 3.3:1.
 */

export type AppReturnOutcome = 'code' | 'error';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function appReturnPage(
  target: string,
  outcome: AppReturnOutcome,
): string {
  const href = escapeHtml(target);
  const title = outcome === 'code' ? 'Вход выполнен' : 'Вход не удался';
  const hint =
    outcome === 'code'
      ? 'Возвращаем вас в приложение VedaMatch. Если оно не открылось само, нажмите кнопку.'
      : 'Причину покажет приложение VedaMatch. Если оно не открылось само, нажмите кнопку.';

  // Адрес попадает в скрипт не строкой, а через href ссылки: экранирование
  // одно, для атрибута, и в JS нечего подставлять.
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${title} · VedaMatch</title>
<style>
:root{--bg:#FBF9FF;--text-0:#180F2C;--text-1:#4B3B6C;--accent:#D71A80}
@media (prefers-color-scheme:dark){:root{--bg:#0A0614;--text-0:#F6F1FF;--text-1:#B8A9D9;--accent:#FF3E9E}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text-0);font:16px/1.5 Manrope,system-ui,-apple-system,sans-serif}
main{max-width:360px;text-align:center}
h1{margin:0 0 8px;font-size:24px;line-height:1.25}
p{margin:0 0 24px;color:var(--text-1)}
a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px 20px;border-radius:14px;background:var(--accent);color:var(--bg);font-weight:700;text-decoration:none}
a:focus-visible{outline:3px solid var(--text-0);outline-offset:3px}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${hint}</p>
<a id="open" href="${href}">Вернуться в VedaMatch</a>
</main>
<script>location.replace(document.getElementById('open').href)</script>
</body>
</html>`;
}
