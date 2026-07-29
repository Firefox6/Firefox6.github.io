# FitTrack — Projektnotizen (Stand: 2026-07-29, aus Codebase abgeleitet)

Dieses File ist die primäre Gedächtnisquelle für dieses Projekt (statt des globalen `~/.claude` Memory-Ordners). `concept.md` ist nur das *ursprüngliche* Konzept für die Erstellung, `update_concept.md` ein späteres Update-Briefing — beide sind Momentaufnahmen. Bei Widersprüchen gilt der aktuelle Code, nicht die Konzept-Dokumente.

Julien nutzt aktuell primär ein **Pixel 8 Pro (Android/Chrome)**, nicht (nur) iPhone wie im ursprünglichen Konzept angenommen.

## Was die App aktuell ist

Vanilla-JS PWA, kein Framework, kein Build-Step, IndexedDB-Speicherung, Service-Worker-Cache, für GitHub Pages gedacht. Kein Git-Repo im Ordner. App heisst überall im Code "FitTrack" (nicht mehr "Julien Tracking" wie in concept.md).

Tabs: Dashboard | Gewicht | Kalorien | Training | Mehr. Render-Funktionen in [app.js](app.js): `renderDashboardV2`, `renderWeight`, `renderCaloriesV2`, `renderTrainingV2`, `renderMoreV2` (Dispatch in `render()`, [app.js](app.js)). Die früher vorhandenen alten Nicht-V2-Funktionen (`renderDashboard`/`renderCalories`/`renderTraining`/`renderMore` + zugehöriger Kraft-Trainingsformular-Code) waren toter Code und wurden am 2026-07-29 vollständig entfernt (~890 Zeilen).

## Umsetzung von update_concept.md (2026-07-29)

Alle 5 Features aus `update_concept.md` sind implementiert:

1. **UI-Bereinigung**: Navy-KFA (Formel, Formularfelder Bauch-/Hals-/Hüftumfang, Anzeige) restlos entfernt. Gewicht-Tab zeigt nur noch "Aktuell" + "7-Tage-Schnitt" als KPI-Karten, plus eine kleine BMI-Gauge (`renderBmiGauge()` in app.js, 4-Zonen-Farbleiste mit Positions-Marker, CSS `.bmi-gauge*` in styles.css) statt nur Text. Ein einziges prominentes Gewichts-Chart lebt jetzt auf dem Dashboard (`drawDashboardWeightChart`, `calculateWeightChartSeries` in calculations.js — ein Punkt pro Kalendertag, schwache Punkte fürs Tagesgewicht + dicke Linie für den 7-Tage-Schnitt), horizontal scrollbar über `.chart-scroll`-Wrapper, volle Historie (nicht mehr nur die letzten 42 Einträge). Das alte Gewicht-Tab-Chart wurde entfernt.
2. **Calories Rollover Pool**: `calculateWeeklyCaloriePool(foodEntries, calorieGoal, referenceDateKey)` in calculations.js — live berechnet (kein gespeicherter Zähler), Montag-Reset, +250 kcal/Tag Cap, floor bei 0. Pill auf dem Dashboard ("+150 kcal Pool").
3. **Auto-TDEE**: `calculateAutoTdee(weightEntries, foodEntries, referenceDateKey)` — 21-Tage-Fenster, ±3-Tage-Gewichts-Toleranz, braucht ≥14/21 geloggte Tage, sonst "nicht genug Daten"-Text. Dezenter Text im Dashboard unter dem Rollover-Pill.
4. **Barcode-Scanner**: Button "📷 Barcode Scannen" im Kalorien-Tab. Nutzt native `BarcodeDetector`-API wo verfügbar, sonst Lazy-Load von `@zxing/browser@0.1.5` per jsDelivr-CDN (**korrekter Pfad ist `/umd/zxing-browser.min.js`**, nicht `/umd/index.min.js` — war ein 404-Bug beim ersten Versuch). Kamera-Overlay liegt in [index.html](index.html) als `#barcode-overlay` **ausserhalb** von `#app` (eigener Klick-Listener in `bindEvents()`, da `handleActionClick` nur auf `#app` lauscht). Fetch gegen `https://ch.openfoodfacts.org/api/v2/product/{barcode}.json`. Modul-lokaler State `scannedProduct` (nicht in `data`/`state`) hält das gescannte Produkt zwischen Scan und Speichern.
5. **Review-Notifications**: bewusst **kein Server** — best-effort, nur solange die App offen ist (`checkDueReviews()` läuft bei `init()`, per `setInterval` alle 60s, und bei `visibilitychange`). Settings-Bereich "Benachrichtigungen & Fokus" im Mehr-Tab (2 Toggles + 8 Fokus-Checkboxen). Fälligkeit wird über `getMeta`/`setMeta` (`last_daily_review_sent_date`, `last_weekly_review_sent_week`) getrackt, nicht in `settings`. Kein Service-Worker-`push`-Handler nötig, da `showNotification` direkt von der offenen Seite aus über `navigator.serviceWorker.ready` aufgerufen wird.

