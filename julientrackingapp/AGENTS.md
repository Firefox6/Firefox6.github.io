# AGENTS.md – Projektzentrale für FitTrack Nutrition

Stand: 4. August 2026

Diese Datei beschreibt den aktuellen Codezustand. Vor grösseren Änderungen zuerst diese Datei und danach die konkret betroffenen Quelldateien lesen. Bei Abweichungen gilt immer der Code; die Dokumentation anschliessend mit aktualisieren.

## Projektüberblick

FitTrack Nutrition ist eine persönliche, deutschsprachige PWA zur Erfassung von Ernährung und Gewicht. Die App ist inzwischen Cloud-first:

- Nutrition-Daten und Gewicht liegen pro angemeldetem Benutzer in Supabase.
- Eine Anmeldung ist nötig, bevor Dashboard, Gewicht, Kalorien oder Einstellungen nutzbar sind.
- IndexedDB dient nur noch für Sicherungssnapshots, lokale Altbestände und die einmalige Übertragung vorhandener Daten in die Cloud.
- Die aktive App umfasst Dashboard, Gewicht, Kalorien und Mehr. Es gibt keine aktive Trainings-, Körperumfangs- oder KFA-Funktion mehr.
- Die Oberfläche ist Deutsch (de-CH), metrisch, responsiv und als installierbare PWA ausgelegt.
- Das Frontend besteht aus statischem HTML, CSS und ES-Modulen ohne Bundler oder Build-Schritt.
- package.json enthält nur den Skript-Eintrag npm test mit Node Test Runner. Aktuell gibt es keine Testdateien.

Die App-Shell ist lokal und cachebar, benötigt für die produktive Nutzung aber Internetzugriff auf Supabase. Barcode-Suche, Kamera-Fallback und QR-Erzeugung verwenden zusätzlich externe Dienste beziehungsweise CDN-Skripte.

## Projektstruktur und Verantwortlichkeiten

- index.html: Statische Shell mit Topbar, Bottom-Navigation, Kamera-/QR-Overlays, Update-Banner, Toast und Moduleinstieg.
- app.js: Zentrale UI-Logik. Hält transienten Zustand, rendert alle vier Screens, verarbeitet Eventdelegation, steuert Cloud-Synchronisierung, Migrationen, Barcode/QR, Benachrichtigungen und Canvas-Chart.
- styles.css: Komplettes responsives Styling, Design-Tokens für hell/dunkel, App-Shell, Formulare, Cards, Overlays und Breakpoints.
- calculations.js: DOM-freie Berechnungen für Ernährung, Gewicht, Kalorienpool, BMI und Auto-TDEE.
- db.js: IndexedDB Version 3, Default-Einstellungen, lokale Snapshots und Legacy-Migrationen. Kein aktives primäres Nutrition-Repository.
- supabase-client.js: Öffentliche Supabase-URL und Publishable Key; lädt supabase-js dynamisch von JSDelivr und verwaltet den Singleton-Client.
- auth-service.js: Session-Initialisierung, Auth-State, E-Mail/Passwort-Anmeldung, Abmeldung und Verbindungstest.
- cloud-repository.js: Cloud-Repository für Einstellungen, Kalorieneinträge, Presets, Review-Metadaten sowie Import/Export-Orchestrierung.
- weight-repository.js: Gemeinsames Cloud-Gewichtsrepository mit Quellenpriorität, manueller Nutrition-Erfassung und Importmigrationen.
- export-import.js: JSON-Export Schema 4, Validierung und Normalisierung alter Backups sowie Merge-, Replace- und Presets-Import.
- share-payload.js: Kompaktes QR-Format ft2 für einzelne Food-Einträge; kann auch das ältere Objektformat lesen.
- manifest.webmanifest: PWA-Metadaten, fünf Icons und Shortcuts für Barcode, Gewicht und Schnelleintrag.
- service-worker.js: Versionierter App-Shell-Cache, Offline-Fallback und Update-Aktivierung.
- icons/: Die echten PWA-Icons. Im Manifest und Service Worker immer die Pfade icons/... verwenden.

Die fünf verwendeten Icon-Dateien sind:

- icons/icon-192.png
- icons/icon-512.png
- icons/icon-maskable-192.png
- icons/icon-maskable-512.png
- icons/apple-touch-icon.png

## Laufzeit und externe Abhängigkeiten

Es gibt keine installierten npm-Abhängigkeiten und keinen Build. Zur Laufzeit werden jedoch externe Ressourcen geladen:

