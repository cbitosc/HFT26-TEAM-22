# Sanket Setu — 90-Second Judge Walkthrough (`DEMO.md`)

> **Product Thesis:** *Other apps send messages when the network dies. Sanket Setu makes sure help actually arrives: encrypted, acknowledged by verified responders, and bridged back online when any phone finds signal.*

---

## 0:00 – 0:15 · Offline-First Architecture & Live Mesh Status Orb (`#/home`)
1. Open the app. Point out the top bar: **ONLINE / OFFLINE** indicator, **SIMULATED MESH** peer counter (`3 peers: 1 direct, 2 multi-hop`), **Outbox queue**, and **Power Mode (`88% ACTIVE`)**.
2. Show the **NOVA Glass Status Orb** surrounded by orbiting peer dots (`RELAY-B`, `RELAY-C`, `MEDIC-D`).
3. Click the green **`one-tap "i'm safe" check-in`** button on the Home screen to broadcast a signed `SAFE` packet to your Family Circle.

---

## 0:15 – 0:40 · Quick-SOS Multilingual Pictograms, Sealed Precise GPS & Closed-Loop Tracker (`#/sos`)
1. Tap **SOS** in the bottom pill bar (`#/sos`).
2. In **01. Quick-SOS Multilingual Pictograms**, switch between **English**, **हिन्दी (HI)**, **తెలుగు (TE)**, and **தமிழ் (TA)** and tap **Trapped in Flood** — the SOS composer populates immediately with zero internet or AI dependency.
3. Under **05. Location Privacy & Responder-Sealed GPS**, select **Precise (Responder-Sealed)**. Point out the privacy guarantee: general mesh nodes only see coarse (`~1km`: `12.97, 77.59`) coordinates, while exact 5-decimal GPS (`12.97159, 77.59456`) is sealed with an ephemeral `X25519` box to the **Verified Responder Group key**.
4. Click **Confirm & Broadcast Priority-0 SOS Beacon**.
5. Point to the **Closed-Loop SOS Status Tracker** at the top of the screen:
   - **Stage 01: Broadcasted** (`Priority 0 · TTL 12 · Ed25519 Signed`)
   - **Stage 02: Reached 3 nodes** (`Signed receipt lower bound`)
   - Click **`+ sim verified medic en route ✔`** to trigger virtual node `MEDIC-D (Field Base)` (3 hops away) to send a signed `SOS_ACK` carrying its `DEMO AUTHORITY` certificate.
   - Watch **Stage 03 (Acknowledged)** and **Stage 04 (Responder En Route)** light up in lime green with **`✔ VERIFIED (NDRF_MEDIC)`** vs **`unverified`** when clicking **`+ sim unverified ack`**.

---

## 0:40 – 1:00 · Sealed vs. Unsealed GPS & Incident Clustering (`#/alerts`)
1. Navigate to **Alerts** (`#/alerts`).
2. Notice the banner: as a **Standard Civilian Node**, you see `COARSE (~1KM): 12.97, 77.59` and `🔒 Exact GPS Sealed to Responder Key`.
3. Click **`enroll demo responder cert ✔ (unseal gps)`** right on the banner. Immediately, the alert card unlocks and displays **`UNSEALED EXACT GPS: 12.97159, 77.59456 (±8m)`**!
4. Toggle **`Cluster Incidents`** in the top right to merge duplicate nearby SOS beacons of the same category.

---

## 1:00 – 1:20 · 4-Node Multi-Hop Partition, Store-and-Forward & Dead-Zone Risk (`#/simulator` & `#/map`)
1. Open **Simulator** (`#/simulator`) to show the 4-node linear chain **`A (You) ↔ B ↔ C ↔ D (MEDIC-D)`** where `A` cannot reach `C` or `D` directly.
2. Click **`Break Link B ↔ C`** to partition the mesh.
3. Go to **Messages** (`#/messages`), select `MEDIC-D (Field Base)`, and send a message. Inspect its status: **`RELAYED (1 HOP)`** (buffered at `RELAY-B` in the Store-and-Forward Outbox).Click **Inspect** on the message bubble to view the `X25519-XSalsa20-Poly1305` cipher suite, `Ed25519` signature, and hop path.
4. Return to **Simulator** (`#/simulator`) and click **`Restore Link B ↔ C`**. Anti-entropy `SYNC_INV / SYNC_REQ` automatically reconciles the partition and updates the message status to **`DELIVERED`** (`A → B → C → D`).
5. Open **Map** (`#/map`) to show the **3D Isometric Topology Graph**, **Dead-Zone Risk (`≤1 Link`)** warning rings on leaf nodes, and plotted **Hazard Beacons**.

---

## 1:20 – 1:30 · Optional Online AI Triage (`#/ai`) & Last-Gasp SOS (`#/settings`)
1. Open **AI** (`#/ai`): show that offline rule-based triage works with zero internet, while Featherless.ai LLM triage is strictly optional and gated by a privacy notice.
2. Open **Settings** (`#/settings`): click **`test ≤5% last-gasp sos`** in the Battery card to demonstrate automatic Last-Gasp SOS emission and WebGL power-down in Saver mode.
