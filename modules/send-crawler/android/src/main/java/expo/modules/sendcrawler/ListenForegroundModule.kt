package expo.modules.sendcrawler

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ListenForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ListenForeground")

    Function("start") {
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, ListenForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, ListenForegroundService::class.java).apply {
        action = ListenForegroundService.ACTION_STOP
      }
      context.startService(intent)
      context.stopService(Intent(context, ListenForegroundService::class.java))
      true
    }
  }
}
