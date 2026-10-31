package com.bitchat.android.snapshot

import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.bitchat.android.ui.theme.BitchatTheme
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Design-review tool, not a regression test: renders screens to PNG under app/build/ui-snapshots/.
 * Skipped unless the environment variable SNAPSHOTS=1 is set, so normal test runs stay fast:
 *
 *     SNAPSHOTS=1 ./gradlew :app:testDebugUnitTest --tests '*UiSnapshotTest*'
 *
 * Rendering is Robolectric native graphics on the JVM — layout, colour and spacing are faithful, but fonts and
 * emoji come from the host, so glyph shapes can differ from a phone.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w412dp-h915dp-port-xhdpi")
abstract class SnapshotBase {
    @get:Rule val rule = createEmptyComposeRule()

    @Before
    fun registerHostActivity() {
        assumeTrue("set SNAPSHOTS=1 to render", System.getenv("SNAPSHOTS") == "1")
        // Must happen before the activity is launched, hence the empty rule + manual launch in snap().
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app.packageName, ComponentActivity::class.java.name))
    }

    /** Renders [content] after letting animations run for [settleMs] and writes build/ui-snapshots/[name].png. */
    protected fun snap(name: String, dark: Boolean = false, settleMs: Long = 2_000, content: @Composable () -> Unit) {
        val scenario = ActivityScenario.launch(ComponentActivity::class.java)
        rule.mainClock.autoAdvance = false
        scenario.onActivity { it.setContent { BitchatTheme(darkTheme = dark) { Box(Modifier.fillMaxSize()) { content() } } } }
        rule.mainClock.advanceTimeBy(settleMs)
        var bmp: android.graphics.Bitmap? = null
        scenario.onActivity { act ->
            val dm = act.resources.displayMetrics
            val w = dm.widthPixels
            val h = dm.heightPixels
            val root = act.window.decorView
            root.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(w, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(h, android.view.View.MeasureSpec.EXACTLY)
            )
            root.layout(0, 0, w, h)
            bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
            root.draw(android.graphics.Canvas(bmp!!))
        }
        val dir = File("build/ui-snapshots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp!!.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        scenario.close()
    }
}

class OnboardingSnapshotTest : SnapshotBase() {
    @Test
    fun loadScreen() = snap("00_load_screen") {
        com.bitchat.android.onboarding.InitializingScreen(Modifier.fillMaxSize())
    }

    @Test
    fun loadScreenMidAnimation() = snap("00_load_screen_mid", settleMs = 700) {
        com.bitchat.android.onboarding.InitializingScreen(Modifier.fillMaxSize())
    }
}

/** Shared fixtures so every section is rendered with believable data. */
internal object Fixtures {
    val now = java.util.Date()

    fun msg(id: String, sender: String, text: String, minutesAgo: Int = 3) = com.bitchat.android.model.BitchatMessage(
        id = id, sender = sender, content = text,
        timestamp = java.util.Date(now.time - minutesAgo * 60_000L), senderPeerID = "a1b2c3d4e5f60718"
    )

    fun cls(p: com.bitchat.android.ai.classifier.MessagePriority, type: String, conf: Float = 0.93f) =
        com.bitchat.android.ai.classifier.ClassificationResult(p, conf, type, "fixture")

    val alertMessages = listOf(
        msg("1", "meera", "Man collapsed near the bus stand, not breathing, need medic urgently", 2),
        msg("2", "ravi", "Building on 4th cross has collapsed, people trapped under rubble", 5),
        msg("3", "anita", "Fire spreading in the market, smoke everywhere, exit blocked", 8),
        msg("4", "joseph", "Water rising fast on Temple Road, need a boat", 12),
        msg("5", "kiran", "Relief camp at school has drinking water and baby formula", 20)
    )

    fun alertClassifications() = androidx.compose.runtime.mutableStateMapOf(
        "1" to cls(com.bitchat.android.ai.classifier.MessagePriority.CRITICAL, "MEDICAL"),
        "2" to cls(com.bitchat.android.ai.classifier.MessagePriority.CRITICAL, "COLLAPSE", 0.88f),
        "3" to cls(com.bitchat.android.ai.classifier.MessagePriority.HIGH, "FIRE", 0.91f),
        "4" to cls(com.bitchat.android.ai.classifier.MessagePriority.HIGH, "FLOOD", 0.86f),
        "5" to cls(com.bitchat.android.ai.classifier.MessagePriority.NORMAL, "RESOURCE_REQUEST", 0.74f)
    )
}

