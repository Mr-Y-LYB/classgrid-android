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
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        String channel = "classgrid_courses";
        manager.createNotificationChannel(new NotificationChannel(channel, "上课提醒",
            NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = intent.getStringExtra("title");
        String room = intent.getStringExtra("room");
        Notification notification = new Notification.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title == null || title.isEmpty() ? "即将上课" : title)
            .setContentText(room == null || room.isEmpty() ? "即将上课" : room)
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(intent.getAction() == null ? 1 : intent.getAction().hashCode(), notification);
    }
}
