package com.mrylyb.classgrid;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (ReminderScheduler.NEXT_ACTION.equals(intent.getAction())) {
            PendingResult pending = goAsync();
            new Thread(() -> {
                try { ReminderScheduler.deliverDue(context.getApplicationContext()); }
                finally { pending.finish(); }
            }, "classgrid-notification").start();
            return;
        }
        post(context, intent.getAction(), intent.getStringExtra("title"), intent.getStringExtra("room"));
    }

    static boolean post(Context context, String id, String title, String room) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !ReminderScheduler.notificationsAllowed(context)) return false;
        String channel = "classgrid_courses";
        manager.createNotificationChannel(new NotificationChannel(channel, "上课提醒",
            NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title == null || title.isEmpty() ? "即将上课" : title)
            .setContentText(room == null || room.isEmpty() ? "即将上课" : room)
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(id == null ? 1 : id.hashCode(), notification);
        return true;
    }
}