- @supabase/supabase-js@2 als ESM über JSDelivr
- @zxing/browser@0.1.5 als Fallback für Barcode-/QR-Scans
- qrcodejs2-fixes@0.0.2 zur QR-Erzeugung
- Open Food Facts Schweiz API für Produktdaten nach einem Barcode-Scan
- chatgpt.com als Ziel für den optional kopierten Tageskontext

Der Service Worker cached nur Same-Origin-Assets. Die oben genannten CDN- und API-Aufrufe sind nicht offline verfügbar. Externe Bibliotheken oder APIs nicht stillschweigend ersetzen oder in den Cache aufnehmen.

## Start, Navigation und Render-Zyklus

index.html enthält vier Navigationseinträge mit data-tab:

- dashboard
- weight
- calories
- more

Beim Start führt app.js im Wesentlichen diese Reihenfolge aus:

1. Globale Events, Import-Draft und PWA-Shortcut aus der URL vorbereiten.
2. Einen alten localStorage-Export sicher nach IndexedDB übernehmen, falls möglich.
3. Den Supabase-Auth-State initialisieren.
4. Bei gültiger Session den Cloud-Snapshot laden und einen lokalen Übertragungskandidaten prüfen.
5. Den aktiven Screen rendern, den Service Worker registrieren und fällige Reviews prüfen.

Der zentrale In-Memory-Snapshot hat die Form:

    {
      settings,
      weight_entries,
      food_entries,
      food_presets,
      review_status
    }

Bei authentifiziertem Zustand lädt loadCloudSnapshot() Einstellungen, Food-Einträge, Presets, Review-Metadaten und die auf Tageswerte reduzierte Gewichtshistorie. Speichern, Löschen und Importe schreiben direkt in die Cloud; anschliessend ruft die UI refreshWeightData() und render() auf.

Ohne Anmeldung zeigt die App nur den Cloud-Anmeldezustand. Es gibt keinen produktiv nutzbaren lokalen Offline-Modus mehr.

## Supabase, Authentifizierung und Datenzugriff

Der aktuelle Cloud-Datenbestand umfasst diese Tabellen:

| Tabelle | Zweck |
| --- | --- |
| app_settings | Genau ein JSON-Settings-Objekt pro user_id |
| food_entries | Kalorieneinträge pro Benutzer |
| food_presets | Wiederverwendbare Lebensmittel-/Portionsvorlagen pro Benutzer |
| app_metadata | Review-Status, aktuell die letzten täglichen und wöchentlichen Benachrichtigungen |
| weight_measurements | Gemeinsame Gewichtsmessungen aus Nutrition, Fitness, Health Connect und Importen |

Die Tabellenschemata, RLS-Policies und Supabase-Migrationen liegen nicht in diesem Repository. Vor jeder Server- oder Schemaänderung zuerst die bestehende Supabase-Konfiguration prüfen. Alle exponierten Tabellen benötigen RLS mit einer echten Besitzprüfung auf user_id; eine clientseitige Filterung ist kein Sicherheitsmechanismus.

Wichtige Regeln:

- supabase-client.js darf ausschliesslich eine öffentliche Projektkonfiguration und einen Publishable Key enthalten. Niemals Service-Role- oder Secret-Keys in diese PWA eintragen.
- Authentifizierung erfolgt mit E-Mail und Passwort über Supabase Auth. Sessions werden im Browser persistent gehalten und automatisch erneuert.
- Repositories holen bei jeder Schreiboperation den aktuellen Benutzer. Cloud-Daten dürfen nie kontenübergreifend gemischt, exportiert oder importiert werden.
- weight_measurements wird von mehreren Anwendungen geteilt. Nutrition darf nur Zeilen mit source = manual_nutrition bearbeiten oder löschen.
- Für die Anzeige wird pro lokalem Kalendertag eine Gewichtsmessung ausgewählt. Priorität: manual_nutrition, manual_fitness, health_connect, danach andere Quellen; bei gleicher Quelle gewinnt die neuere Messzeit.
- Die Quelle und externe IDs von Health-/Fitness-Daten nicht überschreiben oder für einen anderen Benutzer wiederverwenden.

## Lokale Daten, Snapshots und Migration

db.js verwendet weiterhin die Datenbank julien_tracking_db mit DB_VERSION = 3. Die Stores meta, backups, settings, weight_entries, food_entries, food_presets, workouts und exercise_presets bleiben aus Kompatibilitätsgründen erhalten.

