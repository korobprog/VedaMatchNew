package com.vedamatch.calls

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Аргумент JS-функции `showIncomingCall` (`modules/vedamatch-calls/index.ts`). */
class ShowIncomingCallOptions(
  @Field var callId: String = "",
  @Field var callerName: String = "",
  @Field var kind: String = "audio",
  @Field var avatarUrl: String? = null,
) : Record
