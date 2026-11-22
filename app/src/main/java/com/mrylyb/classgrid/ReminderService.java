package com.mrylyb.classgrid;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * 课前提醒的常驻守护进程。
 *
 * 只靠系统闹钟时，国内 ROM（MIUI / ColorOS / OriginOS 等）在用户「划掉最近任务」后
 * 会清掉应用闹钟并冻结广播，结果就是上课前没有任何通知。这里用一个前台服务把进程
 * 保住，并自己按分钟检查有没有到点的课程：即使闹钟被清掉，也能直接把通知发出来。
 * 服务被系统杀掉时由 START_STICKY、任务移除闹钟、定时任务与开机广播一起拉回。
 */
public class ReminderService extends Service {
    static final String CHANNEL = "classgrid_watchdog";
    static final int NOTIFICATION_ID = 0x4347;
    private static final long TICK = 60_000L;
    private static volatile boolean running;
    private static volatile long lastTickAt;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long shownNextAt = -1;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            lastTickAt = System.currentTimeMillis();
            try { ReminderScheduler.deliverDue(ReminderService.this); } catch (Throwable ignored) { }
            refreshNotification();
            handler.postDelayed(this, TICK);
        }
    };

    static boolean isRunning() { return running; }

    /** 最近一次巡逻时间（内存值，不写盘）：用来在提醒页确认守护确实在跑。 */
    static long lastTickAt() { return running ? lastTickAt : 0L; }

    static void start(Context context) {
        if (!ReminderScheduler.notificationsAllowed(context)) return;
        try {
            Intent intent = new Intent(context, ReminderService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Throwable ignored) {
            // 后台启动被系统限制时，仍由精确闹钟、定时任务和下次打开应用兜底。
        }
    }

    static void stop(Context context) {
        try { context.stopService(new Intent(context, ReminderService.class)); } catch (Throwable ignored) { }
    }

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
        try { startForeground(NOTIFICATION_ID, buildNotification()); } catch (Throwable ignored) { }
        handler.postDelayed(tick, TICK);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        createChannel();
        try { startForeground(NOTIFICATION_ID, buildNotification()); } catch (Throwable ignored) { }
        // 刚被拉起来时立刻补一次，避免错过刚刚到点的提醒。
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 1000L);
        return START_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // 用户划掉最近任务：让系统在几秒后把守护服务重新拉起。
        ReminderScheduler.requestRevive(this);
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "提醒守护", NotificationManager.IMPORTANCE_MIN);
        channel.setDescription("后台守护运行时的静默常驻通知；下次提醒见「提醒状态」通知");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private void refreshNotification() {
        long nextAt = ReminderScheduler.nextAt(this);
        if (nextAt == shownNextAt) return;
        shownNextAt = nextAt;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        try { if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification()); } catch (Throwable ignored) { }
    }

    private Notification buildNotification() {
        String text = "后台守护运行中（静默通知）";
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL)
            : new Notification.Builder(this);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        builder.setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("ClassGrid 后台守护")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setShowWhen(false)
            .setOnlyAlertOnce(true);
        if (Build.VERSION.SDK_INT >= 26) builder.setChannelId(CHANNEL);
        return builder.build();
    }
}
