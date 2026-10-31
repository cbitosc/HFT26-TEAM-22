package com.bitchat.android.ai.topology

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

class TopologyLayoutTest {

    private fun e(a: String, b: String, ok: Boolean = true) = TopoEdge(a, b, ok)

    @Test
    fun `viewer sits in the middle and a chain gets one ring per hop`() {
        val l = TopologyLayout.layout("me", mapOf("me" to "You", "a" to "Asha", "b" to "Ravi"), listOf(e("me", "a"), e("a", "b")))
        assertEquals(0, l.node("me")!!.hops)
        assertEquals(1, l.node("a")!!.hops)
        assertEquals(2, l.node("b")!!.hops)
        assertEquals(2, l.rings)
        assertEquals(0f, l.node("me")!!.x, 0f)
        assertEquals(2, l.reachableCount)
        assertFalse(l.hasUnreachable)
    }

    @Test
    fun `radius equals hops over rings`() {
        val l = TopologyLayout.layout("me", emptyMap(), listOf(e("me", "a"), e("a", "b"), e("b", "c")))
        for (n in l.nodes.filter { !it.isSelf }) {
            val r = sqrt(n.x * n.x + n.y * n.y)
            assertEquals(n.hops / 3f, r, 1e-4f)
        }
    }

    @Test
    fun `the shortest path decides the hop count when there is a shortcut`() {
        val l = TopologyLayout.layout("me", emptyMap(), listOf(e("me", "a"), e("a", "b"), e("b", "c"), e("me", "c")))
        assertEquals(1, l.node("c")!!.hops)
    }

    @Test
    fun `siblings never share a position`() {
        val edges = (1..6).map { e("me", "n$it") }
        val l = TopologyLayout.layout("me", emptyMap(), edges)
        val pts = l.nodes.filter { !it.isSelf }.map { it.x to it.y }
        assertEquals(pts.size, pts.toSet().size)
    }

    @Test
    fun `a busy branch gets a wider wedge than a lonely one`() {
        val edges = listOf(e("me", "busy"), e("busy", "b1"), e("busy", "b2"), e("busy", "b3"), e("me", "quiet"))
        val l = TopologyLayout.layout("me", emptyMap(), edges)
        val kids = listOf("b1", "b2", "b3").map { l.node(it)!! }
        // all three grandchildren stay on the busy side of the map, away from "quiet"
        val quiet = l.node("quiet")!!
        for (k in kids) {
            val d = (k.x - quiet.x) * (k.x - quiet.x) + (k.y - quiet.y) * (k.y - quiet.y)
            assertTrue(d > 0.1f)
        }
    }

    @Test
    fun `devices with no known path go on an outer ring and are flagged`() {
        val l = TopologyLayout.layout("me", mapOf("ghost" to "Seen via relay"), listOf(e("me", "a"), e("x", "y")))
        assertTrue(l.hasUnreachable)
        assertEquals(-1, l.node("x")!!.hops)
        assertEquals(-1, l.node("ghost")!!.hops)
        val r = sqrt(l.node("x")!!.let { it.x * it.x + it.y * it.y })
        assertEquals(1f, r, 1e-4f)
        assertTrue(sqrt(l.node("a")!!.let { it.x * it.x + it.y * it.y }) < 1f)
    }

    @Test
    fun `layout is deterministic regardless of edge order`() {
        val edges = listOf(e("me", "a"), e("me", "b"), e("a", "c"), e("b", "d"))
        val one = TopologyLayout.layout("me", emptyMap(), edges)
        val two = TopologyLayout.layout("me", emptyMap(), edges.reversed())
        assertEquals(one.nodes.sortedBy { it.id }, two.nodes.sortedBy { it.id })
    }

    @Test
    fun `self loops and duplicate edges are dropped`() {
        val l = TopologyLayout.layout("me", emptyMap(), listOf(e("me", "me"), e("me", "a"), e("a", "me", false)))
        assertEquals(1, l.edges.size)
    }

    @Test
    fun `an empty mesh is just you`() {
        val l = TopologyLayout.layout("me", emptyMap(), emptyList())
        assertEquals(1, l.nodes.size)
        assertEquals(1, l.rings)
        assertEquals(0, l.reachableCount)
    }

    @Test
    fun `route finds the fewest relays`() {
        val edges = listOf(e("me", "a"), e("a", "b"), e("b", "c"), e("me", "x"), e("x", "c"))
        assertEquals(listOf("me", "x", "c"), TopologyLayout.route("me", "c", edges))
    }

    @Test
    fun `route is null when the mesh is split`() {
        assertNull(TopologyLayout.route("me", "z", listOf(e("me", "a"), e("y", "z"))))
        assertEquals(listOf("me"), TopologyLayout.route("me", "me", emptyList()))
    }
}
