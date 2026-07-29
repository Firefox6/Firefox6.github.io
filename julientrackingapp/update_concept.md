# Konzept-Update: FitTrack (Fokus & Streamlining)

## Zielsetzung für den Agenten
Die bestehende Vanilla-JS/IndexedDB-App soll von unnötigem Ballast befreit und um hochgradig nutzwertige Alltags-Features erweitert werden. Es gilt ein striktes Gebot zur UI-Vereinfachung: Reduzierung von redundanten KPI-Darstellungen (mit definierten Ausnahmen), strikte Begrenzung von Berechnungs-Auswüchsen (kein Schulden-Rollover) und eine reibungslose (schnelle) User-Experience bei der Dateneingabe.

---

## Feature 1: UI-Bereinigung & Neues Dashboard-Fokus
Das Dashboard wird die primäre Informationszentrale für KPIs. Detail-Tabs werden aufgeräumt und dienen primär der Eingabe und tiefen Historie.

**1.1. Bereinigung von Code & UI:**
*   **Navy-KFA Rechner:** Sämtliche Formeln, UI-Elemente und Datenbank-Felder (Hals-, Bauch-, Hüftumfang) bezüglich Körperfett werden restlos entfernt.
*   **Detail-Trainingserfassung:** Die Formulare für Sätze, Wiederholungen, Volumen und Übungs-Drafts werden gelöscht. Training besteht fortan ausschliesslich aus simplen Toggles ("Krafttraining erledigt", "Cardio erledigt").
*   **KPI-Header in Detail-Tabs:** Im Gegensatz zum restlichen Streamlining gibt es hier strikte Ausnahmen: 
    *   Im Tab **"Gewicht"** bleiben die Statistiken **"Aktuell"** und **"7-Tage-Schnitt"** zwingend erhalten, der Rest der Header-Statistiken kann entfernt werden. 
    *   Im Tab **"Kalorien"** bleiben **alle** bisherigen KPI-Zusammenfassungen komplett erhalten.

**1.2. Das neue Gewichts-Chart (Dashboard):**
*   **UI/UX:** Alle kleinen, verstreuten Graphen entfallen. Es gibt exakt ein prominentes Gewichts-Chart direkt auf dem Dashboard.
*   **Darstellung:** X-Achse (Zeitstrahl mit Monaten/Wochen), Y-Achse (Gewicht in kg).
*   **Logik:** Das Chart zeigt die gesamte Historie (horizontal scrollbar oder auszoombar). Das tägliche Gewicht wird als optisch zurückgenommene, schwache Linie/Punkte dargestellt. Der gleitende 7-Tage-Schnitt liegt als visuell dominante, dicke Linie darüber, um den echten Trend zu betonen.

---

## Feature 2: Calories Rollover (Wochen-Budget)
Ein wöchentliches Kalorien-Puffer-System, das strikt gegen negative Spiralen abgesichert ist.

**2.1. Die strikten mathematischen Regeln:**
*   **Reset:** Der Pool wird jeden Montag um 00:00 Uhr zwingend auf `0` gesetzt.
*   **Cap (Spar-Limit):** Isst der User unter dem Tagesziel, wandert die Differenz in den Pool. Das ist jedoch auf ein Maximum von **+250 kcal pro Tag** gedeckelt (Beispiel: 500 kcal unter Ziel = trotzdem nur +250 kcal für den Pool).
*   **No-Debt (Keine Schulden):** Isst der User über dem Tagesziel, wird der Pool reduziert. Fällt der Pool auf `0`, verfällt der restliche Überschuss. Der Pool darf niemals negativ werden. Jeder neue Tag ohne Pool startet regulär mit dem Standard-Tagesziel.

**2.2. UI/UX Umsetzung:**
*   Auf dem Dashboard wird neben dem täglichen Kcal-Ziel ein unaufdringliches "Pill"-Element integriert (z.B. `+ 150 kcal Pool`).
*   Die Zahl ist grün bei $> 0$, und grau bei `0`. Rot/Orange existiert nicht, da keine Minuszahlen erlaubt sind.

---

