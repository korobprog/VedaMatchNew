/**
 * Правило «можно ли заказать ролик из кадра».
 *
 * Живёт отдельно от сервиса, потому что решает не только доступ на сервере, но
 * и то, показывать ли кнопку: выключенная в админке видеогенерация должна
 * убирать «Оживить в видео» из кабинета автора, а не встречать его отказом
 * после нажатия. Администратора выключатель не касается — он им и управляет.
 */

export function canAnimateReel(input: {
  stage: string;
  hasImage: boolean;
  videoState: string;
  videoEnabled: boolean;
  isAdmin: boolean;
}): boolean {
  if (!input.videoEnabled && !input.isAdmin) return false;
  return (
    input.stage === 'published' &&
    input.hasImage &&
    (input.videoState === 'none' || input.videoState === 'failed')
  );
}
