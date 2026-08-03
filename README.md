# FitTrack per GitHub-Webseite veröffentlichen

Diese Vorlage wird **einmalig** in das Repository
`Firefox6/Firefox6.github.io` übertragen. Danach brauchst du kein Git auf dem
Mac: Du lädst deine zukünftigen Web-Dateien im Browser nach
`julienfitnessapp/source/` hoch und erhöhst `julienfitnessapp/version.txt`.

GitHub Actions erzeugt daraufhin automatisch ein ZIP, berechnet den Hash,
signiert das Manifest und veröffentlicht die komplette Website — einschließlich
der bestehenden anderen Projekte — auf GitHub Pages.

## Zielstruktur im GitHub-Repository

```text
.github/
  workflows/fittrack-pages.yml
  scripts/build-fittrack-release.mjs
julienfitnessapp/
  source/                         ← hier lädst du später deine Web-App hoch
  version.txt                     ← die einzige Versionsnummer
  fittrack-shell-bootstrap.js     ← bitte nicht verändern
```

`source/` wird nicht direkt aus dem Repository veröffentlicht. Der Workflow
erstellt daraus die sichtbare Website unter
`https://firefox6.github.io/julienfitnessapp/`, zusammen mit
`app-manifest.json` und dem signierten Bundle.

## Späterer Ablauf

1. GitHub öffnen → `julienfitnessapp/source/` → **Add file → Upload files**.
2. Neue/angepasste HTML-, JavaScript-, CSS- und Asset-Dateien hochladen.
3. `julienfitnessapp/version.txt` öffnen, z. B. von `1.0.0` auf `1.0.1`
   ändern, dann committen.
4. Unter **Actions** warten, bis `Publish FitTrack and GitHub Pages` grün ist.

Beim Löschen oder Umbenennen von Dateien muss die alte Datei einmal im
GitHub-Browser gelöscht werden, damit sie nicht mehr Teil des nächsten Builds
ist. Für reine Änderungen oder neue Dateien reicht der Upload.

## Einmalige Geheimnis-Einrichtung

`FITTRACK_WEB_RELEASE_PRIVATE_KEY` muss als GitHub-Repository-Secret gesetzt
werden. Es enthält den vollständigen PEM-Inhalt des privaten Ed25519-Keys. Der
öffentliche Key gehört beim Bau der Android-APK in
`WEB_UPDATE_PUBLIC_KEY_BASE64`.

Der private Schlüssel darf niemals in `source/`, in einen GitHub-Commit oder
in GitHub Pages gelangen.
