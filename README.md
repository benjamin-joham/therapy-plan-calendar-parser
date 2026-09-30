# Therapieplan → Google Kalender

Take a photo of the day's therapy plan and Claude reads the table
(**Zeit · Terminart · Ort · Mitarbeiter**). You check the entries, then they're added to Google Calendar.
Everything works from the phone. No laptop is needed.

There are two versions:

| | **A. Claude artifact** (recommended) | B. Standalone web app |
|---|---|---|
| Opens in | the Claude app or claude.ai | any browser (GitHub Pages) |
| Reads the photo with | your **Claude subscription** | an Anthropic **API key** (paid separately) |
| Writes to the calendar via | your **Google Calendar connector** in Claude | Google OAuth client ID, or a .ics file / single links |
| Setup | none | GitHub Pages, API key, optional Google Cloud project |
| Source | [`artifact/therapieplan.html`](artifact/therapieplan.html) | `index.html`, `app.js`, `lib.js`, … |

Each event looks like this in both versions:

| Calendar field | Taken from |
|---|---|
| Title | `Terminart` (optional prefix) |
| Time | `Zeit` (if only a start time is shown, the default duration is used, 30 min unless changed) |
| Location | optional clinic/address + `Ort` (room) |
| Description | `Mitarbeiter: …`, `Ort: …` |
| Reminder | configurable, default 10 min before |

Importing the same plan twice does **not** create duplicates.

---

## A. Claude artifact (recommended)

**Link:** https://claude.ai/artifact/768trzAJ5o6os7tatYkhaS

### Requirements
- A Claude subscription (Pro/Max/Team). Each plan uses a little of your usage.
- The **Google Calendar** connector connected in Claude (claude.ai → Settings → Connectors).

### Daily use
1. Open the link in the Claude app or on claude.ai. The first time, Claude asks whether the page may use Claude
   and Google Calendar. Tap **Allow** on both.
2. Tap **Foto aufnehmen oder wählen** (take or choose a photo) and photograph the plan. Take it straight on, with the table filling the photo, and only one day in the picture.
   The page also sends Claude two zoomed halves of the photo so small print is easier to read.
3. Tap **Termine erkennen** (recognize appointments). It usually takes 15–60 seconds. If a date is printed on the plan, it's used automatically.
4. Check each appointment. You can edit any field, untick ones you don't want, or add a row.
5. Tap **Termine eintragen** (add appointments). Each appointment then shows *eingetragen* (added), *schon vorhanden* (already there, skipped because an
   event with the same title and start time is already on that day) or *Fehler* (error).

### Settings (**Einstellungen** section on the page, saved on the device)
- **Kalender** (calendar): the main calendar or any other of your calendars. The list loads when you open the section.
- **Adresse / Klinik** (address / clinic): put in front of the room in the location field.
- **Titel-Präfix** (title prefix), **Dauer ohne Endzeit** (duration when no end time is given), **Erinnerung** (reminder), **Zeitzone** (time zone, default: the phone's time zone).

### Updating the artifact
Edit `artifact/therapieplan.html`, then republish it to the same URL from a Claude Code session. The page declares two
runtime capabilities: `sample` (asks Claude using the viewer's account) and `mcp` for the
`Google Calendar` connector, limited to the tools `create_event`, `list_events` and `list_calendars`.

The page only works inside Claude. Opened as a plain file or on another website, it can't reach Claude or the calendar.

---

## B. Standalone web app (needs an API key)

Use this only if you want to run the tool outside Claude. It's a PWA hosted on GitHub Pages.
Besides adding events directly to Google Calendar, it can export a **.ics file** or single "Add to Google Calendar" links.

### 1. Turn on GitHub Pages
1. Open this repo on github.com in the phone browser. If needed, tap **⋯ → Desktop site**.
2. Go to **Settings → Pages** and set **Source: Deploy from a branch**. Pick the branch with the app and the folder **/ (root)**, then tap **Save**.
3. After about 1 minute the app is at **https://benjamin-joham.github.io/therapy-plan-calendar-parser/**.
   Add it to the home screen: on Android/Chrome **⋮ → Add to Home screen**, on iPhone/Safari **Share → Add to Home Screen**.

### 2. Anthropic API key
Create one at <https://console.anthropic.com> → **API Keys**. This is billed separately from a Claude subscription.
Paste it in the app under **⚙️**. The key stays in this phone's browser storage and is sent only to `api.anthropic.com`.

### 3. (Optional) Google Client ID for adding events with one tap
1. Open <https://console.cloud.google.com> (desktop site mode) and create a project.
2. Go to **APIs & Services → Library → Google Calendar API → Enable**.
3. Set up the **OAuth consent screen**: user type External, and add your own Gmail address as a test user.
4. Go to **Credentials → Create credentials → OAuth client ID → Web application**, and set the authorized JavaScript origin to
   `https://benjamin-joham.github.io`.
5. Paste the client ID in the app under **⚙️**.

Without step 3 you can still use the .ics download or the single links.

---

## Development
The artifact is one self-contained file: `artifact/therapieplan.html`. The standalone app is plain HTML/CSS/JS with no build step. The Anthropic SDK is bundled once into `vendor/anthropic-sdk.js`.

```sh
npm install
npm test               # unit tests for parsing / ICS / event building
npm run build:vendor   # re-bundle the Anthropic SDK after upgrading it
npm run serve          # local preview on http://localhost:8080
```

| File | Purpose |
|---|---|
| `artifact/therapieplan.html` | **Version A**: the Claude artifact (UI, prompt, connector calls in one file) |
| `index.html`, `styles.css` | Version B: UI (mobile first) |
| `app.js` | Camera/upload, Claude request, review list, Google Calendar / ICS export |
| `lib.js` | Pure logic: output schema, prompt, normalizing, event/ICS building (tested in `test/`) |
| `sw.js`, `manifest.webmanifest`, `icon*` | PWA (home screen, offline shell) |

In version B, reading the image uses `claude-opus-5-5` with structured JSON output. The server-side refusal fallback (`fallbacks: "default"`) is turned on.
