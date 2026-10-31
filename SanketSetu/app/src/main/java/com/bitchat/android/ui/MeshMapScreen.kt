package com.bitchat.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitchat.android.ai.topology.MeshLayout
import com.bitchat.android.ai.topology.PlacedNode
import com.bitchat.android.ai.topology.TopoEdge
import com.bitchat.android.ai.topology.TopologyLayout
import com.bitchat.android.services.meshgraph.MeshGraphService
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
import kotlin.math.hypot
import kotlin.math.min

/** Builds the map from the gossip graph, the live neighbour list and known names. All of it is local state. */
fun buildMeshLayout(
    selfId: String,
    snapshot: MeshGraphService.GraphSnapshot,
    directPeers: Collection<String>,
    nicknames: Map<String, String>
): MeshLayout {
    val edges = snapshot.edges.map { TopoEdge(it.a, it.b, it.isConfirmed) }.toMutableList()
    // We know our own radio links first-hand; do not wait for the next gossip round to show them.
    for (p in directPeers) if (p != selfId) edges += TopoEdge(selfId, p, true)
    val labels = HashMap<String, String>()
    for (n in snapshot.nodes) n.nickname?.takeIf { it.isNotBlank() }?.let { labels[n.peerID] = it }
    for ((id, nick) in nicknames) if (nick.isNotBlank()) labels[id] = nick
    labels[selfId] = "You"
    return TopologyLayout.layout(selfId, labels, edges)
}

/** How to describe a device's distance in words. */
fun hopsLabel(hops: Int): String = when {
    hops < 0 -> "No known route"
    hops == 0 -> "You"
    hops == 1 -> "Direct"
    else -> "$hops hops"
}

@Composable
fun MeshMapContent(
    layout: MeshLayout,
    onDirectChat: (peerId: String) -> Unit,
    modifier: Modifier = Modifier,
    initialSelectedId: String? = null
) {
    val c = Sanket.colors
    var selectedId by remember { mutableStateOf(initialSelectedId) }
    val selected = selectedId?.let { layout.node(it) }
    val selfId = layout.nodes.first { it.isSelf }.id
    val route = selected?.takeIf { !it.isSelf && it.hops >= 0 }?.let { TopologyLayout.route(selfId, it.id, layout.edges) }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(c.paper),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            ScreenHeader(
                icon = Icons.Filled.Hub,
                title = "Mesh map",
                subtitle = "Who relays for whom. Works with no internet.",
                tone = Tone.Violet,
                trailing = {
                    StatusPill(
                        text = if (layout.reachableCount == 0) "Alone" else "${layout.reachableCount} on the mesh",
                        tone = if (layout.reachableCount == 0) Tone.Warn else Tone.Safe,
                        dot = true
                    )
                }
            )
        }

        if (layout.nodes.size == 1) {
            item {
                EmptyState(
                    icon = Icons.Filled.Hub,
                    title = "No other phones yet",
                    body = "When another SanketSetu phone comes into Bluetooth range it joins this map. Phones that reach you through a relay appear on the outer rings.",
                    tone = Tone.Violet
                )
            }
        } else {
            item {
                SanketCard {
                    MeshMapCanvas(layout, selectedId, route.orEmpty(), onSelect = { selectedId = it })
                    Legend()
                }
            }
            if (selected != null && !selected.isSelf) {
                item { SelectionCard(selected, route, labelOf = { id -> layout.node(id)?.label ?: id.take(6) }, onChat = { onDirectChat(selected.id) }) }
            }
            item { SanketSectionLabel("Devices (${layout.nodes.size - 1})") }
            items(layout.nodes.filter { !it.isSelf }.sortedWith(compareBy({ if (it.hops < 0) Int.MAX_VALUE else it.hops }, { it.label })), key = { it.id }) { n ->
                DeviceRow(n, selected = n.id == selectedId, onClick = { selectedId = if (selectedId == n.id) null else n.id })
            }
        }
    }
}

