package com.mrylyb.classgrid;

import com.sun.net.httpserver.HttpServer;
import java.io.File;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;

public final class ApkDownloaderTest {
    public static void main(String[] args) throws Exception {
        if (args.length == 2) {
            File target = Files.createTempFile("classgrid-network-test", ".apk").toFile();
            try {
                ApkDownloader.download(Collections.singletonList(args[0]), args[1], target,
                    true, 12000, 20000, new ApkDownloader.Progress() {
                        @Override public void status(String message) { System.out.println(message); }
                        @Override public void percent(int value) {}
                    });
                System.out.println("Verified APK bytes: " + target.length());
            } finally { target.delete(); }
            return;
        }
        byte[] apk = "signed-apk-fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        StringBuilder hex = new StringBuilder("sha256:");
        for (byte value : MessageDigest.getInstance("SHA-256").digest(apk))
            hex.append(String.format("%02x", value & 0xff));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool(r -> {
            Thread thread = new Thread(r);
            thread.setDaemon(true);
            return thread;
        }));
        server.createContext("/slow", exchange -> {
            try { Thread.sleep(350); } catch (InterruptedException ignored) {}
            try { exchange.sendResponseHeaders(200, apk.length); exchange.getResponseBody().write(apk); }
            catch (Exception ignored) {}
            finally { exchange.close(); }
        });
        server.createContext("/good", exchange -> {
            exchange.sendResponseHeaders(200, apk.length);
            exchange.getResponseBody().write(apk);
            exchange.close();
        });
        server.createContext("/bad", exchange -> {
            byte[] wrong = "wrong".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, wrong.length);
            exchange.getResponseBody().write(wrong);
            exchange.close();
        });
        server.start();
        File target = Files.createTempFile("classgrid-download-test", ".apk").toFile();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            ApkDownloader.Progress progress = new ApkDownloader.Progress() {
                @Override public void status(String message) {}
                @Override public void percent(int value) {}
            };
            ApkDownloader.download(Arrays.asList(base + "/slow", base + "/good"),
                hex.toString(), target, false, 100, 100, progress);
            if (!Arrays.equals(apk, Files.readAllBytes(target.toPath())))
                throw new AssertionError("timeout fallback failed");
            ApkDownloader.download(Arrays.asList(base + "/bad", base + "/good"),
                hex.toString(), target, false, 100, 1000, progress);
            if (!Arrays.equals(apk, Files.readAllBytes(target.toPath())))
                throw new AssertionError("hash fallback failed");
            try {
                ApkDownloader.download(Collections.singletonList(base + "/bad"),
                    hex.toString(), target, false, 100, 1000, progress);
                throw new AssertionError("corrupted download accepted");
            } catch (IllegalStateException expected) {
                if (target.exists()) throw new AssertionError("corrupted file not removed");
            }
            System.out.println("ApkDownloader fallback and hash checks passed");
        } finally {
            target.delete();
            server.stop(0);
        }
    }
}