class SectionSnapshotTest : SnapshotBase() {
    private fun tabs(tab: com.bitchat.android.ui.MainScreenTab, sosActive: Boolean = false, acks: Int = 0, body: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit): @Composable () -> Unit = {
        androidx.compose.foundation.layout.Column(Modifier.fillMaxSize().paperBg()) {
            androidx.compose.foundation.layout.Spacer(Modifier.height(36.dp))
            com.bitchat.android.ui.brand.SanketTabBar(
                currentTab = tab, onTabSelect = {}, sosActive = sosActive, sosAckCount = acks,
                emergencyCount = 5, connectedPeersCount = 4
            )
            body()
        }
    }

    private fun alerts(name: String, dark: Boolean) = snap(name, dark) {
        tabs(com.bitchat.android.ui.MainScreenTab.ALERTS) {
            com.bitchat.android.ui.AlertsFeedTabScreen(
                classificationCache = Fixtures.alertClassifications(), messages = Fixtures.alertMessages,
                currentUserNickname = "me", peersConnected = 4, currentChannel = "#mesh",
                onNavigateToChat = {}, onGenerateReport = {}, modifier = Modifier.weight(1f)
            )
        }()
    }
    @Test fun alertsLight() = alerts("10_alerts_light", false)
    @Test fun alertsDark() = alerts("10_alerts_dark", true)

    @Test fun aiLight() = snap("11_ai_light") {
        tabs(com.bitchat.android.ui.MainScreenTab.AI) {
            com.bitchat.android.ui.AiTriageContent(
                com.bitchat.android.ui.AiCapabilities(neuralText = true, photoScene = true, voice = false), Modifier.weight(1f)
            )
        }()
    }
    @Test fun aiDark() = snap("11_ai_dark", dark = true) {
        tabs(com.bitchat.android.ui.MainScreenTab.AI) {
            com.bitchat.android.ui.AiTriageContent(
                com.bitchat.android.ui.AiCapabilities(neuralText = true, photoScene = true, voice = false), Modifier.weight(1f)
            )
        }()
    }

