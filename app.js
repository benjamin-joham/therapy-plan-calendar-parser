import Anthropic from "./vendor/anthropic-sdk.js";
import {
  DEFAULT_SETTINGS,
  PLAN_SCHEMA,
  EXTRACTION_PROMPT,
  normalizeEntries,
  buildEvents,
  googleTemplateLink,
  googleApiEvent,
  toICS,
} from "./lib.js";

const MODEL = "claude-opus-5-5";
const SETTINGS_KEY = "tpcp.settings";
const MAX_IMAGE_EDGE = 2000;

const $ = (id) => document.getElementById(id);

// ---------- settings ----------

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    alert("Einstellungen konnten nicht gespeichert werden (privater Modus?).");
  }
}

let settings = loadSettings();

function openSettings() {
  const form = $("settingsForm");
  for (const [k, v] of Object.entries(settings)) {
    if (form.elements[k]) form.elements[k].value = v ?? "";
  }
  $("settingsDialog").showModal();
}

$("settingsDialog").addEventListener("close", () => {
  if ($("settingsDialog").returnValue !== "save") return;
  const form = $("settingsForm");
  const next = { ...settings };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (form.elements[k]) next[k] = form.elements[k].value.trim();
  }
  if (!next.calendarId) next.calendarId = DEFAULT_SETTINGS.calendarId;
  if (!next.timeZone) next.timeZone = DEFAULT_SETTINGS.timeZone;
  settings = next;
  saveSettings(settings);
  refreshUi();
});

$("settingsBtn").addEventListener("click", openSettings);
$("setupLink").addEventListener("click", (e) => {
  e.preventDefault();
  openSettings();
});

// ---------- state ----------

let imageData = null; // { base64, mediaType, url }
let entries = [];

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
$("dateInput").value = todayIso();

function refreshUi() {
  $("setupHint").hidden = Boolean(settings.anthropicKey);
  $("parseBtn").disabled = !imageData || !settings.anthropicKey;
  $("gcalHint").hidden = Boolean(settings.googleClientId);
  $("gcalBtn").disabled = !settings.googleClientId;
  const hasEntries = entries.length > 0;
  $("reviewSection").hidden = !hasEntries && !$("reviewSection").dataset.shown;
  $("exportSection").hidden = !hasEntries;
  if (hasEntries) renderLinks();
}

// ---------- image handling ----------

async function loadImage(file) {
  // Downscale on the phone: faster upload, and Claude resizes large images anyway.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  let source = bitmap;
  let w, h;
  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
  } else {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      img.src = URL.createObjectURL(file);
    });
    w = source.naturalWidth;
    h = source.naturalHeight;
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.9);
  return { base64: url.split(",")[1], mediaType: "image/jpeg", url };
}

async function onFile(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  setStatus("parseStatus", "Bild wird vorbereitet …");
  try {
    imageData = await loadImage(file);
    $("preview").src = imageData.url;
    $("preview").hidden = false;
    setStatus("parseStatus", "");
  } catch (err) {
    imageData = null;
    setStatus("parseStatus", err.message, true);
  }
  refreshUi();
}
$("cameraInput").addEventListener("change", onFile);
$("fileInput").addEventListener("change", onFile);

// ---------- Claude extraction ----------

async function extractPlan() {
  const client = new Anthropic({
    apiKey: settings.anthropicKey,
    dangerouslyAllowBrowser: true, // key lives only in this phone's local storage
  });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: PLAN_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: imageData.mediaType, data: imageData.base64 } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Die Anfrage wurde vom Modell abgelehnt. Bitte ein anderes Foto versuchen.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Antwort wurde abgeschnitten. Bitte das Foto auf einen Tag zuschneiden.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

$("parseBtn").addEventListener("click", async () => {
  $("parseBtn").disabled = true;
  setStatus("parseStatus", "Termine werden erkannt … (dauert ca. 10–30 s)");
  try {
    const plan = await extractPlan();
    entries = normalizeEntries(plan.entries);
    let note = `${entries.length} Termin(e) erkannt.`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(plan.date) && plan.date !== $("dateInput").value) {
      $("dateInput").value = plan.date;
      note += ` Datum aus dem Plan übernommen: ${formatDate(plan.date)}.`;
    }
    setStatus("parseStatus", note);
    $("reviewSection").dataset.shown = "1";
    renderEntries();
    $("reviewSection").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    setStatus("parseStatus", describeError(err), true);
  } finally {
    refreshUi();
  }
});

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic-API-Key ungültig. Bitte in den Einstellungen prüfen.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Kein Zugriff mit diesem API-Key (Guthaben/Berechtigungen prüfen).";
  if (err instanceof Anthropic.RateLimitError) return "Zu viele Anfragen – bitte kurz warten und erneut versuchen.";
  if (err instanceof Anthropic.APIConnectionError) return "Keine Verbindung zur Anthropic-API. Internet prüfen.";
  if (err instanceof Anthropic.APIError) return `API-Fehler (${err.status ?? "?"}): ${err.message}`;
  if (err instanceof SyntaxError) return "Antwort konnte nicht gelesen werden. Bitte erneut versuchen.";
  return err?.message || String(err);
}

