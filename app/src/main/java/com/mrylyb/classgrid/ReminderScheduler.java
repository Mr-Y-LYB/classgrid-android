package com.mrylyb.classgrid;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
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
    private static final int REVIVE_ID = 0x43470003;
    private static final int STATUS_ID = 0x43470004;
    private static final String STATUS_CHANNEL = "classgrid_status";
    private static String statusText = "";
    private static final int JOB_ID = 0x4347;
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

    /** 系统是否已经把本应用加入电池优化白名单（false 表示可能被限制后台）。 */
    static boolean ignoringBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            PowerManager manager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return manager != null && manager.isIgnoringBatteryOptimizations(context.getPackageName());
        } catch (Throwable ignored) { return true; }
    }

    static long nextAt(Context context) { return prefs(context).getLong("nextAt", 0L); }

    static String nextTitle(Context context) { return prefs(context).getString("nextTitle", ""); }

    static JSONObject status(Context context) {
        JSONObject result = new JSONObject();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = prefs(context);
        try { result.put("notifications", notificationsAllowed(context))
            .put("exact", alarms != null && (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()))
            .put("alarmClock", prefs.getBoolean("alarmClock", false))
            .put("persistent", prefs.getBoolean("status", true))
            .put("watchdog", ReminderService.isRunning())
            .put("watchdogAt", ReminderService.lastTickAt())
            .put("battery", ignoringBatteryOptimizations(context))
            .put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER)
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
        boolean status = true;
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
        plan.status = data.optBoolean("status", true);
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
            long nextAt = 0; String title = ""; boolean alarmClock = false;
            if (plan.enabled && notificationsAllowed(context) && !plan.events.isEmpty()) {
                ReminderPlan.Event first = plan.events.get(0);
                nextAt = Math.max(now + 1000, first.triggerAt); title = first.title;
                // A stable PendingIntent updates the next alarm without cancelling a due broadcast.
                alarmClock = arm(context, alarms, nextAt, next, true);
            } else alarms.cancel(next);
            // 守护服务每分钟都会回到这里：内容没变就不写盘，避免无意义的闪存写入。
            boolean changed = nextAt != prefs.getLong("nextAt", 0L)
                || !title.equals(prefs.getString("nextTitle", ""))
                || plan.events.size() != prefs.getInt("scheduled", -1)
                || plan.enabled != prefs.getBoolean("enabled", false)
                || alarmClock != prefs.getBoolean("alarmClock", false)
                || plan.status != prefs.getBoolean("status", true)
                || prefs.contains("ids")
                || !plan.delivered.equals(prefs.getStringSet("delivered", new HashSet<>()))
                || !"".equals(prefs.getString("error", ""));
            if (changed) prefs.edit().remove("ids").putStringSet("delivered", plan.delivered)
                .putBoolean("enabled", plan.enabled).putInt("scheduled", plan.events.size())
                .putLong("nextAt", nextAt).putString("nextTitle", title).putString("error", "")
                .putBoolean("alarmClock", alarmClock).putBoolean("status", plan.status).commit();
            PendingIntent refresh = refreshIntent(context);
            alarms.cancel(refresh);
            if (plan.enabled) {
                Calendar tomorrow = Calendar.getInstance();
                tomorrow.add(Calendar.DAY_OF_YEAR, 1); tomorrow.set(Calendar.HOUR_OF_DAY, 3);
                tomorrow.set(Calendar.MINUTE, 0); tomorrow.set(Calendar.SECOND, 0); tomorrow.set(Calendar.MILLISECOND, 0);
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, tomorrow.getTimeInMillis(), refresh);
            }
            // 兜底任务始终挂着（不占通知栏）；前台守护与常驻通知按用户选择开启。
            if (plan.enabled && notificationsAllowed(context)) {
                scheduleJob(context);
                if (plan.status) {
                    if (!ReminderService.isRunning()) ReminderService.start(context);
                } else {
                    ReminderService.stop(context);
                }
            } else {
                ReminderService.stop(context);
                cancelJob(context);
            }
            syncStatusNotification(context);
        } catch (Throwable error) { prefs.edit().putString("error", "课程提醒排程失败，请重新保存提醒设置").commit(); }
    }

    /**
     * 系统闹钟（setAlarmClock）优先级最高：不参与 Doze 批处理，国产 ROM 清后台时也会保留，
     * 是「划掉最近任务后仍然准点提醒」的关键；不可用时逐级退到精确闹钟与普通闹钟。
     */
    private static boolean arm(Context context, AlarmManager alarms, long at, PendingIntent pending, boolean clock) {
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        if (clock && exact) {
            try {
                PendingIntent show = PendingIntent.getActivity(context, NEXT_ID,
                    new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                alarms.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pending);
                return true;
            } catch (Throwable ignored) { }
        }
        if (exact) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                return false;
            } catch (SecurityException ignored) { }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        return false;
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
        } catch (Throwable error) {
            schedule(context);
            prefs(context).edit().putString("error", "课程通知发送失败").commit();
        }
    }

    /**
     * 常驻状态通知：由应用自己发（不是前台服务的通知），所以系统清理后台、
     * 甚至进程被杀之后这一行仍然留在通知栏，用户随时能看到下次提醒。
     */
    static synchronized void syncStatusNotification(Context context) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            SharedPreferences prefs = prefs(context);
            if (!prefs.getBoolean("enabled", false) || !prefs.getBoolean("status", true)
                || !notificationsAllowed(context)) {
                manager.cancel(STATUS_ID);
                statusText = "";
                return;
            }
            if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(STATUS_CHANNEL) == null) {
                NotificationChannel channel = new NotificationChannel(STATUS_CHANNEL, "提醒状态",
                    NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("常驻显示下次上课提醒；清理后台后仍然保留");
                channel.setShowBadge(false);
                manager.createNotificationChannel(channel);
            }
            long nextAt = prefs.getLong("nextAt", 0L);
            String title = prefs.getString("nextTitle", "");
            String text = nextAt > 0
                ? "下次提醒 " + new java.text.SimpleDateFormat("M月d日 HH:mm", java.util.Locale.CHINA)
                    .format(new java.util.Date(nextAt)) + (title.isEmpty() ? "" : " · " + title)
                : "暂无待发送的课前提醒";
            if (text.equals(statusText)) return;
            statusText = text;
            PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, STATUS_CHANNEL)
                : new Notification.Builder(context);
            builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("上课提醒已开启")
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true);
            manager.notify(STATUS_ID, builder.build());
        } catch (Throwable ignored) { }
    }

    /** 划掉最近任务后，几秒内把守护服务拉回来。 */
    static void requestRevive(Context context) {
        try {
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) return;
            // 用 getForegroundService 由系统闹钟直接拉起前台服务：后台广播里 startForegroundService
            // 在 Android 12+ 会被拦，而定时任务下发的 PendingIntent 不受这条限制。
            PendingIntent pending = PendingIntent.getForegroundService(context, REVIVE_ID,
                new Intent(context, ReminderService.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            arm(context, alarms, System.currentTimeMillis() + 2000L, pending, false);
        } catch (Throwable ignored) { }
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
            arm(context, alarms, at, PendingIntent.getBroadcast(context, 0x43470002, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE), false);
            result.put("ok", true).put("at", at)
                .put("exact", Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms())
                .put("watchdog", ReminderService.isRunning());
        } catch (Exception error) {
            try { result.put("ok", false).put("error", error.getMessage()); } catch (Exception ignored) {}
        }
        return result;
    }

    private static void scheduleJob(Context context) {
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, ReminderJobService.class))
                .setPeriodic(15 * 60_000L)
                .setPersisted(true)
                .build();
            scheduler.schedule(job);
        } catch (Throwable ignored) { }
    }

    private static void cancelJob(Context context) {
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) scheduler.cancel(JOB_ID);
        } catch (Throwable ignored) { }
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
