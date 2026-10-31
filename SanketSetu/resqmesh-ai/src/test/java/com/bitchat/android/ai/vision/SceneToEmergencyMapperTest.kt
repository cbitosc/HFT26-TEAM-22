package com.bitchat.android.ai.vision

import org.junit.Assert.*
import org.junit.Test

/** The photo caption must never claim an emergency the picture does not show. */
class SceneToEmergencyMapperTest {

    private fun map(vararg l: Pair<String, Float>) = SceneToEmergencyMapper.mapLabels(l.toList())

    @Test
    fun `a confident emergency label is mapped`() {
        val r = map("Ambulance" to 0.9f)
        assertEquals("MEDICAL", r.emergencyType)
        assertTrue(r.description.contains("MEDICAL"))
    }

    @Test
    fun `a weak emergency label is not trusted`() {
        val r = map("Ambulance" to 0.4f)
        assertEquals("", r.emergencyType)
        assertEquals(SceneToEmergencyMapper.UNCLEAR_DESCRIPTION, r.description)
    }

    @Test
    fun `keywords match whole words only`() {
        assertEquals("", map("Member" to 0.95f).emergencyType)      // contains "EMBER"
        assertEquals("", map("Fireplace" to 0.95f).emergencyType)   // starts with "FIRE"
        assertTrue(SceneToEmergencyMapper.containsWords("Fire truck", "FIRE TRUCK"))
        assertFalse(SceneToEmergencyMapper.containsWords("Firetruck", "FIRE TRUCK"))
    }

    @Test
    fun `an ordinary photo is described only by labels the model is sure of`() {
        val r = map("Cat" to 0.92f, "Whiskers" to 0.55f)
        assertEquals("", r.emergencyType)
        assertEquals("[📷]: Cat.", r.description)
    }

    @Test
    fun `when nothing is certain the caption admits it`() {
        val r = map("Cat" to 0.3f, "Pet" to 0.2f)
        assertEquals(SceneToEmergencyMapper.UNCLEAR_DESCRIPTION, r.description)
        assertEquals("", r.emergencyType)
    }

    @Test
    fun `no labels at all stays empty so the plain image is sent`() {
        assertEquals("", SceneToEmergencyMapper.mapLabels(emptyList()).description)
    }
}
