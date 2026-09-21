package expo.modules.sendcrawler

import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SendCrawlerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SendCrawler")

    Function("isEnabled") {
      isAccessibilityEnabled()
    }

    Function("arm") { packageName: String, text: String, timeoutMs: Double ->
      SendCrawlerStore.arm(packageName, text, timeoutMs.toLong().coerceAtLeast(1_000))
    }

    Function("disarm") {
      SendCrawlerStore.disarm()
    }
  }

  private fun isAccessibilityEnabled(): Boolean {
    val context = appContext.reactContext ?: return false
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    return enabled.contains("SendCrawlerService", ignoreCase = true)
  }
}
