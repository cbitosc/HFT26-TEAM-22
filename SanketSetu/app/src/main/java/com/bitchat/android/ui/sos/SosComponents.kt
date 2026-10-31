package com.bitchat.android.ui.sos

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.ai.sos.AckKind
import com.bitchat.android.ai.sos.ResponderReply
import com.bitchat.android.ai.sos.SosLanguage
import com.bitchat.android.ai.sos.SosText
import com.bitchat.android.ui.brand.SanketButton
import com.bitchat.android.ui.brand.Tone

/** Small reusable pieces of the SOS UI. Every tappable element is at least 48 dp tall. */

@Composable
fun SosPrimaryButton(
    text: String,
    tone: Tone,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    SanketButton(text = text, onClick = onClick, modifier = modifier.heightIn(min = 56.dp), tone = tone, enabled = enabled)
}

@Composable
fun SosOutlineButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    SanketButton(text = text, onClick = onClick, modifier = modifier, tone = Tone.Neutral, enabled = enabled, outlined = true)
}

/** Language switcher: native names so a victim can find their own language without reading English. */
@Composable
fun SosLanguageRow(current: SosLanguage, onSelect: (SosLanguage) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (lang in SosLanguage.values()) {
            val selected = lang == current
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = SosPalette.MinTouch)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selected) SosPalette.Ink else SosPalette.Surface)
                    .border(BorderStroke(1.5.dp, if (selected) SosPalette.Ink else SosPalette.Line), RoundedCornerShape(12.dp))
                    .semantics { role = Role.RadioButton; this.selected = selected; contentDescription = lang.nativeName }
                    .clickable { onSelect(lang) }
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = lang.nativeName,
                    color = if (selected) SosPalette.Background else SosPalette.Ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1
                )
            }
        }
    }
}

/** One-line status pill: green for verified responders, plain grey for civilians. */
@Composable
fun SosTrustBadge(reply: ResponderReply, language: SosLanguage, modifier: Modifier = Modifier) {
    if (reply.verified) {
        Column(modifier) {
            Text(
                text = SosText.VERIFIED.text(language),
                color = SosPalette.OnSafe,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(SosPalette.Safe)
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            )
            val detail = listOfNotNull(reply.roleLabel, reply.issuerNote).joinToString(" · ")
            if (detail.isNotEmpty()) Text(detail, color = SosPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
        }
    } else {
        Text(
            text = SosText.UNVERIFIED.text(language),
            color = SosPalette.Ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = modifier
                .clip(RoundedCornerShape(8.dp))
                .border(BorderStroke(1.dp, SosPalette.Muted), RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

/** A responder who answered the sender's SOS: who, how far, verified or not, and any note. */
@Composable
fun SosResponderCard(reply: ResponderReply, language: SosLanguage, modifier: Modifier = Modifier) {
    val stripe = if (reply.verified) SosPalette.Safe else SosPalette.Line
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SosPalette.Surface)
            .border(BorderStroke(1.dp, SosPalette.Line), RoundedCornerShape(12.dp))
    ) {
        Box(Modifier.width(6.dp).heightIn(min = 72.dp).background(stripe))
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(reply.callsign, color = SosPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            SosTrustBadge(reply, language)
            val hops = when (reply.hops) {
                0 -> SosText.HOPS_DIRECT.text(language)
                1 -> SosText.HOP_ONE.text(language)
                else -> SosText.HOPS_N.format(language, reply.hops)
            }
            val what = when (reply.kind) {
                AckKind.EN_ROUTE -> SosText.STAGE_EN_ROUTE.text(language)
                else -> SosText.STAGE_ACKNOWLEDGED.text(language)
            }
            Text("$what · $hops", color = SosPalette.Muted, fontSize = 14.sp)
            reply.note?.let { Text("“$it”", color = SosPalette.Ink, fontSize = 15.sp) }
        }
    }
}

/** A filled dot, ring or empty circle used by the vertical pipeline. */
@Composable
fun SosStageDot(done: Boolean, current: Boolean, size: Dp = 28.dp) {
    val fill = when {
        done -> SosPalette.Safe
        else -> SosPalette.Surface
    }
    val border = when {
        done -> SosPalette.Safe
        current -> SosPalette.Sos
        else -> SosPalette.Line
    }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(fill)
            .border(BorderStroke(3.dp, border), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        if (done) Text("✓", color = SosPalette.OnSafe, fontSize = 15.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
fun SosVerticalConnector(done: Boolean, height: Dp = 22.dp) {
    Box(
        Modifier
            .padding(start = 12.5.dp)
            .width(3.dp)
            .heightIn(min = height)
            .background(if (done) SosPalette.Safe else SosPalette.Line)
    )
}

@Composable
fun SosSectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, color = SosPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = modifier.padding(top = 8.dp))
}

@Composable
fun SosSpacer(height: Dp = 12.dp) = Spacer(Modifier.heightIn(min = height))
