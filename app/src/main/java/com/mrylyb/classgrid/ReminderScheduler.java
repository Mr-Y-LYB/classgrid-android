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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
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
        if (manager != null) {
            notifications = notifications && manager.areNotificationsEnabled();
            android.app.NotificationChannel channel = manager.getNotificationChannel("classgrid_courses");
            if (channel != null) notifications = notifications &&
                channel.getImportance() != android.app.NotificationManager.IMPORTANCE_NONE;
        }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exact = alarms != null && (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms());
        SharedPreferences prefs = context.getSharedPreferences("alarms", Context.MODE_PRIVATE);
        try { result.put("notifications", notifications).put("exact", exact)
            .put("enabled", prefs.getBoolean("enabled", false))
            .put("scheduled", prefs.getInt("scheduled", 0))
            .put("nextAt", prefs.getLong("nextAt", 0L))
            .put("error", prefs.getString("error", "")); } catch (Exception ignored) {}
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
        } catch (Exception error) {
            context.getSharedPreferences("alarms", Context.MODE_PRIVATE).edit()
                .putString("error", "提醒数据保存失败").apply();
        }
    }

    static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        SharedPreferences prefs = context.getSharedPreferences("alarms", Context.MODE_PRIVATE);
        List<ReminderPlan.Event> raw = new ArrayList<>();
        boolean enabled = false;
        File file = new File(context.getFilesDir(), "reminders.json");
        try {
            if (file.exists()) {
                JSONObject data = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                enabled = data.optBoolean("enabled", false);
                int minutes = data.optInt("minutes", 15);
                JSONArray events = data.optJSONArray("events");
                if (enabled && events != null) for (int i = 0; i < events.length(); i++) {
                    JSONObject event = events.optJSONObject(i);
                    if (event == null) continue;
                    raw.add(new ReminderPlan.Event(event.optString("id", ""), event.optLong("at", 0), 0,
                        event.optString("title", "课程即将开始"), event.optString("room", "")));
                }
                raw = ReminderPlan.upcoming(raw, System.currentTimeMillis(), minutes, WINDOW, 300);
            }
        } catch (Exception error) {
            prefs.edit().putString("error", "提醒数据读取失败").apply();
            return;
        }
        Set<String> oldIds = new HashSet<>(prefs.getStringSet("ids", new HashSet<>()));
        for (String id : oldIds) alarms.cancel(eventIntent(context, id, "", ""));
        Set<String> currentIds = new HashSet<>();
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        long nextAt = 0;
        String error = "";
        for (ReminderPlan.Event event : raw) {
            try {
                PendingIntent intent = eventIntent(context, event.id, event.title, event.room);
                if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.triggerAt, intent);
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.triggerAt, intent);
                currentIds.add(event.id);
                if (nextAt == 0 || event.triggerAt < nextAt) nextAt = event.triggerAt;
            } catch (SecurityException denied) {
                exact = false;
                try {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.triggerAt,
                        eventIntent(context, event.id, event.title, event.room));
                    currentIds.add(event.id);
                    if (nextAt == 0 || event.triggerAt < nextAt) nextAt = event.triggerAt;
                } catch (RuntimeException failed) { error = "部分提醒设置失败"; }
            } catch (RuntimeException failed) { error = "部分提醒设置失败"; }
        }
        prefs.edit().putStringSet("ids", currentIds).putBoolean("enabled", enabled)
            .putInt("scheduled", currentIds.size()).putLong("nextAt", nextAt)
            .putString("error", error).apply();
        PendingIntent refresh = refreshIntent(context);
        alarms.cancel(refresh);
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 3);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        try { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), refresh); }
        catch (RuntimeException failed) { prefs.edit().putString("error", "提醒刷新设置失败").apply(); }
    }

    static JSONObject scheduleTest(Context context) {
        JSONObject result = new JSONObject();
        try {
            if (!status(context).optBoolean("notifications", false))
                throw new IllegalStateException("请先开启通知权限");
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) throw new IllegalStateException("无法使用系统提醒");
            long at = System.currentTimeMillis() + 60_000L;
            boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
            PendingIntent test = eventIntent(context, "test-reminder", "ClassGrid 测试提醒", "测试通知已送达");
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, test);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, test);
            result.put("ok", true).put("exact", exact).put("at", at);
        } catch (Exception error) {
            try { result.put("ok", false).put("error", error.getMessage() == null ? "测试提醒设置失败" : error.getMessage()); }
            catch (Exception ignored) {}
        }
        return result;
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
