# FitTrack Fitness

Eine installierbare, datenorientierte Web-App für Recovery, Sleep und Load. Sie ist ohne Build-Tool sofort lauffähig:

```bash
npm run start
```

Danach `http://localhost:4173` öffnen. `npm run check` prüft die JavaScript-Module.

## Was enthalten ist

- Heute-Ansicht, Score-Details, Trends, Workoutliste und Workout-Details
- 5-stufiges Onboarding mit Login- und Health-Connect-Erklärung
- System-, helles und dunkles Farbschema
- Layouts für Hochformat (9:16), Querformat (16:9) und quadratische Geräte (1:1)
- Offline-First-App-Shell: Netzwerk zuerst, vorhandener Cache als Offline-Fallback
- Adaptergrenze für Capacitor/Health Connect und Secure Storage
- lokale IndexedDB für abgeleitete Scores/Baselines/Insights sowie eine interne Gewichts-Synchronisationsbasis

## Native Health Connect

Die APK-Bridge stellt Status, Berechtigungen sowie begrenzte Lese-Endpunkte für Tageswerte, Schlafsessions, Recovery-Messungen, Workouts und Gewicht bereit. `src/health/health-adapter.js` synchronisiert diese Daten ausschliesslich lokal; `src/health/normalization.js` erzeugt daraus die sichtbaren Scores, Faktoren, Trends und Workouts. Im Browser bleibt der bewusst getrennte Demo-/Cache-Modus aktiv. Fehlende Health-Connect-Werte werden nie als `0` interpretiert und vorhandene Gruppen werden auch bei einer Teilfreigabe weiterhin ausgewertet.

## Supabase

Produktionswerte gehören ausschliesslich in `src/supabase/config.js` während des privaten Builds: Project URL und Publishable Key. Die UI hat weder URL- noch Schlüssel-Felder; ein Service-Role-Key darf nie in die Web-App. Der Auth-Adapter verwendet im Android-Modus die vorhandene `SecureStorage`-Bridge und im Browser `localStorage`.

Gewicht wird im UI nicht angezeigt oder bearbeitet. `src/supabase/weight-repository.js` enthält nur das interne Health-Connect-Mapping, das Deduplizieren per `(user_id, source, external_id)` und die Prioritätsauflösung für Berechnungen.