// ---------- review table ----------

function renderEntries() {
  const container = $("entries");
  container.replaceChildren();
  entries.forEach((entry, i) => {
    const node = $("entryTemplate").content.firstElementChild.cloneNode(true);
    for (const input of node.querySelectorAll("[data-f]")) {
      const f = input.dataset.f;
      if (input.type === "checkbox") input.checked = entry[f];
      else input.value = entry[f];
      input.addEventListener("input", () => {
        entry[f] = input.type === "checkbox" ? input.checked : input.value;
        node.classList.toggle("excluded", !entry.include);
        renderLinks();
      });
    }
    node.classList.toggle("excluded", !entry.include);
    node.querySelector(".remove").addEventListener("click", () => {
      entries.splice(i, 1);
      renderEntries();
    });
    container.append(node);
  });
  refreshUi();
}

$("addRowBtn").addEventListener("click", () => {
  entries.push({ include: true, start: "", end: "", terminart: "", ort: "", mitarbeiter: "" });
  renderEntries();
});

$("dateInput").addEventListener("change", () => entries.length && renderLinks());

function currentEvents() {
  return buildEvents($("dateInput").value, entries, settings);
}

// ---------- export: links + ICS ----------

function renderLinks() {
  const list = $("linkList");
  list.replaceChildren();
  for (const ev of currentEvents()) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = googleTemplateLink(ev, settings.timeZone);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${ev.start}–${ev.end} ${ev.title}`;
    li.append(a);
    list.append(li);
  }
}

$("icsBtn").addEventListener("click", () => {
  const events = currentEvents();
  if (!events.length) return setStatus("exportStatus", "Keine Termine ausgewählt.", true);
  const blob = new Blob([toICS(events, settings)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `therapieplan-${$("dateInput").value}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  setStatus("exportStatus", `${events.length} Termin(e) als .ics exportiert.`);
});

// ---------- export: Google Calendar API ----------

let accessToken = null;
let tokenExpiry = 0;

function getGoogleToken() {
  if (accessToken && Date.now() < tokenExpiry - 60_000) return Promise.resolve(accessToken);
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google-Anmeldung noch nicht geladen. Bitte kurz warten und erneut tippen."));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: settings.googleClientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (resp) => {
        if (resp.error) return reject(new Error(`Google-Anmeldung fehlgeschlagen: ${resp.error}`));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + Number(resp.expires_in || 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: (e) => reject(new Error(`Google-Anmeldung abgebrochen (${e.type}).`)),
    });
    client.requestAccessToken();
  });
}

async function gcalRequest(method, path, body, token) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) accessToken = null;
  return res;
}

async function upsertEvent(ev, token) {
  const cal = encodeURIComponent(settings.calendarId || "primary");
  const body = googleApiEvent(ev, settings);
  let res = await gcalRequest("POST", `/calendars/${cal}/events`, body, token);
  if (res.status === 409) {
    // Same plan imported before (or the event was deleted): update/restore it instead of duplicating.
    res = await gcalRequest("PUT", `/calendars/${cal}/events/${body.id}`, body, token);
    if (res.ok) return "updated";
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`${ev.start} ${ev.title}: ${detail.error?.message || res.status}`);
  }
  return "created";
}

$("gcalBtn").addEventListener("click", async () => {
  const events = currentEvents();
  if (!events.length) return setStatus("exportStatus", "Keine Termine ausgewählt.", true);
  $("gcalBtn").disabled = true;
  try {
    const token = await getGoogleToken();
    setStatus("exportStatus", "Termine werden eingetragen …");
    const counts = { created: 0, updated: 0 };
    const errors = [];
    for (const ev of events) {
      try {
        counts[await upsertEvent(ev, token)]++;
      } catch (err) {
        errors.push(err.message);
      }
    }
    let msg = `✅ ${counts.created} neu, ${counts.updated} aktualisiert.`;
    if (errors.length) msg += `\n⚠️ Fehler:\n${errors.join("\n")}`;
    setStatus("exportStatus", msg, errors.length > 0);
  } catch (err) {
    setStatus("exportStatus", err.message, true);
  } finally {
    refreshUi();
  }
});

// ---------- misc ----------

function setStatus(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

refreshUi();
