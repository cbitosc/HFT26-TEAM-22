package com.bitchat.android.ui.media

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.ai.media.MediaLane
import com.bitchat.android.features.media.MediaTransferUi
import com.bitchat.android.ui.brand.Sanket
import com.bitchat.android.ui.brand.StatusPill
import com.bitchat.android.ui.brand.Tone

/**
 * Photos, voice notes and clips that are arriving. Shows the thumbnail that rode in the offer, how far along
 * the transfer is, and which lane is carrying it. A dropped link keeps the bar where it is: the transfer
 * resumes from there on its own.
 */
@Composable
fun MediaTransferStrip(rows: List<MediaTransferUi>, modifier: Modifier = Modifier) {
    if (rows.isEmpty()) return
    val c = Sanket.colors
    Column(
        modifier = modifier.fillMaxWidth().background(c.surfaceAlt).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        rows.take(2).forEach { MediaTransferRow(it) }
        if (rows.size > 2) Text("+${rows.size - 2} more arriving", color = c.muted, fontSize = 12.sp)
    }
}

@Composable
private fun MediaTransferRow(row: MediaTransferUi) {
    val c = Sanket.colors
    val percent = (row.fraction * 100).toInt()
    val thumb = remember(row.hashHex, row.thumbnail?.size) {
        row.thumbnail?.let { runCatching { BitmapFactory.decodeByteArray(it, 0, it.size) }.getOrNull() }
    }
    Row(
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = if (row.failed) "${row.title}: ${row.note ?: "failed"}" else "${row.title}: $percent percent"
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(c.surface), contentAlignment = Alignment.Center) {
            when {
                thumb != null -> Image(thumb.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(44.dp))
                row.failed -> Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = c.sosInk)
                else -> Icon(Icons.Filled.Download, contentDescription = null, tint = c.blueInk)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(row.title, color = c.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                if (!row.failed) {
                    StatusPill(text = if (row.lane == MediaLane.WIFI) "Wi-Fi" else "Bluetooth", tone = if (row.lane == MediaLane.WIFI) Tone.Violet else Tone.Blue)
                }
            }
            if (row.failed) {
                Text(row.note ?: "Failed", color = c.sosInk, fontSize = 12.sp)
            } else {
                LinearProgressIndicator(
                    progress = { row.fraction },
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)),
                    color = c.blue,
                    trackColor = c.line
                )
                Text(if (percent == 0) "Waiting for the sender" else "$percent%  ·  resumes automatically if the link drops", color = c.muted, fontSize = 11.sp)
            }
        }
    }
}
