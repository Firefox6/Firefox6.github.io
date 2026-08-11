# FitTrack Android Widgets

Dieses eigenständige Android-Modul ergänzt die FitTrack-Nutrition-PWA um zwei Homescreen-Widgets:

- **Tagesziele (5×1):** offene Kalorien, aktueller Verbrauch, Kalorienpool, Protein sowie Kohlenhydrate und Fett.
- **Kalorien kompakt (2×2):** offene Kalorien, Tagesfortschritt und Protein.

## Verhalten

- Die Widget-App meldet sich separat mit demselben E-Mail-/Passwort-Konto bei Supabase an. Eine Browser-Session der PWA kann Android nicht übernehmen.
- Das Passwort wird nur für die Anmeldung übertragen und nicht gespeichert.
- Access- und rotierender Refresh-Token liegen AES-GCM-verschlüsselt in den App-Daten; der Schlüssel bleibt im Android Keystore.
- Datenzugriffe verwenden den öffentlichen Publishable Key und den Benutzer-JWT. Die bestehenden RLS-Policies auf `app_settings` und `food_entries` bleiben die Sicherheitsgrenze.
- Das Widget fragt nur die Einstellungen und die letzten acht lokalen Kalendertage ab. Damit kann es den siebentägigen Kalorienpool wie die PWA berechnen.
- Android aktualisiert periodische Widgets höchstens ungefähr alle 30 Minuten. Die Schaltfläche `↻` aktualisiert sofort.

## Bauen und installieren

1. Den Ordner `widgets/android` in einer aktuellen Android-Studio-Version öffnen.
2. Falls Android Studio danach fragt, Android SDK 36 und JDK 17 installieren beziehungsweise auswählen.
3. Das Modul `app` auf einem Gerät mit Android 8.0 (API 26) oder neuer ausführen.
4. **FitTrack Widgets** öffnen und einmal anmelden.
5. Auf dem Homescreen eines der beiden FitTrack-Widgets hinzufügen.

Das Modul nutzt Android-Plattformklassen, `org.json` und direkte HTTPS-Aufrufe. Es enthält keine zusätzliche Laufzeitbibliothek und verändert weder das Schema noch die bestehende PWA.

## Sicherheitsvoraussetzung

Beide exponierten Tabellen müssen für `authenticated` zugänglich sein und RLS-Policies mit echter Besitzprüfung besitzen, beispielsweise sinngemäss `(select auth.uid()) = user_id`. Der explizite `user_id`-Filter des Clients ist nur eine Abfrageoptimierung und ersetzt RLS nicht.
