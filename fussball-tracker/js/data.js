/**
 * data.js — Standard-Datensatz des Fussball Trackers (Stand: 28. Juli 2026)
 *
 * Dies ist NUR der mitgelieferte Default. Zur Laufzeit kann ein importierter
 * Datensatz (siehe store.js) diesen komplett ersetzen — beide folgen exakt
 * demselben, bewusst generischen Schema:
 *
 *   {
 *     schemaVersion: 1,
 *     meta: { lastUpdated: "YYYY-MM-DD", lastUpdatedLabel: "3. September 2026" },
 *     player: {
 *       label: "Kurzname für die Navigation",
 *       profile: { name, team, nationalTeam, shirtNumber, position, born, age, height, foot, contractUntil },
 *       statusNote: "1-3 Sätze",
 *       stats:            [ { label, value, unit, detail } ],
 *       upcomingMatches:  [ { date, time, competition, homeTeam, awayTeam, venue, isFreeBroadcast, note } ],
 *       pastMatches:      [ { date, competition, homeTeam, awayTeam, score, goalsScored, note } ],
 *       news:             [ { title, text } ]
 *     },
 *     club: {
 *       label, profile: { name, founded, stadium, coach, president, owner },
 *       statusNote, stats, upcomingMatches, pastMatches, news   // gleiche Form wie bei player
 *     },
 *     broadcaster: {
 *       label, name, intro,
 *       rights: [ { competition, rightsHolder, freeCoverage, validity } ],
 *       upcomingFreeMatches: [ ...gleiche Match-Form wie oben... ],
 *       emptyStateNote
 *     }
 *   }
 *
 * "isFreeBroadcast": true markiert ein Spiel als gratis live beim getrackten
 * Broadcaster. Die exakte, kopierbare Anleitung zum Aktualisieren dieser
 * Datei findest du in der App unter Mehr → Daten.
 */

