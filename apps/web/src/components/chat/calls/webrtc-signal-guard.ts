/**
 * Defence-in-depth против применения SDP не в том состоянии переговоров
 * (VED-261, feedback-002, блокирующий п.1). Основная защита от дубля —
 * идемпотентность на сервере (`ChatCallsService.claimClientSignal`): она не
 * даёт партиальному успеху повтора породить второй сигнал. Эта проверка —
 * второй, независимый слой: если дубль/поздний сигнал всё-таки дошёл (старый
 * клиент без `clientSignalId`, баг сервера, ручной curl), не даём
 * `RTCPeerConnection` бросить `InvalidStateError`, а на глазах у glare
 * (обе стороны выставили офер одновременно) не запускаем встречную
 * реегоциацию, которой в этом протоколе (жёсткие роли caller/callee, без
 * perfect negotiation) неоткуда взяться легитимно.
 *
 * Чистая функция — таблица состояний `RTCSignalingState` из спецификации
 * WebRTC, не требует настоящего `RTCPeerConnection` для теста.
 */

export type SignalingState =
  | "stable"
  | "have-local-offer"
  | "have-remote-offer"
  | "have-local-pranswer"
  | "have-remote-pranswer"
  | "closed";

export type SdpApplyDecision =
  | "apply"
  | "ignore-glare"
  | "ignore-unexpected-state";

/**
 * Offer валиден из `stable` (обычные переговоры) и `have-remote-offer`
 * (второй офер до того, как мы ответили на первый — по спецификации не
 * требует rollback, просто заменяет ожидающий remote description). Из
 * `have-local-offer` — мы сами уже отправили офер и ждём ответа: применить
 * чужой офер поверх своего значило бы откатить уже идущие переговоры без
 * приглашения — в этом протоколе так не бывает штатно, это и есть glare.
 *
 * Answer валиден только из `have-local-offer` — единственное состояние,
 * которое реально ждёт `setRemoteDescription(answer)`. Из `stable`
 * (переговоры уже завершены — второй экземпляр ответа после ретрая или
 * повторной доставки) — именно тот путь, который раньше бросал
 * `InvalidStateError`, проглоченный `.catch(() => undefined)`.
 */
export function decideSdpApply(
  sdpType: "offer" | "answer",
  signalingState: SignalingState,
): SdpApplyDecision {
  if (sdpType === "offer") {
    if (signalingState === "have-local-offer") return "ignore-glare";
    if (signalingState === "stable" || signalingState === "have-remote-offer")
      return "apply";
    return "ignore-unexpected-state";
  }
  return signalingState === "have-local-offer"
    ? "apply"
    : "ignore-unexpected-state";
}