@Composable
private fun MeshMapCanvas(layout: MeshLayout, selectedId: String?, route: List<String>, onSelect: (String?) -> Unit) {
    val c = Sanket.colors
    val measurer = rememberTextMeasurer()
    val routeEdges = remember(route) { route.zipWithNext().map { (a, b) -> if (a <= b) a to b else b to a }.toSet() }
    val outer = layout.rings + if (layout.hasUnreachable) 1 else 0
    val summary = "Mesh map. ${layout.reachableCount} devices reachable across ${layout.rings} hops" +
        if (layout.hasUnreachable) ", some seen only through relays." else "."

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(340.dp)
            .semantics { contentDescription = summary }
            .pointerInput(layout) {
                detectTapGestures { tap ->
                    val center = Offset(size.width / 2f, size.height / 2f)
                    val maxR = min(size.width, size.height) / 2f - 30.dp.toPx()
                    val hit = layout.nodes
                        .map { it to hypot(center.x + it.x * maxR - tap.x, center.y + it.y * maxR - tap.y) }
                        .filter { it.second <= 28.dp.toPx() }
                        .minByOrNull { it.second }?.first
                    onSelect(hit?.takeIf { !it.isSelf }?.id)
                }
            }
    ) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val maxR = min(size.width, size.height) / 2f - 30.dp.toPx()
        fun pos(n: PlacedNode) = Offset(center.x + n.x * maxR, center.y + n.y * maxR)
        val dash = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx()))
        val labelStyle = TextStyle(color = c.muted, fontSize = 10.sp, fontWeight = FontWeight.Medium)

        // hop rings
        for (k in 1..layout.rings) {
            val r = maxR * k / outer
            drawCircle(c.line, radius = r, center = center, style = Stroke(1.5.dp.toPx(), pathEffect = dash))
            val txt = measurer.measure(if (k == 1) "direct" else "$k hops", labelStyle)
            drawText(txt, topLeft = Offset(center.x - txt.size.width / 2f, center.y - r - txt.size.height - 1.dp.toPx()))
        }
        if (layout.hasUnreachable) {
            drawCircle(c.muted.copy(alpha = 0.45f), radius = maxR, center = center,
                style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 7.dp.toPx()))))
            val txt = measurer.measure("route unknown", labelStyle)
            drawText(txt, topLeft = Offset(center.x - txt.size.width / 2f, center.y - maxR - txt.size.height - 1.dp.toPx()))
        }

        // links: solid when both ends agree, dashed when only one end reported it, blue along the chosen route
        val byId = layout.nodes.associateBy { it.id }
        for (e in layout.edges) {
            val a = byId[e.a] ?: continue
            val b = byId[e.b] ?: continue
            if (a.hops < 0 && b.hops < 0) continue // a separate island: a line across the map would mislead
            val onRoute = (if (e.a <= e.b) e.a to e.b else e.b to e.a) in routeEdges
            if (onRoute) {
                drawLine(c.blue, pos(a), pos(b), strokeWidth = 3.5.dp.toPx(), cap = StrokeCap.Round)
            } else {
                drawLine(
                    c.muted.copy(alpha = 0.55f), pos(a), pos(b), strokeWidth = 1.5.dp.toPx(), cap = StrokeCap.Round,
                    pathEffect = if (e.confirmed) null else PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 5.dp.toPx()))
                )
            }
        }

        // devices
        for (n in layout.nodes) {
            val p = pos(n)
            val fill = when {
                n.isSelf -> c.ink
                n.hops < 0 -> c.surface
                n.hops == 1 -> c.safe
                n.hops == 2 -> c.blue
                else -> c.violet
            }
            val radius = if (n.isSelf) 11.dp.toPx() else 9.dp.toPx()
            if (n.id == selectedId) drawCircle(c.blue, radius = radius + 7.dp.toPx(), center = p, style = Stroke(2.5.dp.toPx()))
            drawCircle(c.surface, radius = radius + 2.dp.toPx(), center = p)
            drawCircle(fill, radius = radius, center = p)
            if (n.hops < 0) drawCircle(c.muted, radius = radius, center = p, style = Stroke(2.dp.toPx(), pathEffect = dash))

            val name = if (n.label.length > 11) n.label.take(10) + "…" else n.label
            val txt = measurer.measure(name, TextStyle(color = c.ink, fontSize = 11.sp, fontWeight = FontWeight.SemiBold))
            // alternate labels above / below so neighbours on the same ring never overprint each other
            val above = !n.isSelf && n.hops >= 2 && n.hops % 2 == 0
            val labelY = if (above) p.y - radius - txt.size.height - 5.dp.toPx() else p.y + radius + 4.dp.toPx()
            val tl = Offset((p.x - txt.size.width / 2f).coerceIn(2.dp.toPx(), size.width - txt.size.width - 2.dp.toPx()), labelY)
            drawRoundRect(c.surface.copy(alpha = 0.85f), topLeft = Offset(tl.x - 3.dp.toPx(), tl.y - 1.dp.toPx()),
                size = androidx.compose.ui.geometry.Size(txt.size.width + 6.dp.toPx(), txt.size.height + 2.dp.toPx()),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()))
            drawText(txt, topLeft = tl)
        }
    }
}

@Composable
private fun Legend() {
    val c = Sanket.colors
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        LegendDot(c.ink, "You")
        LegendDot(c.safe, "Direct")
        LegendDot(c.blue, "2 hops")
        LegendDot(c.violet, "3+")
    }
    Text(
        "Solid line: both phones confirm the link. Dashed: only one has reported it. Tap a device to trace its route.",
        color = c.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)
    )
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
        Text(label, color = Sanket.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SelectionCard(node: PlacedNode, route: List<String>?, labelOf: (String) -> String, onChat: () -> Unit) {
    val c = Sanket.colors
    SanketCard(accent = c.blue) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(node.label, color = c.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(
                    when {
                        node.hops < 0 -> "No relay path known yet. A message is still flooded through the mesh and may get there."
                        node.hops == 1 -> "Direct link, no relay needed."
                        else -> "${node.hops} hops, relayed by ${node.hops - 1} ${if (node.hops == 2) "phone" else "phones"}."
                    },
                    color = c.muted, fontSize = 13.sp
                )
            }
            SanketButton(text = "Chat", icon = Icons.Filled.Chat, onClick = onChat)
        }
        if (route != null && route.size > 2) {
            Text("Route", color = c.muted, fontSize = 11.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 8.dp))
            Text(
                route.joinToString("  →  ") { id -> if (id == route.first()) "You" else labelOf(id) },
                color = Tone.Blue.ink(), fontSize = 13.sp, fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun DeviceRow(node: PlacedNode, selected: Boolean, onClick: () -> Unit) {
    val c = Sanket.colors
    val tone = when {
        node.hops < 0 -> Tone.Neutral
        node.hops == 1 -> Tone.Safe
        node.hops == 2 -> Tone.Blue
        else -> Tone.Violet
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) tone.soft() else c.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(node.label, color = c.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
        StatusPill(text = hopsLabel(node.hops), tone = tone)
    }
}
