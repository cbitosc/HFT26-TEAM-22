package com.bitchat.android.ui.sos

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitchat.android.ai.sos.AckKind
import com.bitchat.android.ai.sos.LocationTier
import com.bitchat.android.ai.sos.SosPayload
import com.bitchat.android.ai.sos.SosText
import com.bitchat.android.sos.SosCoordinator
import com.bitchat.android.ui.brand.Tone
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * How a received SOS (or "I'm safe" check-in) appears in the chat: the situation as a pictogram in
 * the READER's chosen language, who sent it and where, plus one-tap replies. A reply is shown as
 * verified only if this phone holds a valid responder certificate (see ResponderDialog).
 */
@Composable
fun SosMessageCard(
    payload: SosPayload,
    senderName: String,
    senderPeerId: String?,
    timestamp: Date,
    isMine: Boolean,
    modifier: Modifier = Modifier
) {
    val ui by SosCoordinator.state.collectAsStateWithLifecycle()
    val lang = ui.language
    val cat = payload.category
    val accent = if (cat.isDistress) SosPalette.Sos else SosPalette.Safe
    val accentInk = if (cat.isDistress) SosPalette.SosInk else SosPalette.SafeInk
    val replied = ui.respondedTo[payload.id]
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(timestamp)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(SosPalette.Surface)
            .border(BorderStroke(1.dp, SosPalette.Line), RoundedCornerShape(14.dp))
    ) {
        Box(Modifier.width(8.dp).heightIn(min = 96.dp).background(accent))
        Column(Modifier.padding(12.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "${cat.emoji} ${cat.title(lang)}",
                color = accentInk, fontSize = 18.sp, fontWeight = FontWeight.Black
            )
            Text(cat.detail(lang), color = SosPalette.Ink, fontSize = 15.sp)
            Text(
                text = (if (isMine) "You" else senderName) + " · $time",
                color = SosPalette.Muted, fontSize = 13.sp
            )
            val where = when {
                payload.latLon == null -> "📍 ${SosText.LOC_NONE.text(lang)}"
                payload.tier == LocationTier.PRECISE -> "📍 ${payload.latLon}  ·  ${SosText.LOC_PRECISE.text(lang)}"
                else -> "📍 ${payload.latLon}  ·  ${SosText.LOC_COARSE.text(lang)}"
            }
            if (cat.isDistress) Text(where, color = SosPalette.Ink, fontSize = 14.sp)

            if (cat.isDistress && !isMine && senderPeerId != null) {
                when (replied) {
                    null -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        SosOutlineButton(SosText.ACKNOWLEDGE.text(lang), Modifier.weight(1f)) {
                            SosCoordinator.respond(payload.id, senderPeerId, AckKind.ACKNOWLEDGED)
                        }
                        SosPrimaryButton(SosText.ON_MY_WAY.text(lang), Tone.Safe, Modifier.weight(1f)) {
                            SosCoordinator.respond(payload.id, senderPeerId, AckKind.EN_ROUTE)
                        }
                    }
                    AckKind.ACKNOWLEDGED -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("✔ ${SosText.YOU_ACKNOWLEDGED.text(lang)}", color = SosPalette.SafeInk, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        SosPrimaryButton(SosText.ON_MY_WAY.text(lang), Tone.Safe, Modifier.fillMaxWidth()) {
                            SosCoordinator.respond(payload.id, senderPeerId, AckKind.EN_ROUTE)
                        }
                    }
                    else -> Text("✔ ${SosText.YOU_ON_YOUR_WAY.text(lang)}", color = SosPalette.SafeInk, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
