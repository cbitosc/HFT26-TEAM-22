package com.bitchat.android.ui.sos

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitchat.android.ai.sos.ResponderRole
import com.bitchat.android.sos.SosCoordinator
import com.bitchat.android.ui.brand.Tone

/**
 * Where an NDRF / Civil Defense / medical responder installs the certificate their authority
 * issued for THIS phone's signing key. Without one, replies from this phone are labelled
 * "Unverified Civilian Relay". English only: it is used by trained personnel, not by victims.
 */
@Composable
fun ResponderDialog(onDismiss: () -> Unit) {
    val ui by SosCoordinator.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var token by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var demoRole by remember { mutableStateOf(ResponderRole.NDRF) }
    var demoCallsign by remember { mutableStateOf("NDRF-12") }
    val key = remember { SosCoordinator.mySigningKeyToken() }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SosPalette.Surface,
        title = { Text("Responder mode", color = SosPalette.Ink, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val r = ui.responder
                if (r != null) {
                    Text(
                        "✔ ${r.roleLabel} · ${r.callsign}" + (r.issuerNote?.let { " · $it" } ?: ""),
                        color = SosPalette.SafeInk, fontWeight = FontWeight.Bold, fontSize = 16.sp
                    )
                    Text("Your acknowledgements are shown as VERIFIED RESPONDENT.", color = SosPalette.Muted, fontSize = 14.sp)
                    SosOutlineButton("Remove certificate", Modifier.fillMaxWidth()) {
                        SosCoordinator.clearCertificate(); message = "Certificate removed."
                    }
                } else {
                    Text(
                        "No responder certificate. Your replies are shown as “Unverified Civilian Relay”.",
                        color = SosPalette.Ink, fontSize = 14.sp
                    )
                }

                Text("This phone's key — give it to your authority so they can certify you:", color = SosPalette.Ink, fontSize = 14.sp)
                SelectionContainer {
                    Text(key ?: "Mesh not running yet", color = SosPalette.Ink, fontFamily = FontFamily.Default, fontSize = 12.sp)
                }
                if (key != null) {
                    SosOutlineButton("Copy key", Modifier.fillMaxWidth()) {
                        (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)
                            ?.setPrimaryClip(ClipData.newPlainText("responder key", key))
                        message = "Key copied."
                    }
                }

                OutlinedTextField(
                    value = token, onValueChange = { token = it }, label = { Text("Paste certificate") },
                    modifier = Modifier.fillMaxWidth(), minLines = 2
                )
                SosPrimaryButton("Install certificate", Tone.Neutral, Modifier.fillMaxWidth(), enabled = token.isNotBlank()) {
                    val result = SosCoordinator.installCertificate(token)
                    message = result.message
                    if (result.ok) token = ""
                }

                if (SosCoordinator.demoAuthorityAvailable) {
                    Text("DEBUG BUILD ONLY — demo authority", color = SosPalette.SosInk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(
                        "Certifies this phone with a development key that is public in the repository. Labelled “DEMO AUTHORITY”. Not present in release builds.",
                        color = SosPalette.Muted, fontSize = 13.sp
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                        for (role in ResponderRole.values()) {
                            val on = demoRole == role
                            SosOutlineButton(
                                text = (if (on) "◉ " else "○ ") + role.label,
                                modifier = Modifier.weight(1f)
                            ) { demoRole = role }
                        }
                    }
                    OutlinedTextField(
                        value = demoCallsign, onValueChange = { demoCallsign = it.take(16) }, label = { Text("Callsign") },
                        singleLine = true, modifier = Modifier.fillMaxWidth()
                    )
                    SosPrimaryButton("Issue demo certificate", Tone.Sos, Modifier.fillMaxWidth()) {
                        message = SosCoordinator.issueDemoCertificate(demoRole, demoCallsign).message
                    }
                }

                message?.let { Text(it, color = SosPalette.Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
            }
        },
        confirmButton = { SosOutlineButton("Done", onClick = onDismiss) }
    )
}
