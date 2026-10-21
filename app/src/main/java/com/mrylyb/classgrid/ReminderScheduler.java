package com.mrylyb.classgrid;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

final class ReminderScheduler {
    private static final long WINDOW = 21L * 24 * 60 * 60 * 1000;
    private static final int REFRESH_ID = 0x43470000;
    private ReminderScheduler() {}

    static JSONObject status(Context context) {
        JSONObject result = new JSONObject();
        boolean notifications = Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        android.app.NotificationManager manager = (android.app.NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) notifications = notifications && manager.areNotificationsEnabled();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        try { result.put("notifications", notifications).put("exact", exact); } catch (Exception ignored) {}
        return result;
    }

    static void saveAndSchedule(Context context, String json) {
        try {
            new JSONObject(json);
            File temp = new File(context.getFilesDir(), "reminders.tmp");
            File target = new File(context.getFilesDir(), "reminders.json");
            try (FileOutputStream out = new FileOutputStream(temp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (!temp.renameTo(target)) {
                try (FileOutputStream out = new FileOutputStream(target)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
                temp.delete();
            }
            schedule(context);
        } catch (Exception ignored) {}
    }

    static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        SharedPreferences prefs = context.getSharedPreferences("alarms", Context.MODE_PRIVATE);
        Set<String> oldIds = new HashSet<>(prefs.getStringSet("ids", new HashSet<>()));
        for (String id : oldIds) alarms.cancel(eventIntent(context, id, "", ""));
        Set<String> currentIds = new HashSet<>();
        File file = new File(context.getFilesDir(), "reminders.json");
        try {
            if (file.exists()) {
                JSONObject data = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                if (data.optBoolean("enabled", false)) {
                    long now = System.currentTimeMillis();
                    int minutes = Math.max(0, Math.min(240, data.optInt("minutes", 15)));
                    JSONArray events = data.optJSONArray("events");
                    if (events != null) for (int i = 0; i < events.length() && currentIds.size() < 300; i++) {
                        JSONObject event = events.optJSONObject(i);
                        if (event == null) continue;
                        String id = event.optString("id", "");
                        long trigger = event.optLong("at", 0) - minutes * 60000L;
                        if (id.isEmpty() || trigger <= now || trigger > now + WINDOW) continue;
                        PendingIntent intent = eventIntent(context, id,
                            event.optString("title", "课程即将开始"), event.optString("room", ""));
                        if (Build.VERSION.SDK_INT >= 31 && alarms.canScheduleExactAlarms())
                            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, intent);
                        else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, intent);
                        currentIds.add(id);
                    }
                }
            }
        } catch (Exception ignored) {}
        prefs.edit().putStringSet("ids", currentIds).apply();
        PendingIntent refresh = refreshIntent(context);
        alarms.cancel(refresh);
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 3);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), refresh);
    }

    private static PendingIntent eventIntent(Context context, String id, String title, String room) {
        Intent i = new Intent(context, ReminderReceiver.class);
        i.setAction("com.mrylyb.classgrid.COURSE_" + id);
        i.putExtra("title", title);
        i.putExtra("room", room);
        return PendingIntent.getBroadcast(context, id.hashCode(), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent refreshIntent(Context context) {
        Intent i = new Intent(context, RefreshReceiver.class);
        i.setAction("com.mrylyb.classgrid.REFRESH_REMINDERS");
        return PendingIntent.getBroadcast(context, REFRESH_ID, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
