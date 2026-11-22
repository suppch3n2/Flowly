# Flowly

Finanz-App als Progressive Web App, optimiert fürs iPhone. Reines HTML, CSS und Vanilla-JavaScript – kein Build-Schritt.

**Live:** https://suppch3n2.github.io/Flowly/

## Funktionen

- **Aufbau:** oben Reiter als Pillen (Start · Zahlen · Budgets · Ziele · Einstellungen), auf Start der Kontostand groß mit Rest vom Ausgaben-Limit (+ grün / − rot) und die letzten Umsätze, unten Suche und Plus

- **Coins:** echte Kurse aller Coins (CoinGecko), Suche, Chart als Linie oder Kerzen (1T/1W/1M/1J), Kaufen/Verkaufen mit Spielgeld aus dem Flowly-Kontostand (in Euro, nach Menge oder alles); jeder Trade erscheint als Umsatz
- **Zahlen:** Einnahmen/Ausgaben/Sparquote, Limit, Balkendiagramm der letzten 6 Monate, Ringdiagramm nach Kategorie, alle Umsätze nach Datum mit Filter; Suche über die Leiste unten
- **Budgets:** Monatslimit pro Kategorie, Warnfarbe ab 90 % und über 100 %
- **Sparziele:** anlegen, Geld hinzufügen, löschen
- **Einstellungen:** Name, Startguthaben, JSON-Backup exportieren/importieren, alle Daten löschen
- **Automatik:** Apple-Pay-Zahlungen per Kurzbefehl-Automation „Transaktion“ in eine lokale Datei schreiben und mit einem Tipp importieren (nur neue Einträge)
- **Kontoauszug-Import (CSV):** erkennt Sparkasse, Volksbank/Raiffeisen (neu & alt), ING, DKB, Commerzbank, N26, comdirect, Deutsche Bank/Postbank; Vorschau, Duplikaterkennung (auch gegenüber Apple Pay und Daueraufträgen)
- **Automatische Kategorien** nach Händler/Verwendungszweck; Korrekturen werden pro Händler gelernt
- **Daueraufträge & Abos:** Geld hinzufügen (von was) oder abziehen (wofür), ab einem Datum – Flowly bucht automatisch; wiederkehrende Zahlungen werden nach dem Import erkannt und vorgeschlagen
- **Erinnerung**, wenn der letzte Import länger als 7 Tage her ist – wegklickbar; wer lieber selbst einträgt, blendet den Import ganz aus
- **Ausgaben-Limit pro Monat:** grün mit „+ Betrag“, rot mit „− Betrag“; optional jeden Monat automatisch erhöhen oder verringern
- **Geplante Buchungen:** Geld an einem bestimmten Datum dazu oder ab – wird an dem Tag automatisch gebucht
- Offline-fähig (Service Worker), alle Daten bleiben lokal im Browser (localStorage)

## Datenschutz

- **Alle Daten bleiben auf dem Gerät** (localStorage im Browser). Es gibt keinen Server, kein Konto, keine Synchronisation.
- **Kein Tracking, keine Analytics, keine Cookies.** Auch die Schriften sind lokal eingebunden.
- **Einzige externe Verbindung:** Der Bereich „Coins“ lädt öffentliche Kurse und Coin-Bilder von CoinGecko (`api.coingecko.com`, `coin-images.coingecko.com`). Gesendet werden dabei nur die abgefragten Coin-Namen – keine Buchungen, kein Depot, keine Kennung, kein Cookie. Abschaltbar in den Einstellungen.
- Eine **Content-Security-Policy** in `index.html` erlaubt technisch nur diese eine Ausnahme und verbietet alle anderen fremden Verbindungen.
- **Backups** werden nur als Datei auf dem Gerät gespeichert (Download), nie hochgeladen. `.gitignore` verhindert, dass Backup-Dateien versehentlich ins Repository gelangen.
- **Importierte Dateien** (Apple-Pay-Datei, Kontoauszug) werden nur lokal gelesen. Empfohlener Ablageort: „Auf meinem iPhone“ statt iCloud Drive, damit nichts synchronisiert wird.
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
| `js/importer.js` | Apple-Pay-Datei & Bank-CSV lesen, Formaterkennung, Duplikate |
| `js/categorize.js` | Automatische Kategorien & gelernte Händler |
| `js/crypto.js` | Depot, Kauf/Verkauf (Spielgeld), Prüfung der Coin-Daten |
| `js/market.js` | Kursabfrage bei CoinGecko mit Zwischenspeicher |
| `js/recurring.js` | Daueraufträge buchen, wiederkehrende Zahlungen erkennen |
| `js/app.js` | Oberfläche, Tabs, Bottom-Sheets, Dialoge |
| `js/charts.js` | SVG-Diagramme |
| `sw.js` | Service Worker (Offline-Cache) |
| `.github/workflows/pages.yml` | Tests + Deployment auf GitHub Pages bei jedem Push auf `main` |

Schriften: Inter und Space Grotesk (SIL Open Font License), lokal eingebunden.
