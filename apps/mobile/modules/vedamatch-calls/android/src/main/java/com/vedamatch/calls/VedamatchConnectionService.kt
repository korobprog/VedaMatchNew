package com.vedamatch.calls

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/**
 * Self-managed `ConnectionService` (VED-221/222, docs/mobile-calls-native.md
 * §3/§12). Единственная обязанность — превращать запрос Telecom в
 * `Connection` с нужными свойствами и передавать ответ/отклонение/завершение
 * дальше в JS (`VedamatchCallsModule`, события `answer`/`decline`/`end`).
 * Экран и рингтон — не здесь (`CallNotifications`, вызывается из
 * `Connection.onShowIncomingCallUi`).
 */
class VedamatchConnectionService : ConnectionService() {

  private fun buildConnection(callId: String): VedamatchConnection =
    VedamatchConnection(
      callId = callId,
      onAnswerCallback = { VedamatchCallsModule.sendAnswerEvent(it) },
      onRejectCallback = { VedamatchCallsModule.sendDeclineEvent(it) },
      onEndCallback = { VedamatchCallsModule.sendEndEvent(it) },
    )

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID) ?: ""
    val connection = buildConnection(callId)
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
    // «Занято» при активном сотовом на НАШЕЙ стороне решается раньше, в JS
    // (`call-busy-decision.ts`, `native-call-bridge.ts`: `showIncomingCall`
    // вообще не зовётся, если устройство уже занято) — до этой точки такой
    // случай не доходит.
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    // VED-222, п.1: система должна знать об исходящем разговоре — регистрация
    // через `TelecomManager.placeCall` (`VedamatchCallsModule.placeOutgoingCall`)
    // приходит сюда с тем же набором `extras`, что и входящий. WebRTC-сигналинг
    // самого звонка (`chat-calls-client.ts`) не зависит от Telecom — это
    // только системная интеграция (аудиомаршрутизация, Bluetooth/гарнитура,
    // «занято», показ в Android Auto), поэтому отказ здесь (например, Telecom
    // недоступен на конкретном OEM) не должен мешать самому дозвону — JS уже
    // не ждёт результата этого вызова (`placeOutgoingCall`, best-effort).
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID)
      ?: return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
    val connection = buildConnection(callId)
    connection.setDialing()
    connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
    connection.audioModeIsVoip = true
    request.extras?.getString(PendingCallStore.EXTRA_CALLER_NAME)?.let {
      connection.setCallerDisplayName(it, TelecomManager.PRESENTATION_ALLOWED)
    }
    PendingCallStore.putConnection(callId, connection)
    return connection
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    // Тот же принцип, что у `onCreateIncomingConnectionFailed`: сам дозвон
    // идёт через WebRTC-сигналинг независимо от Telecom.
  }
}
