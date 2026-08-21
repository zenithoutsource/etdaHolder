package com.etdawallet.mdocproximity

import android.app.Activity
import android.content.ComponentName
import android.nfc.NfcAdapter
import android.nfc.cardemulation.CardEmulation
import android.util.Log
import android.view.WindowManager
import java.lang.ref.WeakReference

/**
 * ISO mdoc AID `A0000002480400` is also registered by OEM wallets (Samsung Wallet).
 * Without a foreground preferred-service claim, SELECT is routed elsewhere and the
 * reader sees `6A82` even when this app is armed.
 */
object HcePreferredService {
  private const val TAG = "HcePreferredService"

  @Volatile
  private var activityRef: WeakReference<Activity>? = null

  fun claim(activity: Activity): Boolean {
    val adapter = NfcAdapter.getDefaultAdapter(activity)
    if (adapter == null) {
      Log.w(TAG, "[hce] setPreferredService skipped: no NFC adapter")
      return false
    }

    val emulation = CardEmulation.getInstance(adapter)
    val allowsForeground =
      emulation.categoryAllowsForegroundPreference(CardEmulation.CATEGORY_OTHER)
    val component = ComponentName(activity, CompanionHostApduService::class.java)
    val claimed = emulation.setPreferredService(activity, component)
    Log.i(
      TAG,
      "[hce] setPreferredService claimed=$claimed allowsForeground=$allowsForeground component=$component",
    )
    if (!claimed) return false

    activityRef = WeakReference(activity)
    activity.runOnUiThread {
      activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    return true
  }

  fun release() {
    val activity = activityRef?.get()
    activityRef = null
    if (activity == null || activity.isDestroyed) return

    try {
      activity.runOnUiThread {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
      // Do not call unsetPreferredService: Android 16/17 can kill this HostApduService
      // (Multipaz #1787), and losing the foreground claim routes SELECT back to 6A82.
    } catch (error: Exception) {
      Log.w(TAG, "[hce] unsetPreferredService failed", error)
    }
  }
}
