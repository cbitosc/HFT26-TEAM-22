package com.bitchat.android.ui.sos

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sos
import com.bitchat.android.ui.brand.ScreenHeader
import com.bitchat.android.ui.brand.StatusPill
import com.bitchat.android.ui.brand.Tone
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitchat.android.ai.sos.LocationOutcome
import com.bitchat.android.ai.sos.LocationTier
import com.bitchat.android.ai.sos.SosCategory
import com.bitchat.android.ai.sos.SosLanguage
import com.bitchat.android.ai.sos.SosStage
import com.bitchat.android.ai.sos.SosText
import com.bitchat.android.ai.sos.SosTrackerState
import com.bitchat.android.sos.SosCoordinator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Dedicated Emergency SOS Dashboard.
 *
 * Provides a calm, high-contrast, zero-typing emergency hub:
 * 1. Top Status Bar: 100% Offline BLE Mesh & connected peer count
 * 2. Hero SOS Trigger: 3-second hold button with tactile ramp-up
 * 3. Multilingual Pictogram Picker (EN, HI, TE, TA)
 * 4. Location Privacy Choice (None, Coarse ~1km, Precise)
 * 5. Live 4-Stage Setu Tracker when an SOS beacon is active
 */
@Composable
fun EmergencySosTabScreen(
    connectedPeersCount: Int,
    modifier: Modifier = Modifier
) {
    val ui by SosCoordinator.state.collectAsStateWithLifecycle()
    val lang = ui.language
    val scope = rememberCoroutineScope()
    var showResponder by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = SosPalette.Background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 1. Header with live reachability
            ScreenHeader(
                icon = Icons.Filled.Sos,
                title = SosText.TITLE.text(lang),
                subtitle = SosText.WORKS_OFFLINE.text(lang),
                tone = Tone.Sos,
                trailing = {
                    StatusPill(
                        text = if (connectedPeersCount > 0) SosText.NEARBY_COUNT.format(lang, connectedPeersCount)
                        else SosText.NOBODY_NEARBY.text(lang),
                        tone = if (connectedPeersCount > 0) Tone.Safe else Tone.Warn,
                        dot = true
                    )
                }
            )

            // Multilingual language row (Zero typing, instant native script)
            SosLanguageRow(current = lang, onSelect = SosCoordinator::setLanguage)

            val tracker = ui.tracker
            if (tracker != null) {
                // 5. Live 4-Stage Tracker (when an SOS is broadcast)
                TrackerContent(
                    t = tracker,
                    lang = lang,
                    onClose = {},
                    onNew = SosCoordinator::clearTracker
                )
            } else {
                // 2. Hero SOS Trigger, 3. Multilingual Pictograms, 4. Location Privacy
                SosDashboardContent(
                    ui = ui,
                    scope = scope
                )
            }

            // Responder mode entry (NDRF, Civil Defense, Certified Medics)
            SosOutlineButton(
                text = "Responder mode (NDRF / Civil Defense / Medic)",
                modifier = Modifier.fillMaxWidth(),
                onClick = { showResponder = true }
            )
            SosSpacer(16.dp)

            if (showResponder) {
                ResponderDialog(onDismiss = { showResponder = false })
            }
        }
    }
}

