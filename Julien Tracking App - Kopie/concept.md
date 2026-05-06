# Julien Tracking App – Concept.md

## Ziel

Eine persönliche, lokal gespeicherte Tracking-Web-App für Gewicht, Kalorien/Makros und Training. Die App wird statisch via GitHub Pages gehostet und soll auf iPhone als Homescreen-Web-App sowie auf Android als installierbare PWA nutzbar sein.

Die App hat keinen Login, keinen Server und keine Cloud-Synchronisation. Alle Daten liegen lokal im Browser. Damit Gerätewechsel trotzdem gut funktionieren, muss es einen vollständigen JSON-Export und Import geben.

Die App soll bewusst simpel, schnell und alltagstauglich sein. Sie soll keine überladene Fitness-Plattform werden, sondern ein persönliches Kontrollzentrum mit Fokus auf:

- Gewichtstrend
- Kalorien und Makros
- Training
- Fortschritt und sinnvolle Statistiken
- einfache Datensicherung

Technologie für Version 1:

- Vanilla HTML
- Vanilla CSS
- Vanilla JavaScript
- IndexedDB für lokale Speicherung
- Service Worker und Manifest für PWA
- GitHub Pages Hosting
- Keine Build-Pipeline nötig
- Keine externen Frameworks voraussetzen

Optional dürfen kleine Libraries verwendet werden, wenn sie lokal eingebunden oder per CDN sauber nutzbar sind. Für Version 1 soll aber alles auch ohne Framework funktionieren.

---

## Grundstruktur

Die App besteht aus folgenden Hauptbereichen:

1. Dashboard
2. Gewicht
3. Kalorien
4. Training
5. Einstellungen / Daten

Die Navigation soll als Bottom Navigation umgesetzt werden, damit die App auf Mobile wie eine native App wirkt.

Tabs:

```text
Dashboard | Gewicht | Kalorien | Training | Mehr
```

Der aktive Tab wird visuell hervorgehoben. Der Inhalt soll ohne Seitenreload gewechselt werden.

---

## Designrichtung

Die App soll wie ein persönliches Performance-Dashboard wirken, nicht wie eine medizinische App.

Stil:

- Mobile-first
- Dark Mode als Default
- Grosse Zahlen
- Kartenlayout
- Runde Cards
- Ruhige Farben
- Gute Lesbarkeit
- Wenige, klare Akzentfarben
- Bottom Navigation fixiert
- Formulare schnell bedienbar
- Keine übermotivierten Texte oder Gamification

Beispiel für Tonalität:

```text
Trend passt.
Heute Protein noch offen.
Kalorienziel fast erreicht.
Gewichtstrend sinkt.
```

Nicht verwenden:

```text
Champion!
Gürtelloch-Level
Locked-in-Modus
Dirty-Cut-Modus
Bloating-Modus
```

---

## Dashboard

Das Dashboard ist der Startscreen. Es soll sofort zeigen, was heute und aktuell wichtig ist.

### Obere Tageskarten

Anzeigen:

- Kalorien heute
- Protein heute
- Kohlenhydrate heute
- Fett heute
- Fortschritt gegenüber Tagesziel

Beispiel:

```text
Heute
Kcal: 1'420 / 2'200
Protein: 118g / 150g
KH: 130g / 220g
Fett: 42g / 70g
```

Zusätzlich:

```text
Noch 780 kcal offen
Noch 32g Protein offen
Proteinquote: 79%
```

### Gewichtskarte

Anzeigen:

- Neustes Gewicht
- 7-Tage-Schnitt
- Veränderung seit Start
- Veränderung der letzten 7 Tage
- Veränderung der letzten 30 Tage

Beispiel:

```text
Gewicht
Heute: 86.7 kg
7-Tage-Schnitt: 87.1 kg
Seit Start: -4.4 kg
Letzte 30 Tage: -1.8 kg
```

Eine dynamische Fortschrittszeile ist erwünscht:

```text
Du bist aktuell 4.4 kg unter deinem höchsten Wochenmittel.
```

Diese Zeile soll datenbasiert berechnet werden, nicht manuell gepflegt.

Keine Custom-Motivationskarte mit statischen Lifestyle-Meilensteinen wie Gürtelloch, Gesicht, etc.

