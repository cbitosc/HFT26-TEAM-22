package com.bitchat.android.ui.sos

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.bitchat.android.ui.brand.Sanket

/**
 * SOS-screen colour names, resolved from the shared SanketSetu tokens so these surfaces follow light/dark mode
 * with the rest of the app (they used to be a fixed light island). Contrast of every pair used here is asserted
 * for both palettes in `SanketTokensContrastTest`.
 *
 * Fill vs ink: [Sos] / [Safe] are *fills* (buttons, stripes, rings). When red or green is used as *text or an
 * icon*, use [SosInk] / [SafeInk] — the fills are too light to read as small text on the paper background.
 */
object SosPalette {
    val Background: Color @Composable @ReadOnlyComposable get() = Sanket.colors.paper
    val Surface: Color @Composable @ReadOnlyComposable get() = Sanket.colors.surface

    /** Primary text. */
    val Ink: Color @Composable @ReadOnlyComposable get() = Sanket.colors.ink

    /** Secondary text. */
    val Muted: Color @Composable @ReadOnlyComposable get() = Sanket.colors.muted

    /** Hairlines and inactive outlines (not for text). */
    val Line: Color @Composable @ReadOnlyComposable get() = Sanket.colors.line

    val Sos: Color @Composable @ReadOnlyComposable get() = Sanket.colors.sos
    val SosInk: Color @Composable @ReadOnlyComposable get() = Sanket.colors.sosInk
    val OnSos: Color @Composable @ReadOnlyComposable get() = Sanket.colors.onSos
    val SosTint: Color @Composable @ReadOnlyComposable get() = Sanket.colors.sosSoft

    val Safe: Color @Composable @ReadOnlyComposable get() = Sanket.colors.safe
    val SafeInk: Color @Composable @ReadOnlyComposable get() = Sanket.colors.safeInk
    val OnSafe: Color @Composable @ReadOnlyComposable get() = Sanket.colors.onSafe
    val SafeTint: Color @Composable @ReadOnlyComposable get() = Sanket.colors.safeSoft

    /** Minimum touch target for anything tappable, for one-handed use under stress. */
    val MinTouch = 48.dp
}
