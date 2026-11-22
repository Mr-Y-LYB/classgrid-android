package com.mrylyb.classgrid;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机、更新、改时区、每日刷新以及「划掉最近任务后自动复活」都从这里回到排程。 */
public class RefreshReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                ReminderScheduler.schedule(context.getApplicationContext());
                if (!ReminderService.isRunning()) ReminderService.start(context.getApplicationContext());
            } finally { pending.finish(); }
        }, "classgrid-reminder-refresh").start();
    }
}
