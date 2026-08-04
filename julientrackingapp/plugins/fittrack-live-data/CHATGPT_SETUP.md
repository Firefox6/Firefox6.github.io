# FitTrack Live in ChatGPT verbinden

Der MCP-Server wird privat über dein bestehendes Supabase-Konto autorisiert. Er ruft Daten bei jeder Tool-Nutzung neu ab; es gibt keine Hintergrundsynchronisierung in ChatGPT.

1. Aktiviere in ChatGPT unter **Settings → Security and login** den **Developer Mode**.
2. Erstelle unter **Apps & Connectors** eine neue MCP-Verbindung mit der URL `https://fvaaccshuxkvvythbuon.supabase.co/functions/v1/fittrack-mcp/mcp`.
3. Schließe die OAuth-Anmeldung auf der FitTrack-Zustimmungsseite ab. Sie erscheint erst, nachdem Supabase OAuth Server, Dynamic Client Registration und der Authorization Path konfiguriert sind.
4. Nach der Erstellung zeigt ChatGPT eine App-ID im Format `plugin_asdk_app_…`. Lege erst dann im Plugin-Ordner eine echte `.app.json` mit dieser ID an und ergänze in `.codex-plugin/plugin.json` den Eintrag `"apps": "./.app.json"`. Keine Platzhalter-ID eintragen.
5. Installiere das Plugin aus dem lokalen Repo-Marktplatz und starte zum Testen eine neue Unterhaltung.

Schreibzugriffe sind absichtlich zweistufig: ChatGPT muss die konkrete Änderung zuerst anzeigen und darf sie erst nach deinem eindeutigen „Ja“ im Chat ausführen.
