package com.bitchat.android.ai.topology

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** A link between two devices. [confirmed] means both ends reported it; otherwise only one did. */
data class TopoEdge(val a: String, val b: String, val confirmed: Boolean)

/**
 * A device placed on the map. (x, y) are in the unit disc with the viewer at (0, 0); [hops] is the shortest
 * relay distance from the viewer, or -1 when the device is known about but no path to it is known yet.
 */
data class PlacedNode(val id: String, val label: String, val hops: Int, val x: Float, val y: Float, val isSelf: Boolean)

data class MeshLayout(
    val nodes: List<PlacedNode>,
    val edges: List<TopoEdge>,
    /** Number of hop rings to draw (the deepest reachable hop, at least 1). */
    val rings: Int,
    /** True when some devices have no known path and sit on the outer "seen via relay" ring. */
    val hasUnreachable: Boolean
) {
    val reachableCount: Int get() = nodes.count { it.hops >= 0 && !it.isSelf }
    fun node(id: String): PlacedNode? = nodes.firstOrNull { it.id == id }
}

/**
 * Turns gossip-learned adjacency into a picture that works with no internet: the viewer in the middle,
 * each ring one more relay hop away, every branch of the mesh fanned out in its own wedge so links rarely
 * cross. Pure maths, so it is unit-tested without a screen.
 */
object TopologyLayout {

    fun layout(selfId: String, labels: Map<String, String>, edges: List<TopoEdge>): MeshLayout {
        val cleanEdges = edges.filter { it.a != it.b }
            .distinctBy { if (it.a <= it.b) it.a to it.b else it.b to it.a }
        val adjacency = HashMap<String, MutableSet<String>>()
        for (e in cleanEdges) {
            adjacency.getOrPut(e.a) { sortedSetOf() }.add(e.b)
            adjacency.getOrPut(e.b) { sortedSetOf() }.add(e.a)
        }
        val ids = (labels.keys + adjacency.keys + selfId).toSortedSet()

        // Breadth-first from the viewer. Sorted neighbours keep the layout stable between redraws.
        val hops = HashMap<String, Int>()
        val children = HashMap<String, MutableList<String>>()
        hops[selfId] = 0
        val queue = ArrayDeque<String>().also { it.add(selfId) }
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            for (n in adjacency[cur].orEmpty()) {
                if (n in hops) continue
                hops[n] = hops.getValue(cur) + 1
                children.getOrPut(cur) { mutableListOf() }.add(n)
                queue.add(n)
            }
        }

        val weight = HashMap<String, Int>()
        fun weigh(id: String): Int = weight.getOrPut(id) {
            val kids = children[id].orEmpty()
            if (kids.isEmpty()) 1 else kids.sumOf { weigh(it) }
        }
        weigh(selfId)

        val deepest = hops.values.maxOrNull() ?: 0
        val unreachable = ids.filter { it !in hops }
        val rings = maxOf(deepest, 1)
        val outer = rings + if (unreachable.isNotEmpty()) 1 else 0

        val placed = ArrayList<PlacedNode>()
        placed += PlacedNode(selfId, labels[selfId] ?: "You", 0, 0f, 0f, true)

        fun place(id: String, start: Double, end: Double) {
            val kids = children[id].orEmpty()
            val total = kids.sumOf { weigh(it) }.coerceAtLeast(1)
            var cursor = start
            for (k in kids) {
                val span = (end - start) * weigh(k) / total
                val mid = cursor + span / 2
                val h = hops.getValue(k)
                // A relay chain would otherwise sit on one straight line with its labels on top of each other,
                // so alternate hops swing a little to either side. Angle only: the radius still equals the hop count.
                val swing = if (h >= 2) (if (h % 2 == 0) 1 else -1) * minOf(SWING_RADIANS, span / 3) else 0.0
                val r = h.toDouble() / outer
                placed += PlacedNode(k, labels[k] ?: shortId(k), h, (r * cos(mid + swing)).toFloat(), (r * sin(mid + swing)).toFloat(), false)
                place(k, cursor, cursor + span)
                cursor += span
            }
        }
        place(selfId, -PI / 2, 3 * PI / 2)

        unreachable.forEachIndexed { i, id ->
            val a = -PI / 2 + 2 * PI * (i + 0.5) / unreachable.size
            placed += PlacedNode(id, labels[id] ?: shortId(id), -1, cos(a).toFloat(), sin(a).toFloat(), false)
        }

        return MeshLayout(placed, cleanEdges, rings, unreachable.isNotEmpty())
    }

    /** Shortest relay path from [from] to [to] (inclusive), or null when the mesh has no known route. */
    fun route(from: String, to: String, edges: List<TopoEdge>): List<String>? {
        if (from == to) return listOf(from)
        val adjacency = HashMap<String, MutableSet<String>>()
        for (e in edges) {
            adjacency.getOrPut(e.a) { sortedSetOf() }.add(e.b)
            adjacency.getOrPut(e.b) { sortedSetOf() }.add(e.a)
        }
        val prev = HashMap<String, String>()
        val queue = ArrayDeque<String>().also { it.add(from) }
        val seen = hashSetOf(from)
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            for (n in adjacency[cur].orEmpty()) {
                if (!seen.add(n)) continue
                prev[n] = cur
                if (n == to) {
                    val path = ArrayList<String>()
                    var at: String? = to
                    while (at != null) { path += at; at = prev[at] }
                    return path.reversed()
                }
                queue.add(n)
            }
        }
        return null
    }

    private const val SWING_RADIANS = 0.32

    private fun shortId(id: String) = "Node " + id.take(6)
}
