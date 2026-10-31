package com.bitchat.android.ui.brand

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.pow

/**
 * Computes WCAG 2.x contrast for every text/background pair the SanketSetu UI actually uses, in BOTH palettes.
 * If someone changes a token or starts using a new pairing, this is where it has to hold up.
 */
class SanketTokensContrastTest {

    private fun lin(c: Float): Double = if (c <= 0.03928f) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    private fun lum(c: Color) = 0.2126 * lin(c.red) + 0.7152 * lin(c.green) + 0.0722 * lin(c.blue)
    private fun ratio(a: Color, b: Color): Double {
        val la = lum(a); val lb = lum(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private val palettes = mapOf("light" to LightSanketColors, "dark" to DarkSanketColors)

    private fun check(min: Double = 4.5, pairs: SanketColors.() -> List<Triple<String, Color, Color>>) {
        for ((mode, p) in palettes) for ((name, fg, bg) in p.pairs()) {
            val r = ratio(fg, bg)
            assertTrue("[$mode] $name = %.2f:1, needs %.1f:1".format(r, min), r >= min)
        }
    }

    @Test
    fun `body and secondary text on every surface`() = check {
        listOf(
            Triple("ink/paper", ink, paper), Triple("ink/surface", ink, surface), Triple("ink/surfaceAlt", ink, surfaceAlt),
            Triple("muted/paper", muted, paper), Triple("muted/surface", muted, surface), Triple("muted/surfaceAlt", muted, surfaceAlt),
            // tinted tiles and notes carry ink and muted text
            Triple("ink/sosSoft", ink, sosSoft), Triple("ink/safeSoft", ink, safeSoft),
            Triple("ink/warnSoft", ink, warnSoft), Triple("ink/blueSoft", ink, blueSoft),
            Triple("muted/sosSoft", muted, sosSoft), Triple("muted/safeSoft", muted, safeSoft)
        )
    }

    @Test
    fun `accent ink text and icons on cards, paper and their own tints`() = check {
        listOf(
            Triple("blueInk/surface", blueInk, surface), Triple("blueInk/paper", blueInk, paper), Triple("blueInk/blueSoft", blueInk, blueSoft),
            Triple("sosInk/surface", sosInk, surface), Triple("sosInk/paper", sosInk, paper), Triple("sosInk/sosSoft", sosInk, sosSoft),
            Triple("safeInk/surface", safeInk, surface), Triple("safeInk/paper", safeInk, paper), Triple("safeInk/safeSoft", safeInk, safeSoft),
            Triple("warnInk/surface", warnInk, surface), Triple("warnInk/paper", warnInk, paper), Triple("warnInk/warnSoft", warnInk, warnSoft),
            Triple("violetInk/surface", violetInk, surface), Triple("violetInk/paper", violetInk, paper), Triple("violetInk/violetSoft", violetInk, violetSoft)
        )
    }

    @Test
    fun `text on saturated fills (buttons, badges, the SOS ring)`() = check {
        listOf(
            Triple("onSos/sos", onSos, sos), Triple("onSafe/safe", onSafe, safe),
            Triple("onWarn/warn", onWarn, warn), Triple("onBlue/blue", onBlue, blue),
            Triple("paper/ink (selected filter chip)", paper, ink)
        )
    }

    @Test
    fun `the specified emergency colours are the light palette's SOS and safe fills and ink`() {
        assertEquals(Color(0xFFD9381E), LightSanketColors.sos)
        assertEquals(Color(0xFF15803D), LightSanketColors.safe)
        assertEquals(Color(0xFF111827), LightSanketColors.ink)
        assertEquals(Color(0xFFFFFFFF), LightSanketColors.surface)
    }

    @Test
    fun `interactive minimum is 48dp`() {
        assertTrue(com.bitchat.android.ui.sos.SosPalette.MinTouch.value >= 48f)
    }
}
