# Therapieplan → Google Kalender

A web app for your phone. Take a photo of the day's therapy plan and Claude reads the table
(**Zeit · Terminart · Ort · Mitarbeiter**). You check and correct the entries, then add them to Google Calendar.

- Runs completely in the phone's browser. There's no server, and everything is hosted free on GitHub Pages.
- Can be installed on the home screen like an app (PWA).
- Importing the same plan twice **updates** the existing events. It doesn't create duplicates.
- There are three ways to get the events into the calendar:
  1. **Directly into Google Calendar** with one tap (needs a one-time Google setup, see step 3).
  2. **.ics file**: download it and open it with the calendar app.
  3. **Single links**: one "Add to Google Calendar" link per appointment. No setup needed.

Each event looks like this:

| Calendar field | Taken from |
|---|---|
| Title | `Terminart` (optional prefix) |
| Time | `Zeit` (if only a start time is shown, the default duration is used, 30 min unless changed) |
| Location | optional address/clinic prefix + `Ort` (room) |
| Description | `Mitarbeiter: …`, `Ort: …` |
| Reminder | configurable, default 10 min before |

---

## Setup (all doable from the phone)

### 1. Turn on GitHub Pages
1. Open this repo on github.com in the phone browser. If needed, tap **⋯ → Desktop site**.
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, set **Source: Deploy from a branch**. Pick the branch that has the app (`main` after merging, or `claude/therapy-timetable-google-calendar-wt3crs`) and the folder **/ (root)**. Tap **Save**.
4. After about 1 minute the app is live at
   **https://benjamin-joham.github.io/therapy-plan-calendar-parser/**
5. Open that link on the phone and add it to the home screen:
   - Android/Chrome: **⋮ → Add to Home screen**
   - iPhone/Safari: **Share → Add to Home Screen**

### 2. Anthropic API key (for reading the image)
1. Go to <https://console.anthropic.com> → **API Keys → Create Key**. Some credit is needed. One plan costs roughly a few cents.
2. In the app, tap **⚙️** and paste the key into *Anthropic-API-Key*, then tap **Speichern** (Save).

The key is stored only in this phone's browser storage and is sent only to `api.anthropic.com`.

### 3. (Optional) Google Client ID for adding events with one tap
Without this step you can still use the .ics download or the single links.

1. Open <https://console.cloud.google.com> (use desktop site mode) and create a new project, e.g. "Therapieplan".
2. Go to **APIs & Services → Library**, search for **Google Calendar API** and tap **Enable**.
3. Go to **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - App name: anything. User type: **External**.
   - Under **Audience / Test users**, add your own Gmail address.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://benjamin-joham.github.io`
   - Tap **Create** and copy the **Client ID** (`….apps.googleusercontent.com`).
5. In the app, tap **⚙️**, paste it into *Google OAuth Client-ID* and save.

The first time you tap "Direkt in Google Kalender eintragen" (add directly to Google Calendar), Google asks for permission.
Because the app is in "Testing" mode, Google shows a warning screen. Tap **Continue**.

### Other settings (⚙️)
- **Kalender-ID** (calendar ID): `primary` = your main calendar. To use a separate calendar such as "Therapie", find its ID in
  Google Calendar (web) → calendar settings → *Integrate calendar* → *Calendar ID*.
- **Adresse / Ortspräfix** (address/location prefix): e.g. the clinic's name or address, put in front of the room.
- **Titel-Präfix** (title prefix), **Standarddauer** (default duration), **Erinnerung** (reminder), **Zeitzone** (time zone, default `Europe/Berlin`).

---

## Daily use
1. Open the app and tap **📷 Foto aufnehmen** (take photo) to photograph the plan. Take it straight on, well lit, and with only one day in the picture.
2. Tap **Termine erkennen** (recognize appointments). If a date is printed on the plan, the app uses it automatically.
3. Check the entries. You can correct fields, untick appointments you don't want, or add your own.
4. Tap **📅 Direkt in Google Kalender eintragen**, or use the .ics file / single links.

---

## Development
Plain HTML/CSS/JS with no build step. The Anthropic SDK is bundled once into `vendor/anthropic-sdk.js`.

```sh
npm install
npm test               # unit tests for parsing / ICS / event building
npm run build:vendor   # re-bundle the Anthropic SDK after upgrading it
npm run serve          # local preview on http://localhost:8080
```

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | UI (mobile first) |
| `app.js` | Camera/upload, Claude request, review list, Google Calendar / ICS export |
| `lib.js` | Pure logic: output schema, prompt, normalizing, event/ICS building (tested in `test/`) |
| `sw.js`, `manifest.webmanifest`, `icon*` | PWA (home screen, offline shell) |

Reading the image uses `claude-opus-5-5` with structured JSON output. The server-side refusal fallback (`fallbacks: "default"`) is turned on.
