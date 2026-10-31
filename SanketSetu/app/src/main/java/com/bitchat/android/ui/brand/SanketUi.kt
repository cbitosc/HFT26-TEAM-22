package com.bitchat.android.ui.brand

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Semantic colour roles shared by pills, headers, buttons and cards. */
enum class Tone { Neutral, Blue, Sos, Safe, Warn, Violet }

/** Text/icon colour ("ink") for [tone] — AA on both [SanketColors.surface] and [SanketColors.paper]. */
@Composable
fun Tone.ink(): Color = with(Sanket.colors) {
    when (this@ink) {
        Tone.Neutral -> muted
        Tone.Blue -> blueInk
        Tone.Sos -> sosInk
        Tone.Safe -> safeInk
        Tone.Warn -> warnInk
        Tone.Violet -> violetInk
    }
}

/** Quiet background tint for [tone] (ink text sits on it). */
@Composable
fun Tone.soft(): Color = with(Sanket.colors) {
    when (this@soft) {
        Tone.Neutral -> surfaceAlt
        Tone.Blue -> blueSoft
        Tone.Sos -> sosSoft
        Tone.Safe -> safeSoft
        Tone.Warn -> warnSoft
        Tone.Violet -> violetSoft
    }
}

/** Saturated fill for [tone] (use [onFill] for text on top). */
@Composable
fun Tone.fill(): Color = with(Sanket.colors) {
    when (this@fill) {
        Tone.Neutral -> ink
        Tone.Blue -> blue
        Tone.Sos -> sos
        Tone.Safe -> safe
        Tone.Warn -> warn
        Tone.Violet -> violet
    }
}

@Composable
fun Tone.onFill(): Color = with(Sanket.colors) {
    when (this@onFill) {
        Tone.Neutral -> paper
        Tone.Blue -> onBlue
        Tone.Sos -> onSos
        Tone.Safe -> onSafe
        Tone.Warn -> onWarn
        Tone.Violet -> Color(0xFF1B1030)
    }
}

/** A surface card, optionally with a coloured severity stripe on its leading edge. */
@Composable
fun SanketCard(
    modifier: Modifier = Modifier,
    accent: Color? = null,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val c = Sanket.colors
    val shape = RoundedCornerShape(16.dp)
    val base = modifier
        .fillMaxWidth()
        .clip(shape)
        .background(c.surface)
        .border(BorderStroke(1.dp, c.line), shape)
        .let { if (onClick != null) it.clickable(role = Role.Button, onClick = onClick) else it }
    if (accent == null) {
        Column(base.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    } else {
        Row(base.height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(accent))
            Column(Modifier.weight(1f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
    }
}

@Composable
fun SanketSectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        color = Sanket.colors.muted,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        modifier = modifier.padding(start = 4.dp, top = 6.dp)
    )
}

/** Small rounded status label: "Active", "CRITICAL 2", "4 nearby". */
@Composable
fun StatusPill(text: String, tone: Tone, modifier: Modifier = Modifier, dot: Boolean = false) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(tone.soft())
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (dot) Box(Modifier.size(7.dp).clip(CircleShape).background(tone.ink()))
        Text(text, color = tone.ink(), fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** Section header: tinted icon tile, title, one-line subtitle, optional trailing control. */
@Composable
fun ScreenHeader(
    icon: ImageVector,
    title: String,
    subtitle: String,
    tone: Tone,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(tone.soft()),
            contentAlignment = Alignment.Center
        ) { Icon(icon, contentDescription = null, tint = tone.ink(), modifier = Modifier.size(24.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, color = Sanket.colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(subtitle, color = Sanket.colors.muted, fontSize = 13.sp, maxLines = 2)
        }
        trailing?.invoke()
    }
}

@Composable
fun SanketButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.Blue,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    outlined: Boolean = false
) {
    val c = Sanket.colors
    val shape = RoundedCornerShape(12.dp)
    val bg = if (!enabled) c.surfaceAlt else if (outlined) c.surface else tone.fill()
    val fg = if (!enabled) c.muted else if (outlined) tone.ink() else tone.onFill()
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(bg)
            .let { if (outlined) it.border(BorderStroke(1.5.dp, if (enabled) tone.ink() else c.line), shape) else it }
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Text(text, color = fg, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, tone: Tone = Tone.Neutral, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            Modifier.size(72.dp).clip(CircleShape).background(tone.soft()),
            contentAlignment = Alignment.Center
        ) { Icon(icon, contentDescription = null, tint = tone.ink(), modifier = Modifier.size(36.dp)) }
        Text(title, color = Sanket.colors.ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(body, color = Sanket.colors.muted, fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 20.sp)
    }
}
