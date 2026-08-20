/**
 * Правило «можно ли заказать ролик из кадра».
 *
 * Живёт отдельно от сервиса, потому что решает не только доступ на сервере, но
 * и то, показывать ли кнопку: выключенная в админке видеогенерация должна
 * убирать «Оживить в видео» из кабинета автора, а не встречать его отказом
 * после нажатия. Администратора выключатель не касается — он им и управляет.
 *
 * `videoConfigured` — отдельный запрет и от админа тоже. Без ключа fal.ai
 * воркер видео не стартует вовсе, заказ лёг бы в очередь, которую некому
 * разобрать, и рилс навсегда завис бы в «готовится». Выключатель админ
 * поправит сам, ключ окружения — нет, поэтому кнопки не должно быть ни у кого.
 */

export function canAnimateReel(input: {
  stage: string;
  hasImage: boolean;
  videoState: string;
  videoEnabled: boolean;
  videoConfigured: boolean;
  isAdmin: boolean;
}): boolean {
  if (!input.videoConfigured) return false;
  if (!input.videoEnabled && !input.isAdmin) return false;
  return (
    input.stage === 'published' &&
    input.hasImage &&
    (input.videoState === 'none' || input.videoState === 'failed')
  );
}
