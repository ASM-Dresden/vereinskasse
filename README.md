# Vereinskasse

Kassenhelfer für Vereinsfeste: Produkte antippen, Wechselgeld ablesen, nach dem Fest Einnahmen, Stückzahlen, Einkauf/Rest und Stundenverlauf auswerten. Export als CSV (Excel) und PDF.

## Benutzung
- Auf dem Tablet in Chrome die Adresse dieser Seite öffnen, Menü ⋮ → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
- Danach läuft die App ohne Internet.
- Alle Daten liegen nur auf dem Gerät. Nach jedem Fest unter „Daten" eine Sicherung exportieren.

## Hinweis
Rechen- und Planungshilfe, keine zertifizierte Registrierkasse (keine TSE nach KassenSichV).

## Entwicklung
Reines HTML/CSS/JavaScript ohne Build-Schritt. Lokal testen:

```
powershell -ExecutionPolicy Bypass -File testserver.ps1
```

Bei Änderungen an Dateien in `sw.js` die Cache-Version (`CACHE`) erhöhen, damit installierte Geräte das Update laden.
