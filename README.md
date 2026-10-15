# CodeHilfe

Mit der CodeHilfe erstellen Lehrkräfte interaktive Code-Aufgaben für ihre
Schülerinnen und Schüler. Diese füllen Lücken im Programm, setzen Codebausteine
ein oder bringen durcheinandergeratene Zeilen in die richtige Reihenfolge und
bekommen dazu sofort eine Rückmeldung. Die fertige Aufgabe wird als Link,
QR-Code oder eingebettet weitergegeben, eine Anmeldung ist nicht nötig.

- **Zum Werkzeug:** <https://tomkarp.github.io/codehilfe/>
- **Anleitung und Beispiele:** <https://tomkarp.github.io/codehilfe/hilfe.html>

## So funktioniert es

1. Im Editor den richtigen Lösungscode einfügen und darin markieren, was
   ergänzt oder sortiert werden soll.
2. Einstellungen wählen, z.B. ob Zeilen gemischt werden und ob eine Lösung
   angezeigt wird. Die Vorschau zeigt die Aufgabe so, wie die Klasse sie sieht.
3. Den Link, den QR-Code oder den Code zum Einbetten weitergeben.

Das Werkzeug ist sprachunabhängig. Syntaxhervorhebung gibt es unter anderem
für Python, Kotlin, Java, JavaScript, C, C++ und SQL.

## Speicherung und Datenschutz

- Es gibt keine Anmeldung und keine Datenbank. Die Aufgabe steckt komprimiert
  im Link, im Teil hinter dem `#`. Diesen Teil schicken Browser nicht an den
  Server.
- Links laufen deshalb nicht ab. Jede Änderung an einer Aufgabe ergibt einen
  neuen Link.
- Der aktuelle Entwurf wird nur im eigenen Browser zwischengespeichert.
  Dauerhaft sichern lässt er sich über den Bearbeitungslink oder als Datei.
- Die Lösung steckt ebenfalls im Link und lässt sich mit etwas Wissen auslesen.
  Die CodeHilfe ist zum Üben gedacht, nicht für Leistungsüberprüfungen.
- Die Seiten werden über GitHub Pages ausgeliefert.

Benötigt wird ein aktueller Browser (Chrome oder Edge ab Version 103, Firefox
ab 113, Safari ab 16.4).

## In eigene Webseiten einbinden

Für eine einzelne Aufgabe genügt der `iframe`-Code aus dem Editor. Wer eigene
Seiten mit mehreren CodeHilfen gestaltet, kann das Widget aus `lib/codehilfe/`
direkt einbinden und die Aufgaben als HTML notieren. Wie das geht, steht in der
[Hilfe](https://tomkarp.github.io/codehilfe/hilfe.html#einbinden).

## Lokal ausführen

Das Werkzeug besteht nur aus statischen Dateien, ein Build-Schritt ist nicht
nötig. Zum Ausprobieren genügt ein einfacher Webserver im Projektordner:

```bash
python3 -m http.server 8642 --bind 127.0.0.1
```

Danach <http://127.0.0.1:8642/> öffnen.

## Aufbau

```text
index.html             Editor
aufgabe.html           Schüleransicht (mit ?einbetten für iframes)
hilfe.html             Anleitung, Referenz und Beispiele
css/seite.css          Seitenstile
js/teilen.js           Aufgabe in einen Link umwandeln und zurück
js/aufgabe.js          Aufgabe darstellen (Vorschau und Schüleransicht)
js/aufgabenseite.js    Schüleransicht
js/editor.js           Editor
js/hilfe.js            „Im Editor öffnen“ an den Beispielen der Hilfe
lib/codehilfe/         Das CodeHilfe-Widget
lib/prism/             Prism 1.30.0 (Syntaxhervorhebung)
lib/qrcode/            qrcode-generator 2.0.4
```

Links haben die Form `aufgabe.html#v1.…`: die Aufgabe als JSON, mit
`deflate-raw` komprimiert und Base64url-kodiert. Bearbeitungslinks
(`index.html#v1.…`) enthalten im JSON zusätzlich `"bearbeitbar": true`; der
Editor öffnet nur solche Links. Ändert sich das Format, bekommt es ein neues
Präfix; bereits verteilte `v1`-Links bleiben lesbar.

## Lizenz

MIT-Lizenz, siehe [`LICENSE`](LICENSE). Das gilt für den Code, die Hilfetexte
und die Beispiele.

Mitgelieferte Fremdbibliotheken stehen unter ihren eigenen Lizenzen:

- [Prism](https://prismjs.com) – MIT-Lizenz, siehe `lib/prism/LICENSE`
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) von
  Kazuhiko Arase – MIT-Lizenz, siehe `lib/qrcode/LICENSE`
