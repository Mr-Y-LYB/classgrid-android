package com.mrylyb.classgrid;

import java.util.Arrays;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;

public final class ReminderPlanTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        long eight = 8L * 60 * 60 * 1000;
        long now = eight - 20 * 60_000L;
        List<ReminderPlan.Event> source = Arrays.asList(
            new ReminderPlan.Event("later", eight + 60 * 60_000L, 0, "第二节", "B201"),
            new ReminderPlan.Event("first", eight, 0, "第一节", "A101"),
            new ReminderPlan.Event("first", eight, 0, "重复", ""),
            new ReminderPlan.Event("", eight, 0, "无效", ""),
            new ReminderPlan.Event("past", now + 10 * 60_000L, 0, "来不及提前", ""));
        List<ReminderPlan.Event> planned = ReminderPlan.upcoming(source, now, 15, 21L * 86400000, 300);
        check(planned.size() == 3, "保留尚未上课但已到提醒时刻的课程，防止返回前台时丢失通知");
        check(planned.get(0).id.equals("past") && planned.get(0).triggerAt < now, "逾期提醒优先补发");
        check(planned.get(1).id.equals("first") && planned.get(1).triggerAt == eight - 15 * 60_000L,
            "08:00 课程应在 07:45 提醒");
        check(planned.get(2).id.equals("later") && planned.get(2).triggerAt == eight + 45 * 60_000L,
            "09:00 课程应在 08:45 提醒");
        check(ReminderPlan.upcoming(source, now, 15, 21L * 86400000, 1).size() == 1,
            "超出容量时保留最近的提醒");
        check(ReminderPlan.upcoming(source, now, 0, 21L * 86400000, 300).size() == 3,
            "提前 0 分钟可在课程开始时提醒");
        check(ReminderPlan.upcoming(source, now, 15, 21L * 86400000, 300,
            Collections.singleton(ReminderPlan.deliveryKey(planned.get(0)))).size() == 2,
            "已发送提醒在保存或重启后不重复发送");
        check(ReminderPlan.upcoming(source, now, 30, 21L * 86400000, 300,
            Collections.singleton(ReminderPlan.deliveryKey(planned.get(0)))).size() == 2,
            "改变提前分钟不会重复发送同一次课程的通知");
        check(ReminderPlan.upcoming(source, eight + 121_000L, 15, 21L * 86400000, 300).size() == 1,
            "已经上课超过两分钟的课程不补发过期提醒");
        List<ReminderPlan.Event> simultaneous = Arrays.asList(
            new ReminderPlan.Event("a", eight, 0, "课程 A", ""),
            new ReminderPlan.Event("b", eight, 0, "课程 B", ""));
        check(ReminderPlan.upcoming(simultaneous, now, 15, 86400000, 300).size() == 2,
            "同时开始的不同课程都保留");
        List<ReminderPlan.Event> many = new ArrayList<>();
        for (int i = 0; i < 400; i++) many.add(new ReminderPlan.Event("event-" + i, eight + i * 60_000L, 0, "课", ""));
        check(ReminderPlan.upcoming(many, now, 15, 86400000, Integer.MAX_VALUE).size() == 400,
            "下一条队列不因旧版 300 条上限遗漏课程");
        System.out.println("Reminder plan tests passed");
    }
}
