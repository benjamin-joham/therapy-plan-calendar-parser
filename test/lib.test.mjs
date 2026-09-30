import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTime, normalizeEntries, buildEvents, eventUid, toICS, googleApiEvent, googleTemplateLink } from "../lib.js";

test("normalizeTime accepts common formats", () => {
  assert.equal(normalizeTime("8.00"), "08:00");
  assert.equal(normalizeTime("08:30"), "08:30");
  assert.equal(normalizeTime(" 13:05 "), "13:05");
  assert.equal(normalizeTime("25:00"), "");
  assert.equal(normalizeTime(""), "");
});

test("normalizeEntries sorts and drops empty rows", () => {
  const out = normalizeEntries([
    { start: "10.00", end: "10.45", terminart: "Ergotherapie", ort: "E12", mitarbeiter: "Fr. Maier" },
    { start: "", end: "", terminart: "", ort: "", mitarbeiter: "" },
    { start: "8:00", end: "", terminart: "Frühsport", ort: "Halle", mitarbeiter: "" },
  ]);
  assert.deepEqual(out.map((e) => e.start), ["08:00", "10:00"]);
});

test("buildEvents applies default duration and location prefix", () => {
  const entries = normalizeEntries([{ start: "8:00", end: "", terminart: "Frühsport", ort: "Halle", mitarbeiter: "Hr. X" }]);
  const [ev] = buildEvents("2026-10-01", entries, { defaultDuration: 45, locationPrefix: "Klinik" });
  assert.equal(ev.end, "08:45");
  assert.equal(ev.location, "Klinik, Halle");
  assert.match(ev.description, /Mitarbeiter: Hr. X/);
});

test("eventUid is stable and valid for Google Calendar", () => {
  const e = { start: "08:00", terminart: "Frühsport" };
  const id = eventUid("2026-10-01", e);
  assert.equal(id, eventUid("2026-10-01", { ...e, ort: "other" }));
  assert.notEqual(id, eventUid("2026-10-02", e));
  assert.match(id, /^[a-v0-9]{5,1024}$/);
});

test("googleApiEvent uses local time with zone", () => {
  const [ev] = buildEvents("2026-10-01", normalizeEntries([{ start: "9:00", end: "9:30", terminart: "Physio", ort: "", mitarbeiter: "" }]), {});
  const g = googleApiEvent(ev, { timeZone: "Europe/Vienna", reminderMinutes: 15 });
  assert.deepEqual(g.start, { dateTime: "2026-10-01T09:00:00", timeZone: "Europe/Vienna" });
  assert.equal(g.reminders.overrides[0].minutes, 15);
  assert.match(googleTemplateLink(ev, "Europe/Vienna"), /dates=20261001T090000%2F20261001T093000/);
});

test("toICS produces a valid calendar", () => {
  const [ev] = buildEvents("2026-10-01", normalizeEntries([{ start: "9:00", end: "9:30", terminart: "Gruppe; Achtsamkeit, Teil 1", ort: "R 2", mitarbeiter: "" }]), {});
  const ics = toICS([ev], {}, new Date("2026-09-30T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;TZID=Europe\/Berlin:20261001T090000/);
  assert.match(ics, /SUMMARY:Gruppe\\; Achtsamkeit\\, Teil 1/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