Aktiv verwendet werden lokal nur meta, backups sowie die alten Nutrition-Stores während der Migration. Die Stores workouts und exercise_presets sind Legacy-Daten und dürfen nicht als neue Produktfunktion reaktiviert werden.

Es gibt zwei aufeinanderfolgende Altpfade:

1. Alte localStorage-Exports werden, falls IndexedDB noch keine Nutzdaten hat, normalisiert. Einstellungen, Food-Einträge und Presets werden nach IndexedDB übernommen; alte Gewichte werden für die spätere Cloud-Übertragung vorgemerkt.
2. Nach der ersten erfolgreichen Cloud-Anmeldung erkennt die App lokale Daten, zeigt einen expliziten Dialog und kann sie einmalig nach Supabase übertragen. Vorher wird ein IndexedDB-Snapshot erstellt.

deleteTransferableLocalData() entfernt bewusst nur übertragbare lokale Nutrition-Daten und zugehörige Metadaten. Backups sowie nicht übertragene Legacy-Workout-Daten bleiben erhalten. Diese Sicherheitsgrenze nicht aufweichen.

Zeit- und Identitätskonventionen:

- Tagesschlüssel sind lokale Strings im Format YYYY-MM-DD.
- Lokale Zeitstempel werden mit lokalem UTC-Offset erzeugt.
- Neue clientseitige Food- und Preset-IDs werden über generateId() gebildet.
- Vergangene manuelle Gewichtseinträge erhalten standardmässig 12:00 Uhr Ortszeit; ein heutiger Eintrag erhält die aktuelle Uhrzeit.

## Aktuelles Datenmodell

Food-Eintrag:

    id, date, meal, name, quantity, unit,
    calories_kcal, protein_g, carbs_g, fat_g,
    fiber_g?, sugar_g?, salt_g?, preset_id?, notes?,
    created_at, updated_at

Food-Preset:

    id, type, name, base_quantity, unit,
    calories_kcal, protein_g, carbs_g, fat_g,
    fiber_g?, sugar_g?, salt_g?, tags[],
    created_at, updated_at

Preset-Typen sind ingredient_100g und unit_item. Beim Eintragen aus einem Preset werden alle Nährwerte proportional zur gewählten Menge skaliert.

Gewicht für die UI:

    id, date, weight_kg, source, remote_id,
    measured_at, can_edit

Die UI-Struktur ist eine tägliche Projektion der Cloud-Tabelle. Ein editierbarer UI-Eintrag referenziert mit remote_id auf eine Messung mit source = manual_nutrition.

Default-Einstellungen enthalten:

- Profil: height_cm, birth_date, sex (male oder female)
- Ziele: Kalorien, Protein, optionale Kohlenhydrate/Fett/Ballaststoffe sowie Zucker-/Salz-Maxima und Zielgewicht
- Pool: calorie_goal_history
- Maintenance-Spanne
- Erinnerungsintervalle und letzte Erledigungen
- Darstellung: metric, system/light/dark und dashboard_range_days
- Tägliche/wöchentliche Review-Benachrichtigungen mit wählbaren Fokusmetriken

Alte Trainingsziele und der Trainings-Fokus werden beim Mergen von Einstellungen explizit entfernt.

## Fachliche Berechnungen

calculations.js bleibt rein und DOM-frei. Sie enthält:

- Alter aus Geburtsdatum
- BMI und BMI-Kategorie
- Tages-Summen für Kalorien, Makros und optionale Nährwerte
- ISO-Wochen, 7-/14-Tage-Moving-Average und 7-Tage-Chart-Serie fürs Gewicht
- Maintenance-Deltas
- Kalorienpool: höchstens 250 kcal Guthaben pro abgeschlossenem Tag; ein Guthaben ist sieben Folgetage gültig und wird beim Überschuss zuerst verbraucht
- zeitabhängige Kalorienziele über calorie_goal_history
- Auto-TDEE: 21-Tage-Fenster, mindestens 14 Tage mit geloggter Kalorienaufnahme, Gewicht nahe Anfang und Ende des Fensters; Gewichtsdifferenz wird mit 7’700 kcal/kg umgerechnet

Die frühere Navy-KFA-, Körperumfangs- und Trainingslogik ist nicht mehr Teil des aktiven Fachmodells. Neue Funktionen nur auf Basis des tatsächlich vorhandenen aktuellen Datenmodells entwickeln.

