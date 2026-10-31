package com.bitchat.android.ui.sos

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** How long the button must be held before an SOS is committed. */
const val SOS_HOLD_MILLIS = 3_000

/**
 * Press-and-hold emergency button. The SOS is committed only after [holdMillis] of continuous
 * pressing, shown as a ring filling around the button with escalating vibration pulses. Lifting
 * the finger early — or the touch being cancelled — aborts and sends nothing.
 *
 * The ring only animates while a finger is down (at most 3 s); at rest there is no animation.
 *
 * TalkBack users cannot sustain a hold, so the button also exposes an explicit "send now"
 * accessibility action; assistive technology has to choose it deliberately from its action menu.
 */
@Composable
fun SosHoldButton(
    idleLabel: String,
    holdingLabel: String,
    accessibilityLabel: String,
    modifier: Modifier = Modifier,
    size: Dp = 176.dp,
    holdMillis: Int = SOS_HOLD_MILLIS,
    enabled: Boolean = true,
    onCompleted: () -> Unit,
    onAborted: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val progress = remember { Animatable(0f) }
    var holding by remember { mutableStateOf(false) }
    val completed by rememberUpdatedState(onCompleted)
    val aborted by rememberUpdatedState(onAborted)
    val fillColor = SosPalette.Sos
    val idleFill = SosPalette.Line
    val onSos = SosPalette.OnSos

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(if (enabled) fillColor else idleFill)
            .semantics {
                role = Role.Button
                contentDescription = accessibilityLabel
                customActions = listOf(CustomAccessibilityAction(accessibilityLabel) { if (enabled) completed(); enabled })
            }
            .pointerInput(enabled, holdMillis) {
                if (!enabled) return@pointerInput
                detectTapGestures(onPress = {
                    holding = true
                    var finished = false
                    SosHaptics.startHold(context)
                    val job = scope.launch {
                        progress.snapTo(0f)
                        progress.animateTo(1f, tween(durationMillis = holdMillis, easing = LinearEasing))
                        finished = true
                        SosHaptics.committed(context)
                        completed()
                    }
                    tryAwaitRelease() // true on lift, false if the gesture was cancelled — both abort if unfinished
                    holding = false
                    if (!finished) {
                        job.cancel()
                        SosHaptics.cancel(context)
                        aborted()
                    }
                    scope.launch { progress.snapTo(0f) }
                })
            },
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = 10.dp.toPx()
            val inset = stroke / 2 + 6.dp.toPx()
            val arcSize = Size(this.size.width - inset * 2, this.size.height - inset * 2)
            drawArc(
                color = onSos.copy(alpha = 0.30f), startAngle = 0f, sweepAngle = 360f, useCenter = false,
                topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke)
            )
            drawArc(
                color = onSos, startAngle = -90f, sweepAngle = 360f * progress.value, useCenter = false,
                topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round)
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("SOS", color = onSos, fontSize = (size.value / 4).sp, fontWeight = FontWeight.Black)
            Text(
                text = if (holding) holdingLabel else idleLabel,
                color = onSos,
                fontSize = (size.value / 11).coerceIn(12f, 16f).sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center
            )
        }
    }
}
