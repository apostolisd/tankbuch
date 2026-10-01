-- Serverseitige Grenzen für den Bucket «belege» (W9/Missbrauchsschutz).
-- Das Verkleinern der Fotos auf ca. 1600 px passiert im Client; hier wird zusätzlich erzwungen:
--   höchstens 5 MB je Datei, nur JPEG und PNG.
-- Bewusst als eigene Migration (0002 ist evtl. schon ausgeführt). Kann gefahrlos mehrfach ausgeführt werden.

update storage.buckets
set file_size_limit = 5242880,                                  -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'belege';