@Composable
private fun SosDashboardContent(
    ui: SosCoordinator.UiState,
    scope: CoroutineScope
) {
    val lang = ui.language
    val context = LocalContext.current
    var hint by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(hint) { if (hint != null) { delay(3_500); hint = null } }

    val chosen = ui.selected
    val willSend = SosCoordinator.defaultCategory()
    val isSafe = chosen == SosCategory.SAFE

    fun report(outcome: SosCoordinator.SendOutcome) {
        if (outcome == SosCoordinator.SendOutcome.NO_MESH) {
            Toast.makeText(context, "Mesh is not running yet", Toast.LENGTH_LONG).show()
        }
    }

    // 2. HERO SOS TRIGGER CARD
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isSafe) SosPalette.SafeTint else SosPalette.SosTint,
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, (if (isSafe) SosPalette.Safe else SosPalette.Sos).copy(alpha = 0.35f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (isSafe) {
                SosPrimaryButton(
                    text = SosText.SEND_SAFE.text(lang),
                    tone = Tone.Safe,
                    enabled = !ui.sending,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    scope.launch { report(SosCoordinator.send(SosCategory.SAFE)) }
                }
                if (ui.safeSentAtMs != null) {
                    Text(
                        "✔ ${SosText.SAFE_SENT.text(lang)}",
                        color = SosPalette.SafeInk,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                SosHoldButton(
                    idleLabel = SosText.HOLD_BUTTON.text(lang),
                    holdingLabel = SosText.KEEP_HOLDING.text(lang),
                    accessibilityLabel = SosText.HOLD_TO_SEND.text(lang),
                    enabled = !ui.sending,
                    onCompleted = { scope.launch { report(SosCoordinator.send(willSend)) } },
                    onAborted = { hint = SosText.RELEASED_EARLY.text(lang) }
                )
                Text(
                    text = hint ?: SosText.HOLD_TO_SEND.text(lang),
                    color = if (hint != null) SosPalette.SosInk else SosPalette.Ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "Will broadcast: ${willSend.emoji} ${willSend.title(lang)}",
                    color = SosPalette.Muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center
                )
            }
        }
    }

    // 3. MULTILINGUAL PICTOGRAM PICKER (Zero Typing)
    SosSectionLabel(SosText.CHOOSE_SITUATION.text(lang))
    for (row in SosCategory.picker.chunked(2)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)
        ) {
            for (cat in row) {
                SituationTile(
                    category = cat,
                    lang = lang,
                    selected = ui.selected == cat,
                    modifier = Modifier.weight(1f)
                ) {
                    SosCoordinator.select(if (ui.selected == cat) null else cat)
                }
            }
        }
    }

    // 4. LOCATION PRIVACY CHOICE
    SosSectionLabel(SosText.SHARE_LOCATION.text(lang))
    TierOption(LocationTier.NONE, SosText.LOC_NONE, SosText.LOC_NONE_HELP, ui)
    TierOption(LocationTier.COARSE, SosText.LOC_COARSE, SosText.LOC_COARSE_HELP, ui)
    TierOption(LocationTier.PRECISE, SosText.LOC_PRECISE, SosText.LOC_PRECISE_HELP, ui)
}

