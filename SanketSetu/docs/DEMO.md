# Demo script (3 minutes)

Use the **light theme**. Keep Bluetooth and Wi-Fi on, mobile data off. Every number shown in the
browser/simulator is labelled SIMULATED; say so out loud. Two phones are needed for segment 2;
everything else also works on one phone or the web build.

| Time | Segment | What to do and say |
| --- | --- | --- |
| 0:00-0:15 | Splash + first run | Cold start: the bridge animation and real status line ("Unlocking keys", "Opening local store", "Starting radio"). Walk the 3 onboarding steps: what it does, permissions (tap **Allow permissions**), name + PIN. "Nothing here needs a server." |
| 0:15-0:55 | Two phones, airplane mode, encrypted chat | Both phones in Airplane Mode with Bluetooth and Wi-Fi turned back on. Watch the status strip change from **Simulated** to **Real radio** on both. Send a message A to B. Point at the delivery bridge going Pending, Sent, Delivered. Say: "Delivered only appears after a signed acknowledgement from the real recipient." **Unverified until run on phones.** |
| 0:55-1:25 | 4-node multi-hop + packet inspector | More > **Simulator** (SIMULATED). Send A to D: the bridge shows Relayed with hop count. Tap **Inspect**: sender, relays, receiver chain, labelled an unauthenticated hint; Packet and Crypto tabs show the header and signature check. |
| 1:25-1:50 | Break / restore B-C | Tap **Break middle link (B-C)**, send another message: it stays Pending in the queue. Tap **Restore**: the sync exchange delivers it with no user action. |
| 1:50-2:20 | SOS closed loop | Home: hold the SOS button for 3 seconds. Open the tracker: Broadcast, Reached N, Acknowledged, Responder en route. In Alerts, enroll as a demo verified responder and acknowledge: the ack shows **Verified**; one from an unenrolled node shows **Unverified** and does not stop the SOS repeating. With precise location, only the verified responder sees exact coordinates. |
| 2:20-2:35 | Congestion Benchmark | Simulator: **Congestion benchmark**. Read the two-column card: SOS vs normal, p50 and p95, "N of N arrived". "Measured on the simulated mesh. Best effort, not a guarantee." |
| 2:35-2:45 | Saver mode | Settings: drag the battery slider below 15%. The status strip shows **Saver**; the dark-mode suggestion appears (dismissible); only SOS and emergency packets are relayed. |
| 2:45-3:00 | AI panel online vs offline | More > **AI assistant**. Offline: controls greyed with a notice and the **Rule-based hint** still works. Online with a Featherless key: summarize or classify; every result says "AI suggestion, use your judgment." |

## Presenter notes

- The demo mesh peers (RELAY-B, RELAY-C, MEDIC-D) and the Responder Authority are **DEMO** fixtures.
- Rescuer Locate and the Setu gateway are **EXPERIMENTAL / DEMO** and are not part of this script.
- If a real-radio link will not form, say so and continue on the simulator; do not fake the status strip.
