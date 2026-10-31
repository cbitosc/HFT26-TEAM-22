package com.bitchat.android.ui
// [Goose] TODO: Replace inline file attachment stub with FilePickerButton abstraction that dispatches via FileShareDispatcher


import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.R
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.withStyle
import com.bitchat.android.ui.theme.BASE_FONT_SIZE
import com.bitchat.android.ai.voice.normalizeAmplitudeSample
import com.bitchat.android.ai.voice.AudioWaveformExtractor
import com.bitchat.android.ui.media.RealtimeScrollingWaveform
import com.bitchat.android.ui.media.ImagePickerButton
import com.bitchat.android.ui.media.FilePickerButton
import com.bitchat.android.ui.media.PhotoReportButton

/**
 * Input components for ChatScreen
 * Extracted from ChatScreen.kt for better organization
 */

/**
 * VisualTransformation that styles slash commands with background and color
 * while preserving cursor positioning and click handling
 */
class SlashCommandVisualTransformation(
    private val commandColor: Color = Color(0xFF4F6BFF)
) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val slashCommandRegex = Regex("(/\\w+)(?=\\s|$)")
        val annotatedString = buildAnnotatedString {
            var lastIndex = 0

            slashCommandRegex.findAll(text.text).forEach { match ->
                // Add text before the match
                if (match.range.first > lastIndex) {
                    append(text.text.substring(lastIndex, match.range.first))
                }

                // Add the styled slash command
                withStyle(
                    style = SpanStyle(
                        color = commandColor,
                        fontFamily = FontFamily.Default,
                        fontWeight = FontWeight.Medium,
                        background = Color(0xFF2D2D2D) // Dark gray background
                    )
                ) {
                    append(match.value)
                }

                lastIndex = match.range.last + 1
            }

            // Add remaining text
            if (lastIndex < text.text.length) {
                append(text.text.substring(lastIndex))
            }
        }

        return TransformedText(
            text = annotatedString,
            offsetMapping = OffsetMapping.Identity
        )
    }
}

/**
 * VisualTransformation that styles mentions with background and color
 * while preserving cursor positioning and click handling
 */
class MentionVisualTransformation(
    private val mentionColor: Color = Color(0xFF9A4508)
) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val mentionRegex = Regex("@([a-zA-Z0-9_]+)")
        val annotatedString = buildAnnotatedString {
            var lastIndex = 0
            
            mentionRegex.findAll(text.text).forEach { match ->
                // Add text before the match
                if (match.range.first > lastIndex) {
                    append(text.text.substring(lastIndex, match.range.first))
                }
                
                // Add the styled mention
                withStyle(
                    style = SpanStyle(
                        color = mentionColor,
                        fontFamily = FontFamily.Default,
                        fontWeight = FontWeight.SemiBold
                    )
                ) {
                    append(match.value)
                }
                
                lastIndex = match.range.last + 1
            }
            
            // Add remaining text
            if (lastIndex < text.text.length) {
                append(text.text.substring(lastIndex))
            }
        }
        
        return TransformedText(
            text = annotatedString,
            offsetMapping = OffsetMapping.Identity
        )
    }
}

/**
 * VisualTransformation that combines multiple visual transformations
 */
class CombinedVisualTransformation(private val transformations: List<VisualTransformation>) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        var resultText = text
        
        // Apply each transformation in order
        transformations.forEach { transformation ->
            resultText = transformation.filter(resultText).text
        }
        
        return TransformedText(
            text = resultText,
            offsetMapping = OffsetMapping.Identity
        )
    }
}





