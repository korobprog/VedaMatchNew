/**
 * Зеркалить или нет (VED-347) — перенос без переписывания из
 * `apps/web/src/components/chat/calls/camera-mirror.ts`.
 *
 * Своё окошко с фронтальной камеры человек привык видеть зеркальным — как
 * в зеркале: ведёшь рукой влево, отражение идёт влево. С тыловой камерой
 * всё наоборот: она смотрит туда же, куда и человек, и зеркало превращает
 * «влево» в «вправо» — ровно это и нашлось живой проверкой.
 *
 * Картинка собеседника не зеркалится никогда и ни при какой камере: к нам
 * приходит уже готовый кадр, и отражать его — значит показывать чужой мир
 * наизнанку (вплоть до перевёрнутых надписей).
 */

export type CameraFacing = 'user' | 'environment';

/** Чья картинка: наша собственная в окошке или пришедшая от собеседника. */
export type VideoSurface = 'local-preview' | 'remote';

export function shouldMirrorVideo(view: {
  surface: VideoSurface;
  /** Какая камера снимает. `null` — ещё не знаем; звонок начинается с фронтальной. */
  facing?: CameraFacing | null;
}): boolean {
  if (view.surface === 'remote') return false;
  return view.facing !== 'environment';
}

/** Следующая камера по кругу — для кнопки «перевернуть». */
export function nextCameraFacing(facing: CameraFacing): CameraFacing {
  return facing === 'user' ? 'environment' : 'user';
}