### BMI und KFA auf Dashboard

Auf dem Dashboard soll sinnvoll integriert werden:

- BMI
- BMI-Kategorie
- Navy-KFA-Schätzung, sofern die nötigen Werte vorhanden sind

BMI basiert auf:

- aktuellem Gewicht oder 7-Tage-Gewichtsschnitt
- Körpergrösse aus Einstellungen

KFA nach Navy-Methode basiert auf:

Für Männer:

- Körpergrösse
- Bauchumfang
- Halsumfang

Für Frauen:

- Körpergrösse
- Bauchumfang / Taille
- Halsumfang
- Hüftumfang

Da die App primär für Julien gebaut wird, muss die männliche Formel sauber funktionieren. Die weibliche Formel kann vorbereitet werden, wenn Geschlecht in den Einstellungen auswählbar ist.

Wenn nötige Umfangsdaten fehlen, anzeigen:

```text
KFA: nicht berechenbar – Bauch- und Halsumfang erfassen.
```

### Training-Kurzstatus

Anzeigen:

- Trainings diese Woche
- Krafttrainings diese Woche
- Cardio-Einheiten diese Woche
- Gesamtvolumen Krafttraining diese Woche

Beispiel:

```text
Diese Woche
2 Krafttrainings
1 Cardio
Gesamtvolumen: 13'400 kg
```

### Dashboard-Statistiken

Unter den Hauptkarten sollen interessante, aber sachliche Statistiken erscheinen:

- Gewicht + 7-Tage-Schnitt
- Wochengewicht / Wochenmittel
- Kalorien der letzten 14 Tage
- Protein-Trefferquote der letzten 14 Tage
- Trainingstage pro Woche
- Kalorienabweichung vom Ziel
- Durchschnittskalorien der letzten 7 Tage
- Durchschnittsprotein der letzten 7 Tage

Graphen können in Version 1 mit Canvas/SVG oder einfachen HTML/CSS-Bars umgesetzt werden. Kein Chart-Framework nötig, aber erlaubt, wenn es die Umsetzung vereinfacht.

---

## Gewichtstracking

### Gewichtseintrag

Pflichtfeld:

- Datum
- Gewicht in kg

Optionale Felder:

- Bauchumfang in cm
- Halsumfang in cm
- Hüftumfang in cm
- Notiz

Nicht erfassen:

- Bloating-Gefühl
- Schlafqualität
- Salz hoch
- Carbs hoch
- Training gestern
- sonstige Dirty-Cut-Flags

### Gewichtseintrag-Datenmodell

```json
{
  "id": "weight_2026-05-06",
  "date": "2026-05-06",
  "weight_kg": 86.7,
  "waist_cm": 92,
  "neck_cm": 39,
  "hip_cm": null,
  "notes": "",
  "created_at": "2026-05-06T07:30:00+02:00",
  "updated_at": "2026-05-06T07:30:00+02:00"
}
```

### Gewicht Tab UI

Der Gewicht-Tab enthält:

- Button: `+ Gewicht eintragen`
- Aktuelles Gewicht
- 7-Tage-Schnitt
- Startgewicht
- Höchstes Wochenmittel
- Veränderung seit Start
- Veränderung seit letztem Monat
- BMI
- KFA-Schätzung, falls berechenbar
- Verlaufsgrafik
- Historie als Liste

Beim Bearbeiten eines bestehenden Tages soll der vorhandene Eintrag überschrieben/aktualisiert werden, nicht doppelt angelegt.

### Gewichtsanalyse

Berechnen:

- aktuelles Gewicht = neuster Gewichtseintrag
- 7-Tage-Schnitt = Durchschnitt der letzten 7 Kalendertage mit vorhandenen Einträgen
- 14-Tage-Schnitt
- Wochenmittel pro Kalenderwoche
- höchstes Gewicht
- niedrigstes Gewicht
- höchstes Wochenmittel
- Differenz zum höchsten Wochenmittel
- Differenz seit Start
- Differenz letzte 7 Tage
- Differenz letzte 30 Tage

Gewichtstrend soll nicht nur Tagesgewicht betrachten.

---

## BMI

BMI-Formel:

```text
BMI = Gewicht_kg / (Grösse_m * Grösse_m)
```

