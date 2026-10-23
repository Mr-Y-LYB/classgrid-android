package com.mrylyb.classgrid;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class ReminderScheduler {
    static final String NEXT_ACTION = "com.mrylyb.classgrid.NEXT_COURSE";
    private static final long WINDOW = 21L * 24 * 60 * 60 * 1000;
    private static final int REFRESH_ID = 0x43470000;
    private static final int NEXT_ID = 0x43470001;
    private ReminderScheduler() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("alarms", Context.MODE_PRIVATE);
    }

    static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return false;
        NotificationChannel channel = manager.getNotificationChannel("classgrid_courses");
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static JSONObject status(Context context) {
        JSONObject result = new JSONObject();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = prefs(context);
        try { result.put("notifications", notificationsAllowed(context))
            .put("exact", alarms != null && (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()))
            .put("enabled", prefs.getBoolean("enabled", false)).put("scheduled", prefs.getInt("scheduled", 0))
            .put("nextAt", prefs.getLong("nextAt", 0L)).put("nextTitle", prefs.getString("nextTitle", ""))
            .put("lastAt", prefs.getLong("lastAt", 0L)).put("lastTitle", prefs.getString("lastTitle", ""))
            .put("error", prefs.getString("error", "")); } catch (Exception ignored) {}
        return result;
    }

    static synchronized void saveAndSchedule(Context context, String json) {
        try {
            new JSONObject(json);
            File temp = new File(context.getFilesDir(), "reminders.tmp");
            File target = new File(context.getFilesDir(), "reminders.json");
            try (FileOutputStream out = new FileOutputStream(temp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8)); out.getFD().sync();
            }
            if (!temp.renameTo(target)) throw new IllegalStateException("无法保存提醒");
            schedule(context);
        } catch (Exception error) { prefs(context).edit().putString("error", "提醒数据保存失败").commit(); }
    }

    private static final class Plan {
        boolean enabled;
        List<ReminderPlan.Event> events = new ArrayList<>();
        Set<String> delivered;
    }

    private static Plan readPlan(Context context, long now) throws Exception {
        Plan plan = new Plan();
        plan.delivered = new HashSet<>(prefs(context).getStringSet("delivered", new HashSet<>()));
        File file = new File(context.getFilesDir(), "reminders.json");
        if (!file.exists()) return plan;
        JSONObject data = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        plan.enabled = data.optBoolean("enabled", false);
        int minutes = data.optInt("minutes", 15);
        JSONArray events = data.optJSONArray("events");
        List<ReminderPlan.Event> raw = new ArrayList<>();
        Set<String> currentKeys = new HashSet<>();
        if (events != null) for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null) continue;
            long at = event.optLong("at", 0);
            ReminderPlan.Event item = new ReminderPlan.Event(event.optString("id", ""), at,
                at - Math.max(0, Math.min(240, minutes)) * 60_000L,
                event.optString("title", "课程即将开始"), event.optString("room", ""));
            raw.add(item); currentKeys.add(ReminderPlan.deliveryKey(item));
        }
        plan.delivered.retainAll(currentKeys);
        if (plan.enabled) plan.events = ReminderPlan.upcoming(raw, now, minutes, WINDOW,
            Integer.MAX_VALUE, plan.delivered);
        return plan;
    }

    static synchronized void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        SharedPreferences prefs = prefs(context);
        try {
            long now = System.currentTimeMillis();
            Plan plan = readPlan(context, now);
            // Clean up individual alarms created by earlier app versions once.
            for (String id : prefs.getStringSet("ids", new HashSet<>())) {
                Intent old = new Intent(context, ReminderReceiver.class).setAction("com.mrylyb.classgrid.COURSE_" + id);
                PendingIntent pending = PendingIntent.getBroadcast(context, id.hashCode(), old,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pending != null) { alarms.cancel(pending); pending.cancel(); }
            }
            PendingIntent next = queueIntent(context);
            long nextAt = 0; String title = "";
            if (plan.enabled && notificationsAllowed(context) && !plan.events.isEmpty()) {
                ReminderPlan.Event first = plan.events.get(0);
                nextAt = Math.max(now + 1000, first.triggerAt); title = first.title;
                // A stable PendingIntent updates the next alarm without cancelling a due broadcast.
                arm(alarms, nextAt, next);
            } else alarms.cancel(next);
            prefs.edit().remove("ids").putStringSet("delivered", plan.delivered)
                .putBoolean("enabled", plan.enabled).putInt("scheduled", plan.events.size())
                .putLong("nextAt", nextAt).putString("nextTitle", title).putString("error", "").commit();
            PendingIntent refresh = refreshIntent(context);
            alarms.cancel(refresh);
            if (plan.enabled) {
                Calendar tomorrow = Calendar.getInstance();
                tomorrow.add(Calendar.DAY_OF_YEAR, 1); tomorrow.set(Calendar.HOUR_OF_DAY, 3);
                tomorrow.set(Calendar.MINUTE, 0); tomorrow.set(Calendar.SECOND, 0); tomorrow.set(Calendar.MILLISECOND, 0);
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, tomorrow.getTimeInMillis(), refresh);
            }
        } catch (Exception error) { prefs.edit().putString("error", "课程提醒排程失败，请重新保存提醒设置").commit(); }
    }

    static synchronized void deliverDue(Context context) {
        try {
            long now = System.currentTimeMillis();
            Plan plan = readPlan(context, now);
            if (notificationsAllowed(context)) for (ReminderPlan.Event event : plan.events) {
                if (event.triggerAt > now) break;
                if (ReminderReceiver.post(context, event.id, event.title, event.room)) {
                    plan.delivered.add(ReminderPlan.deliveryKey(event));
                    prefs(context).edit().putStringSet("delivered", plan.delivered)
                        .putLong("lastAt", now).putString("lastTitle", event.title).commit();
                }
            }
            schedule(context);
        } catch (Exception error) {
            schedule(context);
            prefs(context).edit().putString("error", "课程通知发送失败").commit();
        }
    }

    private static void arm(AlarmManager alarms, long at, PendingIntent pending) {
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending); return; }
            catch (SecurityException ignored) { }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
    }

    static synchronized JSONObject scheduleTest(Context context) {
        JSONObject result = new JSONObject();
        try {
            if (!notificationsAllowed(context)) throw new IllegalStateException("请先开启通知权限");
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) throw new IllegalStateException("无法使用系统提醒");
            long at = System.currentTimeMillis() + 60_000L;
            Intent intent = new Intent(context, ReminderReceiver.class).setAction("com.mrylyb.classgrid.TEST_REMINDER")
                .putExtra("title", "ClassGrid 测试提醒").putExtra("room", "测试通知已送达");
            arm(alarms, at, PendingIntent.getBroadcast(context, 0x43470002, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            result.put("ok", true).put("at", at)
                .put("exact", Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms());
        } catch (Exception error) {
            try { result.put("ok", false).put("error", error.getMessage()); } catch (Exception ignored) {}
        }
        return result;
    }

    private static PendingIntent queueIntent(Context context) {
        return PendingIntent.getBroadcast(context, NEXT_ID,
            new Intent(context, ReminderReceiver.class).setAction(NEXT_ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent refreshIntent(Context context) {
        return PendingIntent.getBroadcast(context, REFRESH_ID,
            new Intent(context, RefreshReceiver.class).setAction("com.mrylyb.classgrid.REFRESH_REMINDERS"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
