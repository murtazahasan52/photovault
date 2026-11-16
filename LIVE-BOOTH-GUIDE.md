# Live Booth: instant photo + QR on stage

Shoot on stage → the photo appears on the booth screen (phone or laptop) with a big QR code → the guest scans it and downloads the photo on the spot.
Every booth photo is also face-indexed, so it shows up in the guest's selfie search, and a **TV screen** page can show each new photo live with its QR.

## Pages
| Page | Who | Link |
|---|---|---|
| Booth console | Photographer (login) | Event → 🔴 Live booth → **Open booth console** (`/admin/booth/<event>`) |
| Guest photo page | Guest scans QR | `/p/<code>`: one photo, Download, Share on WhatsApp, "Find all my photos" |
| TV / projector screen | Venue screen | `/live/<event-link>`: newest photo + QR, rotates recent shots, double-click for full screen |

## 1. Choose where photos are saved (once per Gmail)
**Recommended: your Google Drive** (no load on the server)
1. My Drives → **Edit** on a Drive → open **Live Booth upload script**.
2. Click **Generate secret** → **Copy script**.
3. Open https://script.google.com → **New project** (logged in with that Drive's Gmail) → delete the sample code → paste → 💾 Save (name it "PhotoVault Booth").
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** → **Deploy**.
5. **Authorize access** → pick the Gmail → **Advanced → Go to PhotoVault Booth (unsafe) → Allow**. Google shows this warning because it's your own unpublished script.
6. Copy the **Web app URL** (ends with `/exec`) → paste it → **Test** → **Save**.

Photos are saved in Drive under `PhotoVault Live Booth / <Event name>` and shared "anyone with the link".
(The same script code is in `google-apps-script/PhotoVaultBoothUpload.gs`.)

**Fallback: the server.** If no script is set (or Drive upload fails), shots are kept on the server, resized to 2048 px (about 0.5 MB each).

## 2. Connect the camera
- **Phone mounted on the camera (like the reel):**
  - Turn on the camera's auto-transfer to the phone (Canon Camera Connect, Sony Creators' App / Imaging Edge Mobile, Nikon SnapBridge, Fujifilm XApp), or use a USB-C cable / card reader. The photos land in the phone gallery.
  - In the booth console tap **➕ Add photos**, pick the new shot(s), and each one is published with its QR in a few seconds.
  - **📷 Phone camera** shoots with the phone itself (a backup).
- **Laptop tethering (fully automatic, no taps):**
  - Tether the camera with EOS Utility, Imaging Edge Desktop, Nikon Webcam/NX Tether, Lightroom, or any software that saves to a folder.
  - In **Chrome or Edge** on the laptop, open the booth console → **📂 Auto-import from folder** → pick that folder. Every new JPG is published about 2 seconds after it's saved.
- Set the camera to **JPG** or **RAW+JPG** (RAW files are ignored).

## 3. At the venue
- Open the **TV screen** link on a TV or projector, then double-click for full screen.
- The guest scans the QR on the booth screen or the TV and taps **Download photo**.
- The event tab shows every booth shot with its download count.
- Event → Edit → "Live booth TV screen on" turns the public TV page off.

## Notes
- A browser on a phone can't pull photos from the camera by itself, so on a phone it's one tap to pick the shot. A laptop with the folder watch is fully automatic.
- Booth photos are never removed by "Sync from Drive". Delete them from the console (✕). A copy saved in Drive stays in Drive.