Die App soll standardmässig den aktuellen 7-Tage-Gewichtsschnitt verwenden, falls vorhanden. Wenn nicht vorhanden, das neuste Gewicht.

BMI-Kategorien:

```text
< 18.5: Untergewicht
18.5 - 24.9: Normalgewicht
25.0 - 29.9: Übergewicht
>= 30.0: Adipositas
```

Anzeige:

```text
BMI: 22.5 – Normalgewicht
```

---

## Navy-KFA-Rechner

Die App soll einen Navy-Körperfett-Rechner integrieren.

### Männer-Formel

Eingaben:

- Körpergrösse in cm
- Bauchumfang in cm
- Halsumfang in cm

Formel mit Zentimetern:

```text
KFA Männer = 495 / (1.0324 - 0.19077 * log10(Bauchumfang - Halsumfang) + 0.15456 * log10(Körpergrösse)) - 450
```

### Frauen-Formel

Eingaben:

- Körpergrösse in cm
- Bauchumfang in cm
- Halsumfang in cm
- Hüftumfang in cm

Formel mit Zentimetern:

```text
KFA Frauen = 495 / (1.29579 - 0.35004 * log10(Bauchumfang + Hüftumfang - Halsumfang) + 0.22100 * log10(Körpergrösse)) - 450
```

### Verhalten

Wenn nötige Werte fehlen:

```text
KFA nicht berechenbar.
```

Wenn Werte vorhanden sind:

```text
KFA: 22.4% nach Navy-Methode
```

Die App soll klar machen, dass dies eine Schätzung ist.

---

## Kalorientracking

Kalorientracking soll schnell und flexibel sein.

Pflichtwerte pro Eintrag:

- Name
- Kalorien
- Protein
- Kohlenhydrate
- Fett

Optionale Werte:

- Ballaststoffe
- Zucker
- Salz

Nicht tracken:

- Nikotin
- Koffein
- Wasser
- Stimmung
- Hunger

### Kalorien-Tab UI

Der Kalorien-Tab zeigt für den aktuellen Tag:

- Tagesübersicht
- Kcal total / Ziel
- Protein total / Ziel
- KH total / Ziel
- Fett total / Ziel
- optionale Werte, falls vorhanden
- Einträge gruppiert nach Mahlzeit

Mahlzeiten:

- Frühstück
- Mittag
- Abend
- Snack
- Getränke
- Sonstiges

Ein Eintrag darf auch ohne Mahlzeit möglich sein.

Buttons:

```text
+ Schnelleintrag
+ Aus Preset
+ Neues Preset
+ Gestern kopieren
```

### Schnelleintrag

Sehr wichtig: Es muss möglich sein, unterwegs einfach Werte einzutragen, ohne daraus ein Preset zu machen.

Schnelleintrag-Felder:

- Name
- kcal
- Protein
- KH
- Fett
- optional Ballaststoffe
- optional Zucker
- optional Salz
- Mahlzeit optional
- Notiz optional

Checkbox:

```text
Als Preset speichern
```

Standardmässig ist diese Checkbox aus.

### Food Entry Datenmodell

```json
{
  "id": "food_abc123",
  "date": "2026-05-06",
  "meal": "lunch",
  "name": "Schweinskotelett mit Kartoffeln",
  "quantity": 1,
  "unit": "Portion",
  "calories_kcal": 780,
  "protein_g": 52,
  "carbs_g": 48,
  "fat_g": 38,
  "fiber_g": null,
  "sugar_g": null,
  "salt_g": null,
  "preset_id": null,
  "notes": "",
  "created_at": "2026-05-06T12:30:00+02:00",
  "updated_at": "2026-05-06T12:30:00+02:00"
}
```

---

## Kalorien-Presets

Kalorien-Presets müssen klar zwei Typen unterscheiden:

1. Zutat / Lebensmittel nach 100g
2. Fertigprodukt / Stück / Portion

Das ist wichtig, weil Pouletbrust anders eingegeben wird als Chicken Nuggets.

---

### Preset-Typ 1: Zutat / 100g-Werte

Beispiele:

- Pouletbrust
- Reis gekocht
- Kartoffeln
- Halbrahm
- Gurke
- Tomate

Daten werden pro 100g gespeichert.

