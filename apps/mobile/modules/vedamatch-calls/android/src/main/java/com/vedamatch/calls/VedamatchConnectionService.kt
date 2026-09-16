package com.vedamatch.calls

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/**
 * Self-managed `ConnectionService` (VED-221, docs/mobile-calls-native.md §3).
 * Единственная обязанность — превращать запрос Telecom в `Connection` с
 * нужными свойствами и передавать ответ/отклонение дальше в JS
 * (`VedamatchCallsModule`, события `answer`/`decline`). Экран и рингтон —
 * не здесь (`CallNotifications`, вызывается из `Connection.onShowIncomingCallUi`).
 */
class VedamatchConnectionService : ConnectionService() {

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID) ?: ""
    val connection = VedamatchConnection(
      callId = callId,
      onAnswerCallback = { VedamatchCallsModule.sendAnswerEvent(it) },
      onRejectCallback = { VedamatchCallsModule.sendDeclineEvent(it) },
    )
    connection.setRinging()
    connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
    connection.audioModeIsVoip = true
    request.extras?.getString(PendingCallStore.EXTRA_CALLER_NAME)?.let {
      connection.setCallerDisplayName(it, TelecomManager.PRESENTATION_ALLOWED)
    }
    PendingCallStore.putConnection(callId, connection)
    return connection
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    // Telecom отказал (например, уже есть звонок на устройстве в другом
    // self-managed приложении, конфликт self-managed/managed) — молча:
    // JS всё равно узнает, что дозвон не идёт, по таймауту/`call.ended`.
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    // Исходящие звонки через Telecom не заводим — WebRTC-сигналинг уже
    // работает без него (`chat-calls-client.ts`), самоуправляемый исходящий
    // нужен только если понадобится системный экран «набор идёт» (не в
    // рамках VED-221). `Connection` абстрактный — не создать напрямую,
    // `createFailedConnection` штатный способ Telecom-API отдать сразу
    // неудавшееся соединение без своего подкласса.
    return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
  }
}
