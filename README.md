# Lernkarten – PWA

Lernkarten aus CSV, offline im Browser. Kein Backend, kein Konto, keine Tracker.
Enthalten sind die beiden Sets aus `flashcards_11-1.csv` (50 Karten) und
`flashcards_11-3.csv` (55 Karten).

## Zwei Modi

**Blättern** – Tippen dreht die Karte um. Wischen nach **rechts = gewusst**,
nach **links = nochmal**; die beiden Buttons unten machen dasselbe. `↶` nimmt die
letzte Bewertung zurück, `⤮` mischt den Reststapel neu. Am Rundenende gibt es die
Quote und einen Knopf, der nur noch die „Nochmal"-Karten durchgeht.

**Schreiben** – Antwort selbst formulieren (auf dem iPhone auch über die
Mikrofon-Taste der Tastatur diktieren), dann „Prüfen". Die App vergleicht nicht
Wort für Wort, sondern prüft, ob die **Kernbegriffe** der Karte vorkommen –
sinngemäß, in beliebiger Formulierung und Reihenfolge, Beugungen und Synonyme
eingerechnet. Danach kommt die Musterantwort, und du bewertest selbst
gewusst/nochmal – dein Urteil zählt für den Fortschritt, die Begriffsprüfung ist
nur das Feedback dazu.

Der Fortschritt liegt pro Deck im `localStorage` des Browsers und bleibt erhalten,
bis du ihn im Deck-Menü zurücksetzt.

## Eigene Sets importieren

„CSV importieren" auf dem Startbildschirm. Erwartet werden zwei Spalten
(Frage, Antwort); Komma, Semikolon und Tab werden erkannt, eine Kopfzeile
(`Frage,Antwort` / `Question,Answer` / `Term,Definition` …) wird automatisch
übersprungen. Für importierte Sets werden die Kernbegriffe automatisch aus der
Antwort abgeleitet – gröber als bei den beiden mitgelieferten Decks, wo sie von
Hand gesetzt sind. Importierte Decks bleiben gespeichert und lassen sich einzeln
wieder löschen.

## Lokal testen

Der Service Worker braucht `http://`, per Doppelklick geöffnet (`file://`) läuft
die App zwar, aber ohne Offline-Cache. Deshalb im Ordner:

```bash
cd lernkarten
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen.

## Online stellen (GitHub Pages)

1. Auf github.com ein neues Repository anlegen, z. B. `lernkarten` – **Public**
   (Pages gibt es für private Repos nur mit bezahltem Plan; der Inhalt ist damit
   öffentlich einsehbar).
2. Den Inhalt dieses Ordners hochladen – entweder per „Add file → Upload files"
   im Browser, oder im Terminal:

   ```bash
   cd lernkarten
   git init && git add . && git commit -m "Lernkarten PWA"
   git branch -M main
   git remote add origin https://github.com/<DEIN-NAME>/lernkarten.git
   git push -u origin main
   ```

   Wichtig: die Dateien müssen im **Wurzelverzeichnis** des Repos liegen
   (`index.html` direkt sichtbar), nicht in einem Unterordner.
3. Repo → **Settings → Pages** → Source: „Deploy from a branch", Branch: `main`,
   Ordner: `/ (root)` → Save. Nach ein bis zwei Minuten liegt die App unter
   `https://<DEIN-NAME>.github.io/lernkarten/`.

## Aufs iPhone

Die Pages-URL in **Safari** öffnen (nicht Chrome – nur Safari kann PWAs
installieren) → Teilen-Symbol → **„Zum Home-Bildschirm"** → Hinzufügen.
Danach startet die App im Vollbild ohne Browserleiste und funktioniert offline.

## Nach Änderungen

`sw.js` cacht die App aggressiv. Wenn du etwas änderst, in `sw.js` die Zeile
`const CACHE = "lernkarten-v1";` hochzählen (`-v2`, `-v3` …) und neu hochladen,
sonst zeigt das iPhone weiter die alte Version.

## Dateien

```
index.html      Aufbau der vier Screens
styles.css      Dark-Theme, mobile-first
app.js          Logik: Sitzung, Wischen, Bewertung, CSV-Import, Stichwortprüfung
decks.js        Die beiden Kartensätze samt kuratierten Kernbegriffen
manifest.json   PWA-Metadaten (Name, Farben, Icons)
sw.js           Service Worker für den Offline-Betrieb
icons/          App-Icons (192, 512, maskable, apple-touch)
```
