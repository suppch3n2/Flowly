# Flowly

Finanz-App als Progressive Web App, optimiert fürs iPhone. Reines HTML, CSS und Vanilla-JavaScript – kein Build-Schritt.

**Live:** https://suppch3n2.github.io/Flowly/

## Funktionen

- **Übersicht:** Gesamtvermögen mit Verlaufskurve (zum Wischen), Einnahmen/Ausgaben/Sparquote, Balkendiagramm der letzten 6 Monate, Ringdiagramm nach Kategorie, letzte Buchungen
- **Buchungen:** nach Datum gruppiert, Filter, Suche, Bearbeiten/Löschen
- **Budgets:** Monatslimit pro Kategorie, Warnfarbe ab 90 % und über 100 %
- **Sparziele:** anlegen, Geld hinzufügen, löschen
- **Einstellungen:** Name, Startguthaben, JSON-Backup exportieren/importieren, alle Daten löschen
- Offline-fähig (Service Worker), alle Daten bleiben lokal im Browser (localStorage)

## Datenschutz

- **Alle Daten bleiben auf dem Gerät** (localStorage im Browser). Es gibt keinen Server, kein Konto, keine Synchronisation.
- **Kein Tracking, keine Analytics, keine Cookies, keine externen Dienste.** Auch die Schriften sind lokal eingebunden.
- Eine **Content-Security-Policy** in `index.html` verbietet technisch jede Verbindung zu fremden Servern (`connect-src 'self'`).
- **Backups** werden nur als Datei auf dem Gerät gespeichert (Download), nie hochgeladen. `.gitignore` verhindert, dass Backup-Dateien versehentlich ins Repository gelangen.
- **Beispieldaten** sind frei erfunden und werden im Code erzeugt.
- **Optionale App-Sperre:** 4-stellige PIN beim Öffnen. Gespeichert wird nur ein PBKDF2-Hash mit zufälligem Salt; nach 5 Fehlversuchen gibt es eine Wartezeit. Die Sperre ist ein Sichtschutz – die Daten selbst sind nicht verschlüsselt.
- GitHub Pages liefert nur die App-Dateien aus. Wie jeder Webserver sieht GitHub dabei technische Zugriffsdaten (z. B. IP-Adresse) beim Laden der App, aber niemals deine Finanzdaten.

## Aufs iPhone holen

Seite in **Safari** öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.

## Entwicklung

```bash
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
npm test                      # Logik-Tests (Node 20+, keine Abhängigkeiten)
```

| Datei | Inhalt |
|---|---|
| `index.html` | App-Gerüst, Meta-Tags für iOS |
| `css/styles.css` | Design |
| `js/logic.js` | Reine Logik: Beträge, Monate, Summen, Budgets, Import-Prüfung |
| `js/store.js` | Speicherung (localStorage, mit try/catch) |
| `js/lock.js` | Optionale PIN-Sperre (PBKDF2-Hash, Fehlversuch-Sperre) |
| `js/app.js` | Oberfläche, Tabs, Bottom-Sheets, Dialoge |
| `js/charts.js` | SVG-Diagramme |
| `sw.js` | Service Worker (Offline-Cache) |
| `.github/workflows/pages.yml` | Tests + Deployment auf GitHub Pages bei jedem Push auf `main` |

Schriften: Inter und Space Grotesk (SIL Open Font License), lokal eingebunden.