## Aktive Produktfunktionen

Dashboard:

- Tagesfortschritt für Kalorien, Protein, Makros und Kalorienpool
- Dashboard-Kennzahlen: 7-Tage-Kalorienschnitt aus den letzten sieben abgeschlossenen Tagen (ohne heute), 7-Tage-Gewichtsschnitt, Gewichtsveränderung seit Start und BMI mit Farbleiste und Positionspunkt
- Canvas-Chart mit Tageswerten und 7-Tage-Schnitt
- Auto-TDEE-Hinweis
- Export eines strukturierten Tageskontexts für ChatGPT

Gewicht:

- Manuelles Erfassen, Bearbeiten und Löschen der eigenen Nutrition-Gewichte
- BMI und Gewichtsstatistiken
- Historie mit Quellenkennzeichnung; fremde Fitness-/Health-Quellen sind nicht editierbar

Kalorien:

- Schnelleintrag, Bearbeiten, Löschen und Kopieren des Vortags
- Food-Presets anlegen, bearbeiten und mengenabhängig verwenden
- Barcode-Scan mit Nährwerten von Open Food Facts
- QR-Code für einzelne Einträge erzeugen und FitTrack-QR-Code importieren
- Tagesansicht nach Mahlzeit gruppiert

Mehr:

- Cloud-Konto, Verbindungstest und Abmeldung
- Profil, Ziele, Theme, Maintenance, Erinnerungen und Review-Fokus
- JSON-Export und Import

Benachrichtigungen werden nur geprüft, solange die App offen ist. Die App erzeugt keine verlässlichen Hintergrund-Erinnerungen, wenn sie vollständig geschlossen ist.

## Import und Export

Der aktuelle Export hat schema_version = 4 und app.version = 4.0.0. Er enthält:

    settings
    food_entries
    food_presets
    weight_measurements
    review_status

Importe akzeptieren Schema 1 bis 4 sowie erkennbare ältere Exporte. Alte Workouts und Körpermessungen werden gezählt und bewusst nicht importiert.

- Zusammenführen: Übernimmt Food-Einträge und Presets nur, wenn der eingehende Zeitstempel mindestens so neu ist. Gewicht wird dedupliziert und nur ergänzt.
- Alles ersetzen: Erstellt einen lokalen Snapshot und bietet vorher einen aktuellen Download an. Ersetzt Einstellungen, Food-Einträge, Presets und Review-Status. Gewicht bleibt absichtlich merge-only, weil die Tabelle mit Fitness/Health Connect geteilt wird.
- Nur Presets: Importiert ausschliesslich Food-Presets.

Gewichte aus älteren Backups erhalten beim Import stabile externe IDs. Dadurch bleibt ein wiederholter Import desselben Backups idempotent. Exportierte user_id-Werte dürfen nie aus einem Backup übernommen werden.

## UI- und Sicherheitskonventionen

- Die App ist mobile-first, skaliert aber bis zu einer breiteren Desktop-Shell. Safe Areas, prefers-reduced-motion und hell/dunkel werden berücksichtigt.
- Theme wird über :root[data-theme="dark"] gesteuert. Die Präferenz liegt in settings.preferences.theme.
- UI-Texte, Zahlen und Daten in de-CH halten; Schweizer Schreibweisen wie Grösse verwenden.
- Werte aus Nutzereingaben oder Cloud-Daten in HTML immer mit safe() escapen; Attribute immer mit attr() escapen.
- Interaktionen über die bestehende Eventdelegation und data-action/data-tab/data-panel-Attribute anschliessen, nicht über eine Vielzahl neuer Listener.
- Der Gewichtsverlauf wird direkt auf Canvas gezeichnet; keine Chart-Bibliothek hinzufügen.
- Die Ausgabe von PowerShell Get-Content zeigt in dieser Umgebung immer Mojibake – auch dann, wenn die gelesene Datei korrekt UTF-8-kodiert ist. Sie ist deshalb niemals ein Nachweis für einen Encoding-Fehler und darf keine pauschale Text- oder Encoding-Korrektur auslösen. Bei einem konkreten Verdacht den Dateicodec mit einer bytebasierten oder sonst verlässlichen Prüfung untersuchen.

## PWA und Service Worker

service-worker.js definiert APP_VERSION = 2026-08-04-dashboard-bmi-v10. Der Cache enthält alle lokalen Module, die Shell, Manifest und fünf Icons.

