/**
 * data.js — Inhalt des Fussball Trackers
 * Stand: 28. Juli 2026
 *
 * Das ist ein statischer Datensatz (kein Live-API-Call), damit die App auch
 * offline als installierte PWA funktioniert. Um die Daten zu aktualisieren,
 * einfach diese Datei ersetzen/anpassen — die Struktur unten beschreibt das
 * Format. isFreeSRF = true markiert ein Spiel als gratis live auf SRF.
 */

const APP_DATA = {
  meta: {
    lastUpdated: "2026-07-28",
    lastUpdatedLabel: "28. Juli 2026",
  },

  // ---------------------------------------------------------------------
  // MBAPPÉ
  // ---------------------------------------------------------------------
  mbappe: {
    profile: {
      name: "Kylian Mbappé",
      club: "Real Madrid",
      nationalTeam: "Frankreich",
      shirt: 10,
      position: "Mittelstürmer",
      born: "20.12.1998",
      age: 27,
      height: "180 cm",
      foot: "rechts",
      contractUntil: "30.06.2029",
    },
    statusNote:
      "Nach dem WM-Finalturnier zurück bei Real Madrid. José Mourinho hat als neuer Cheftrainer übernommen, die Vorbereitung auf die Saison 2026/27 läuft in Valdebebas.",
    stats: {
      laliga2526: { label: "La Liga 2025/26", matches: 31, goals: 25, assists: 5, note: "Torschützenkönig der Liga" },
      ucl2526: { label: "Champions League 2025/26", goals: 15, note: "Torschützenkönig des Wettbewerbs, Real Madrid schied im Viertelfinal aus" },
      overall2526: { label: "Alle Wettbewerbe 2025/26", matches: 44, goals: 42, assists: 6 },
      worldCup2026: {
        label: "WM 2026",
        matches: 7,
        goals: 10,
        note: "Golden Boot (zum 2. Mal nach 2022) · 22 WM-Tore total = alleiniger Rekordtorschütze der WM-Geschichte, vor Messi (21)",
      },
    },
    upcomingMatches: [
      {
        date: "2026-07-28",
        time: "18:00",
        competition: "Testspiel",
        home: "Real Madrid",
        away: "Leganés",
        venue: "Ciudad Real Madrid, Valdebebas (hinter verschlossenen Türen)",
        isFreeSRF: false,
      },
      {
        date: "2026-08-01",
        time: "18:00",
        competition: "Testspiel",
        home: "Real Madrid",
        away: "Fiorentina",
        venue: "Wörthersee Stadion, Klagenfurt (AUT)",
        isFreeSRF: false,
      },
      {
        date: "2026-08-12",
        time: "21:00",
        competition: "Trofeo Teresa Herrera",
        home: "Deportivo La Coruña",
        away: "Real Madrid",
        venue: "Riazor, A Coruña",
        isFreeSRF: false,
      },
      {
        date: "2026-08-22",
        time: null,
        competition: "La Liga 2026/27 · 1. Spieltag",
        home: "Real Madrid",
        away: "Espanyol",
        venue: "Santiago Bernabéu",
        isFreeSRF: false,
        note: "Saisonstart in der Liga (ursprünglich 1. Spieltag, wegen WM-Teilnehmern verschoben)",
      },
    ],
    pastMatches: [
      {
        date: "2026-07-18",
        competition: "WM 2026 · Spiel um Platz 3",
        home: "Frankreich",
        away: "England",
        score: "4:6",
        goalsScored: 2,
        note: "Frankreich verliert das Spiel um Platz 3 in einem Offensiv-Spektakel — Mbappé trifft doppelt und sichert sich damit den Golden Boot.",
      },
      {
        date: "2026-07-14",
        competition: "WM 2026 · Halbfinal",
        home: "Frankreich",
        away: "Spanien",
        score: "0:2",
        goalsScored: 0,
        note: "Mbappé bleibt gegen die spanische Abwehr blass, Frankreichs Turnier endet im Halbfinal.",
      },
      {
        date: "2026-07-09",
        competition: "WM 2026 · Viertelfinal",
        home: "Frankreich",
        away: "Marokko",
        score: "—",
        goalsScored: 1,
        note: "Treffer zum WM-Rekord-Gleichstand mit Messi (21 Karriere-Tore).",
      },
      {
        date: "2026-07-04",
        competition: "WM 2026 · Achtelfinal",
        home: "Frankreich",
        away: "Paraguay",
        score: "—",
        goalsScored: 1,
        note: "Verwandelter Foulelfmeter.",
      },
      {
        date: "2026-05-23",
        competition: "La Liga 2025/26 · Saisonfinale",
        home: "Real Madrid",
        away: "Athletic Club",
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
  // FC BASEL
  // ---------------------------------------------------------------------
  basel: {
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
    stats: {
      lastSeason: { label: "Super League 2025/26", position: 5, cup: "Viertelfinal Schweizer Cup" },
      topScorerLastSeason: { name: "Xherdan Shaqiri", leagueGoals: 11, allGoals: 16 },
      newSignings: ["Zan Celar", "Louis Coleen", "Akpe Victory", "Assane Sow", "Ludwig Malachowski"],
      returnee: "Philip Otele",
    },
    upcomingMatches: [
      {
        date: "2026-08-01",
        time: "18:00",
        competition: "Super League 2026/27 · 2. Spieltag",
        home: "FC Basel",
        away: "FC Lausanne-Sport",
        venue: "St. Jakob-Park (1. Augustfeiertag)",
        isFreeSRF: false,
      },
    ],
    pastMatches: [
      {
        date: "2026-07-25",
        competition: "Super League 2026/27 · 1. Spieltag",
        home: "Servette FC",
        away: "FC Basel",
        score: "0:1",
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
  // SRF SPORT — Free-to-air Fussball-Übersicht
  // ---------------------------------------------------------------------
  srf: {
    intro:
      "SRF überträgt einen Teil des Schweizer und internationalen Fussballs gratis und frei empfangbar. Die grossen Live-Pakete der Super League liegen aber bei Blue Sport (Pay-TV) — SRF zeigt daraus nur ausgewählte Topspiele.",
    rights: [
      {
        competition: "Super League (Schweiz)",
        holder: "Blue Sport hat die umfassenden Live-Rechte (Pay-TV/Stream)",
        srfPart: "SRF, RTS und RSI übertragen pro Runde ein ausgewähltes Topspiel gratis im Free-TV.",
        until: "Vereinbarung bis Saison 2029/30",
      },
      {
        competition: "UEFA Champions League",
        holder: "Hauptrechte bei Blue TV (Pay-TV)",
        srfPart: "SRF zeigt in der Saison 2026/27 jeweils mittwochs ein Live-Spiel gratis.",
        until: "Letzte Saison mit SRF-Live-Rechten — ab 2027/28 keine CL-Livespiele mehr im Free-TV",
      },
      {
        competition: "Europa League / Conference League",
        holder: "Hauptrechte bei DAZN",
        srfPart: "SRF zeigt in der Saison 2026/27 jeweils donnerstags ein Live-Spiel gratis.",
        until: "Letzte Saison mit SRF-Live-Rechten — ab 2027/28 gehen die Free-TV-Rechte verloren",
      },
      {
        competition: "Schweizer Nationalteam (Männer)",
        holder: "SRF/SRG",
        srfPart: "Alle Spiele der Schweizer Nati gratis live.",
        until: "laufende Partnerschaft mit dem SFV",
      },
      {
        competition: "Schweizer Cup",
        holder: "SRF/SRG",
        srfPart: "Live-Rechte im Rahmen der SFV-Medienpartnerschaft.",
        until: "laufende Partnerschaft",
      },
      {
        competition: "Frauenfussball",
        holder: "SRF/SRG",
        srfPart: "Mind. 10 Livespiele der Women's Super League sowie Schweizer Spiele der Women's Champions League gratis.",
        until: "laufende Partnerschaft",
      },
    ],
    upcomingFreeMatches: [
      // Wird laufend ergänzt, sobald SRF ein konkretes Topspiel bestätigt.
    ],
    note:
      "Für die kommenden Tage hat SRF noch kein konkretes Topspiel bestätigt — das Super-League-Topspiel wird jeweils unter der Woche vor dem Spieltag angekündigt. Die Champions-League- und Europa-League-Saison 2026/27 startet erst im September.",
  },
};
