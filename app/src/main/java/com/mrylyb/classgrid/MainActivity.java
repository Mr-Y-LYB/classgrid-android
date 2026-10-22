package com.mrylyb.classgrid;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_IMPORT = 101;
    private static final int CREATE_EXPORT = 102;
    private static final int PORTAL = 103;
    private static final int NOTIFICATION_PERMISSION = 104;
    private static final int PICK_BACKGROUND = 105;
    private static final int MAX_FILE_BYTES = 20 * 1024 * 1024;
    private WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private UpdateManager updater;
    private String pendingExport;
    private String pendingBackgroundTableId;
    private final Object backgroundLock = new Object();
    private String pendingBackgroundData;
    private String pendingBackgroundToken;
    private boolean pageReady;
    private boolean foreground;
    private boolean networkCallbackRegistered;
    private ConnectivityManager connectivity;
    private final ConnectivityManager.NetworkCallback updateNetworkCallback = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) {
            runOnUiThread(() -> {
                if (foreground && pageReady && updater != null) updater.checkOnNetworkAvailable();
            });
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(247, 249, 251));
        getWindow().setNavigationBarColor(Color.rgb(247, 249, 251));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        updater = new UpdateManager(this, worker, this::callback);
        connectivity = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                requestAutoUpdate();
                callback("onReminderStatus", ReminderScheduler.status(MainActivity.this).toString());
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private File stateFile() { return new File(getFilesDir(), "classgrid.json"); }

    private void requestAutoUpdate() {
        if (!pageReady || connectivity == null) return;
        Network network = connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivity.getNetworkCapabilities(network);
        if (capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            updater.check(false);
    }

    private void callback(String name, String argument) {
        runOnUiThread(() -> {
            if (web != null && pageReady) web.evaluateJavascript("window." + name + "(" + argument + ")", null);
        });
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (connectivity != null && !networkCallbackRegistered) {
            try {
                connectivity.registerDefaultNetworkCallback(updateNetworkCallback);
                networkCallbackRegistered = true;
            } catch (RuntimeException ignored) {}
        }
        if (updater != null) {
            updater.resumePendingInstall();
            requestAutoUpdate();
        }
        worker.execute(() -> ReminderScheduler.schedule(this));
        if (pageReady) callback("onReminderStatus", ReminderScheduler.status(this).toString());
    }

    @Override protected void onPause() {
        foreground = false;
        if (networkCallbackRegistered) {
            connectivity.unregisterNetworkCallback(updateNetworkCallback);
            networkCallbackRegistered = false;
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    public class Bridge {
        @JavascriptInterface public String appVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return ""; }
        }
        @JavascriptInterface public String androidVersion() { return Build.VERSION.RELEASE; }
        @JavascriptInterface public String loadState() {
            try { return new String(java.nio.file.Files.readAllBytes(stateFile().toPath()), StandardCharsets.UTF_8); }
            catch (Exception e) { return ""; }
        }
        @JavascriptInterface public boolean saveState(String json) {
            if (json == null || json.length() > 18_000_000) return false;
            try {
                new JSONObject(json);
                File temp = new File(getFilesDir(), "classgrid.tmp");
                try (FileOutputStream out = new FileOutputStream(temp)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                }
                if (!temp.renameTo(stateFile())) {
                    try (FileOutputStream out = new FileOutputStream(stateFile())) {
                        out.write(json.getBytes(StandardCharsets.UTF_8));
                        out.getFD().sync();
                    }
                    temp.delete();
                }
                return true;
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public void pickImport() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/csv", "text/plain", "application/json",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"});
                startActivityForResult(i, PICK_IMPORT);
            });
        }
        @JavascriptInterface public void exportFile(String filename, String mime, String content) {
            if (filename == null || content == null || content.length() > 20_000_000) return;
            runOnUiThread(() -> {
                pendingExport = content;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(i, CREATE_EXPORT);
            });
        }
        @JavascriptInterface public void pickBackground(String tableId) {
            if (tableId == null || !tableId.matches("[a-zA-Z0-9_-]{6,80}")) return;
            runOnUiThread(() -> {
                pendingBackgroundTableId = tableId;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/jpeg");
                startActivityForResult(i, PICK_BACKGROUND);
            });
        }
        @JavascriptInterface public String readBackgroundChunk(String token, int offset, int length) {
            synchronized (backgroundLock) {
                if (token == null || !token.equals(pendingBackgroundToken) || pendingBackgroundData == null
                    || offset < 0 || offset >= pendingBackgroundData.length() || length < 1 || length > 16384)
                    return "";
                return pendingBackgroundData.substring(offset,
                    Math.min(pendingBackgroundData.length(), offset + length));
            }
        }
        @JavascriptInterface public void clearPendingBackground(String token) {
            synchronized (backgroundLock) {
                if (token != null && token.equals(pendingBackgroundToken)) {
                    pendingBackgroundData = null;
                    pendingBackgroundToken = null;
                }
            }
        }
        @JavascriptInterface public void openPortal(String url) {
            runOnUiThread(() -> {
                String safe = "https://jws.syuct.edu.cn/";
                try {
                    Uri u = Uri.parse(url);
                    if ("https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null
                        && u.getUserInfo() == null)
                        safe = u.toString();
                } catch (Exception ignored) {}
                Intent i = new Intent(MainActivity.this, PortalActivity.class);
                i.putExtra("url", safe);
                startActivityForResult(i, PORTAL);
            });
        }
        @JavascriptInterface public void syncReminders(String eventsJson) {
            if (eventsJson == null || eventsJson.length() > 2_000_000) return;
            worker.execute(() -> {
                ReminderScheduler.saveAndSchedule(MainActivity.this, eventsJson);
                callback("onReminderStatus", ReminderScheduler.status(MainActivity.this).toString());
            });
        }
        @JavascriptInterface public void requestReminderPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
                else callback("onReminderStatus", ReminderScheduler.status(MainActivity.this).toString());
            });
        }
        @JavascriptInterface public void openExactAlarmSettings() {
            if (Build.VERSION.SDK_INT >= 31) runOnUiThread(() -> {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getPackageName()));
                startActivity(i);
            });
        }
        @JavascriptInterface public void checkForUpdates(boolean manual) { updater.check(manual); }
        @JavascriptInterface public void downloadUpdate(String url, String digest, String version) {
            updater.download(url, digest, version);
        }
        @JavascriptInterface public void openUpdateInBrowser(String url) {
            updater.openInBrowser(url);
        }
        @JavascriptInterface public void openFeedback(String title, String body) {
            if (body == null || body.length() > 2500) return;
            runOnUiThread(() -> {
                try {
                    Uri url = Uri.parse("https://github.com/Mr-Y-LYB/classgrid-android/issues/new")
                        .buildUpon().appendQueryParameter("title", title == null ? "问题反馈" : title)
                        .appendQueryParameter("body", body).build();
                    Intent intent = new Intent(Intent.ACTION_VIEW, url);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (Exception e) {
                    callback("onFeedbackResult", "{\"error\":\"无法打开 GitHub\"}");
                }
            });
        }
        @JavascriptInterface public void shareFeedback(String text) {
            if (text == null || text.length() > 2500) return;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType("text/plain");
                    intent.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(intent, "分享反馈"));
                } catch (Exception e) {
                    callback("onFeedbackResult", "{\"error\":\"无法打开分享页面\"}");
                }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_BACKGROUND) {
            String tableId = pendingBackgroundTableId;
            pendingBackgroundTableId = null;
            if (result == RESULT_OK && data != null && data.getData() != null && tableId != null) {
                Uri image = data.getData();
                worker.execute(() -> {
                    JSONObject response = new JSONObject();
                    try {
                        String background = encodeBackground(image);
                        String token = java.util.UUID.randomUUID().toString();
                        synchronized (backgroundLock) {
                            pendingBackgroundData = background;
                            pendingBackgroundToken = token;
                        }
                        response.put("tableId", tableId);
                        response.put("token", token);
                        response.put("length", background.length());
                    } catch (Exception e) {
                        try { response.put("error", e.getMessage() == null ? "无法读取 JPG 图片" : e.getMessage()); }
                        catch (Exception ignored) {}
                    }
                    callback("onBackgroundPicked", response.toString());
                });
            }
            return;
        }
        if (result != RESULT_OK || data == null) return;
        if (request == PORTAL) {
            String payload = data.getStringExtra("payload");
            if (payload != null) callback("onPortalData", payload);
            return;
        }
        Uri uri = data.getData();
        if (uri == null) return;
        if (request == CREATE_EXPORT) {
            String content = pendingExport;
            pendingExport = null;
            if (content == null) return;
            worker.execute(() -> {
                boolean ok = false;
                try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out != null) { out.write(content.getBytes(StandardCharsets.UTF_8)); ok = true; }
                } catch (Exception ignored) {}
                callback("onExportDone", ok ? "{\"ok\":true}" : "{\"ok\":false}");
            });
        } else if (request == PICK_IMPORT) {
            worker.execute(() -> {
                JSONObject resultObj = new JSONObject();
                try {
                    String name = "import";
                    try (android.database.Cursor c = getContentResolver().query(uri,
                        new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst()) name = c.getString(0);
                    }
                    byte[] bytes = readLimited(uri);
                    String text = name.toLowerCase().endsWith(".xlsx")
                        ? XlsxReader.toCsv(bytes) : new String(bytes, StandardCharsets.UTF_8);
                    resultObj.put("name", name);
                    resultObj.put("text", text);
                } catch (Exception e) {
                    try { resultObj.put("error", e.getMessage() == null ? "无法读取文件" : e.getMessage()); }
                    catch (Exception ignored) {}
                }
                callback("onFileImported", resultObj.toString());
            });
        }
    }

    private byte[] readLimited(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IllegalStateException("无法打开文件");
            byte[] buf = new byte[8192]; int count;
            while ((count = in.read(buf)) != -1) {
                if (out.size() + count > MAX_FILE_BYTES) throw new IllegalStateException("文件超过 20 MB");
                out.write(buf, 0, count);
            }
            return out.toByteArray();
        }
    }

    private String encodeBackground(Uri uri) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("无法打开图片");
            BitmapFactory.decodeStream(in, null, options);
        }
        if (!"image/jpeg".equals(options.outMimeType)) throw new IllegalStateException("请选择 JPG 图片");
        if (options.outWidth < 1 || options.outHeight < 1) throw new IllegalStateException("无法读取 JPG 图片尺寸");
        if (options.outWidth > 30000 || options.outHeight > 30000
            || (long) options.outWidth * options.outHeight > 400_000_000L)
            throw new IllegalStateException("图片分辨率过高，请选用较小的 JPG");
        options.inJustDecodeBounds = false;
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 1600)
            options.inSampleSize *= 2;
        Bitmap bitmap;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("无法打开图片");
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) throw new IllegalStateException("无法读取 JPG 图片");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) orientation = new ExifInterface(in).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (Exception ignored) {}
        int degrees = orientation == ExifInterface.ORIENTATION_ROTATE_90 ? 90
            : orientation == ExifInterface.ORIENTATION_ROTATE_180 ? 180
            : orientation == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        if (degrees != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) bitmap.recycle();
            bitmap = rotated;
        }
        byte[] jpeg = null;
        for (int scale = 0; scale < 5; scale++) {
            for (int quality = 82; quality >= 42; quality -= 10) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
                jpeg = out.toByteArray();
                if (jpeg.length <= 160_000) break;
            }
            if (jpeg != null && jpeg.length <= 160_000) break;
            Bitmap smaller = Bitmap.createScaledBitmap(bitmap, Math.max(1, bitmap.getWidth() * 4 / 5),
                Math.max(1, bitmap.getHeight() * 4 / 5), true);
            if (smaller != bitmap) bitmap.recycle();
            bitmap = smaller;
        }
        bitmap.recycle();
        if (jpeg == null || jpeg.length > 160_000) throw new IllegalStateException("图片内容过于复杂，请换一张 JPG");
        return "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == NOTIFICATION_PERMISSION)
            callback("onReminderStatus", ReminderScheduler.status(this).toString());
    }
}
