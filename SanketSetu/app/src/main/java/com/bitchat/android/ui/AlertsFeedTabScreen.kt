package com.bitchat.android.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitchat.android.ai.classifier.ClassificationResult
import com.bitchat.android.ai.classifier.MessagePriority
import com.bitchat.android.ai.emergency.categoryEmojiAndLabel
import com.bitchat.android.ai.emergency.shouldShowEmergencyBadge
import com.bitchat.android.ai.report.ICS213ReportData
import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.sos.SosCoordinator
import com.bitchat.android.ui.brand.EmptyState
import com.bitchat.android.ui.brand.SanketButton
import com.bitchat.android.ui.brand.SanketCard
import com.bitchat.android.ui.brand.Sanket
import com.bitchat.android.ui.brand.SanketSectionLabel
import com.bitchat.android.ui.brand.ScreenHeader
import com.bitchat.android.ui.brand.StatusPill
import com.bitchat.android.ui.brand.Tone
import com.bitchat.android.ui.brand.fill
import com.bitchat.android.ui.brand.ink
import com.bitchat.android.ui.brand.soft
import com.bitchat.android.ui.sos.sosDisplayText
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Severity -> colour role. Critical is red, high is amber, everything else blue. */
private fun MessagePriority?.tone(): Tone = when (this) {
    MessagePriority.CRITICAL -> Tone.Sos
    MessagePriority.HIGH -> Tone.Warn
    MessagePriority.NORMAL -> Tone.Blue
    else -> Tone.Neutral
}

private fun MessagePriority?.label(): String = when (this) {
    MessagePriority.CRITICAL -> "CRITICAL"
    MessagePriority.HIGH -> "HIGH"
    else -> "NORMAL"
}

/** "just now", "7 min ago", then a clock time once it is more than an hour old. */
private fun relativeTime(t: Date, now: Long = System.currentTimeMillis()): String {
    val mins = ((now - t.time) / 60_000L).toInt()
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "$mins min ago"
        else -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(t)
    }
}

/**
 * The triage order: only messages the classifier flagged as an emergency, CRITICAL before HIGH before NORMAL,
 * newest first within a severity. (The feed used to be newest-first only, which buried critical alerts under
 * routine ones.)
 */
internal fun orderAlertsByUrgency(
    messages: List<BitchatMessage>,
    classificationOf: (messageId: String) -> ClassificationResult?
): List<BitchatMessage> =
    messages
        .filter { msg ->
            val r = classificationOf(msg.id)
            r != null && shouldShowEmergencyBadge(r) && r.emergencyType != "NONE"
        }
        .sortedWith(
            compareBy<BitchatMessage> { classificationOf(it.id)?.priority?.ordinal ?: Int.MAX_VALUE }
                .thenByDescending { it.timestamp }
        )

