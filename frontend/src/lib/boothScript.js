// Google Apps Script the photographer pastes into script.google.com (one per Google account / Drive).
// It receives Live Booth photos from the browser and saves them straight into that Google Drive.
export const BOOTH_SCRIPT = `/**
 * PhotoVault — Live Booth upload script
 * Saves each booth photo into your Google Drive and makes it viewable by link.
 * 1. Change SECRET below (any password-like text). Put the SAME secret in PhotoVault → My Drives.
 * 2. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy.
 */
const SECRET = 'CHANGE-ME-123';
const ROOT_FOLDER_ID = ''; // optional: ID of a folder to save into. Empty = "PhotoVault Live Booth" in My Drive

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return out({ ok: false, error: 'Wrong secret' });
    const root = ROOT_FOLDER_ID ? DriveApp.getFolderById(ROOT_FOLDER_ID)
                                : getOrCreate(DriveApp.getRootFolder(), 'PhotoVault Live Booth');
    const folder = getOrCreate(root, String(body.event || 'Event').replace(/[\\\\/]/g, '-'));
    const bytes = Utilities.base64Decode(String(body.data).split(',').pop());
    const name = body.name || ('booth_' + new Date().getTime() + '.jpg');
    const file = folder.createFile(Utilities.newBlob(bytes, body.mime || 'image/jpeg', name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return out({ ok: true, id: file.getId() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() { return out({ ok: true, app: 'PhotoVault Live Booth upload' }); }

function getOrCreate(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;

/** Upload one JPEG (data URL) through the photographer's Apps Script. Returns the Drive file id. */
export async function uploadViaScript(scriptUrl, secret, { event, name, dataUrl }) {
  // text/plain body = "simple request" → no CORS preflight, which Apps Script can't answer.
  const r = await fetch(scriptUrl, { method: "POST", body: JSON.stringify({ secret, event, name, mime: "image/jpeg", data: dataUrl }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Upload script failed");
  return j.id;
}

export async function pingScript(scriptUrl) {
  const r = await fetch(scriptUrl);
  const j = await r.json();
  if (!j.ok) throw new Error("Script answered but not OK");
  return j;
}