Beim Eintragen gibt der Nutzer Gramm ein.

Beispiel:

Preset:

```text
Pouletbrust
165 kcal / 100g
31g Protein / 100g
0g KH / 100g
3.6g Fett / 100g
```

Eintrag:

```text
Menge: 200g
```

Berechnung:

```text
kcal = 165 * 200 / 100 = 330
Protein = 31 * 200 / 100 = 62g
```

Datenmodell:

```json
{
  "id": "preset_pouletbrust",
  "type": "ingredient_100g",
  "name": "Pouletbrust",
  "base_quantity": 100,
  "unit": "g",
  "calories_kcal": 165,
  "protein_g": 31,
  "carbs_g": 0,
  "fat_g": 3.6,
  "fiber_g": null,
  "sugar_g": null,
  "salt_g": null,
  "tags": ["Protein"],
  "created_at": "2026-05-06T12:00:00+02:00",
  "updated_at": "2026-05-06T12:00:00+02:00"
}
```

---

### Preset-Typ 2: Fertigprodukt / Stück / Portion

Beispiele:

- 1 Chicken Nugget
- 1 Burger
- 1 Proteinriegel
- 1 Portion Fertiggericht
- 1 Glas Apfelsaft 5dl
- 1 Weggli

Hier wird nicht primär mit Gramm gerechnet, sondern mit Anzahl oder Portionen.

Beispiel:

Preset:

```text
Chicken Nugget
44 kcal pro Stück
2.5g Protein pro Stück
2.8g KH pro Stück
2.7g Fett pro Stück
```

Eintrag:

```text
Anzahl: 5
```

Berechnung:

```text
kcal = 44 * 5 = 220
Protein = 2.5 * 5 = 12.5g
```

Datenmodell:

```json
{
  "id": "preset_chicken_nugget",
  "type": "unit_item",
  "name": "Chicken Nugget",
  "base_quantity": 1,
  "unit": "Stück",
  "calories_kcal": 44,
  "protein_g": 2.5,
  "carbs_g": 2.8,
  "fat_g": 2.7,
  "fiber_g": null,
  "sugar_g": null,
  "salt_g": null,
  "tags": ["Fast Food"],
  "created_at": "2026-05-06T12:00:00+02:00",
  "updated_at": "2026-05-06T12:00:00+02:00"
}
```

Weitere mögliche Einheiten:

```text
Stück
Portion
Packung
Glas
Flasche
Dose
Riegel
Scheibe
```

### Preset-Formular

Felder:

- Name
- Typ: `Zutat / pro 100g` oder `Fertigprodukt / Einheit`
- Einheit
- Basis-Menge
- kcal
- Protein
- KH
- Fett
- optional Ballaststoffe
- optional Zucker
- optional Salz
- Tags optional

Beim Typ `ingredient_100g` soll die Basis-Menge standardmässig 100g sein.

Beim Typ `unit_item` soll die Basis-Menge standardmässig 1 Stück/Portion sein.

---

## Kalorienberechnungen

### Tageswerte

```text
Tageskalorien = Summe aller food_entries pro Datum
Protein = Summe protein_g
KH = Summe carbs_g
Fett = Summe fat_g
Ballaststoffe = Summe fiber_g, falls vorhanden
Zucker = Summe sugar_g, falls vorhanden
Salz = Summe salt_g, falls vorhanden
```

### Protein pro kg

```text
Protein pro kg = Tagesprotein / aktuelles Trendgewicht
```

Wenn kein Gewicht vorhanden ist, nicht anzeigen.

Anzeige:

```text
Protein: 142g
Protein/kg: 1.64 g/kg
```

### Kalorienabweichung

```text
Abweichung = Tageskalorien - Kalorienziel
```

Anzeige:

```text
Noch 430 kcal offen
```

oder:

```text
210 kcal über Ziel
```

---

## Trainingstracking

Training soll simpel und generisch sein, aber Krafttraining und Cardio sauber abdecken.

Trainingsarten:

- Krafttraining
- Cardio
- Sonstiges

---

## Krafttraining

Ein Krafttraining besteht aus Übungen. Eine Übung besteht aus Sets.

### Krafttraining-Datenmodell