Neue Settings-Struktur in `DEFAULT_SETTINGS` (db.js): `notifications: {daily_review_enabled, weekly_review_enabled, focus: {calories, protein, carbs, fat, fiber, sugar, salt, training}}`. Kein `DB_VERSION`-Bump nötig (alles lebt in `settings`/`meta`).

`APP_VERSION` in [service-worker.js](service-worker.js) wurde auf `"2026-07-29-concept-update"` gebumpt, damit installierte PWAs den Cache invalidieren.

## Frühere, weiterhin gültige Abweichungen von concept.md

- **ChatGPT-Integration** (nicht im ursprünglichen Konzept): Button "ChatGPT" auf dem Dashboard ruft `copyChatGptDailyContextToClipboard()` auf, baut über `buildChatGptDailyContext()` ein JSON mit Profil, Zielen, heutigem Stand, Essen, Training und Gewichtstrend, kopiert es in die Zwischenablage (oder lädt es als Datei herunter, falls Clipboard nicht verfügbar).
- **Export/Import** ([export-import.js](export-import.js)): `SCHEMA_VERSION = 2`, exportiert `weight_entries`, `food_entries`, `food_presets`, `workouts`, `settings` (inkl. `notifications`). Kein `exercise_presets`-Export mehr. Workouts sind auf ein vereinfachtes Tages-Checkbox-Modell normalisiert (`normalizeWorkouts`).

## Datenhaltung

IndexedDB `julien_tracking_db`, `DB_VERSION = 2` ([db.js](db.js)). Stores: `meta`, `backups`, `settings`, `weight_entries`, `food_entries`, `food_presets`, `workouts`, `exercise_presets` (letzterer verwaist — Trainings sind nur noch Tages-Checkboxen ohne Übungs-Presets). Automatische Legacy-localStorage-Migration und Auto-Snapshots in `backups` vor riskanten Operationen.

## Berechnungen ([calculations.js](calculations.js))

BMI, Tagesnährwerte, 7-Tage-gleitender Durchschnitt Gewicht, Wochenmittel-Gewicht, Gewichts-Chart-Serie (Kalendertag-Punkte), Wochentrainingsstatistik, Maintenance-Delta, Wochen-Kalorien-Pool, Auto-TDEE. Navy-KFA und `calculateStrengthWorkoutVolume` wurden entfernt (nicht mehr gebraucht).

## Fixes & Verbesserungen Runde 2 (2026-07-29)

Nach echtem Testen auf dem Pixel 8 Pro kamen diese Korrekturen dazu:

