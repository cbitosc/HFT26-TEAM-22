package com.bitchat.android.ui.brand

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * SanketSetu design tokens — one palette for every screen, in light and dark.
 *
 * Roles, not hues: screens ask for "surface", "muted text" or "SOS fill" and never hard-code a colour, so a
 * section can't drift out of the system. The pairs that carry text are asserted against WCAG AA (4.5:1) for BOTH
 * palettes in `SanketTokensContrastTest`.
 *
 * Fill vs ink: a saturated brand colour that works as a *fill* with white text (e.g. SOS red) is often too light to
 * use as *text* on the paper background, so each accent has a darker `…Ink` twin for text and icons.
 */
@Immutable
class SanketColors(
    val isDark: Boolean,
    /** App background. */
    val paper: Color,
    /** Cards and sheets sitting on [paper]. */
    val surface: Color,
    /** Quiet fills: chips, inputs, inactive controls. */
    val surfaceAlt: Color,
    /** Hairlines and borders (never text). */
    val line: Color,
    val ink: Color,
    val muted: Color,

    val blue: Color, val blueInk: Color, val blueSoft: Color, val onBlue: Color,
    val sos: Color, val sosInk: Color, val sosSoft: Color, val onSos: Color,
    val safe: Color, val safeInk: Color, val safeSoft: Color, val onSafe: Color,
    val warn: Color, val warnInk: Color, val warnSoft: Color, val onWarn: Color,
    val violet: Color, val violetInk: Color, val violetSoft: Color
)

val LightSanketColors = SanketColors(
    isDark = false,
    paper = Color(0xFFF6F4EF), surface = Color(0xFFFFFFFF), surfaceAlt = Color(0xFFEDEAE2), line = Color(0xFFDAD5CA),
    ink = Color(0xFF111827), muted = Color(0xFF4B5563),
    blue = Color(0xFF2D5BFF), blueInk = Color(0xFF2347D6), blueSoft = Color(0xFFE6ECFF), onBlue = Color.White,
    sos = Color(0xFFD9381E), sosInk = Color(0xFFC42E14), sosSoft = Color(0xFFFCEBE7), onSos = Color.White,
    safe = Color(0xFF15803D), safeInk = Color(0xFF136B34), safeSoft = Color(0xFFE6F4EA), onSafe = Color.White,
    warn = Color(0xFFB45309), warnInk = Color(0xFF9A4508), warnSoft = Color(0xFFFEF1DD), onWarn = Color.White,
    violet = Color(0xFFB79CFF), violetInk = Color(0xFF5B3CD0), violetSoft = Color(0xFFEFEAFF)
)

val DarkSanketColors = SanketColors(
    isDark = true,
    paper = Color(0xFF0D0F13), surface = Color(0xFF171A20), surfaceAlt = Color(0xFF20242C), line = Color(0xFF2F343E),
    ink = Color(0xFFF2F1EC), muted = Color(0xFFA6ACB8),
    blue = Color(0xFF7C9BFF), blueInk = Color(0xFF9DB4FF), blueSoft = Color(0xFF1B2547), onBlue = Color(0xFF0D0F13),
    sos = Color(0xFFFF6A4D), sosInk = Color(0xFFFF8A73), sosSoft = Color(0xFF3A1A14), onSos = Color(0xFF0D0F13),
    safe = Color(0xFF4ADE80), safeInk = Color(0xFF6EE79A), safeSoft = Color(0xFF12301F), onSafe = Color(0xFF0D0F13),
    warn = Color(0xFFFBBF24), warnInk = Color(0xFFFCD34D), warnSoft = Color(0xFF33270E), onWarn = Color(0xFF0D0F13),
    violet = Color(0xFFB79CFF), violetInk = Color(0xFFC9B6FF), violetSoft = Color(0xFF2A2347)
)

val LocalSanketColors = staticCompositionLocalOf { LightSanketColors }

/** `Sanket.colors.surface` etc. — read inside any composable. */
object Sanket {
    val colors: SanketColors
        @Composable @ReadOnlyComposable get() = LocalSanketColors.current
}
