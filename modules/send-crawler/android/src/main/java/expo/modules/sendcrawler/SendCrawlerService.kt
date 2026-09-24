package expo.modules.sendcrawler

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Taps Send/Post in WhatsApp, Signal, or X — but only while SendCrawlerStore is armed.
 *
 * Accessibility services can see the whole screen. We deliberately do the opposite of a
 * generic scraper: we ignore every event until JS arms a specific package + message,
 * then we click one matching button and disarm. If the UI changed and we cannot find
 * Send, we time out and the user taps it themselves.
 */
class SendCrawlerService : AccessibilityService() {

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    SendCrawlerStore.takeIfValid(event.packageName?.toString()) ?: return

    val root = rootInActiveWindow ?: return
    var button: AccessibilityNodeInfo? = null
    try {
      button = findSendButton(root) ?: return
      val clicked = button.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      if (clicked) SendCrawlerStore.disarm()
    } finally {
      button?.recycle()
      root.recycle()
    }
  }

  override fun onInterrupt() {
    SendCrawlerStore.disarm()
  }

  private fun findSendButton(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    if (isSendControl(node)) return AccessibilityNodeInfo.obtain(node)

    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      try {
        val found = findSendButton(child)
        if (found != null) return found
      } finally {
        child.recycle()
      }
    }
    return null
  }

  private fun isSendControl(node: AccessibilityNodeInfo): Boolean {
    if (!node.isVisibleToUser) return false
    val clickable = node.isClickable || node.isEnabled
    if (!clickable) return false

    val desc = node.contentDescription?.toString()?.lowercase().orEmpty()
    val text = node.text?.toString()?.lowercase().orEmpty()
    val viewId = node.viewIdResourceName?.lowercase().orEmpty()
    val blob = "$desc $text $viewId"

    val labels = arrayOf(
      "send",
      "send message",
      "send now",
      "post",
      "tweet",
      "publish",
      "enviar",
      "enviar mensaje",
      "publicar",
    )
    if (labels.any { desc == it || text == it }) return true
    if (viewId.contains("send") && (desc.contains("send") || text.contains("send") || desc.isEmpty())) return true
    return labels.any { blob.contains(it) && node.isClickable }
  }
}
