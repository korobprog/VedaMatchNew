/**
 * Зеркалить или нет (VED-347). Своё окошко с фронтальной камеры человек
 * привык видеть зеркальным — как в зеркале: ведёшь рукой влево, отражение
 * идёт влево. С тыловой камерой всё наоборот: она смотрит туда же, куда и
 * человек, и зеркало превращает «влево» в «вправо».
 *
 * Картинка собеседника не зеркалится никогда и ни при какой камере: к нам
 * приходит уже готовый кадр, и отражать его — значит показывать чужой мир
 * наизнанку (вплоть до перевёрнутых надписей).
 *
 * Чистая функция в отдельном модуле, а не условие по месту: решение нужно
 * и полноэкранному звонку, и любому будущему превью, а врозь они бы
 * разъехались.
 */

export type CameraFacing = "user" | "environment";

/** Чья картинка: наша собственная в окошке или пришедшая от собеседника. */
export type VideoSurface = "local-preview" | "remote";

export function shouldMirrorVideo(view: {
  surface: VideoSurface;
  /** Какая камера снимает. `null` — ещё не знаем; звонок начинается с фронтальной. */
  facing?: CameraFacing | null;
}): boolean {
  if (view.surface === "remote") return false;
  return view.facing !== "environment";
}

/** Следующая камера по кругу — для кнопки «перевернуть». */
export function nextCameraFacing(facing: CameraFacing): CameraFacing {
  return facing === "user" ? "environment" : "user";
}

/**
 * Какая камера снимает — по самой дорожке (`track.getSettings()`), а не по
 * тому, что мы просили у `getUserMedia`: с этим ответом не разъедется ни
 * подмена дорожки, ни устройство, выдавшее не то, что заказывали.
 * Веб-камера ноутбука `facingMode` не сообщает вовсе — это `null`,
 * «неизвестно», и такая картинка зеркалится как фронтальная: она и есть
 * фронтальная.
 */
export function facingFromTrackSettings(
  settings?: { facingMode?: string } | null,
): CameraFacing | null {
  const mode = settings?.facingMode;
  return mode === "user" || mode === "environment" ? mode : null;
}