    private val radarPeers = listOf(
        com.bitchat.android.ui.RadarPeer("a1b2c3d4e5f60718", "meera", -52),
        com.bitchat.android.ui.RadarPeer("b2c3d4e5f6071829", "ravi", -71),
        com.bitchat.android.ui.RadarPeer("c3d4e5f607182930", "anita", -88),
        com.bitchat.android.ui.RadarPeer("d4e5f60718293041", "node 4", null)
    )
    @Test fun radarLight() = snap("12_radar_light") {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshRadarContent(radarPeers, onDirectChat = {}, modifier = Modifier.weight(1f))
        }()
    }
    @Test fun radarDark() = snap("12_radar_dark", dark = true) {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshRadarContent(radarPeers, onDirectChat = {}, modifier = Modifier.weight(1f))
        }()
    }
    @Test fun radarEmpty() = snap("12_radar_empty") {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshRadarContent(emptyList(), onDirectChat = {}, modifier = Modifier.weight(1f))
        }()
    }

    private fun sampleMesh(): com.bitchat.android.ai.topology.MeshLayout {
        val e = { a: String, b: String, ok: Boolean -> com.bitchat.android.ai.topology.TopoEdge(a, b, ok) }
        return com.bitchat.android.ai.topology.TopologyLayout.layout(
            "me",
            mapOf("me" to "You", "meera" to "meera", "ravi" to "ravi", "anita" to "anita", "dev" to "dev", "kiran" to "kiran", "ghost" to "Shelter 3"),
            listOf(e("me", "meera", true), e("me", "ravi", true), e("meera", "anita", true), e("ravi", "anita", false),
                e("anita", "dev", true), e("ravi", "kiran", true), e("x1", "x2", true))
        )
    }
    @Test fun meshMapLight() = snap("12_mesh_map_light") {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshMapContent(sampleMesh(), onDirectChat = {}, modifier = Modifier.weight(1f), initialSelectedId = "dev")
        }()
    }
    @Test fun meshMapDark() = snap("12_mesh_map_dark", dark = true) {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshMapContent(sampleMesh(), onDirectChat = {}, modifier = Modifier.weight(1f), initialSelectedId = "dev")
        }()
    }
    @Test fun meshMapEmpty() = snap("12_mesh_map_empty") {
        tabs(com.bitchat.android.ui.MainScreenTab.RADAR) {
            com.bitchat.android.ui.MeshMapContent(
                com.bitchat.android.ai.topology.TopologyLayout.layout("me", emptyMap(), emptyList()),
                onDirectChat = {}, modifier = Modifier.weight(1f)
            )
        }()
    }

    @Test fun sosIdleLight() = snap("13_sos_idle_light") {
        tabs(com.bitchat.android.ui.MainScreenTab.SOS) {
            com.bitchat.android.ui.sos.EmergencySosTabScreen(connectedPeersCount = 4, modifier = Modifier.weight(1f))
        }()
    }
    @Test fun sosIdleDark() = snap("13_sos_idle_dark", dark = true) {
        tabs(com.bitchat.android.ui.MainScreenTab.SOS) {
            com.bitchat.android.ui.sos.EmergencySosTabScreen(connectedPeersCount = 0, modifier = Modifier.weight(1f))
        }()
    }

    private class FakeBridge : com.bitchat.android.sos.SosMeshBridge {
        override val myPeerId = "aaaaaaaaaaaaaaaa"
        override fun myNickname() = "me"
        override fun connectedPeerCount() = 3
        override fun mySigningPublicKey(): ByteArray = ByteArray(32) { 1 }
        override fun peerSigningKey(peerId: String): ByteArray? = null
        override fun verifyEd25519(signature: ByteArray, data: ByteArray, publicKey: ByteArray) = true
        override fun broadcast(text: String, priority: Int, ttl: Int, syncable: Boolean) {}
    }

    private fun trackerScene(dark: Boolean, name: String) {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        com.bitchat.android.sos.SosCoordinator.resetForTesting()
        com.bitchat.android.sos.SosCoordinator.attach(app, FakeBridge())
        com.bitchat.android.sos.SosCoordinator.setTier(com.bitchat.android.ai.sos.LocationTier.NONE)
        kotlinx.coroutines.runBlocking { com.bitchat.android.sos.SosCoordinator.send(com.bitchat.android.ai.sos.SosCategory.MEDICAL) }
        val id = com.bitchat.android.sos.SosCoordinator.state.value.tracker!!.sosId
        fun reply(kind: com.bitchat.android.ai.sos.AckKind, from: String, cs: String, note: String?) =
            com.bitchat.android.sos.SosCoordinator.onBroadcastText(
                com.bitchat.android.ai.sos.SosProtocol.encodeAck(
                    com.bitchat.android.ai.sos.SosAck(id, "aaaaaaaaaaaaaaaa", kind, 7, cs, null, note)
                ), from, System.currentTimeMillis(), 6, null
            )
        reply(com.bitchat.android.ai.sos.AckKind.RECEIVED, "p1", "meera", null)
        reply(com.bitchat.android.ai.sos.AckKind.ACKNOWLEDGED, "p2", "ravi", "Coming with a first-aid kit")
        snap(name, dark) {
            tabs(com.bitchat.android.ui.MainScreenTab.SOS, sosActive = true, acks = 1) {
                com.bitchat.android.ui.sos.EmergencySosTabScreen(connectedPeersCount = 3, modifier = Modifier.weight(1f))
            }()
        }
        com.bitchat.android.sos.SosCoordinator.resetForTesting()
    }
    @Test fun sosTrackerLight() = trackerScene(false, "14_sos_tracker_light")
    @Test fun sosTrackerDark() = trackerScene(true, "14_sos_tracker_dark")
}

@Composable
private fun Modifier.paperBg(): Modifier = this.then(Modifier.background(com.bitchat.android.ui.brand.Sanket.colors.paper))

class ChatSnapshotTest : SnapshotBase() {
    /** The chat UI only reads `myPeerID` from the radio service, so skip its constructor (BLE, keystore) entirely. */
    private fun mesh(): com.bitchat.android.mesh.BluetoothMeshService {
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val unsafe = unsafeClass.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
        val svc = unsafeClass.getMethod("allocateInstance", Class::class.java)
            .invoke(unsafe, com.bitchat.android.mesh.BluetoothMeshService::class.java) as com.bitchat.android.mesh.BluetoothMeshService
        com.bitchat.android.mesh.BluetoothMeshService::class.java.getDeclaredField("myPeerID").apply { isAccessible = true }.set(svc, "aaaaaaaaaaaaaaaa")
        return svc
    }