const DEFAULT_DATA = {
  schemaVersion: 1,

  meta: {
    lastUpdated: "2026-07-28",
    lastUpdatedLabel: "28. Juli 2026",
  },

  // ---------------------------------------------------------------------
  // PLAYER
  // ---------------------------------------------------------------------
  player: {
    label: "Mbappé",
    profile: {
      name: "Kylian Mbappé",
      team: "Real Madrid",
      nationalTeam: "Frankreich",
      shirtNumber: 10,
      position: "Mittelstürmer",
      born: "20.12.1998",
      age: 27,
      height: "180 cm",
      foot: "rechts",
      contractUntil: "30.06.2029",
    },
    statusNote:
      "Nach dem WM-Finalturnier zurück bei Real Madrid. José Mourinho hat als neuer Cheftrainer übernommen, die Vorbereitung auf die Saison 2026/27 läuft in Valdebebas.",
    stats: [
      { label: "La Liga 2025/26", value: 25, unit: "Tore", detail: "31 Spiele · 5 Assists — Torschützenkönig der Liga" },
      { label: "Champions League 2025/26", value: 15, unit: "Tore", detail: "Torschützenkönig des Wettbewerbs, Real Madrid schied im Viertelfinal aus" },
      { label: "Alle Wettbewerbe 2025/26", value: 42, unit: "Tore", detail: "44 Spiele · 6 Assists" },
      { label: "WM 2026", value: 10, unit: "Tore", detail: "Golden Boot (2. Mal nach 2022) · 22 WM-Tore total = alleiniger Rekordtorschütze der WM-Geschichte, vor Messi (21)" },
    ],
    upcomingMatches: [
      {
        date: "2026-07-28",
        time: "18:00",
        competition: "Testspiel",
        homeTeam: "Real Madrid",
        awayTeam: "Leganés",
        venue: "Ciudad Real Madrid, Valdebebas (hinter verschlossenen Türen)",
        isFreeBroadcast: false,
        note: null,
      },
      {
        date: "2026-08-01",
        time: "18:00",
        competition: "Testspiel",
        homeTeam: "Real Madrid",
        awayTeam: "Fiorentina",
        venue: "Wörthersee Stadion, Klagenfurt (AUT)",
        isFreeBroadcast: false,
        note: null,
      },
      {
        date: "2026-08-12",
        time: "21:00",
        competition: "Trofeo Teresa Herrera",
        homeTeam: "Deportivo La Coruña",
        awayTeam: "Real Madrid",
        venue: "Riazor, A Coruña",
        isFreeBroadcast: false,
        note: null,
      },
      {
        date: "2026-08-22",
        time: null,
        competition: "La Liga 2026/27 · 1. Spieltag",
        homeTeam: "Real Madrid",
        awayTeam: "Espanyol",
        venue: "Santiago Bernabéu",
        isFreeBroadcast: false,
        note: "Saisonstart in der Liga (ursprünglich 1. Spieltag, wegen WM-Teilnehmern verschoben)",
      },
    ],
    pastMatches: [
      {
        date: "2026-07-18",
        competition: "WM 2026 · Spiel um Platz 3",
        homeTeam: "Frankreich",
        awayTeam: "England",
        score: "4:6",
        goalsScored: 2,
        note: "Frankreich verliert das Spiel um Platz 3 in einem Offensiv-Spektakel — Mbappé trifft doppelt und sichert sich damit den Golden Boot.",
      },
      {
        date: "2026-07-14",
        competition: "WM 2026 · Halbfinal",
        homeTeam: "Frankreich",
        awayTeam: "Spanien",
        score: "0:2",
        goalsScored: 0,
        note: "Mbappé bleibt gegen die spanische Abwehr blass, Frankreichs Turnier endet im Halbfinal.",
      },
      {
        date: "2026-07-09",
        competition: "WM 2026 · Viertelfinal",
        homeTeam: "Frankreich",
        awayTeam: "Marokko",
        score: "—",
        goalsScored: 1,
        note: "Treffer zum WM-Rekord-Gleichstand mit Messi (21 Karriere-Tore).",
      },
      {
        date: "2026-07-04",
        competition: "WM 2026 · Achtelfinal",
        homeTeam: "Frankreich",
        awayTeam: "Paraguay",
        score: "—",
        goalsScored: 1,
        note: "Verwandelter Foulelfmeter.",
      },
      {
        date: "2026-05-23",
        competition: "La Liga 2025/26 · Saisonfinale",
        homeTeam: "Real Madrid",
        awayTeam: "Athletic Club",
        score: "4:2",
        goalsScored: null,
        note: "Letzter Ligaspieltag der Saison 2025/26 — Real Madrid beendet die Saison als Vizemeister hinter Barcelona.",
      },
    ],
    news: [
      {
        title: "Mourinho zurück auf der Real-Bank",
        text: "José Mourinho hat als neuer Cheftrainer bei Real Madrid übernommen und löst Álvaro Arbeloa ab. Er soll dem Klub nach einer titellosen Saison 2025/26 wieder zu Trophäen verhelfen.",
      },
      {
        title: "Golden Boot Nummer 2",
        text: "Mbappé gewann an der WM 2026 mit 10 Turniertoren erneut den Golden Boot — als erster Spieler überhaupt zum zweiten Mal (nach 2022). Damit ist er auch alleiniger ewiger WM-Rekordtorschütze mit 22 Toren.",
      },
      {
        title: "Vierter Platz mit Frankreich",
        text: "Nach der Halbfinal-Niederlage gegen Spanien verlor Frankreich auch das kleine Finale gegen England 4:6 und wurde WM-Vierter. Mbappé traf im Spiel um Platz 3 zweimal.",
      },
      {
        title: "Pérez stellt sich hinter Mbappé",
        text: "Klubpräsident Florentino Pérez hat Spekulationen über einen Abgang eine Absage erteilt und Mbappé trotz der bisher titellosen Real-Zeit das Vertrauen ausgesprochen.",
      },
      {
        title: "Ballon-d'Or-Diskussion läuft",
        text: "In einem WM-Jahr gilt Mbappé für einige Experten als Mitfavorit auf den Ballon d'Or 2026 — trotz des frühen Frankreich-Ausscheidens, dank Liga-Torschützenkrone und WM-Rekorden.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // CLUB
  // ---------------------------------------------------------------------
  club: {
    label: "Basel",
    profile: {
      name: "FC Basel 1893",
      founded: 1893,
      stadium: "St. Jakob-Park",
      coach: "Stephan Lichtsteiner",
      president: "Reto Baumgartner",
      owner: "FCB Holding (David Degen)",
    },
    statusNote:
      "Nach Platz 5 in der Saison 2025/26 und einem Trainerwechsel (Ludovic Magnin → Stephan Lichtsteiner im Januar) startet der FCB ohne internationales Geschäft in die neue Saison — Meister Thun, St. Gallen sowie Lugano/Sion belegen 2026/27 die Schweizer Europacup-Plätze.",
    stats: [
      { label: "Vorsaison 2025/26", value: 5, unit: "Platz", detail: "Cup: Viertelfinal Schweizer Cup" },
      { label: "Topscorer 25/26 (Liga)", value: 11, unit: "Tore", detail: "Xherdan Shaqiri — 16 Tore in allen Wettbewerben" },
      { label: "Neuzugänge 26/27", value: 5, unit: "Spieler", detail: "Zan Celar, Louis Coleen, Akpe Victory, Assane Sow, Ludwig Malachowski · Rückkehrer: Philip Otele" },
    ],
    upcomingMatches: [
      {
        date: "2026-08-01",
        time: "18:00",
        competition: "Super League 2026/27 · 2. Spieltag",
        homeTeam: "FC Basel",
        awayTeam: "FC Lausanne-Sport",
        venue: "St. Jakob-Park (1. Augustfeiertag)",
        isFreeBroadcast: false,
        note: null,
      },
    ],
    pastMatches: [
      {
        date: "2026-07-25",
        competition: "Super League 2026/27 · 1. Spieltag",
        homeTeam: "Servette FC",
        awayTeam: "FC Basel",
        score: "0:1",
        goalsScored: null,
        note: "Saisonauftakt-Sieg dank Foulelfmeter: Neuzugang Zan Celar verwandelt in der 78. Minute, nachdem Louis Coleen im Strafraum gelegt wurde.",
      },
    ],
    news: [
      {
        title: "Geglückter Saisonstart in Genf",
        text: "Der FCB gewinnt zum Auftakt der Super-League-Saison 2026/27 bei Servette 1:0. Den entscheidenden Elfmeter verwandelte Neuzugang Zan Celar, herausgeholt von Louis Coleen.",
      },
      {
        title: "Fünf neue Gesichter im Kader",
        text: "Mit Zan Celar, Louis Coleen, Akpe Victory, Assane Sow und Rückkehrer Philip Otele hat Trainer Stephan Lichtsteiner mehrere neue Optionen für die neue Saison erhalten.",
      },
      {
        title: "Keine Europacup-Saison",
        text: "Nach Rang 5 in der Vorsaison bestreitet der FCB 2026/27 ausschliesslich Super League und Schweizer Cup — die internationalen Startplätze gehen an Meister Thun, an St. Gallen (Europa League) sowie an Lugano und Sion (Conference League).",
      },
      {
        title: "Erstes Heimspiel am 1. August",
        text: "Am Schweizer Nationalfeiertag empfängt der FCB im St. Jakob-Park den FC Lausanne-Sport zum ersten Heimspiel der neuen Saison.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // BROADCASTER
  // ---------------------------------------------------------------------
  broadcaster: {
    label: "SRF",
    name: "SRF Sport",
    intro:
      "SRF überträgt einen Teil des Schweizer und internationalen Fussballs gratis und frei empfangbar. Die grossen Live-Pakete der Super League liegen aber bei Blue Sport (Pay-TV) — SRF zeigt daraus nur ausgewählte Topspiele.",
    rights: [
      {
        competition: "Super League (Schweiz)",
        rightsHolder: "Blue Sport hat die umfassenden Live-Rechte (Pay-TV/Stream)",
        freeCoverage: "SRF, RTS und RSI übertragen pro Runde ein ausgewähltes Topspiel gratis im Free-TV.",
        validity: "Vereinbarung bis Saison 2029/30",
      },
      {
        competition: "UEFA Champions League",
        rightsHolder: "Hauptrechte bei Blue TV (Pay-TV)",
        freeCoverage: "SRF zeigt in der Saison 2026/27 jeweils mittwochs ein Live-Spiel gratis.",
        validity: "Letzte Saison mit SRF-Live-Rechten — ab 2027/28 keine CL-Livespiele mehr im Free-TV",
      },
      {
        competition: "Europa League / Conference League",
        rightsHolder: "Hauptrechte bei DAZN",
        freeCoverage: "SRF zeigt in der Saison 2026/27 jeweils donnerstags ein Live-Spiel gratis.",
        validity: "Letzte Saison mit SRF-Live-Rechten — ab 2027/28 gehen die Free-TV-Rechte verloren",
      },
      {
        competition: "Schweizer Nationalteam (Männer)",
        rightsHolder: "SRF/SRG",
        freeCoverage: "Alle Spiele der Schweizer Nati gratis live.",
        validity: "laufende Partnerschaft mit dem SFV",
      },
      {
        competition: "Schweizer Cup",
        rightsHolder: "SRF/SRG",
        freeCoverage: "Live-Rechte im Rahmen der SFV-Medienpartnerschaft.",
        validity: "laufende Partnerschaft",
      },
      {
        competition: "Frauenfussball",
        rightsHolder: "SRF/SRG",
        freeCoverage: "Mind. 10 Livespiele der Women's Super League sowie Schweizer Spiele der Women's Champions League gratis.",
        validity: "laufende Partnerschaft",
      },
    ],
    upcomingFreeMatches: [
      // Wird laufend ergänzt, sobald SRF ein konkretes Topspiel bestätigt.
    ],
    emptyStateNote:
      "Für die kommenden Tage hat SRF noch kein konkretes Topspiel bestätigt — das Super-League-Topspiel wird jeweils unter der Woche vor dem Spieltag angekündigt. Die Champions-League- und Europa-League-Saison 2026/27 startet erst im September.",
  },
};
