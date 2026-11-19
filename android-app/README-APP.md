# PhotoVault Android app

A light, fast app (about 110 KB) that opens your live PhotoVault site full-screen.
Everything you change on the website shows up in the app straight away. No app update needed.

## What it does
- Opens the **Admin panel** (`/admin`) when launched from the home screen.
- **Event links open in the app.** Guest links like `https://photovault-six.vercel.app/e/...` open in the app when tapped in WhatsApp (Android asks "Open with PhotoVault" the first time).
- **Live selfie camera** and **"Upload from gallery"** both work. Camera permission is asked once.
- **Save photo** goes to Gallery › PhotoVault. Drive downloads go to Downloads/PhotoVault.
- **External links** open in their own apps: WhatsApp, phone, Google Drive, Instagram.
- **Back button** goes back a page. There is a friendly "You're offline / Try again" screen.

## Install
1. Send `PhotoVault.apk` to the phone (WhatsApp or Drive) and tap it.
2. Allow **"Install unknown apps"** for WhatsApp/Files when Android asks, then tap **Install**.
3. If Play Protect warns you, tap **More details › Install anyway**. It warns about any app that isn't from the Play Store.

## Change the website address
Edit `SITE` at the top of `src/com/photovault/app/MainActivity.java`, and the `android:host` in
`AndroidManifest.xml`, then run `./build.sh`.

## Signing key — keep it safe
`photovault-release.jks` (alias `photovault`, password `PhotoVault2026`) signs the app.
Use the **same key** for every future version, or phones will refuse to update over the old one.
You also need this key to put the app on the Play Store.