/**
 * Alerts: every distress message the on-device classifier flagged, MOST URGENT FIRST (critical, then high, then
 * normal; newest first within each), with severity totals, category filters and one-tap ICS-213 export.
 * SOS beacons from the SOS tab appear here too, shown as plain language rather than their wire format.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AlertsFeedTabScreen(
    classificationCache: SnapshotStateMap<String, ClassificationResult>,
    messages: List<BitchatMessage>,
    currentUserNickname: String,
    peersConnected: Int,
    currentChannel: String,
    onNavigateToChat: (messageId: String) -> Unit,
    onGenerateReport: (ICS213ReportData) -> Unit,
    modifier: Modifier = Modifier
) {
    val c = Sanket.colors
    val sosState by SosCoordinator.state.collectAsStateWithLifecycle()
    var selectedFilter by remember { mutableStateOf<String?>(null) }

    // Flagged messages, most urgent first, newest first within a severity.
    val emergencyMessages = remember(messages, classificationCache.size) {
        orderAlertsByUrgency(messages) { classificationCache[it] }
    }

    val categoryCounts = remember(emergencyMessages) {
        emergencyMessages.mapNotNull { classificationCache[it.id]?.emergencyType }
            .filter { it.isNotEmpty() }
            .groupingBy { it }.eachCount()
            .toList().sortedByDescending { it.second }
    }
    val criticalCount = emergencyMessages.count { classificationCache[it.id]?.priority == MessagePriority.CRITICAL }
    val highCount = emergencyMessages.count { classificationCache[it.id]?.priority == MessagePriority.HIGH }
    val otherCount = emergencyMessages.size - criticalCount - highCount

    val shown = remember(emergencyMessages, selectedFilter) {
        if (selectedFilter == null) emergencyMessages
        else emergencyMessages.filter { classificationCache[it.id]?.emergencyType == selectedFilter }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(c.paper),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            ScreenHeader(
                icon = Icons.Filled.NotificationsActive,
                title = "Alerts",
                subtitle = if (emergencyMessages.isEmpty()) "Nothing urgent nearby"
                else "${emergencyMessages.size} active · most urgent first",
                tone = Tone.Warn,
                trailing = {
                    SanketButton(
                        text = "ICS-213",
                        icon = Icons.Filled.Assignment,
                        tone = Tone.Neutral,
                        outlined = true,
                        enabled = emergencyMessages.isNotEmpty(),
                        onClick = {
                            onGenerateReport(
                                buildReportData(
                                    sortedCategories = categoryCounts.map { it.first },
                                    messages = messages,
                                    classificationCache = classificationCache,
                                    currentUserNickname = currentUserNickname,
                                    peersConnected = peersConnected,
                                    currentChannel = currentChannel
                                )
                            )
                        }
                    )
                }
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                SeverityTile("Critical", criticalCount, Tone.Sos, Modifier.weight(1f))
                SeverityTile("High", highCount, Tone.Warn, Modifier.weight(1f))
                SeverityTile("Other", otherCount, Tone.Blue, Modifier.weight(1f))
            }
        }

        if (categoryCounts.isNotEmpty()) {
            item {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    FilterPill("All ${emergencyMessages.size}", selectedFilter == null) { selectedFilter = null }
                    for ((cat, count) in categoryCounts) {
                        val (emoji, label) = categoryEmojiAndLabel(cat)
                        FilterPill("$emoji $label $count", selectedFilter == cat) {
                            selectedFilter = if (selectedFilter == cat) null else cat
                        }
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Filled.Shield,
                    title = "All quiet",
                    body = "Distress messages that the on-device AI spots on the mesh show up here, most urgent first. Nothing is sent anywhere.",
                    tone = Tone.Safe
                )
            }
        } else {
            var lastPriority: MessagePriority? = null
            var first = true
            for (msg in shown) {
                val result = classificationCache[msg.id]
                val pri = result?.priority
                if (first || pri != lastPriority) {
                    val header = pri.label()
                    item(key = "hdr-$header") { SanketSectionLabel("$header") }
                    lastPriority = pri
                    first = false
                }
                item(key = msg.id) {
                    AlertCard(
                        msg = msg,
                        result = result,
                        sosText = sosDisplayText(msg.content, sosState.language),
                        onClick = { onNavigateToChat(msg.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SeverityTile(label: String, count: Int, tone: Tone, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (count > 0) tone.soft() else Sanket.colors.surface)
            .border(BorderStroke(1.dp, if (count > 0) tone.fill().copy(alpha = 0.35f) else Sanket.colors.line), RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text("$count", color = if (count > 0) tone.ink() else Sanket.colors.muted, fontSize = 28.sp, fontWeight = FontWeight.Black)
        Text(label, color = if (count > 0) tone.ink() else Sanket.colors.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FilterPill(text: String, selected: Boolean, onClick: () -> Unit) {
    val c = Sanket.colors
    Box(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .background(if (selected) c.ink else c.surface)
            .border(BorderStroke(1.dp, if (selected) c.ink else c.line), RoundedCornerShape(50))
            .semantics { role = Role.RadioButton; this.selected = selected }
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = if (selected) c.paper else c.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun AlertCard(msg: BitchatMessage, result: ClassificationResult?, sosText: String?, onClick: () -> Unit) {
    val tone = result?.priority.tone()
    val (emoji, label) = categoryEmojiAndLabel(result?.emergencyType ?: "OTHER")
    SanketCard(accent = tone.fill(), onClick = onClick, modifier = Modifier.animateContentSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("$emoji $label", color = tone.ink(), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(relativeTime(msg.timestamp), color = Sanket.colors.muted, fontSize = 12.sp)
        }
        Text(
            text = sosText ?: com.bitchat.android.ai.sos.SosProtocol.humanReadable(msg.content),
            color = Sanket.colors.ink, fontSize = 15.sp, lineHeight = 21.sp
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("from ${msg.sender}", color = Sanket.colors.muted, fontSize = 12.sp)
                result?.let { StatusPill("AI ${(it.confidence * 100).toInt()}%", Tone.Neutral) }
            }
            Text("View in chat ›", color = Tone.Blue.ink(), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
