// Gemeinsame Texte für Segmentstatus (Tankbuch/Verlauf). Reine Funktionen.
import type { Segment, SegmentStatus } from '../../core/types';
import { verbrauchsGrenzenText } from '../../core/segments';

export const STATUS_LABEL: Record<SegmentStatus, string> = {
  gueltig: 'gültig',
  geschaetzt: 'geschätzt',
  unplausibel: 'unplausibel',
  unvollstaendig: 'unvollständig',
};

export const STATUS_ERKLAERUNG: Record<SegmentStatus, string> = {
  gueltig: 'Segment ist gültig und zählt im Durchschnitt.',
  geschaetzt: 'Enthält einen geschätzten Eintrag: wird angezeigt, zählt aber nicht im Durchschnitt (ausser in den Einstellungen aktiviert).',
  unplausibel: `Verbrauch ausserhalb ${verbrauchsGrenzenText()}: vermutlich fehlt ein Beleg oder die Volltankungs-Markierung stimmt nicht.`,
  unvollstaendig: 'Vom Nutzer als unvollständig markiert: liefert km und Kosten, aber keinen Verbrauch.',
};

/** Grund-Text eines Segments ohne Verbrauchswert oder ausserhalb des Durchschnitts. */
export function segmentGrund(s: Segment): string {
  return s.grund && s.grund.trim() ? s.grund : STATUS_ERKLAERUNG[s.status];
}

/** Ist das Segment ein Warnfall (Warnsymbol + Text)? */
export function istWarnung(s: Segment): boolean {
  return s.status !== 'gueltig';
}
