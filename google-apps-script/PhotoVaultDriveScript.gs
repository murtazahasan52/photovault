/**
 * PhotoVault — Drive script (one per Gmail account)
 *  • lets PhotoVault read your event folders (no Google Cloud / API key needed)
 *  • shares your main folder as "Anyone with the link – Viewer" for guests
 *  • saves Live Booth photos into your Drive
 * SETUP: keep the SECRET below exactly as PhotoVault shows it.
 * Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy.
 */
const SECRET = 'CHANGE-ME-123';
const ROOT_FOLDER_ID = ''; // optional: folder for Live Booth photos. Empty = "PhotoVault Live Booth" in My Drive
const FOLDER = 'application/vnd.google-apps.folder';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) return out({ ok: true, app: 'PhotoVault Drive script' });
  if (p.secret !== SECRET) return out({ ok: false, error: 'Wrong secret' });
  try {
    if (p.action === 'whoami') return out({ ok: true, email: Session.getEffectiveUser().getEmail() });
    if (p.action === 'meta') return out({ ok: true, item: item(p.id) });
    if (p.action === 'list') {
      const f = DriveApp.getFolderById(p.id);
      return out({ ok: true, folder: { id: f.getId(), name: f.getName(), mimeType: FOLDER }, folders: subFolders(f), files: mediaFiles(f) });
    }
    if (p.action === 'tree') {
      const f = DriveApp.getFolderById(p.id);
      const all = [];
      walk(f, p.album || '', all, 0);
      return out({ ok: true, folder: { id: f.getId(), name: f.getName() }, files: all });
    }
    if (p.action === 'share') {
      DriveApp.getFolderById(p.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out({ ok: true });
    }
    return out({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// Live Booth: save one photo into Drive
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return out({ ok: false, error: 'Wrong secret' });
    const root = ROOT_FOLDER_ID ? DriveApp.getFolderById(ROOT_FOLDER_ID)
                                : getOrCreate(DriveApp.getRootFolder(), 'PhotoVault Live Booth');
    const folder = getOrCreate(root, String(body.event || 'Event').replace(/[\\/]/g, '-'));
    const bytes = Utilities.base64Decode(String(body.data).split(',').pop());
    const file = folder.createFile(Utilities.newBlob(bytes, body.mime || 'image/jpeg', body.name || ('booth_' + Date.now() + '.jpg')));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return out({ ok: true, id: file.getId() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function item(id) {
  try {
    const f = DriveApp.getFolderById(id);
    return { id: f.getId(), name: f.getName(), mimeType: FOLDER };
  } catch (e) {
    return fileObj(DriveApp.getFileById(id));
  }
}
function fileObj(x) {
  return { id: x.getId(), name: x.getName(), mimeType: x.getMimeType(), size: x.getSize(), createdTime: x.getDateCreated().toISOString() };
}
function mediaFiles(f) {
  const r = [], it = f.getFiles();
  while (it.hasNext()) {
    const x = it.next(), m = x.getMimeType();
    if (m.indexOf('image/') === 0 || m.indexOf('video/') === 0) r.push(fileObj(x));
  }
  return r;
}
function subFolders(f) {
  const r = [], it = f.getFolders();
  while (it.hasNext()) { const s = it.next(); r.push({ id: s.getId(), name: s.getName(), mimeType: FOLDER, modifiedTime: s.getLastUpdated().toISOString() }); }
  return r;
}
function walk(f, album, all, depth) {
  mediaFiles(f).forEach(function (x) { x.album = album; all.push(x); });
  if (depth > 6) return;
  const it = f.getFolders();
  while (it.hasNext()) { const s = it.next(); walk(s, album ? album + ' / ' + s.getName() : s.getName(), all, depth + 1); }
}
function getOrCreate(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
