package com.mrylyb.classgrid;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Collections;

final class ReminderPlan {
    static final class Event {
        final String id;
        final long startsAt;
        final long triggerAt;
        final String title;
        final String room;

        Event(String id, long startsAt, long triggerAt, String title, String room) {
            this.id = id;
            this.startsAt = startsAt;
            this.triggerAt = triggerAt;
            this.title = title;
            this.room = room;
        }
    }

    static List<Event> upcoming(List<Event> events, long now, int minutes, long window, int limit) {
        return upcoming(events, now, minutes, window, limit, Collections.emptySet());
    }

    static String deliveryKey(Event event) {
        return event.id + "@" + event.startsAt;
    }

    static List<Event> upcoming(List<Event> events, long now, int minutes, long window, int limit,
                                Set<String> delivered) {
        long lead = Math.max(0, Math.min(240, minutes)) * 60_000L;
        List<Event> result = new ArrayList<>();
        for (Event event : events) {
            if (event.id == null || event.id.isEmpty() || event.startsAt <= 0) continue;
            long trigger = event.startsAt - lead;
            // A due alarm may still be waiting for delivery when the app resumes or the device wakes.
            // Keep it until shortly after class starts; delivery history prevents duplicate notifications.
            if (event.startsAt < now - 120_000L || trigger > now + window) continue;
            Event planned = new Event(event.id, event.startsAt, trigger, event.title, event.room);
            if (!delivered.contains(deliveryKey(planned))) result.add(planned);
        }
        result.sort(Comparator.comparingLong(e -> e.triggerAt));
        Set<String> ids = new HashSet<>();
        result.removeIf(e -> !ids.add(e.id));
        return result.size() > limit ? new ArrayList<>(result.subList(0, limit)) : result;
    }
}
