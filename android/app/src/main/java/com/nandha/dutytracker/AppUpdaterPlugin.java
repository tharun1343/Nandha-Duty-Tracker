package com.nandha.dutytracker;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates: downloads the new APK into the app's cache (with progress events)
 * and installs it from inside the app using the PackageInstaller session API — the app
 * itself streams the APK and commits the install, so there is no browser tab and no
 * file-manager hop. Android still shows one unavoidable system "Update?" confirmation
 * (a security rule no ordinary app can skip); confirming it returns straight to the app.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String INSTALL_ACTION = "com.nandha.dutytracker.INSTALL_STATUS";
    private boolean receiverRegistered = false;

    private File updateFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "duty-tracker-update.apk");
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("A secure (https) download link is required");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String next = url;
                boolean ok = false;
                // Follow redirects (GitHub release downloads redirect to a file host).
                for (int hops = 0; hops < 6; hops++) {
                    conn = (HttpURLConnection) new URL(next).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(60000);
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null) {
                        next = new URL(new URL(next), conn.getHeaderField("Location")).toString();
                        conn.disconnect();
                        continue;
                    }
                    if (code != 200) {
                        call.reject("Download failed (HTTP " + code + ")");
                        return;
                    }
                    ok = true;
                    break;
                }
                if (!ok) {
                    call.reject("Download failed: too many redirects");
                    return;
                }
                long total = conn.getContentLengthLong();
                File out = updateFile();
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = conn.getInputStream(); OutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject ev = new JSObject();
                                ev.put("percent", percent);
                                notifyListeners("progress", ev);
                            }
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("bytes", done);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = updateFile();
        if (!apk.exists()) {
            call.reject("No downloaded update");
            return;
        }
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // First update only: Android asks the person to allow installs from this app.
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }
        try {
            registerStatusReceiver();
            final Context ctx = getContext().getApplicationContext();
            PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            final int sessionId = installer.createSession(params);
            try (PackageInstaller.Session session = installer.openSession(sessionId)) {
                try (OutputStream out = session.openWrite("duty-tracker", 0, apk.length());
                     InputStream in = new FileInputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
                Intent status = new Intent(INSTALL_ACTION).setPackage(ctx.getPackageName());
                PendingIntent pending = PendingIntent.getBroadcast(ctx, sessionId, status, flags);
                session.commit(pending.getIntentSender());
            }
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Install failed: " + e.getMessage(), e);
        }
    }

    /** Listens for the installer's result; it must surface the system confirmation itself. */
    private void registerStatusReceiver() {
        if (receiverRegistered) return;
        receiverRegistered = true;
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                int statusCode = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (statusCode == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    // The one system confirmation Android requires; launch it from the app.
                    Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        try { c.startActivity(confirm); } catch (Exception ignored) {}
                    }
                    return;
                }
                JSObject ev = new JSObject();
                ev.put("status", statusCode);
                ev.put("ok", statusCode == PackageInstaller.STATUS_SUCCESS);
                ev.put("message", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
                notifyListeners("installStatus", ev);
            }
        };
        ContextCompat.registerReceiver(getContext().getApplicationContext(), receiver,
                new IntentFilter(INSTALL_ACTION), ContextCompat.RECEIVER_EXPORTED);
    }
}
