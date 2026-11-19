package com.photovault.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {

    /** The live PhotoVault site. Change this one line if you move to your own domain. */
    static final String SITE = "https://photovault-six.vercel.app";
    static final String HOST = Uri.parse(SITE).getHost();
    static final String START = SITE + "/admin";

    private static final int REQ_FILE = 11;
    private static final int REQ_CAM_PERM = 12;
    private static final int REQ_CAM_PERM_FOR_CHOOSER = 13;

    private WebView web;
    private ProgressBar bar;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingParams;
    private Uri cameraUri;
    private PermissionRequest pendingWebPermission;
    private boolean showingError = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#FBF7F1"));
        if (Build.VERSION.SDK_INT >= 23) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#FBF7F1"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.getProgressDrawable().setTint(Color.parseColor("#B8925A"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, dp(3));
        root.addView(bar, lp);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " PhotoVaultApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "PhotoVaultApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, cd, mime, len) -> download(url, ua, cd, mime));

        if (saved != null) {
            web.restoreState(saved);
        } else {
            web.loadUrl(urlFrom(getIntent()));
        }
    }

    private String urlFrom(Intent i) {
        if (i != null && i.getData() != null) {
            Uri u = i.getData();
            if (HOST.equalsIgnoreCase(u.getHost())) return u.toString();
        }
        return START;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) web.loadUrl(urlFrom(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (showingError) { showingError = false; web.reload(); return; }
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    // ---------------------------------------------------------------- links
    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            String host = u.getHost() == null ? "" : u.getHost();
            if ((scheme.equals("http") || scheme.equals("https"))) {
                // Stay inside the app for PhotoVault pages and Google sign-in / Drive pages it opens
                if (host.equalsIgnoreCase(HOST)) return false;
                if (host.endsWith("googleusercontent.com")) return false;
            }
            // WhatsApp, phone, mail, UPI, Drive, Instagram etc. → their own apps / browser
            try {
                Intent i = scheme.equals("intent")
                        ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME)
                        : new Intent(Intent.ACTION_VIEW, u);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(i);
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "No app found to open this link", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            bar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) showOffline();
        }
    }

    private void showOffline() {
        showingError = true;
        String html = "<html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#FBF7F1;font-family:sans-serif;color:#3d342b;text-align:center}"
                + "h2{font-weight:600;margin:12px 0 6px}p{color:#8a7d6f;margin:0 24px 22px}"
                + "a{background:#B8925A;color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600}</style></head>"
                + "<body><div><div style='font-size:52px'>&#128247;</div><h2>You're offline</h2>"
                + "<p>" + (online() ? "PhotoVault could not be reached. Please try again." : "Check your internet connection and try again.") + "</p>"
                + "<a href='#' onclick='PhotoVaultApp.retry();return false'>Try again</a></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------------------------------------------------------------- camera + file chooser
    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int p) {
            bar.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
            bar.setProgress(p);
        }

        /** Live selfie camera (getUserMedia) on the guest page and Live Booth. */
        @Override
        public void onPermissionRequest(PermissionRequest req) {
            runOnUiThread(() -> {
                boolean wantsCam = false;
                for (String r : req.getResources())
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCam = true;
                if (!wantsCam) { req.deny(); return; }
                if (hasCam()) {
                    req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingWebPermission = req;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM_PERM);
                }
            });
        }

        /** <input type=file> — selfie from camera or gallery, booth/admin uploads. */
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            pendingParams = params;
            boolean imageish = acceptsImages(params);
            if (imageish && !hasCam()) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM_PERM_FOR_CHOOSER);
            } else {
                openChooser(imageish && hasCam());
            }
            return true;
        }
    }

    private boolean hasCam() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean acceptsImages(WebChromeClient.FileChooserParams p) {
        String[] types = p.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            if (t == null || t.trim().isEmpty() || t.contains("image") || t.contains("*")) return true;
        }
        return false;
    }

    private void openChooser(boolean withCamera) {
        WebChromeClient.FileChooserParams p = pendingParams;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        String[] types = p == null ? null : p.getAcceptTypes();
        String mime = "*/*";
        if (types != null && types.length > 0 && types[0] != null && !types[0].trim().isEmpty()) {
            mime = types[0].contains("image") ? "image/*" : (types[0].contains("video") ? "video/*" : "*/*");
        }
        pick.setType(mime);
        if (p != null && p.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        ArrayList<Intent> extra = new ArrayList<>();
        cameraUri = null;
        if (withCamera) {
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "photovault_selfie_" + System.currentTimeMillis() + ".jpg");
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                if (Build.VERSION.SDK_INT >= 29) cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PhotoVault");
                cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (cameraUri != null) {
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    if (p != null && p.isCaptureEnabled()) {
                        // capture="user" → straight to the camera
                        try { startActivityForResult(cam, REQ_FILE); return; } catch (ActivityNotFoundException ignored) {}
                    }
                    extra.add(cam);
                }
            } catch (Exception ignored) { cameraUri = null; }
        }

        Intent chooser = Intent.createChooser(pick, "Choose photo");
        if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
        try {
            startActivityForResult(chooser, REQ_FILE);
        } catch (ActivityNotFoundException e) {
            finishChooser(null);
        }
    }

    private void finishChooser(Uri[] result) {
        if (fileCallback != null) fileCallback.onReceiveValue(result);
        fileCallback = null;
        pendingParams = null;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
            } else if (cameraUri != null) {
                out = new Uri[]{cameraUri};
            }
        }
        if (out == null && cameraUri != null) {
            // camera cancelled → remove the empty placeholder
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) {}
        }
        cameraUri = null;
        finishChooser(out);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (req == REQ_CAM_PERM && pendingWebPermission != null) {
            if (ok) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else {
                pendingWebPermission.deny();
                Toast.makeText(this, "Camera permission is needed for the live selfie", Toast.LENGTH_LONG).show();
            }
            pendingWebPermission = null;
        } else if (req == REQ_CAM_PERM_FOR_CHOOSER) {
            openChooser(ok);
        }
    }

    // ---------------------------------------------------------------- downloads
    private void download(String url, String ua, String cd, String mime) {
        if (url.startsWith("blob:")) {
            // Booth / server shots are saved through a blob link; read it in the page and hand it to Java.
            String js = "(function(){var x=new XMLHttpRequest();x.open('GET','" + url + "',true);x.responseType='blob';"
                    + "x.onload=function(){var r=new FileReader();r.onloadend=function(){"
                    + "PhotoVaultApp.saveBase64(r.result, (document.querySelector('a[download]')||{}).download||'');};"
                    + "r.readAsDataURL(x.response);};x.send();})();";
            web.evaluateJavascript(js, null);
            return;
        }
        if (url.startsWith("data:")) { saveDataUrl(url, ""); return; }
        try {
            String name = URLUtil.guessFileName(url, cd, mime);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setMimeType(mime);
            r.addRequestHeader("User-Agent", ua);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "PhotoVault/" + name);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(this, "Downloading " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
        }
    }

    private void saveDataUrl(String dataUrl, String name) {
        try {
            int comma = dataUrl.indexOf(',');
            String meta = dataUrl.substring(5, comma);
            String mime = meta.contains(";") ? meta.substring(0, meta.indexOf(';')) : meta;
            if (mime.isEmpty()) mime = "image/jpeg";
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            if (name == null || name.isEmpty()) name = "PhotoVault_" + System.currentTimeMillis() + (mime.contains("png") ? ".png" : ".jpg");
            boolean video = mime.startsWith("video");
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            if (Build.VERSION.SDK_INT >= 29)
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/PhotoVault");
            Uri target = getContentResolver().insert(video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            try (OutputStream os = getContentResolver().openOutputStream(target)) { os.write(bytes); }
            final String n = name;
            runOnUiThread(() -> Toast.makeText(this, "Saved to Gallery › PhotoVault", Toast.LENGTH_SHORT).show());
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "Could not save photo", Toast.LENGTH_SHORT).show());
        }
    }

    // ---------------------------------------------------------------- JS bridge
    private class Bridge {
        @JavascriptInterface public void saveBase64(String dataUrl, String name) { saveDataUrl(dataUrl, name); }
        @JavascriptInterface public void retry() { runOnUiThread(() -> { showingError = false; web.loadUrl(START); }); }
        @JavascriptInterface public boolean isApp() { return true; }
        @JavascriptInterface public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Share"));
            });
        }
    }
}