    private fun conversation(): List<com.bitchat.android.model.BitchatMessage> {
        fun m(id: String, who: String, peer: String, text: String, ago: Int) = com.bitchat.android.model.BitchatMessage(
            id = id, sender = who, content = text, timestamp = java.util.Date(System.currentTimeMillis() - ago * 60_000L), senderPeerID = peer
        )
        val sos = com.bitchat.android.ai.sos.SosProtocol.encodeSos(
            com.bitchat.android.ai.sos.SosPayload("a1b2c3d4", com.bitchat.android.ai.sos.SosCategory.FLOOD,
                com.bitchat.android.ai.sos.LocationTier.COARSE, "12.97,77.59")
        )
        return listOf(
            m("1", "meera#41f2", "b1b1b1b1b1b1b1b1", "anyone near the bus stand? roads are closed", 14),
            m("2", "me", "aaaaaaaaaaaaaaaa", "I'm at the school, about 20 people here and we have water", 12),
            m("3", "ravi#9c03", "c2c2c2c2c2c2c2c2", "good, heading there now. @me can you keep the gate open", 11),
            m("4", "joseph#77aa", "d3d3d3d3d3d3d3d3", sos, 2),
            m("5", "me", "aaaaaaaaaaaaaaaa", "On my way to Temple Road with the boat", 1)
        )
    }

    private fun chat(name: String, dark: Boolean) = snap(name, dark) {
        androidx.compose.foundation.layout.Column(Modifier.fillMaxSize().then(Modifier.background(com.bitchat.android.ui.brand.Sanket.colors.paper))) {
            androidx.compose.foundation.layout.Spacer(Modifier.height(36.dp))
            com.bitchat.android.ui.brand.SanketTabBar(
                currentTab = com.bitchat.android.ui.MainScreenTab.CHAT, onTabSelect = {}, sosActive = false, sosAckCount = 0,
                emergencyCount = 1, connectedPeersCount = 3
            )
            com.bitchat.android.ui.MessagesList(
                messages = conversation(), currentUserNickname = "me", meshService = mesh(), modifier = Modifier.weight(1f)
            )
            com.bitchat.android.ui.MessageInput(
                value = androidx.compose.ui.text.input.TextFieldValue(""), onValueChange = {}, onSend = {},
                onSendVoiceNote = { _, _, _ -> }, onSendImageNote = { _, _, _ -> }, onSendFileNote = { _, _, _ -> },
                onSceneAnalyzed = { _, _, _ -> }, selectedPrivatePeer = null, currentChannel = null, nickname = "me", showMediaButtons = true
            )
        }
    }
    @Test fun chatLight() = chat("20_chat_light", false)
    @Test fun chatDark() = chat("20_chat_dark", true)
}

class OnboardingScreensSnapshotTest : SnapshotBase() {
    private fun cats() = listOf(
        com.bitchat.android.onboarding.PermissionCategory(
            com.bitchat.android.onboarding.PermissionType.NEARBY_DEVICES,
            "Required to discover and connect to nearby phones over Bluetooth.", listOf("BLUETOOTH_SCAN"), false, "Allow nearby devices"
        ),
        com.bitchat.android.onboarding.PermissionCategory(
            com.bitchat.android.onboarding.PermissionType.PRECISE_LOCATION,
            "Android requires location access to scan for Bluetooth devices. SanketSetu never tracks you.", listOf("ACCESS_FINE_LOCATION"), true, "Allow location"
        ),
        com.bitchat.android.onboarding.PermissionCategory(
            com.bitchat.android.onboarding.PermissionType.NOTIFICATIONS,
            "Lets you know when a message or an SOS arrives while the app is in the background.", listOf("POST_NOTIFICATIONS"), false, "Allow notifications"
        )
    )
    @Test fun permissionsLight() = snap("30_permissions_light") {
        com.bitchat.android.onboarding.PermissionExplanationScreen(Modifier.fillMaxSize(), cats()) {}
    }
    @Test fun permissionsDark() = snap("30_permissions_dark", dark = true) {
        com.bitchat.android.onboarding.PermissionExplanationScreen(Modifier.fillMaxSize(), cats()) {}
    }
}
