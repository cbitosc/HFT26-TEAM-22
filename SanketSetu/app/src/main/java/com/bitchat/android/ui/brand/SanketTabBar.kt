package com.bitchat.android.ui.brand

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Radar
import androidx.compose.material.icons.outlined.Sos
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.ui.MainScreenTab

/**
 * The five-section switcher: Chat · SOS · Alerts · Radar · AI.
 *
 * Five fixed, equal slots — every section is always visible and reachable with one thumb (the earlier strip
 * scrolled sideways and hid the last tabs). Selection is one clear pill; live state (active SOS, open alerts,
 * nearby devices) is a small badge instead of changing the label's length.
 */
@Composable
fun SanketTabBar(
    currentTab: MainScreenTab,
    onTabSelect: (MainScreenTab) -> Unit,
    sosActive: Boolean,
    sosAckCount: Int,
    emergencyCount: Int,
    connectedPeersCount: Int,
    modifier: Modifier = Modifier
) {
    val c = Sanket.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(c.surface)
            .drawBehind {
                drawLine(c.line, Offset(0f, size.height), Offset(size.width, size.height), strokeWidth = 1.dp.toPx())
            }
            .padding(horizontal = 6.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        TabItem(
            label = "Chat", description = "Chat",
            selected = currentTab == MainScreenTab.CHAT,
            icon = Icons.Outlined.Forum, selectedIcon = Icons.Filled.Forum,
            onClick = { onTabSelect(MainScreenTab.CHAT) }, modifier = Modifier.weight(1f)
        )
        TabItem(
            label = "SOS",
            description = when {
                !sosActive -> "SOS"
                sosAckCount > 0 -> "SOS active, $sosAckCount acknowledged"
                else -> "SOS active"
            },
            selected = currentTab == MainScreenTab.SOS,
            icon = Icons.Outlined.Sos, selectedIcon = Icons.Filled.Sos,
            tone = Tone.Sos,
            badge = if (sosActive) (if (sosAckCount > 0) sosAckCount.toString() else "") else null,
            badgeTone = if (sosAckCount > 0) Tone.Safe else Tone.Sos,
            forceInk = sosActive,
            onClick = { onTabSelect(MainScreenTab.SOS) }, modifier = Modifier.weight(1f)
        )
        TabItem(
            label = "Alerts", description = if (emergencyCount > 0) "Alerts, $emergencyCount active" else "Alerts",
            selected = currentTab == MainScreenTab.ALERTS,
            icon = Icons.Outlined.NotificationsActive, selectedIcon = Icons.Filled.NotificationsActive,
            badge = if (emergencyCount > 0) emergencyCount.coerceAtMost(99).toString() else null,
            badgeTone = Tone.Warn,
            onClick = { onTabSelect(MainScreenTab.ALERTS) }, modifier = Modifier.weight(1f)
        )
        TabItem(
            label = "Radar", description = if (connectedPeersCount > 0) "Radar, $connectedPeersCount nearby" else "Radar",
            selected = currentTab == MainScreenTab.RADAR,
            icon = Icons.Outlined.Radar, selectedIcon = Icons.Filled.Radar,
            badge = if (connectedPeersCount > 0) connectedPeersCount.coerceAtMost(99).toString() else null,
            badgeTone = Tone.Safe,
            onClick = { onTabSelect(MainScreenTab.RADAR) }, modifier = Modifier.weight(1f)
        )
        TabItem(
            label = "AI", description = "AI triage",
            selected = currentTab == MainScreenTab.AI,
            icon = Icons.Outlined.AutoAwesome, selectedIcon = Icons.Filled.AutoAwesome,
            onClick = { onTabSelect(MainScreenTab.AI) }, modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TabItem(
    label: String,
    description: String,
    selected: Boolean,
    icon: ImageVector,
    selectedIcon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.Blue,
    badge: String? = null,
    badgeTone: Tone = Tone.Sos,
    /** Keep the icon in the tone colour even when not selected (an active SOS must stay visible). */
    forceInk: Boolean = false
) {
    val c = Sanket.colors
    val iconColor = when {
        selected || forceInk -> tone.ink()
        else -> c.muted
    }
    Column(
        modifier = modifier
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(14.dp))
            .semantics { role = Role.Tab; this.selected = selected; contentDescription = description }
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .width(56.dp).height(30.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (selected) tone.soft() else androidx.compose.ui.graphics.Color.Transparent),
                contentAlignment = Alignment.Center
            ) {
                Icon(if (selected) selectedIcon else icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(22.dp))
            }
            if (badge != null) {
                val shape = CircleShape
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 4.dp, y = (-2).dp)
                        .then(if (badge.isEmpty()) Modifier.size(10.dp) else Modifier.defaultMinSize(minWidth = 16.dp, minHeight = 16.dp))
                        .clip(shape)
                        .background(badgeTone.fill())
                        .padding(horizontal = if (badge.isEmpty()) 0.dp else 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    if (badge.isNotEmpty()) Text(badge, color = badgeTone.onFill(), fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
        }
        Text(
            text = label,
            color = if (selected) c.ink else c.muted,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1
        )
    }
}