@Composable
fun MessageInput(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    onSend: () -> Unit,
    onSendVoiceNote: (String?, String?, String) -> Unit,
    onSendImageNote: (String?, String?, String) -> Unit,
    onSendFileNote: (String?, String?, String) -> Unit,
    onSceneAnalyzed: (description: String, imagePath: String, emergencyType: String) -> Unit,
    selectedPrivatePeer: String?,
    currentChannel: String?,
    nickname: String,
    showMediaButtons: Boolean,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val isFocused = remember { mutableStateOf(false) }
    val hasText = value.text.isNotBlank() // Check if there's text for send button state
    val keyboard = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }
    // VoiceRecordButton removed — isRecording / elapsedMs / amplitude no longer needed.
    // Kept as comments for reference; do not delete.
    // var isRecording by remember { mutableStateOf(false) }
    // var elapsedMs by remember { mutableStateOf(0L) }
    // var amplitude by remember { mutableStateOf(0) }

    Row(
        modifier = modifier.padding(horizontal = 12.dp, vertical = 8.dp), // Reduced padding
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Text input with placeholder OR visualizer when recording
        Box(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(24.dp))
                .background(colorScheme.surfaceVariant)
                .padding(horizontal = 18.dp, vertical = 13.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            // Always keep the text field mounted to retain focus and avoid IME collapse
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                textStyle = MaterialTheme.typography.bodyMedium.copy(
                    color = colorScheme.onSurface,
                    fontFamily = FontFamily.Default
                ),
                cursorBrush = SolidColor(colorScheme.primary),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { 
                    if (hasText) onSend() // Only send if there's text
                }),
                visualTransformation = CombinedVisualTransformation(
                    listOf(
                        SlashCommandVisualTransformation(colorScheme.primary),
                        MentionVisualTransformation(com.bitchat.android.ui.brand.Sanket.colors.warnInk)
                    )
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .onFocusChanged { focusState ->
                        isFocused.value = focusState.isFocused
                    }
            )

            if (value.text.isEmpty()) {
                Text(
                    text = stringResource(R.string.type_a_message_placeholder),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Default
                    ),
                    color = colorScheme.onSurfaceVariant, // Muted
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // ── DISABLED: real-time waveform overlay (was shown while VoiceRecordButton active) ──
            // if (isRecording) {
            //     Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            //         RealtimeScrollingWaveform(
            //             modifier = Modifier.weight(1f).height(32.dp),
            //             amplitudeNorm = normalizeAmplitudeSample(amplitude)
            //         )
            //         Spacer(Modifier.width(20.dp))
            //         val secs = (elapsedMs / 1000).toInt()
            //         val mm = secs / 60; val ss = secs % 60
            //         val maxSecs = 10; val maxMm = maxSecs / 60; val maxSs = maxSecs % 60
            //         Text(
            //             text = String.format("%02d:%02d / %02d:%02d", mm, ss, maxMm, maxSs),
            //             fontFamily = FontFamily.Default, color = colorScheme.primary,
            //             fontSize = (BASE_FONT_SIZE - 4).sp
            //         )
            //     }
            // }
        }
        Spacer(modifier = Modifier.width(8.dp)) // Reduced spacing
        
        // Media buttons — visible when no text is typed (only in Mesh chat)
        if (value.text.isEmpty() && showMediaButtons) {
            val bg = colorScheme.primary

            val latestSelectedPeer = rememberUpdatedState(selectedPrivatePeer)
            val latestChannel = rememberUpdatedState(currentChannel)

            // ── PhotoReportButton — ML Kit scene analysis ─────────────────────────────────
            // Single click: gallery  |  Long click: camera
            // Analyzes image → fills TextField with emergency description.
            // Falls back to plain image send if ML Kit returns no labels.
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                // ── DISABLED: plain ImagePickerButton (sends image as attachment directly) ──
                // Replaced by PhotoReportButton. Kept for reference — do not delete.
                // ImagePickerButton(onImageReady = { outPath ->
                //     onSendImageNote(latestSelectedPeer.value, latestChannel.value, outPath)
                // })
                //
                // DISABLED: FilePickerButton
                // FilePickerButton(onFileReady = { path ->
                //     onSendFileNote(latestSelectedPeer.value, latestChannel.value, path)
                // })

                PhotoReportButton(
                    onSceneAnalyzed = { description, imagePath, emergencyType ->
                        onSceneAnalyzed(description, imagePath, emergencyType)
                    },
                    onImageReady = { outPath ->
                        // ML Kit hard failure — send as plain image (old ImagePickerButton behavior)
                        onSendImageNote(latestSelectedPeer.value, latestChannel.value, outPath)
                    }
                )
            }

            Spacer(Modifier.width(1.dp))

            // ── DISABLED: VoiceRecordButton (sends audio as attachment) ──────────────────
            // Replaced by VoskTranscribeButton below which converts speech to text instead.
            // Kept for reference — do not delete.
            // VoiceRecordButton(
            //     backgroundColor = bg,
            //     onStart = {
            //         isRecording = true; elapsedMs = 0L
            //         if (isFocused.value) { try { focusRequester.requestFocus() } catch (_: Exception) {} }
            //     },
            //     onAmplitude = { amp, ms -> amplitude = amp; elapsedMs = ms },
            //     onFinish = { path ->
            //         isRecording = false
            //         AudioWaveformExtractor.extractAsync(path, sampleCount = 120) { arr ->
            //             if (arr != null) { try { com.bitchat.android.ai.voice.VoiceWaveformCache.put(path, arr) } catch (_: Exception) {} }
            //         }
            //         latestOnSendVoiceNote.value(latestSelectedPeer.value, latestChannel.value, path)
            //     }
            // )

            // ── VoskTranscribeButton — speech → text inserted into TextField ──────────────
            val latestOnValueChange = rememberUpdatedState(onValueChange)
            val latestValue = rememberUpdatedState(value)
            VoskTranscribeButton(
                enabled = true,
                backgroundColor = bg,
                onTranscribed = { text ->
                    val current = latestValue.value.text
                    // Prefix with [🎤] when starting a new message (mirrors [📷] for photo-to-text)
                    val newText = when {
                        current.isEmpty() -> "[🎤] $text"
                        current.contains("[🎤]") || current.contains("[📷]") -> "$current $text"
                        else -> "$current $text"
                    }
                    latestOnValueChange.value(
                        TextFieldValue(newText, TextRange(newText.length))
                    )
                }
            )

        } else {
            // Send button with enabled/disabled state
            IconButton(
                onClick = { if (hasText) onSend() }, // Only execute if there's text
                enabled = hasText, // Enable only when there's text
                modifier = Modifier.size(48.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            color = if (hasText) colorScheme.primary else colorScheme.surfaceVariant,
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.ArrowUpward,
                        contentDescription = stringResource(id = R.string.send_message),
                        modifier = Modifier.size(22.dp),
                        tint = if (hasText) colorScheme.onPrimary else colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    // Auto-stop handled inside VoiceRecordButton
}

@Composable
fun CommandSuggestionsBox(
    suggestions: List<CommandSuggestion>,
    onSuggestionClick: (CommandSuggestion) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme

    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .background(colorScheme.surface)
            .border(1.dp, colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
            .padding(vertical = 8.dp)
    ) {
        suggestions.forEach { suggestion: CommandSuggestion ->
            CommandSuggestionItem(
                suggestion = suggestion,
                onClick = { onSuggestionClick(suggestion) }
            )
        }
    }
}

@Composable
fun CommandSuggestionItem(
    suggestion: CommandSuggestion,
    onClick: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 3.dp)
            .background(Color.Gray.copy(alpha = 0.1f)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Show all aliases together
        val allCommands = if (suggestion.aliases.isNotEmpty()) {
            listOf(suggestion.command) + suggestion.aliases
        } else {
            listOf(suggestion.command)
        }

        Text(
            text = allCommands.joinToString(", "),
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Default,
                fontWeight = FontWeight.Medium
            ),
            color = colorScheme.primary,
            fontSize = (BASE_FONT_SIZE - 4).sp
        )

        // Show syntax if any
        suggestion.syntax?.let { syntax ->
            Text(
                text = syntax,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Default
                ),
                color = colorScheme.onSurface.copy(alpha = 0.8f),
                fontSize = (BASE_FONT_SIZE - 5).sp
            )
        }

        // Show description
        Text(
            text = suggestion.description,
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Default
            ),
            color = colorScheme.onSurface.copy(alpha = 0.7f),
            fontSize = (BASE_FONT_SIZE - 5).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun MentionSuggestionsBox(
    suggestions: List<String>,
    onSuggestionClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    
    Column(
        modifier = modifier
            .background(colorScheme.surface)
            .border(1.dp, colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
            .padding(vertical = 8.dp)
    ) {
        suggestions.forEach { suggestion: String ->
            MentionSuggestionItem(
                suggestion = suggestion,
                onClick = { onSuggestionClick(suggestion) }
            )
        }
    }
}

@Composable
fun MentionSuggestionItem(
    suggestion: String,
    onClick: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 3.dp)
            .background(Color.Gray.copy(alpha = 0.1f)),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = stringResource(R.string.mention_suggestion_at, suggestion),
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Default,
                fontWeight = FontWeight.SemiBold
            ),
            color = Color(0xFFFF9500), // Orange like mentions
            fontSize = (BASE_FONT_SIZE - 4).sp
        )
        
        Spacer(modifier = Modifier.weight(1f))
        
        Text(
            text = stringResource(R.string.mention),
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Default
            ),
            color = colorScheme.onSurface.copy(alpha = 0.7f),
            fontSize = (BASE_FONT_SIZE - 5).sp
        )
    }
}
