package com.bitchat.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.ai.classifier.TFLiteMessageClassifier
import com.bitchat.android.ai.vision.VisionTFLiteClassifier
import com.bitchat.android.ai.voice.VoskManager
import com.bitchat.android.ui.brand.Sanket
import com.bitchat.android.ui.brand.SanketCard
import com.bitchat.android.ui.brand.SanketSectionLabel
import com.bitchat.android.ui.brand.ScreenHeader
import com.bitchat.android.ui.brand.StatusPill
import com.bitchat.android.ui.brand.Tone
import com.bitchat.android.ui.brand.fill
import com.bitchat.android.ui.brand.ink
import com.bitchat.android.ui.brand.soft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** What the on-device AI can actually do on THIS phone right now. Read from the installed model files. */
data class AiCapabilities(
    val neuralText: Boolean,
    val photoScene: Boolean,
    val voice: Boolean
)

/**
 * AI Triage: what the on-device models can do on this phone (checked, not assumed) plus offline first-aid
 * protocols for the first minutes before responders arrive.
 */
@Composable
fun AiTriageTabScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val caps by produceState<AiCapabilities?>(initialValue = null, context) {
        value = withContext(Dispatchers.IO) {
            AiCapabilities(
                neuralText = TFLiteMessageClassifier.isModelAvailable(context),
                photoScene = VisionTFLiteClassifier.isAvailable(context),
                voice = runCatching { VoskManager(context).isModelAvailable() }.getOrDefault(false)
            )
        }
    }
    AiTriageContent(caps, modifier)
}

@Composable
fun AiTriageContent(caps: AiCapabilities?, modifier: Modifier = Modifier) {
    val c = Sanket.colors
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(c.paper)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        ScreenHeader(
            icon = Icons.Filled.AutoAwesome,
            title = "AI triage",
            subtitle = "Runs on this phone. Nothing leaves it.",
            tone = Tone.Violet,
            trailing = { StatusPill("On-device", Tone.Violet, dot = true) }
        )

        SanketCard {
            CapabilityRow(
                title = "Spots distress messages",
                detail = when (caps?.neuralText) {
                    true -> "Keyword rules plus a neural model"
                    false -> "Keyword rules only (neural model not installed)"
                    null -> "Checking…"
                },
                ready = caps?.neuralText, readyTone = Tone.Safe, partialTone = Tone.Warn
            )
            Divider()
            CapabilityRow(
                title = "Checks photos for hazards",
                detail = when (caps?.photoScene) {
                    true -> "Fire, flood, weather, security"
                    false -> "Uses the phone's basic image labels instead"
                    null -> "Checking…"
                },
                ready = caps?.photoScene, readyTone = Tone.Safe, partialTone = Tone.Warn
            )
            Divider()
            CapabilityRow(
                title = "Voice notes to text",
                detail = when (caps?.voice) {
                    true -> "English speech model installed"
                    false -> "Speech model not installed. It downloads once when you have internet."
                    null -> "Checking…"
                },
                ready = caps?.voice, readyTone = Tone.Safe, partialTone = Tone.Warn
            )
        }

        SanketSectionLabel("First aid until help arrives")

        SanketCard(accent = Tone.Warn.fill()) {
            Text(
                "General guidance for the first minutes. It does not replace trained responders. Send an SOS and follow their instructions as soon as they reach you.",
                color = c.ink, fontSize = 13.sp, lineHeight = 19.sp
            )
        }

        Protocol(
            "🩺", "Severe bleeding and trauma", "Critical", Tone.Sos,
            listOf(
                "Apply direct continuous pressure with a clean cloth or sterile dressing.",
                "Elevate the wounded limb above heart level if no fracture is suspected.",
                "If arterial bleeding spurts or will not stop: apply a tourniquet 2-3 inches above the wound (tighten until bleeding stops, record exact time).",
                "Keep victim warm to prevent hypothermia and hemorrhagic shock."
            )
        )
        Protocol(
            "🏠", "Building collapse and rubble", "Critical", Tone.Sos,
            listOf(
                "Cover mouth and nose with a shirt or cloth to filter airborne dust and particulates.",
                "Do NOT shout continuously to avoid inhaling dangerous silica dust; instead tap rhythmically on a metal pipe or wall in groups of 3 taps.",
                "Avoid unnecessary movement to prevent shifting rubble or triggering secondary collapse.",
                "Conserve flashlight and phone battery; turn off unnecessary screen brightness."
            )
        )
        Protocol(
            "❤️", "CPR", "Critical", Tone.Sos,
            listOf(
                "Check responsiveness and breathing (look, listen, feel for 5 seconds).",
                "Interlock hands in the center of victim's chest (lower half of sternum).",
                "Push hard and fast: 100 to 120 compressions per minute at 2 inches depth (match tempo of 'Stayin Alive').",
                "Cycle 30 chest compressions followed by 2 gentle rescue breaths until emergency rescue arrives."
            )
        )
        Protocol(
            "🌊", "Flash flood and water hazard", "High", Tone.Warn,
            listOf(
                "Move immediately to the highest accessible ground or structural roof.",
                "Never walk or drive through moving water: 6 inches of water can sweep a person away; 12 inches can float vehicles.",
                "Disconnect electrical mains if safe to do so before water reaches panel.",
                "Signal with bright clothing or flashing flashlight SOS rhythm (... --- ...)."
            )
        )
        Protocol(
            "🔥", "Fire and smoke", "High", Tone.Warn,
            listOf(
                "Crawl low under smoke: breathable air is within 12-24 inches of the floor.",
                "Feel door handles with the back of your hand before opening: if warm, do NOT open.",
                "Cover face with a damp cloth if available.",
                "If clothes catch fire: Stop, Drop, and Roll."
            )
        )
    }
}

@Composable
private fun Divider() {
    Box(Modifier.fillMaxWidth().size(width = 1.dp, height = 1.dp).background(Sanket.colors.line))
}

@Composable
private fun CapabilityRow(title: String, detail: String, ready: Boolean?, readyTone: Tone, partialTone: Tone) {
    val tone = when (ready) { true -> readyTone; false -> partialTone; null -> Tone.Neutral }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = Sanket.colors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(detail, color = Sanket.colors.muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
        StatusPill(
            text = when (ready) { true -> "Ready"; false -> "Limited"; null -> "…" },
            tone = tone
        )
    }
}

@Composable
private fun Protocol(emoji: String, title: String, priority: String, tone: Tone, steps: List<String>) {
    var expanded by remember { mutableStateOf(false) }
    val c = Sanket.colors
    SanketCard(accent = tone.fill()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .clickable(role = Role.Button) { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(emoji, fontSize = 24.sp)
            Column(Modifier.weight(1f)) {
                Text(title, color = c.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(priority, color = tone.ink(), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandMore else Icons.Filled.ChevronRight,
                contentDescription = if (expanded) "Collapse" else "Expand", tint = c.muted
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
                steps.forEachIndexed { i, step ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(
                            Modifier.size(24.dp).clip(RoundedCornerShape(50)).background(tone.soft()),
                            contentAlignment = Alignment.Center
                        ) { Text("${i + 1}", color = tone.ink(), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        Text(step, color = c.ink, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