- Navigation: network-first mit Cache-/index.html-Fallback.
- Andere Same-Origin-GET-Requests: cache-first.
- Alte fittrack-app-shell-*-Caches werden bei Aktivierung gelöscht.
- app.js zeigt bei wartendem Service Worker das Update-Banner, sendet SKIP_WAITING und lädt nach controllerchange neu.

Nach jeder Änderung am App-Code – auch bei einer noch so kleinen Änderung – muss APP_VERSION in service-worker.js auf einen neuen eindeutigen Wert gesetzt werden. Das gilt für HTML, CSS und JavaScript, nicht nur für Anpassungen an CORE_ASSETS. Andernfalls erhalten installierte PWAs das Update möglicherweise nicht. Werden Module hinzugefügt oder entfernt, CORE_ASSETS und die Modulimporte gemeinsam prüfen.

## Arbeitsregeln für Änderungen

- Keine Frameworks, Bundler oder Dependencies hinzufügen, sofern dies nicht ausdrücklich verlangt wird.
- Kleine, zielgerichtete Änderungen bevorzugen; app.js ist bewusst die zentrale UI-Datei.
- Bei einer neuen oder geänderten Nutrition-Funktion immer UI, Cloud-Repository, Export/Import, Einstellungen und lokalen Migrationspfad auf Auswirkungen prüfen.
- Schema-, Auth- oder RLS-Änderungen nie ausschliesslich im Client „lösen“. Server-Policies und Datenbesitz müssen in Supabase verifiziert werden.
- Vor destruktiven Cloud- oder lokalen Datenoperationen den vorhandenen Snapshot-/Exportpfad bewahren.
- Bei Änderungen am geteilten Gewicht stets Quellen, Quellenpriorität, Import-Deduplizierung und die Editiergrenze manual_nutrition respektieren.
- Bei QR-Formatänderungen Abwärtskompatibilität mit dem älteren Objektformat erhalten.
- Bei Barcode- oder QR-Änderungen Kamera-Ressourcen beim Schliessen wieder freigeben.
- Für neue Einstellungen mergeSettings(), cleanSettingsForExport(), Cloud-Speicherung, Import und UI-Formular konsistent erweitern.
- Bei PWA-Asset-Änderungen index.html, manifest.webmanifest, service-worker.js und icons/ gemeinsam prüfen.

## Risikobasierte Verifikation

Tests und manuelle UI-Prüfungen sind kein Selbstzweck. Umfang und Art der Verifikation richten sich nach Risiko, Reichweite und Reversibilität der Änderung:

- Reine Dokumentations-, Text- oder klar isolierte Styling-Änderungen brauchen normalerweise weder neue Tests noch einen manuellen UI-Durchlauf.
- Für reine Berechnungslogik genügen gezielte Eingabe-/Ausgabeprüfungen der geänderten Funktion; es muss kein Test-Framework für eine Einzeländerung eingeführt werden.
- Bei UI-Änderungen nur dann visuell oder interaktiv prüfen, wenn Layout, Bedienablauf, responsive Darstellung oder Barrierefreiheit tatsächlich betroffen sein können. Die Nutzerin oder der Nutzer kann den allgemeinen UI-Durchlauf selbst übernehmen.
- Datenmigrationen, Importe/Exporte, Cloud-Repository, Authentifizierung, RLS, gemeinsame Gewichtsdaten und Service-Worker-Änderungen sind hochriskant. Hier gezielt den betroffenen Ablauf prüfen und bei Bedarf einen kleinen reproduzierbaren Test ergänzen.
- Keine Tests schreiben, die lediglich die aktuelle Implementierung nacherzählen oder keinen realistischen Fehler verhindern würden.

Wenn eine Prüfung sinnvoll ist, über einen lokalen HTTP-Server testen, nicht über file://. Typische zielgerichtete Abläufe sind:

- Anmeldung, Abmeldung und Cloud-Verbindung nach Auth-Änderungen
- Gewichtsquelle und Editiergrenze nach Änderungen im Weight-Repository
- Merge-, Replace- oder Presets-Import mit einem Testbackup nach Import-/Export-Änderungen
- PWA-Update, Update-Banner und Offline-Fallback nach Änderungen am Service Worker
- Barcode, QR oder Kamera nur bei Änderungen an diesen jeweiligen Flows und wenn Kamera/Netzwerk verfügbar sind

npm test kann als Basiskommando ausgeführt werden, deckt im aktuellen Repository aber mangels Testdateien keine Produktlogik ab.