```json
{
  "id": "workout_abc123",
  "date": "2026-05-06",
  "type": "strength",
  "name": "Ganzkörper",
  "duration_min": 60,
  "exercises": [
    {
      "exercise_id": "bench_press",
      "name": "Bankdrücken",
      "sets": [
        {
          "weight_kg": 60,
          "reps": 8
        },
        {
          "weight_kg": 60,
          "reps": 7
        }
      ]
    }
  ],
  "notes": "",
  "created_at": "2026-05-06T18:00:00+02:00",
  "updated_at": "2026-05-06T18:00:00+02:00"
}
```

Keine Pflicht für RIR/RPE in Version 1.

### Übungs-Presets

Übungen sollen als Presets speicherbar sein.

Datenmodell:

```json
{
  "id": "exercise_bench_press",
  "name": "Bankdrücken",
  "category": "Kraft",
  "muscle_groups": ["Brust", "Trizeps", "Schulter"],
  "default_tracking": "weight_reps",
  "notes": "",
  "created_at": "2026-05-06T12:00:00+02:00",
  "updated_at": "2026-05-06T12:00:00+02:00"
}
```

Mögliche `default_tracking` Werte:

```text
weight_reps
reps_only
time
```

Für Version 1 reicht `weight_reps` und optional `reps_only`.

### Krafttraining-Statistiken

Berechnen:

```text
Volumen = Gewicht × Wiederholungen
```

Pro Training:

```text
Gesamtvolumen = Summe aller Sets
```

Pro Woche:

```text
Wochengesamtvolumen = Summe aller Trainingsvolumen der Woche
```

Anzeigen:

- Trainingstage pro Woche
- Krafttrainings pro Woche
- Gesamtvolumen pro Woche
- Volumen pro Übung
- Letzte Leistung je Übung

---

## Cardio

Cardio soll bewusst simpel bleiben.

Gedacht primär fürs Laufband im Fitness.

Felder:

- Datum
- Dauer in Minuten
- Distanz in km optional
- Geschwindigkeit in km/h
- Notiz optional

Datenmodell:

```json
{
  "id": "cardio_abc123",
  "date": "2026-05-06",
  "type": "cardio",
  "name": "Laufband",
  "duration_min": 25,
  "distance_km": 3.2,
  "speed_kmh": 7.7,
  "notes": "",
  "created_at": "2026-05-06T18:00:00+02:00",
  "updated_at": "2026-05-06T18:00:00+02:00"
}
```

Wenn Distanz und Dauer vorhanden sind, kann km/h automatisch berechnet werden:

```text
km/h = Distanz / (Dauer / 60)
```

Wenn km/h und Dauer vorhanden sind, kann Distanz automatisch berechnet werden:

```text
Distanz = km/h * (Dauer / 60)
```

UI soll eines davon automatisch ergänzen, wenn möglich.

---

## Einstellungen

Alles Relevante soll variabel einstellbar sein.

### Profil

Felder:

- Körpergrösse in cm
- Geburtsdatum
- Geschlecht

Alter wird aus Geburtsdatum berechnet, nicht nur aus Geburtsjahr.

Datenmodell:

```json
{
  "profile": {
    "height_cm": 178,
    "birth_date": "2004-03-15",
    "sex": "male"
  }
}
```

Geschlecht-Werte:

```text
male
female
other
```

Für Navy-KFA:

- `male` verwendet Männerformel
- `female` verwendet Frauenformel
- `other` zeigt KFA nur an, wenn eine Formel manuell gewählt wird oder bleibt nicht berechenbar

### Ziele

Felder:

- Kalorienziel kcal
- Proteinziel g
- Kohlenhydrate-Ziel g
- Fett-Ziel g
- optional Ballaststoff-Ziel g
- optional Zucker-Maximum g
- optional Salz-Maximum g
- Zielgewicht kg
- Trainingstage pro Woche

Keine Ziel-Modi wie Cut, Maintenance, Lean Bulk. Der Nutzer passt Ziele manuell an.

Datenmodell:

```json
{
  "goals": {
    "calorie_goal_kcal": 2200,
    "protein_goal_g": 150,
    "carbs_goal_g": 220,
    "fat_goal_g": 70,
    "fiber_goal_g": null,
    "sugar_max_g": null,
    "salt_max_g": null,
    "weight_goal_kg": 80,
    "training_days_goal_per_week": 3
  }
}
```

