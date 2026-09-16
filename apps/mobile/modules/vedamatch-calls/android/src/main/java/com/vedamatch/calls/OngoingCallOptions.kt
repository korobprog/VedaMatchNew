package com.vedamatch.calls

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Аргумент JS-функций `placeOutgoingCall`/`startOngoingCall`
 * (`modules/vedamatch-calls/index.ts`, VED-222). Тот же набор полей, что у
 * `ShowIncomingCallOptions` (без `avatarUrl` — фото собеседника уведомлению
 * разговора не нужно, только имя и тип для заголовка/типа foreground-службы).
 */
class OngoingCallOptions(
  @Field var callId: String = "",
  @Field var callerName: String = "",
  @Field var kind: String = "audio",
) : Record
