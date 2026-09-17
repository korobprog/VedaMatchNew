import type { ChatCallKind } from '@vedamatch/shared';
import type { CallPhase } from './call-machine';

/**
 * Нужен ли на экране звонка отдельный элемент только под звук собеседника
 * (веха 5, веб-звонки). На Android/iOS-нативе звук удалённого потока играет
 * через аудиосессию телефона сам по себе, как только трек добавлен в
 * `RTCPeerConnection` (`ontrack`), — рендерить что-то на экране для этого не
 * требуется вовсе, `RTCView` там только про картинку.
 *
 * В браузере наоборот: звук воспроизводит именно DOM-элемент
 * (`<video>`/`<audio>` с `srcObject`) — `app/call/[id].tsx` уже рендерит
 * `RTCView` с удалённым потоком, но только когда `showsRemoteVideo`
 * (видеозвонок и разговор идёт), поэтому на аудиозвонке без этой добавки
 * удалённый голос на вебе не звучал бы вовсе. `objectFit`/картинка тут не
 * важны — элемент скрыт стилями (`styles.hiddenRemoteAudio`), только звук.
 */
export function needsSeparateRemoteAudioElement(
  kind: ChatCallKind,
  phase: CallPhase,
  hasRemoteStream: boolean,
): boolean {
  return kind === 'audio' && phase === 'active' && hasRemoteStream;
}