## Feature 3: Auto-TDEE (Verbrauchs-Kompass)
Die App berechnet den echten Grundumsatz inklusive Verbrauch, greift aber niemals bevormundend in die manuell gesetzten Ziele ein.

**3.1. Die Logik:**
*   Das System vergleicht rollierend die täglich aufgenommene Energie (Kcal-Intake) mit der realen Gewichtsveränderung über die letzten exakt 21 Tage.
*   Daraus wird der tatsächliche tägliche Kalorienverbrauch (Total Daily Energy Expenditure) interpoliert.

**3.2. UI/UX Umsetzung:**
*   Der berechnete Wert wird ausschliesslich als informativer Text dargestellt.
*   Ort: Im Dashboard im Bereich Tagesziele, unterhalb der Kcal/Rollover-Anzeige.
*   Darstellung (dezent, graue Schrift): *"Dein berechneter Ø Verbrauch (letzte 21 Tage) liegt bei ca. 2'750 kcal."*

---

## Feature 4: Barcode-Scanner (via OpenFoodFacts)
Schnelleingabe via Kamera-API.

**4.1. UI/UX Workflow:**
1.  Im Tab "Kalorien" gibt es neben "Schnelleintrag" den neuen Button **"📷 Barcode Scannen"**.
2.  Ein Vollbild-Kamera-Overlay öffnet sich. (Technischer Hinweis: Web `MediaDevices` API / `BarcodeDetector` API verwenden).
3.  Nach erfolgreichem Scan schliesst sich die Kamera, ein Lade-Status erscheint kurz, danach öffnet sich eine vorausgefüllte "Neuer Eintrag"-Karte.

**4.2. Pre-Fill & Berechnungs-Logik:**
*   *(Technischer Hinweis: HTTP-GET an `ch.openfoodfacts.org/api/v2/product/[BARCODE].json` - keine Authentifizierung).*
*   Die App sucht im API-Response zwingend nach den 100g-Werten (Kcal, Protein, KH, Fett).
*   **Smart Pre-Fill:** Liefert die API ein Produktgewicht (z. B. Packungsgrösse `150g` oder `serving_size`), wird das Eingabefeld "Menge" direkt mit `150` ausgefüllt. Fehlt der Wert, defaulted es auf `100`.
*   Alle Makros/Kcal auf der Karte sind bereits entsprechend der Menge im Feld hochgerechnet.
*   **User Action:** Der User wählt die Mahlzeit (Dropdown), kann die Menge optional anpassen (Makros updaten sich live), entscheidet sich via Checkbox optional für "Als Preset speichern" und drückt "Eintragen".

---

## Feature 5: Smart Push-Notifications (Review-System)
Nutzung der PWA-Fähigkeiten für native Sperrbildschirm-Benachrichtigungen ohne App-Öffnung.

**5.1. UI Konfiguration (Im "Mehr" / Settings-Tab):**
Ein neuer Bereich "Benachrichtigungen & Fokus" mit exakt folgenden Kontrollen:
*   Toggle: `Tägliches Review (20:30 Uhr) aktivieren`
*   Toggle: `Wöchentliches Review (Sonntag 18:00 Uhr) aktivieren`
*   Abschnitt "Fokus-Metriken (werden in Benachrichtigung angezeigt)":
    *   Checkbox: `Kcal & Rollover-Status`
    *   Checkbox: `Protein`
    *   Checkbox: `Kohlenhydrate`
    *   Checkbox: `Fett`
    *   Checkbox: `Ballaststoffe`
    *   Checkbox: `Zucker`
    *   Checkbox: `Salz`
    *   Checkbox: `Training (Erledigt Haken)`

**5.2. Funktionsweise:**
*   *(Technischer Hinweis: Umsetzung lokal über Service Worker Cron/Timers und Web Notifications API).*
*   Die Nachricht aggregiert ausschliesslich die angekreuzten Metriken.
*   **Beispiel Output Daily:** *"Tages-Review: 2'300 / 2'200 kcal | Pool: +150 | 145g Protein | Cardio erledigt ✅"*
*   **Beispiel Output Weekly:** *"Wochen-Review: Ø 86.4 kg (-0.2kg) | Rest-Pool: +450 kcal | 3x Kraft, 1x Cardio"*