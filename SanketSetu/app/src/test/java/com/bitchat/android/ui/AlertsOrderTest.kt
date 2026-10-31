package com.bitchat.android.ui

import com.bitchat.android.ai.classifier.ClassificationResult
import com.bitchat.android.ai.classifier.MessagePriority
import com.bitchat.android.model.BitchatMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

/** The Alerts tab promises "most urgent first"; this pins that down. */
class AlertsOrderTest {
    private fun msg(id: String, minutesAgo: Int) = BitchatMessage(
        id = id, sender = "s", content = "c", timestamp = Date(1_000_000_000_000L - minutesAgo * 60_000L)
    )
    private fun r(p: MessagePriority, type: String, conf: Float = 0.9f) = ClassificationResult(p, conf, type, "test")

    @Test
    fun `critical comes before high before normal, newest first within each`() {
        val messages = listOf(
            msg("normalNew", 1), msg("highOld", 30), msg("critOld", 20), msg("critNew", 5), msg("highNew", 2)
        )
        val cls = mapOf(
            "normalNew" to r(MessagePriority.NORMAL, "RESOURCE_REQUEST"),
            "highOld" to r(MessagePriority.HIGH, "FIRE"),
            "highNew" to r(MessagePriority.HIGH, "FLOOD"),
            "critOld" to r(MessagePriority.CRITICAL, "MEDICAL"),
            "critNew" to r(MessagePriority.CRITICAL, "COLLAPSE")
        )
        val ordered = orderAlertsByUrgency(messages) { cls[it] }.map { it.id }
        assertEquals(listOf("critNew", "critOld", "highNew", "highOld", "normalNew"), ordered)
    }

    @Test
    fun `unclassified and non emergency messages are left out`() {
        val messages = listOf(msg("a", 1), msg("b", 2), msg("c", 3))
        val cls = mapOf(
            "a" to r(MessagePriority.CRITICAL, "MEDICAL"),
            "b" to r(MessagePriority.NORMAL, "NONE"),
            "c" to null
        )
        assertEquals(listOf("a"), orderAlertsByUrgency(messages) { cls[it] }.map { it.id })
    }

    @Test
    fun `an empty feed stays empty`() {
        assertTrue(orderAlertsByUrgency(emptyList()) { null }.isEmpty())
    }
}
