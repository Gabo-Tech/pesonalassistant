package expo.modules.sendcrawler

/**
 * Shared one-shot authorisation for the Accessibility crawler.
 *
 * The JS confirm gate arms this *after* the user taps Send or says "send".
 * The service reads it, taps once, then clears it. Nothing else in the process
 * can send without going through that arm() call.
 */
object SendCrawlerStore {
  data class Armed(
    val packageName: String,
    val text: String,
    val expiresAtMs: Long,
  )

  @Volatile
  var armed: Armed? = null
    private set

  @Synchronized
  fun arm(packageName: String, text: String, timeoutMs: Long) {
    armed = Armed(
      packageName = packageName,
      text = text,
      expiresAtMs = System.currentTimeMillis() + timeoutMs,
    )
  }

  @Synchronized
  fun takeIfValid(eventPackage: String?): Armed? {
    val current = armed ?: return null
    if (System.currentTimeMillis() > current.expiresAtMs) {
      armed = null
      return null
    }
    if (eventPackage != current.packageName) return null
    return current
  }

  @Synchronized
  fun disarm() {
    armed = null
  }
}
