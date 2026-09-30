// Pure helpers (no DOM) so they can be unit-tested with Node.

export const DEFAULT_SETTINGS = {
  anthropicKey: "",
  googleClientId: "",
  calendarId: "primary",
  locationPrefix: "",
  titlePrefix: "",
  defaultDuration: 30,
  reminderMinutes: 15,
  timeZone: "Europe/Berlin",
};

// JSON schema for Claude's structured output.
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "entries"],
  properties: {
    date: {
      type: "string",
      description: "Date printed on the plan as YYYY-MM-DD, or empty string if not visible.",
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "terminart", "ort", "mitarbeiter"],
        properties: {
          start: { type: "string", description: "Start time HH:MM (24h)." },
          end: { type: "string", description: "End time HH:MM (24h), or empty string if the plan shows only a start time." },
          terminart: { type: "string", description: "Value of the 'Terminart' column." },
          ort: { type: "string", description: "Value of the 'Ort' column (room)." },
          mitarbeiter: { type: "string", description: "Value of the 'Mitarbeiter' column, or empty string." },
        },
      },
    },
  },
};

export const EXTRACTION_PROMPT = `Das Bild zeigt einen Tages-Therapieplan (Tabelle) mit den Spalten
"Zeit", "Terminart", "Ort" und "Mitarbeiter".

Extrahiere jede Tabellenzeile als einen Termin:
- start/end: aus der Spalte "Zeit" im Format HH:MM (24h). Bei "8.00 - 8.30", "08:00-08:30 Uhr" o. ä. beides übernehmen; steht nur eine Uhrzeit da, end = "".
- terminart, ort, mitarbeiter: Text der jeweiligen Spalte, genau so wie gedruckt (Abkürzungen nicht auflösen). Leere Zelle = "".
- Zeilen, die über mehrere Textzeilen umbrechen, gehören zu einem Termin.
- Kopfzeilen, Legenden, Fußnoten und durchgestrichene Einträge ignorieren.
- date: das auf dem Plan gedruckte Datum als YYYY-MM-DD, sonst "".
Sortiere die Termine nach Startzeit. Erfinde nichts; wenn etwas unleserlich ist, gib deine beste Lesung an.`;

const TIME_RE = /^(\d{1,2})[:.](\d{2})$/;

export function normalizeTime(value) {
  const m = TIME_RE.exec(String(value ?? "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function normalizeEntries(entries) {
  return (entries ?? [])
    .map((e) => ({
      include: true,
      start: normalizeTime(e.start),
      end: normalizeTime(e.end),
      terminart: String(e.terminart ?? "").trim(),
      ort: String(e.ort ?? "").trim(),
      mitarbeiter: String(e.mitarbeiter ?? "").trim(),
    }))
    .filter((e) => e.start || e.terminart)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// Turn reviewed entries into calendar-neutral event objects.
export function buildEvents(date, entries, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const duration = Number(s.defaultDuration) || 30;
  return entries
    .filter((e) => e.include && e.start)
    .map((e) => {
      let end = e.end && e.end > e.start ? e.end : addMinutes(e.start, duration);
      const title = `${s.titlePrefix || ""}${e.terminart || "Termin"}`;
      const location = [s.locationPrefix, e.ort].filter(Boolean).join(", ");
      const descLines = [];
      if (e.mitarbeiter) descLines.push(`Mitarbeiter: ${e.mitarbeiter}`);
      if (e.ort) descLines.push(`Ort: ${e.ort}`);
      return {
        date,
        start: e.start,
        end,
        title,
        location,
        description: descLines.join("\n"),
        uid: eventUid(date, e),
      };
    });
}

// Deterministic ID so re-importing the same plan updates instead of duplicating.
// Google Calendar IDs must use base32hex chars [a-v0-9], length 5-1024.
export function eventUid(date, e) {
  const key = `${date}|${e.start}|${(e.terminart || "").toLowerCase()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `tp${date.replaceAll("-", "")}${h1.toString(32)}${h2.toString(32)}`;
}

function compact(date, time) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

export function googleTemplateLink(ev, timeZone) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${compact(ev.date, ev.start)}/${compact(ev.date, ev.end)}`,
    ctz: timeZone || DEFAULT_SETTINGS.timeZone,
    location: ev.location,
    details: ev.description,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function googleApiEvent(ev, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const tz = s.timeZone || DEFAULT_SETTINGS.timeZone;
  const reminder = Number(s.reminderMinutes);
  return {
    id: ev.uid,
    status: "confirmed",
    summary: ev.title,
    location: ev.location,
    description: ev.description,
    start: { dateTime: `${ev.date}T${ev.start}:00`, timeZone: tz },
    end: { dateTime: `${ev.date}T${ev.end}:00`, timeZone: tz },
    reminders: Number.isFinite(reminder) && reminder > 0
      ? { useDefault: false, overrides: [{ method: "popup", minutes: reminder }] }
      : { useDefault: true },
  };
}

function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// RFC 5545 line folding (75 octets; approximated by chars, safe for ASCII-heavy text).
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function toICS(events, settings, now = new Date()) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const tz = s.timeZone || DEFAULT_SETTINGS.timeZone;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const reminder = Number(s.reminderMinutes);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//therapy-plan-calendar-parser//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}@therapy-plan`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${compact(ev.date, ev.start)}`,
      `DTEND;TZID=${tz}:${compact(ev.date, ev.end)}`,
      `SUMMARY:${icsEscape(ev.title)}`,
    );
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    if (Number.isFinite(reminder) && reminder > 0) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${reminder}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
