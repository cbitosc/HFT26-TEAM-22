package com.bitchat.android.ui.theme

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import com.bitchat.android.ui.brand.DarkSanketColors
import com.bitchat.android.ui.brand.LightSanketColors
import com.bitchat.android.ui.brand.LocalSanketColors
import com.bitchat.android.ui.brand.SanketColors

/**
 * Material 3 colour scheme derived from the SanketSetu tokens, so existing screens that read
 * `MaterialTheme.colorScheme` pick up the brand without being rewritten.
 */
private fun SanketColors.toMaterial() = if (isDark) {
    darkColorScheme(
        primary = blue, onPrimary = onBlue, primaryContainer = blueSoft, onPrimaryContainer = blueInk,
        secondary = violet, onSecondary = onBlue, secondaryContainer = violetSoft, onSecondaryContainer = violetInk,
        tertiary = safe, onTertiary = onSafe,
        background = paper, onBackground = ink,
        surface = surface, onSurface = ink, surfaceVariant = surfaceAlt, onSurfaceVariant = muted,
        surfaceContainer = surface, surfaceContainerHigh = surfaceAlt, surfaceContainerLow = paper,
        outline = line, outlineVariant = line,
        error = sos, onError = onSos, errorContainer = sosSoft, onErrorContainer = sosInk
    )
} else {
    lightColorScheme(
        primary = blue, onPrimary = onBlue, primaryContainer = blueSoft, onPrimaryContainer = blueInk,
        secondary = violetInk, onSecondary = onBlue, secondaryContainer = violetSoft, onSecondaryContainer = violetInk,
        tertiary = safe, onTertiary = onSafe,
        background = paper, onBackground = ink,
        surface = surface, onSurface = ink, surfaceVariant = surfaceAlt, onSurfaceVariant = muted,
        surfaceContainer = surface, surfaceContainerHigh = surfaceAlt, surfaceContainerLow = paper,
        outline = line, outlineVariant = line,
        error = sosInk, onError = onSos, errorContainer = sosSoft, onErrorContainer = sosInk
    )
}

@Composable
fun BitchatTheme(
    darkTheme: Boolean? = null,
    content: @Composable () -> Unit
) {
    // App-level override from ThemePreferenceManager
    val themePref by ThemePreferenceManager.themeFlow.collectAsState(initial = ThemePreference.System)
    val shouldUseDark = when (darkTheme) {
        true -> true
        false -> false
        null -> when (themePref) {
            ThemePreference.Dark -> true
            ThemePreference.Light -> false
            ThemePreference.System -> isSystemInDarkTheme()
        }
    }

    val tokens = if (shouldUseDark) DarkSanketColors else LightSanketColors
    val colorScheme = tokens.toMaterial()

    val view = LocalView.current
    SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.insetsController?.setSystemBarsAppearance(
                    if (!shouldUseDark) WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS else 0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                )
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = if (!shouldUseDark) {
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                } else 0
            }
            window.navigationBarColor = colorScheme.background.toArgb()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isNavigationBarContrastEnforced = false
            }
        }
    }

    CompositionLocalProvider(LocalSanketColors provides tokens) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