### Maintenance Calories

In den Einstellungen soll eine manuell gepflegte Estimated-Maintenance-Range möglich sein.

Felder:

- Maintenance Minimum kcal
- Maintenance Maximum kcal

Beispiel:

```json
{
  "maintenance": {
    "min_kcal": 2400,
    "max_kcal": 2800
  }
}
```

Anzeige im Dashboard oder Kalorienbereich:

```text
Estimated Maintenance: 2'400–2'800 kcal
Heute gegessen: 2'100 kcal
Grob unter Maintenance: 300–700 kcal
```

Diese Berechnung ist nur eine grobe Orientierung.

### Erinnerungen

Felder:

- Körpergrösse erneut prüfen alle X Tage
- Backup-Erinnerung alle X Tage

Datenmodell:

```json
{
  "reminders": {
    "height_check_interval_days": 60,
    "backup_interval_days": 7,
    "last_height_check_at": null,
    "last_backup_at": null
  }
}
```

Die App soll beim Start prüfen, ob eine Erinnerung fällig ist.

Beispiel:

```text
Körpergrösse wieder einmal prüfen oder bestätigen.
```

---

## Export / Import

Export und Import sind Pflicht in Version 1.

### Export

Die App muss einen vollständigen JSON-Export erzeugen.

Export enthält:

- App-Metadaten
- Settings
- Gewichtseinträge
- Kalorieneinträge
- Kalorien-Presets
- Trainings
- Übungs-Presets

Dateiname:

```text
julien-tracking-backup-YYYY-MM-DD.json
```

Beispiel:

```text
julien-tracking-backup-2026-05-06.json
```

### Import

Version 1 soll mindestens unterstützen:

1. Alles ersetzen
2. Zusammenführen

Optional:

3. Nur Presets importieren

### Alles ersetzen

Der gesamte lokale Datenbestand wird durch die importierte Datei ersetzt.

Vorher muss die App automatisch ein Backup des aktuellen Stands zum Download anbieten oder zumindest klar warnen.

### Zusammenführen

Beim Zusammenführen:

- Einträge mit neuer ID werden hinzugefügt
- Einträge mit gleicher ID werden anhand `updated_at` verglichen
- Der neuere Eintrag gewinnt

Alle Datenobjekte müssen deshalb haben:

```json
{
  "created_at": "2026-05-06T08:30:00+02:00",
  "updated_at": "2026-05-06T09:10:00+02:00"
}
```

### Export-Datenmodell

```json
{
  "schema_version": 1,
  "exported_at": "2026-05-06T12:00:00+02:00",
  "app": {
    "name": "Julien Tracking",
    "version": "1.0.0"
  },
  "settings": {
    "profile": {
      "height_cm": 178,
      "birth_date": "2004-03-15",
      "sex": "male"
    },
    "goals": {
      "calorie_goal_kcal": 2200,
      "protein_goal_g": 150,
      "carbs_goal_g": 220,
      "fat_goal_g": 70,
      "fiber_goal_g": null,
      "sugar_max_g": null,
      "salt_max_g": null,
      "weight_goal_kg": 80,
      "training_days_goal_per_week": 3
    },
    "maintenance": {
      "min_kcal": 2400,
      "max_kcal": 2800
    },
    "reminders": {
      "height_check_interval_days": 60,
      "backup_interval_days": 7,
      "last_height_check_at": null,
      "last_backup_at": null
    },
    "preferences": {
      "units": "metric",
      "theme": "dark",
      "dashboard_range_days": 28
    }
  },
  "weight_entries": [],
  "food_entries": [],
  "food_presets": [],
  "workouts": [],
  "exercise_presets": []
}
```

---

## Lokale Speicherung

Für Version 1 soll IndexedDB verwendet werden.

Database Name:

```text
julien_tracking_db
```

Object Stores:

```text
settings
weight_entries
food_entries
food_presets
workouts
exercise_presets
```

Jeder Store ausser `settings` verwendet `id` als Key.

Settings kann als einzelner Datensatz mit Key `settings` gespeichert werden.

Fallback auf localStorage ist optional, aber nicht nötig.

---

## PWA / GitHub Pages

Dateistruktur für Vanilla-Version:

