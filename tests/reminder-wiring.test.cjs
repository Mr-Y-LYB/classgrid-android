// 课前提醒「清后台后仍能提醒」的接线检查：清单、服务、桥接与界面是否齐备。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=read('app/src/main/AndroidManifest.xml');
const scheduler=read('app/src/main/java/com/mrylyb/classgrid/ReminderScheduler.java');
const service=read('app/src/main/java/com/mrylyb/classgrid/ReminderService.java');
const job=read('app/src/main/java/com/mrylyb/classgrid/ReminderJobService.java');
const receiver=read('app/src/main/java/com/mrylyb/classgrid/ReminderReceiver.java');
const refresh=read('app/src/main/java/com/mrylyb/classgrid/RefreshReceiver.java');
const activity=read('app/src/main/java/com/mrylyb/classgrid/MainActivity.java');
const app=read('app/src/main/assets/app.js');
const css=read('app/src/main/assets/material.css');

// 1. 权限与声明
for(const permission of ['USE_EXACT_ALARM','SCHEDULE_EXACT_ALARM','POST_NOTIFICATIONS',
  'FOREGROUND_SERVICE','FOREGROUND_SERVICE_SPECIAL_USE','REQUEST_IGNORE_BATTERY_OPTIMIZATIONS','RECEIVE_BOOT_COMPLETED'])
  assert.ok(manifest.includes(`android.permission.${permission}`),`缺少权限 ${permission}`);
assert.match(manifest,/android:name="\.ReminderService"[\s\S]*?foregroundServiceType="specialUse"/,'守护服务未声明 specialUse 前台类型');
assert.match(manifest,/android:name="\.ReminderJobService"[\s\S]*?BIND_JOB_SERVICE/,'兜底任务未声明');
assert.match(manifest,/com\.mrylyb\.classgrid\.REVIVE_REMINDERS/,'缺少「划掉任务后复活」广播');
assert.match(manifest,/BOOT_COMPLETED/,'未监听开机广播');

// 2. 排程：最高优先级系统闹钟 + 精确闹钟回退 + 守护服务/兜底任务开关
assert.match(scheduler,/setAlarmClock\(new AlarmManager\.AlarmClockInfo/,'未使用 setAlarmClock');
assert.match(scheduler,/setExactAndAllowWhileIdle/,'缺少精确闹钟回退');
assert.match(scheduler,/ReminderService\.start\(context\)/,'排程未拉起守护服务');
assert.match(scheduler,/ReminderService\.stop\(context\)/,'关闭提醒时未停止守护服务');
assert.match(scheduler,/ReminderJobService\.class/,'未安排兜底定时任务');
assert.match(scheduler,/requestRevive/,'缺少复活入口');
assert.match(scheduler,/PendingIntent\.getForegroundService/,'复活没有走 PendingIntent.getForegroundService（Android 12+ 后台启动会被拦）');
assert.match(scheduler,/syncStatusNotification/,'缺少常驻状态通知');
assert.match(scheduler,/IMPORTANCE_LOW[\s\S]*?提醒状态|提醒状态[\s\S]*?IMPORTANCE_LOW/,'状态通知通道重要度不对');
assert.match(service,/IMPORTANCE_MIN/,'守护服务通知应是静默通道，避免与常驻状态通知重复');
assert.match(scheduler,/isIgnoringBatteryOptimizations/,'状态里没有电池优化检查');
assert.match(scheduler,/"watchdog"/,'状态里没有守护服务字段');

// 3. 服务：前台常驻 + 每分钟自查 + 被划掉后复活
assert.match(service,/startForeground\(/,'守护服务没有前台通知');
assert.match(service,/START_STICKY/,'守护服务不是粘性重启');
assert.match(service,/onTaskRemoved[\s\S]*?requestRevive/,'划掉任务后没有安排复活');
assert.match(service,/deliverDue/,'守护服务没有自查投递');
assert.match(job,/deliverDue/,'兜底任务没有投递提醒');
assert.match(receiver,/deliverDue/,'闹钟广播没有投递提醒');
assert.match(refresh,/ReminderService\.start/,'开机/刷新广播没有拉起守护服务');

// 4. 原生桥接与界面自检
for(const method of ['requestIgnoreBatteryOptimizations','openAutoStartSettings','restartReminderWatchdog'])
  assert.ok(activity.includes(method),`缺少桥接方法 ${method}`);
for(const action of ['battery-permission','autostart'])
  assert.ok(app.includes(`action==='${action}'`),`设置页缺少动作 ${action}`);
assert.match(app,/data-action="battery-permission"/,'设置页没有「允许后台运行」按钮');
assert.match(app,/data-action="autostart"/,'设置页没有「自启动」按钮');
assert.match(app,/function reminderCheckHtml/,'缺少提醒自检清单');
assert.match(app,/reminderStatus\.watchdog/,'状态提示没有考虑守护服务');
assert.match(css,/\.reminder-check/,'自检清单没有样式');

// 5. 通知重要性：课前提醒必须能弹出，而不是沉到通知栏底部
assert.match(receiver,/IMPORTANCE_HIGH/,'课程通知重要度过低');

// 6. 常驻状态通知（不是前台服务通知，进程被杀也留在通知栏）
assert.match(scheduler,/setOngoing\(true\)/,'常驻状态通知不是 ongoing');
assert.match(scheduler,/manager\.cancel\(STATUS_ID\)/,'关闭提醒时未撤掉常驻状态通知');

// 7. 通知栏显示方式开关：需要时提醒 → 不跑前台守护、不发常驻通知
assert.match(scheduler,/optBoolean\("status", true\)/,'未读取「通知栏显示方式」开关');
assert.match(scheduler,/if \(plan\.status\)/, '未按开关决定是否启动守护服务');
assert.match(scheduler,/ReminderService\.stop\(context\)/,'按需模式下未停止前台守护');
assert.match(scheduler,/prefs\.getBoolean\("status", true\)/,'常驻通知未尊重开关');
assert.match(app,/name="reminder-status"/,'设置页缺少通知栏显示方式选择');
assert.match(app,/reminderStatusBar/,'前端未保存通知栏显示方式');
console.log('Reminder background-reliability wiring tests passed');
