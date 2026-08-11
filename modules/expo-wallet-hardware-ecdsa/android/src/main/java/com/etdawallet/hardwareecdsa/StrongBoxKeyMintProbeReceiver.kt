package com.etdawallet.hardwareecdsa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class StrongBoxKeyMintProbeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_PROBE_STRONGBOX) {
      return
    }

    val result = StrongBoxKeyMintProbe.run(context.applicationContext)
    StrongBoxKeyMintProbeReporter.log(result)
  }

  companion object {
    const val ACTION_PROBE_STRONGBOX = "com.etdawallet.hardwareecdsa.PROBE_STRONGBOX"
  }
}