```text
/
  index.html
  styles.css
  app.js
  db.js
  calculations.js
  export-import.js
  manifest.webmanifest
  service-worker.js
  /icons
    icon-192.png
    icon-512.png
    apple-touch-icon.png
```

### manifest.webmanifest

```json
{
  "name": "Julien Tracking",
  "short_name": "Tracking",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### iOS Meta Tags

In `index.html`:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Tracking">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
```

### Service Worker

Der Service Worker soll die Kern-Dateien cachen:

```text
index.html
styles.css
app.js
db.js
calculations.js
export-import.js
manifest.webmanifest
icons
```

Bei Updates soll die App nicht unendlich alte Versionen behalten. Versioniertes Cache-Naming verwenden:

```text
julien-tracking-cache-v1
```

Später bei Änderungen erhöhen:

```text
julien-tracking-cache-v2
```

Beim Aktivieren alte Caches löschen.

---

## Berechnungsfunktionen

In `calculations.js` zentral sammeln.

Funktionen:

```js
calculateAge(birthDate)
calculateBMI(weightKg, heightCm)
getBMICategory(bmi)
calculateNavyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm })
calculateDailyNutrition(foodEntries, date)
calculateWeeklyAverageWeight(weightEntries)
calculateMovingAverage(weightEntries, days)
calculateStrengthWorkoutVolume(workout)
calculateWeeklyTrainingStats(workouts)
calculateMaintenanceDelta(calories, minMaintenance, maxMaintenance)
```

---

## Validierung

Die App soll simple Validierung haben.

Beispiele:

- Gewicht muss > 0 sein
- Körpergrösse muss > 0 sein
- kcal dürfen nicht negativ sein
- Protein/KH/Fett dürfen nicht negativ sein
- Datum muss vorhanden sein
- Bauchumfang und Halsumfang müssen sinnvoll > 0 sein, wenn KFA berechnet werden soll
- Import muss `schema_version` enthalten

Fehlermeldungen kurz und direkt:

```text
Bitte Gewicht eintragen.
Kalorien dürfen nicht negativ sein.
Import-Datei ungültig.
```

---

## Version 1 Scope

Alles Folgende gehört direkt in Version 1:

- Dashboard
- Gewichtstracking
- Bauch-/Hals-/Hüftumfang optional beim Gewicht
- BMI-Berechnung
- Navy-KFA-Rechner
- Kalorientracking mit kcal, Protein, KH, Fett
- optionale Ballaststoffe, Zucker, Salz
- Schnelleintrag ohne Preset
- Kalorien-Presets mit klarer Trennung:
  - Zutat / pro 100g
  - Fertigprodukt / Einheit
- Trainingstracking
- Krafttraining mit Übungen und Sets
- Übungs-Presets
- Cardio mit Dauer, Distanz optional, km/h
- Einstellungen
- Geburtsdatum statt nur Geburtsjahr
- Estimated Maintenance Calories als Range
- Ziele manuell einstellbar
- Export komplett
- Import ersetzen
- Import zusammenführen
- PWA installierbar
- GitHub Pages kompatibel

Nicht in Version 1:

- Login
- Server
- Cloud Sync
- Nikotintracking
- Dirty-Cut-Modus
- Bloating-Modus
- Locked-in-Modus
- Ziel-Modi wie Cut/Maintenance/Bulk
- Statische Custom-Motivationskarten
- Social Features
- Barcode Scanner
- Food Database API

---

## Umsetzungshinweise für Codex

Bitte mit einer einfachen, robusten Vanilla-Struktur beginnen.

Priorität:

1. Datenmodell und IndexedDB sauber anlegen
2. Settings Screen bauen
3. Gewicht erfassen und anzeigen
4. BMI und KFA berechnen
5. Kalorien-Schnelleintrag bauen
6. Food-Presets bauen
7. Dashboard aus echten Daten befüllen
8. Training erfassen
9. Export/Import bauen
10. PWA-Dateien ergänzen
11. UI verfeinern

Nicht zuerst an perfekten Graphen hängen bleiben. Graphen können am Anfang simple Canvas/SVG/HTML-Visualisierungen sein.

Der wichtigste Punkt ist, dass Eintragen schnell geht und Daten nicht verloren gehen.
