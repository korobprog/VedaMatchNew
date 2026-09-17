/**
 * Defence-in-depth против применения SDP не в том состоянии переговоров
 * (VED-261, feedback-002, блокирующий п.1) — перенос
 * `apps/web/src/components/chat/calls/webrtc-signal-guard.ts`, идентичен
 * по логике.
 *
 * Основная защита от дубля — идемпотентность на сервере
 * (`ChatCallsService.claimClientSignal`): она не даёт партиальному успеху
 * повтора породить второй сигнал. Эта проверка — второй, независимый слой:
 * если дубль/поздний сигнал всё-таки дошёл, не даём `RTCPeerConnection`
 * бросить `InvalidStateError`, а на glare (обе стороны выставили офер
 * одновременно) не запускаем встречную реегоциацию, которой в этом
 * протоколе (жёсткие роли caller/callee, без perfect negotiation) неоткуда
 * взяться легитимно.
 *
 * Чистая функция — таблица состояний `RTCSignalingState` из спецификации
 * WebRTC (те же значения у `react-native-webrtc`), не требует нативного
 * модуля для теста.
 */

export type SignalingState =
  | 'stable'
  | 'have-local-offer'
  | 'have-remote-offer'
  | 'have-local-pranswer'
  | 'have-remote-pranswer'
  | 'closed';

export type SdpApplyDecision = 'apply' | 'ignore-glare' | 'ignore-unexpected-state';

/**
 * Offer валиден из `stable` и `have-remote-offer`, не валиден (glare) из
 * `have-local-offer`. Answer валиден только из `have-local-offer` — из
 * `stable` (переговоры уже завершены) это и есть тот дубль/поздний ответ,
 * что раньше бросал `InvalidStateError`, проглоченный `.catch(() =>
 * undefined)`.
 */
export function decideSdpApply(
  sdpType: 'offer' | 'answer',
  signalingState: SignalingState,
): SdpApplyDecision {
  if (sdpType === 'offer') {
    if (signalingState === 'have-local-offer') return 'ignore-glare';
    if (signalingState === 'stable' || signalingState === 'have-remote-offer') return 'apply';
    return 'ignore-unexpected-state';
  }
  return signalingState === 'have-local-offer' ? 'apply' : 'ignore-unexpected-state';
}