@Composable
internal fun SituationTile(
    category: SosCategory,
    lang: SosLanguage,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val accent = if (category == SosCategory.SAFE) SosPalette.Safe else SosPalette.Sos
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .fillMaxHeight()
            .heightIn(min = 120.dp)
            .clip(shape)
            .background(if (selected) (if (category == SosCategory.SAFE) SosPalette.SafeTint else SosPalette.SosTint) else SosPalette.Surface)
            .border(BorderStroke(if (selected) 3.dp else 1.dp, if (selected) accent else SosPalette.Line), shape)
            .semantics { role = Role.RadioButton; this.selected = selected }
            .clickable(onClick = onClick)
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(category.emoji, fontSize = 34.sp)
        Text(
            text = category.title(lang),
            color = SosPalette.Ink,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Text(
            text = category.detail(lang),
            color = SosPalette.Muted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}

@Composable
internal fun TierOption(
    tier: LocationTier,
    label: SosText,
    help: SosText,
    ui: SosCoordinator.UiState
) {
    val lang = ui.language
    val selected = ui.tier == tier
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(shape)
            .background(SosPalette.Surface)
            .border(BorderStroke(if (selected) 2.5.dp else 1.dp, if (selected) SosPalette.Ink else SosPalette.Line), shape)
            .semantics { role = Role.RadioButton; this.selected = selected }
            .clickable { SosCoordinator.setTier(tier) }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier.size(22.dp).clip(CircleShape)
                .border(BorderStroke(2.dp, if (selected) SosPalette.Ink else SosPalette.Line), CircleShape),
            contentAlignment = Alignment.Center
        ) { if (selected) Box(Modifier.size(11.dp).clip(CircleShape).background(SosPalette.Ink)) }
        Column {
            Text(label.text(lang), color = SosPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(help.text(lang), color = SosPalette.Muted, fontSize = 13.sp)
        }
    }
}

@Composable
internal fun TrackerContent(
    t: SosTrackerState,
    lang: SosLanguage,
    onClose: () -> Unit,
    onNew: () -> Unit
) {
    SosSectionLabel(SosText.YOUR_SOS.text(lang))

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SosPalette.Surface)
            .border(BorderStroke(1.dp, SosPalette.Line), RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text("${t.category.emoji} ${t.category.title(lang)}", color = SosPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(t.category.detail(lang), color = SosPalette.Muted, fontSize = 14.sp)
        val where = when (t.locationOutcome) {
            LocationOutcome.SHARED -> "📍 ${t.latLon}  ·  " + (if (t.tier == LocationTier.PRECISE) SosText.LOC_PRECISE else SosText.LOC_COARSE).text(lang)
            LocationOutcome.NOT_SHARED -> "📍 ${SosText.LOC_NONE.text(lang)}"
            LocationOutcome.NO_FIX -> "📍 ${SosText.NO_GPS_FIX.text(lang)}"
        }
        Text(where, color = SosPalette.Ink, fontSize = 14.sp)
    }

    if (t.handedToPeers == 0 && t.reachedCount == 0) {
        Text(
            SosText.NO_PEERS_NOTE.text(lang), color = SosPalette.Ink, fontSize = 15.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(SosPalette.SosTint).padding(12.dp)
        )
    }

    // The four-stage "Setu" loop: Stage is done only when real event proved it
    val stages = SosStage.values()
    val firstPending = stages.firstOrNull { !t.isReached(it) }
    Column {
        for ((i, stage) in stages.withIndex()) {
            val done = t.isReached(stage)
            val title = when (stage) {
                SosStage.BROADCASTED -> SosText.STAGE_BROADCASTED.text(lang)
                SosStage.REACHED -> SosText.STAGE_REACHED.format(lang, t.reachedCount)
                SosStage.ACKNOWLEDGED -> SosText.STAGE_ACKNOWLEDGED.text(lang)
                SosStage.EN_ROUTE -> SosText.STAGE_EN_ROUTE.text(lang)
            }
            val detail = when (stage) {
                SosStage.BROADCASTED -> if (t.handedToPeers > 0) SosText.BROADCAST_DETAIL.format(lang, t.handedToPeers) else SosText.BROADCAST_NO_PEERS.text(lang)
                SosStage.REACHED -> if (done) null else SosText.WAITING.text(lang)
                SosStage.ACKNOWLEDGED -> if (done) t.acknowledgers.joinToString { it.callsign } else SosText.WAITING.text(lang)
                SosStage.EN_ROUTE -> if (done) t.verifiedEnRoute.joinToString { it.callsign } else SosText.WAITING.text(lang)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Column {
                    SosStageDot(done = done, current = stage == firstPending)
                    if (i < stages.lastIndex) SosVerticalConnector(done = t.isReached(stages[i + 1]))
                }
                Column(Modifier.padding(bottom = 14.dp)) {
                    Text(title, color = if (done || stage == firstPending) SosPalette.Ink else SosPalette.Muted, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    if (!detail.isNullOrBlank()) Text(detail, color = SosPalette.Muted, fontSize = 14.sp)
                }
            }
        }
    }

    val answered = t.acknowledgers
    if (answered.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (r in answered) SosResponderCard(r, lang)
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        SosOutlineButton(SosText.SEND_ANOTHER.text(lang), Modifier.fillMaxWidth(), onClick = onNew)
    }
}

