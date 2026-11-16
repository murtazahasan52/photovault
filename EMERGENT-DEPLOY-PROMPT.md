Update the existing PhotoVault app with the files in the uploaded zip. DO NOT run any tests, do not use the testing agent, do not refactor or redesign anything — just copy the files, build and deploy.

Change: new light "wedding & events" theme (ivory, blush, champagne gold, serif headings, floral accents) for the admin panel, guest pages, Live Booth console and venue TV screen.

Replace exactly these files (paths from the project root):
- frontend/src/styles.css
- frontend/src/pages/admin/Layout.js
- frontend/src/pages/admin/Booth.js
- frontend/src/pages/guest/GuestEvent.js
- frontend/src/pages/guest/SelfieCamera.js

No backend changes, no new packages, no .env changes.

Then rebuild the frontend and deploy. Do not change any code. Do not run tests.
