# Vergangene Zeiteinträge anzeigen und bearbeiten

**User story:** Als Nutzer möchte ich neben der Stoppuhr meine vergangenen Zeiteinträge sehen und deren Start, Ende und Pausen bearbeiten können, damit ich erfasste Zeiten nachträglich korrigieren kann.

## Context
Die App kann Zeit aktuell nur starten, pausieren, fortsetzen und stoppen (`StopWatch.astro` auf `dashboard.astro`, Aktionen in `application/web-app/src/actions/time-tracking.ts`). Abgeschlossene Einträge sind danach weder sichtbar noch änderbar.

Ein `TimeRecord` (`application/shared/data/src/time-record.ts`) besteht aus `userEmail`, `startedAt`, optionalem `endedAt` und einer Liste von `pauses` (jeweils `startedAt` und optionales `endedAt`). Die Datenschicht bietet bisher nur `findActiveTimeRecord` — eine Abfrage abgeschlossener Einträge (`endedAt` gesetzt) existiert noch nicht.

## Scope
- Datenschicht: Funktion zum Laden der abgeschlossenen Zeiteinträge eines Nutzers (`endedAt` gesetzt) sowie zum Aktualisieren von `startedAt`, `endedAt` und `pauses` eines bestehenden Eintrags.
- Astro-Action(s) zum Abfragen der Historie und zum Speichern der Bearbeitung, mit `zod`-Validierung an der Grenze (`ActionError` für erwartbare Fehler).
- UI neben der Stoppuhr auf dem Dashboard: Liste der vergangenen Einträge mit Start, Ende und Pausen.
- Bearbeiten eines Eintrags: Start- und Endzeit sowie Pausen (Start/Ende) anpassen und speichern.

## Acceptance criteria
- Auf dem Dashboard wird neben der Stoppuhr eine Liste der abgeschlossenen Zeiteinträge des angemeldeten Nutzers angezeigt.
- Jeder Listeneintrag zeigt Startzeit, Endzeit und die enthaltenen Pausen (jeweils Start und Ende).
- Ein vergangener Eintrag lässt sich bearbeiten: Startzeit, Endzeit und die Start-/Endzeiten der Pausen können geändert werden.
- Beim Speichern werden die Eingaben an der Grenze validiert (gültige Zeitstempel; Ende nach Start; Pausen liegen innerhalb des Eintrags); ungültige Eingaben führen zu einer verständlichen Fehlermeldung und werden nicht gespeichert.
- Eine gespeicherte Änderung ist nach dem Neuladen der Seite dauerhaft sichtbar.
- Ein Nutzer kann nur seine eigenen Einträge sehen und bearbeiten.

## Out of scope
- Anlegen oder Löschen vergangener Einträge von Hand (nur Bearbeiten bestehender).
- Bearbeiten des aktuell laufenden Eintrags über die Historie.
- Hinzufügen oder Entfernen einzelner Pausen innerhalb eines Eintrags (nur Anpassen vorhandener Zeiten).
- Reporting, Export oder Aggregation der Zeiteinträge.
