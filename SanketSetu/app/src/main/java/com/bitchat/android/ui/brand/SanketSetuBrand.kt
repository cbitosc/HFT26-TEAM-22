package com.bitchat.android.ui.brand

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** SanketSetu brand colours, taken from the logo (logo/icon-full.svg). */
object SanketSetuColors {
    val Paper = Color(0xFFF6F4EF)
    val Ink = Color(0xFF0B0B0B)
    val Blue = Color(0xFF2D5BFF)
    val Violet = Color(0xFFB79CFF)
    val Coral = Color(0xFFFF6A4D)
    val Muted = Color(0xFF4B5563)
}

/**
 * Maps a point on the global timeline [t] (0..1) onto a segment [from]..[to], clamped to 0..1.
 * Used to stagger the logo's parts along one timeline.
 */
internal fun segment(t: Float, from: Float, to: Float): Float = ((t - from) / (to - from)).coerceIn(0f, 1f)

/** Ease-out with a small overshoot, for the "pop" of the nodes. */
internal fun easeOutBack(x: Float): Float {
    val c1 = 1.70158f
    val c3 = c1 + 1f
    val p = x - 1f
    return 1f + c3 * p * p * p + c1 * p * p
}

private fun easeOutCubic(x: Float): Float = 1f - (1f - x) * (1f - x) * (1f - x)

/**
 * The SanketSetu mark — a signal bridge: three arcs rising from a horizon around a home node, a faint
 * reflection beneath, and a coral beacon. Geometry is the logo's own 200×200 design space, so it matches the
 * launcher icon exactly.
 *
 * [timeline] is read only inside the draw phase, so animating it redraws this canvas without recomposing
 * anything. 1f draws the finished logo (used for reduced-motion and static placements). The build-up order is:
 * horizon → home node → violet, blue, black arcs → reflection → coral beacon.
 */
@Composable
fun SanketSetuLogo(
    modifier: Modifier = Modifier,
    size: Dp = 200.dp,
    timeline: () -> Float = { 1f }
) {
    Canvas(
        modifier = modifier
            .size(size)
            .semantics { contentDescription = "SanketSetu logo" }
    ) {
        drawLogo(timeline())
    }
}

private fun DrawScope.drawLogo(t: Float) {
    val k = this.size.minDimension / 200f // design units -> px
    fun x(u: Float) = u * k
    val stroke = Stroke(width = 10f * k, cap = StrokeCap.Round)

    // horizon grows out from the centre
    val bar = easeOutCubic(segment(t, 0.00f, 0.20f))
    if (bar > 0f) {
        drawLine(
            color = SanketSetuColors.Ink,
            start = Offset(x(100f - 76f * bar), x(100f)),
            end = Offset(x(100f + 76f * bar), x(100f)),
            strokeWidth = 10f * k,
            cap = StrokeCap.Round
        )
    }

    // faint reflection below the horizon, fading in once the arcs are up
    val mirror = segment(t, 0.62f, 0.84f)
    if (mirror > 0f) {
        for ((r, c) in ARCS) {
            drawArc(
                color = c.copy(alpha = 0.2f * mirror),
                startAngle = 180f,
                sweepAngle = -180f * easeOutCubic(mirror),
                useCenter = false,
                topLeft = Offset(x(100f - r), x(100f - r)),
                size = Size(x(2 * r), x(2 * r)),
                style = stroke
            )
        }
    }

    // arcs sweep over the top from the left end, innermost first
    for ((i, arc) in ARCS.reversed().withIndex()) {
        val (r, c) = arc
        val p = easeOutCubic(segment(t, 0.20f + 0.12f * i, 0.46f + 0.12f * i))
        if (p > 0f) {
            drawArc(
                color = c,
                startAngle = 180f,
                sweepAngle = 180f * p,
                useCenter = false,
                topLeft = Offset(x(100f - r), x(100f - r)),
                size = Size(x(2 * r), x(2 * r)),
                style = stroke
            )
        }
    }

    // home node
    val home = easeOutBack(segment(t, 0.10f, 0.30f))
    if (home > 0f) drawCircle(SanketSetuColors.Ink, radius = x(9f) * home, center = Offset(x(100f), x(100f)))

    // coral beacon pops in last, with the paper-coloured ring the logo has
    val beacon = easeOutBack(segment(t, 0.74f, 0.92f))
    if (beacon > 0f) {
        val c = Offset(x(144f), x(56f))
        drawCircle(SanketSetuColors.Paper, radius = x(14.5f) * beacon, center = c)
        drawCircle(SanketSetuColors.Coral, radius = x(12f) * beacon, center = c)
    }
}

/** Arc radius (design units) and colour, outermost first. */
private val ARCS = listOf(
    62f to SanketSetuColors.Ink,
    42f to SanketSetuColors.Blue,
    22f to SanketSetuColors.Violet
)
