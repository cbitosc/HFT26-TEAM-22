package com.bitchat.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitchat.android.ui.brand.EmptyState
import com.bitchat.android.ui.brand.Sanket
import com.bitchat.android.ui.brand.SanketButton
import com.bitchat.android.ui.brand.SanketCard
import com.bitchat.android.ui.brand.SanketSectionLabel
import com.bitchat.android.ui.brand.ScreenHeader
import com.bitchat.android.ui.brand.StatusPill
import com.bitchat.android.ui.brand.Tone
import com.bitchat.android.ui.brand.ink
import com.bitchat.android.ui.brand.soft
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** One nearby device as the radar shows it. [rssi] is null when the radio has not reported a reading. */
data class RadarPeer(val id: String, val name: String, val rssi: Int?)

/** Rough proximity from Bluetooth signal strength. Null RSSI is "unknown" — never guessed. */
enum class SignalBand(val label: String, val tone: Tone, val bars: Int, val ring: Float) {
    STRONG("Strong", Tone.Safe, 4, 0.40f),
    FAIR("Fair", Tone.Warn, 3, 0.68f),
    WEAK("Weak", Tone.Sos, 1, 0.92f),
    UNKNOWN("Signal unknown", Tone.Neutral, 0, 1.0f);

    companion object {
        fun of(rssi: Int?): SignalBand = when {
            rssi == null -> UNKNOWN
            rssi > -60 -> STRONG
            rssi > -80 -> FAIR
            else -> WEAK
        }
    }
}

/** Stateful entry point: reads live peers from the view-model. */
@Composable
fun MeshRadarTabScreen(
    viewModel: ChatViewModel,
    onDirectChat: (peerId: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val connectedPeers by viewModel.connectedPeers.collectAsStateWithLifecycle()
    val peerNicknames by viewModel.peerNicknames.collectAsStateWithLifecycle()
    val peerRSSI by viewModel.peerRSSI.collectAsStateWithLifecycle()
    val peers = connectedPeers.map { id ->
        RadarPeer(id = id, name = peerNicknames[id] ?: "Node ${id.take(6)}", rssi = peerRSSI[id])
    }
    MeshRadarContent(peers = peers, onDirectChat = onDirectChat, modifier = modifier)
}

/** Stateless radar UI (kept separate so it can be rendered and tested without a view-model). */
@Composable
fun MeshRadarContent(
    peers: List<RadarPeer>,
    onDirectChat: (peerId: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val c = Sanket.colors
    LazyColumn(
        modifier = modifier.fillMaxSize().background(c.paper),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            ScreenHeader(
                icon = Icons.Filled.Radar,
                title = "Radar",
                subtitle = "Bluetooth mesh. Works with no internet.",
                tone = Tone.Blue,
                trailing = {
                    StatusPill(
                        text = if (peers.isEmpty()) "Searching" else "${peers.size} nearby",
                        tone = if (peers.isEmpty()) Tone.Warn else Tone.Safe,
                        dot = true
                    )
                }
            )
        }

        item {
            SanketCard {
                RadarDisc(peers, Modifier.fillMaxWidth().height(230.dp))
                Text(
                    "Closer to the centre means a stronger signal. Direction is not measured.",
                    color = c.muted, fontSize = 12.sp
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                InfoTile("Reach", "Up to 7 hops", Modifier.weight(1f))
                InfoTile("Security", "Encrypted, signed", Modifier.weight(1f))
                InfoTile("Relaying", "Multi-hop", Modifier.weight(1f))
            }
        }

        item { SanketSectionLabel("Nearby devices (${peers.size})") }

        if (peers.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Filled.Radar,
                    title = "Looking for nearby phones",
                    body = "Keep Bluetooth on. Other SanketSetu phones within range join automatically and relay for each other.",
                    tone = Tone.Blue
                )
            }
        } else {
            items(peers.sortedByDescending { it.rssi ?: Int.MIN_VALUE }, key = { it.id }) { peer ->
                PeerCard(peer, onChat = { onDirectChat(peer.id) })
            }
        }
    }
}