- **Dashboard-Breite-Bug behoben**: `.screen-stack` (styles.css) hatte kein `grid-template-columns`, wodurch der implizite Grid-Track sich am breitesten Kind orientierte (dem per JS auf mehrere tausend Pixel gesetzten Gewichts-Chart-Canvas) und die ganze Seite unnötig breit machte. Fix: `grid-template-columns: minmax(0, 1fr);` ergänzt.
- **Checkbox-Layout-Bug behoben**: Die globale Regel `input, select, textarea { width: 100%; ... }` (styles.css) griff ungefiltert auch auf `<input type="checkbox">`, wodurch jede Checkbox auf ~180px gestreckt wurde und ihr Häkchen scheinbar "zentriert"/"herumfliegend" wirkte. Fix: Checkboxen/Radios aus dieser Regel ausgeschlossen + eigene 16×16px-Regel ergänzt. Betraf alle Checkbox-Zeilen (`.check-row`), nicht nur die neuen Benachrichtigungs-Toggles.
- **Kcal-Pool-Logik korrigiert**: `calculateWeeklyCaloriePool` zählte fälschlich auch den laufenden, noch nicht abgeschlossenen heutigen Tag in den Pool ein. Jetzt schliesst die Schleife bei `referenceDate - 1 Tag` (nur abgeschlossene Tage Montag–gestern zählen in den gebankten Pool). Ausserdem wird für **heute** ein `effectiveCalorieGoal = Tagesziel + gebankter Pool` berechnet und überall dort verwendet, wo der Kalorien-Status angezeigt wird (Fortschrittsbalken, "übrig/drüber"-Text, Pill-Farbe) — dashboard- und Kalorien-Tab-weit (letzterer nur wenn `state.selectedDate === heute`). Verhindert fälschliche "über Ziel"/roter-Balken-Anzeige, obwohl noch Pool-Puffer vorhanden ist.
- **Gewichtsverlauf-Chart** liegt auf dem Dashboard jetzt ganz am Ende (nach den 4 Statistik-Boxen), nicht mehr direkt nach der Hero-Karte.
- **Barcode-Formular** hat jetzt auch Ballaststoffe/Zucker/Salz-Felder (aus OpenFoodFacts `fiber_100g`/`sugars_100g`/`salt_100g`) sowie die gleichen Preset-Zusatzfelder (Typ/Einheit/Basis-Menge, per Checkbox eingeblendet) wie der Schnelleintrag.
- **"ChatGPT"-Dashboard-Button** heisst jetzt "Heute exportieren" (der nachfolgende Dialog nennt ChatGPT weiterhin explizit, da er tatsächlich dorthin verlinkt).
- **Neues App-Icon**: heller Farbverlauf-Blob (Teal/Amber/Violett, passend zum `.today-card`-Look) mit einem abstrakten Puls-/Trendlinien-Symbol (bewusst kein Schriftzug — bei kleinen Icon-Grössen kaum lesbar). SVG-Quellen liegen nicht im Projekt (nur die gerenderten PNGs unter `icons/`), gebaut mit `npx sharp-cli` (kein ImageMagick/Inkscape lokal vorhanden, aber `npx sharp-cli`/`npm install sharp` funktionieren problemlos für zukünftige Icon-Änderungen). Neu: `icons/icon-maskable-192.png` + `icons/icon-maskable-512.png` (Symbol auf ~72% Skalierung zentriert, übersteht auch kreisrunden Zuschnitt) mit `purpose: "maskable"` im Manifest, zusätzlich zu den bestehenden `purpose: "any"`-Icons.
- `concept.md`-Kopfzeile/Beispieltexte von "Julien Tracking" auf "FitTrack" aktualisiert. **Nicht** umbenannt (bewusst): `DB_NAME = "julien_tracking_db"` und die Legacy-localStorage-Migrationsschlüssel in db.js — würde bestehende Nutzerdaten verwaisen lassen.
- `APP_VERSION` in service-worker.js auf `"2026-07-29-fixes-round2"` gebumpt.

## PWA Shortcuts (2026-07-29)

Android-Homescreen-Long-Press-Shortcuts ergänzt (Android/Chrome-only, iOS Safari ignoriert das folgenlos — passt zu Julien's Pixel 8 Pro). `manifest.webmanifest` hat jetzt ein `"shortcuts"`-Array (Barcode scannen/Gewicht eintragen/Schnelleintrag, jeweils `./?action=...`, wiederverwendet `icons/icon-192.png`). In [app.js](app.js) liest `applyLaunchAction()` (aufgerufen ganz am Anfang von `init()`, vor der Legacy-Migration) den `?action=`-Query-Parameter, setzt `state.tab`/`state.caloriePanel` entsprechend, bereinigt die URL sofort per `history.replaceState` (verhindert Re-Trigger bei späterem manuellem Reload) und öffnet bei `action=barcode` nach dem ersten `render()` automatisch `openBarcodeOverlay()`. Alle drei Aktionen sind end-to-end verifiziert (inkl. URL-Cleanup und "kein Doppel-Trigger nach Reload").

## Testing-Hinweis für zukünftige Sessions

Lokal testen via `npx serve` (siehe `.claude/launch.json`, Port 5173). **Wichtig**: Der Service Worker cacht `app.js`/`styles.css` aggressiv (cache-first). Nach Code-Änderungen im Browser immer erst SW deregistrieren + Caches löschen (`navigator.serviceWorker.getRegistrations()` → `unregister()`, `caches.keys()` → `caches.delete()`) und neu laden, sonst testet man versehentlich die alte Version. Ausserdem: `requestAnimationFrame` (und damit die Canvas-Chart-Zeichnung) läuft nicht, wenn das Browser-Pane als "hidden"/nicht sichtbar gilt — Canvas-Logik lieber durch direkten Aufruf der Berechnungsfunktionen verifizieren statt per Screenshot.
