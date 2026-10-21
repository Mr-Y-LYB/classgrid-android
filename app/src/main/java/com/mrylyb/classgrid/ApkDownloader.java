package com.mrylyb.classgrid;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;

final class ApkDownloader {
    interface Progress {
        void status(String message);
        void percent(int value);
    }

    private static final long MAX_BYTES = 200L * 1024 * 1024;

    static void download(List<String> sources, String digest, File target,
                         boolean requireHttps, int connectTimeout, int readTimeout,
                         Progress progress) throws Exception {
        if (sources.isEmpty() || !digest.matches("sha256:[a-fA-F0-9]{64}"))
            throw new IllegalArgumentException("更新信息无效");
        Exception last = null;
        for (int i = 0; i < sources.size(); i++) {
            if (target.exists() && !target.delete()) throw new IllegalStateException("无法清除未完成的下载");
            progress.status("正在连接下载源 " + (i + 1) + "/" + sources.size() + "…");
            try {
                downloadOne(sources.get(i), digest, target, requireHttps,
                    connectTimeout, readTimeout, progress);
                return;
            } catch (Exception e) {
                last = e;
                if (target.exists()) target.delete();
            }
        }
        String reason = last == null ? "连接失败" : last.getMessage();
        throw new IllegalStateException("所有下载源均失败（" + reason + "）", last);
    }

    private static void downloadOne(String source, String digest, File target,
                                    boolean requireHttps, int connectTimeout, int readTimeout,
                                    Progress progress) throws Exception {
        URL address = new URL(source);
        if (requireHttps && !"https".equals(address.getProtocol()))
            throw new IllegalArgumentException("下载地址不安全");
        HttpURLConnection conn = (HttpURLConnection) address.openConnection();
        conn.setConnectTimeout(connectTimeout);
        conn.setReadTimeout(readTimeout);
        conn.setRequestProperty("User-Agent", "ClassGrid-Android");
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new IllegalStateException("HTTP " + code);
            if (requireHttps && !"https".equals(conn.getURL().getProtocol()))
                throw new IllegalStateException("下载地址不安全");
            long expected = conn.getContentLengthLong();
            if (expected > MAX_BYTES) throw new IllegalStateException("安装包过大");
            progress.status("正在下载（下载源）…");
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            long total = 0;
            int lastPercent = -1;
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_BYTES) throw new IllegalStateException("安装包过大");
                    hash.update(buffer, 0, count);
                    out.write(buffer, 0, count);
                    if (expected > 0) {
                        int percent = (int) Math.min(100, total * 100 / expected);
                        if (percent >= lastPercent + 5) {
                            lastPercent = percent;
                            progress.percent(percent);
                        }
                    }
                }
                out.getFD().sync();
            }
            if (total == 0 || (expected > 0 && total != expected))
                throw new IllegalStateException("下载不完整");
            StringBuilder actual = new StringBuilder();
            for (byte b : hash.digest()) actual.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            if (!actual.toString().equalsIgnoreCase(digest.substring(7)))
                throw new IllegalStateException("安装包校验失败");
        } finally {
            conn.disconnect();
        }
    }
}
