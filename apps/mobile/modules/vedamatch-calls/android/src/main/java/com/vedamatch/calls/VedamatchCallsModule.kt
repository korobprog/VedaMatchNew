package com.vedamatch.calls

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Публичный JS-интерфейс модуля звонков (VED-221) — обёртка описана в
 * `modules/vedamatch-calls/index.ts`. Реализация опирается на self-managed
 * `ConnectionService` (`VedamatchConnectionService`/`VedamatchConnection`)
 * и полноэкранные уведомления (`CallNotifications`); решение записано в
 * `docs/mobile-calls-native.md`, §3.
 */
class VedamatchCallsModule : Module() {
  companion object {
    private const val ACCOUNT_ID = "vedamatch"

    @Volatile
    private var instance: WeakReference<VedamatchCallsModule>? = null

    fun sendAnswerEvent(callId: String) {
      instance?.get()?.sendEvent("answer", mapOf("callId" to callId))
    }

    fun sendDeclineEvent(callId: String) {
      instance?.get()?.sendEvent("decline", mapOf("callId" to callId))
    }

    /** Контекст приложения для классов вне модуля (`VedamatchConnection`),
     *  у которых нет своего `Module.appContext`. */
    fun applicationContextOrNull(): Context? = instance?.get()?.appContext?.reactContext?.applicationContext

    private fun phoneAccountHandle(context: Context): PhoneAccountHandle =
      PhoneAccountHandle(ComponentName(context, VedamatchConnectionService::class.java), ACCOUNT_ID)

    private fun ensurePhoneAccount(context: Context) {
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val handle = phoneAccountHandle(context)
      if (telecomManager.getPhoneAccount(handle) != null) return
      val account = PhoneAccount.builder(handle, "VedaMatch")
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
      telecomManager.registerPhoneAccount(account)
    }
  }

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("VedamatchCalls: нет ReactContext")

  override fun definition() = ModuleDefinition {
    Name("VedamatchCalls")

    Events("answer", "decline")

    OnCreate {
      instance = WeakReference(this@VedamatchCallsModule)
    }

    AsyncFunction("showIncomingCall") { options: ShowIncomingCallOptions ->
      val callId = options.callId
      if (callId.isEmpty()) return@AsyncFunction
      val callerName = options.callerName
      val kind = options.kind
      val avatarUrl = options.avatarUrl

      ensurePhoneAccount(context)
      val notificationId = CallNotifications.notificationIdFor(callId)
      PendingCallStore.putInfo(
        PendingCallStore.CallInfo(
          callId = callId,
          callerName = callerName,
          kind = kind,
          avatarUrl = avatarUrl,
          notificationId = notificationId,
        ),
      )

      val extras = android.os.Bundle().apply {
        putString(PendingCallStore.EXTRA_CALL_ID, callId)
        putString(PendingCallStore.EXTRA_CALLER_NAME, callerName)
        putString(PendingCallStore.EXTRA_KIND, kind)
        avatarUrl?.let { putString(PendingCallStore.EXTRA_AVATAR_URL, it) }
      }
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      telecomManager.addNewIncomingCall(phoneAccountHandle(context), extras)
    }

    AsyncFunction("endCall") { callId: String, _: String ->
      CallNotifications.cancel(context, callId)
      PendingCallStore.connectionFor(callId)?.disconnectFromApp()
      PendingCallStore.removeInfo(callId)
    }

    Function("getLaunchCall") {
      val launch = PendingCallStore.consumeLaunch() ?: return@Function null
      mapOf("callId" to launch.callId, "action" to launch.action)
    }

    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.canUseFullScreenIntent()
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }

    Function("setCallScreenActive") { active: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(active)
        activity.setTurnScreenOn(active)
      }
      if (active) {
        val keyguard = activity.getSystemService(Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
        keyguard?.requestDismissKeyguard(activity, null)
      }
    }
  }
}