@Composable
private fun InfoTile(label: String, value: String, modifier: Modifier = Modifier) {
    val c = Sanket.colors
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(14.dp))
            .background(c.surface)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(label, color = c.muted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        Text(value, color = c.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 2)
    }
}

@Composable
private fun RadarDisc(peers: List<RadarPeer>, modifier: Modifier = Modifier) {
    val c = Sanket.colors
    val toneColors = SignalBand.values().associateWith { band ->
        when (band.tone) {
            Tone.Safe -> c.safe
            Tone.Warn -> c.warn
            Tone.Sos -> c.sos
            else -> c.muted
        }
    }
    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val maxR = min(size.width, size.height) / 2f - 10.dp.toPx()
        val ringStroke = Stroke(width = 1.5.dp.toPx())

        // the logo's rings: faint outer, blue middle, violet inner
        drawCircle(c.line, radius = maxR, center = center, style = ringStroke)
        drawCircle(c.blue.copy(alpha = 0.35f), radius = maxR * 0.68f, center = center, style = Stroke(width = 2.dp.toPx()))
        drawCircle(c.violet.copy(alpha = 0.6f), radius = maxR * 0.40f, center = center, style = Stroke(width = 2.dp.toPx()))
        // horizon, as in the logo
        drawLine(c.ink.copy(alpha = 0.18f), Offset(center.x - maxR - 6.dp.toPx(), center.y), Offset(center.x + maxR + 6.dp.toPx(), center.y),
            strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)

        // peers: distance from centre follows signal band; the angle only spreads dots apart (not a bearing)
        peers.forEachIndexed { i, p ->
            val band = SignalBand.of(p.rssi)
            val seed = (p.id.hashCode() and 0x7fffffff) % 360
            val angle = ((seed + i * 47) % 360) * PI / 180.0
            val r = maxR * band.ring
            val pos = Offset(center.x + (r * cos(angle)).toFloat(), center.y + (r * sin(angle)).toFloat())
            val col = toneColors.getValue(band)
            drawCircle(c.surface, radius = 10.dp.toPx(), center = pos)
            drawCircle(col, radius = 7.dp.toPx(), center = pos)
        }

        // you
        drawCircle(c.surface, radius = 11.dp.toPx(), center = center)
        drawCircle(c.ink, radius = 8.dp.toPx(), center = center)
    }
}

@Composable
private fun PeerCard(peer: RadarPeer, onChat: () -> Unit) {
    val c = Sanket.colors
    val band = SignalBand.of(peer.rssi)
    SanketCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier.size(44.dp).clip(CircleShape).background(Tone.Blue.soft()),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    peer.name.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "?",
                    color = Tone.Blue.ink(), fontSize = 18.sp, fontWeight = FontWeight.Bold
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(peer.name, color = c.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SignalBars(band)
                    Text(
                        text = if (peer.rssi != null) "${band.label} · ${peer.rssi} dBm" else band.label,
                        color = band.tone.ink(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                    )
                }
                Text(peer.id.take(12), color = c.muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
            }
            SanketButton(text = "Chat", icon = Icons.Filled.Chat, onClick = onChat)
        }
    }
}

/** Four rising bars; the first [SignalBand.bars] are filled. */
@Composable
private fun SignalBars(band: SignalBand) {
    val c = Sanket.colors
    val on = when (band.tone) {
        Tone.Safe -> c.safe
        Tone.Warn -> c.warn
        Tone.Sos -> c.sos
        else -> c.line
    }
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (i in 1..4) {
            Box(
                Modifier.width(4.dp).height((4 + i * 3).dp).clip(RoundedCornerShape(1.5.dp))
                    .background(if (i <= band.bars) on else c.line)
            )
        }
    }
}
