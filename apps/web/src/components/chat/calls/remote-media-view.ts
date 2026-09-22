import type { ChatCallKind } from "@vedamatch/shared";
import type { CallPhase } from "./call-machine";

/**
 * Куда класть поток собеседника на экране звонка (VED-359).
 *
 * Живая поломка 22.09: «в браузере не было видеосвязи, только аудио».
 * Причина — в порядке событий, а не в медиа. `<video>` для собеседника
 * рендерился условием `remoteStream && phase === "active"`, а `srcObject`
 * присваивал эффект с зависимостью `[remoteStream]`. Поток приходит в
 * `ontrack` (то есть на `setRemoteDescription`), а фаза становится
 * `active` только по `connectionState === "connected"` — всегда позже.
 * Значит в тот единственный раз, когда эффект срабатывал, элемента в
 * документе ещё не было (`ref.current === null`), поток не привязывался, а
 * когда элемент появлялся — эффект уже не перезапускался. Звук при этом
 * шёл: его `<audio>` рендерится безусловно. Отсюда ровно тот симптом.
 *
 * Правило: элемент, которому предстоит принять поток, должен быть в
 * документе с самого начала звонка — «показывать» и «держать в документе»
 * это разные вещи. Видимость решает фаза, монтирование — только вид
 * звонка.
 */
export interface RemoteMediaView {
  /**
   * Держать `<video>` в документе. Не зависит ни от фазы, ни от того, есть
   * ли уже поток: иначе `ref` не существует в момент привязки.
   */
  mountVideo: boolean;
  /** Показывать картинку собеседника (иначе на её месте аватар и имя). */
  showVideo: boolean;
  /**
   * Отдельный `<audio>` для голоса собеседника. Нужен только там, где
   * `<video>` нет вовсе: у смонтированного `<video>` звук играет и когда
   * картинка спрятана, и два элемента на одном потоке дали бы эхо.
   */
  mountAudio: boolean;
}

export function decideRemoteMediaView(input: {
  kind: ChatCallKind;
  hasRemoteStream: boolean;
  phase: CallPhase;
}): RemoteMediaView {
  const isVideo = input.kind === "video";
  return {
    mountVideo: isVideo,
    showVideo: isVideo && input.hasRemoteStream && input.phase === "active",
    mountAudio: !isVideo,
  };
}
