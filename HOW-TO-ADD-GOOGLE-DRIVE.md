# How to connect a photographer's Google Drive to PhotoVault

No Google Cloud Console and no API key needed. Each Gmail gets a small **PhotoVault Drive script**
(Google Apps Script, made at script.google.com) that lets PhotoVault read the event folders, shares the
main folder for guests, and saves Live Booth photos. Photos are never copied to the server.

A photographer can connect **several Drives** (for example several Gmail accounts with 15 GB free each). Do these steps once per Gmail.

## 1. Make one main folder in Google Drive
1. Open https://drive.google.com with the Gmail where the photos are.
2. **+ New → New folder**, e.g. `Studio Events 2026`. Inside it, make one folder per event. Sub-folders such as `Haldi`, `Wedding` and `Reception` become albums.
3. Open the main folder and copy its link from the address bar (`https://drive.google.com/drive/folders/...`).

## 2. Start adding the Drive in PhotoVault
**My Drives → ＋ Add Drive**: enter a name (e.g. "Main Gmail"), the Gmail ID, and the main folder link.
The form already shows a **secret**. Click **📋 Copy script**; the secret is already inside the copied code.

The main admin can do the same for a photographer: **Photographers → ＋ Add photographer → Google Drive**, or the **🗂️ Drives** button on the photographer's row.

## 3. Create the script (about 3 minutes)
1. Open https://script.google.com/home/projects/create, logged in with **the same Gmail as the photos**.
2. Delete the sample code, paste the copied script, click 💾 **Save**, and name it "PhotoVault Drive".
3. **Deploy → New deployment** → ⚙️ choose **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**.
4. **Authorize access** → choose the Gmail → **Advanced → Go to PhotoVault Drive (unsafe) → Allow**.
   Google shows this warning for any personal script; it only runs in your own account.
5. Copy the **Web app URL**. It ends with `/exec`.

## 4. Finish in PhotoVault
Paste the Web app URL → **Test**. It should say "Script working ✓ — connected to your Gmail". Then click **Check & add Drive**.
Keep **"Share the main folder automatically"** ticked; guests need it to see their photos.

## 5. Use it
**My Drives → 📂 Browse folders** → open the event folder → **＋ Create event** (or **Add to event**).
Then on the event: **Sync from Drive → Face index → Share**. The same script also saves **Live Booth** photos into this Drive.

## Common problems
| Message | Fix |
|---|---|
| "The secret does not match" | Copy the script again from PhotoVault, paste it in script.google.com, **Deploy → New deployment**, and use the new URL. |
| "Drive script did not answer correctly" | The deployment must be **Web app**, Execute as **Me**, access **Anyone**, and the URL must end with `/exec`. |
| "Folder not found in this Google account" | The folder belongs to another Gmail. Make the script with the Gmail that owns the folder. |
| New photos not showing | On the event, click **Sync from Drive**, then **Face index → Start**. |
| Changed the script code | In Apps Script use **Deploy → Manage deployments → Edit → Version: New version**. The URL stays the same. |

## Optional: Google API key (advanced)
The old method still works: My Drives → ⚙️ Advanced → paste a Google Drive API key from Google Cloud Console.
With a key, folders must be shared as "Anyone with the link → Viewer" by hand. The Live Booth still needs the script.
