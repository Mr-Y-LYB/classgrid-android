package com.mrylyb.classgrid;

import java.util.Arrays;
import java.util.List;

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
        check(planned.size() == 2, "只安排有有效 ID 且尚未过提醒时刻的课程");
        check(planned.get(0).id.equals("first") && planned.get(0).triggerAt == eight - 15 * 60_000L,
            "08:00 课程应在 07:45 提醒");
        check(planned.get(1).id.equals("later") && planned.get(1).triggerAt == eight + 45 * 60_000L,
            "09:00 课程应在 08:45 提醒");
        check(ReminderPlan.upcoming(source, now, 15, 21L * 86400000, 1).size() == 1,
            "超出容量时保留最近的提醒");
        check(ReminderPlan.upcoming(source, now, 0, 21L * 86400000, 300).size() == 3,
            "提前 0 分钟可在课程开始时提醒");
        System.out.println("Reminder plan tests passed");
    }
}
