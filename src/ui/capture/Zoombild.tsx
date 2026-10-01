import { useState } from 'preact/hooks';

/** Foto mit Zoom-Knöpfen (Tastatur/Touch); vergrössertes Bild ist im Rahmen scrollbar. */
export default function Zoombild({ url, titel }: { url: string; titel: string }) {
  const [zoom, setZoom] = useState(1);
  const stufe = (d: number) => setZoom((z) => Math.min(4, Math.max(1, Math.round((z + d) * 10) / 10)));
  return (
    <figure class="cap-zoom">
      <figcaption class="cap-zoom__titel">{titel}</figcaption>
      <div class="cap-zoom__rahmen" tabIndex={0} role="group" aria-label={`${titel}, vergrösserbar`}>
        <img
          class="cap-zoom__bild"
          src={url}
          alt={titel}
          style={{ width: `${zoom * 100}%` }}
          onClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
        />
      </div>
      <div class="cap-zoom__knoepfe">
        <button type="button" class="knopf knopf--sekundaer" onClick={() => stufe(-0.5)} disabled={zoom <= 1} aria-label={`${titel} verkleinern`}>−</button>
        <span class="cap-zoom__wert" aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" class="knopf knopf--sekundaer" onClick={() => stufe(0.5)} disabled={zoom >= 4} aria-label={`${titel} vergrössern`}>+</button>
        <a class="knopf knopf--text" href={url} target="_blank" rel="noopener">Im neuen Tab</a>
      </div>
    </figure>
  );
}
