package com.mrylyb.classgrid;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class RefreshReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult pending = goAsync();
        new Thread(() -> {
            try { ReminderScheduler.schedule(context.getApplicationContext()); }
            finally { pending.finish(); }
        }, "classgrid-reminder-refresh").start();
    }
}
