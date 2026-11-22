package com.mrylyb.classgrid;

import android.app.job.JobParameters;
import android.app.job.JobService;

/**
 * 15 分钟一次的兜底任务：即使前台服务被 ROM 清掉、闹钟也被清掉，
 * 系统维护窗口里仍会执行这里，补发到点的提醒并把排程与守护服务重新拉起来。
 */
public class ReminderJobService extends JobService {
    @Override public boolean onStartJob(JobParameters params) {
        try { ReminderScheduler.deliverDue(getApplicationContext()); }
        catch (Throwable ignored) { }
        jobFinished(params, false);
        return false;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
}
