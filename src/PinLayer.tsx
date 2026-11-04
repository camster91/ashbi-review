import { useRef, useState } from 'react';
import type { Pin } from './api';

import { percentagePoint, type Point } from '../shared/pins';
export { percentagePoint, type Point } from '../shared/pins';

/** Positions are percentages of the image surface, independent of rendered size. */
export function PinLayer({ src, name, pins, activeId, pending, onSelect, onCreate }: {
  src: string; name: string; pins: Pin[]; activeId: string | null; pending: Point | null;
  onSelect: (pin: Pin) => void; onCreate: (point: Point) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  return <div className="canvas-scroll">
    <p className="canvas-help" id="pin-help">Click the image to leave a pin. Keyboard: focus the image, use arrow keys, then Enter.</p>
    {failed && <p role="alert">This image could not load. Reload the review to try again.</p>}
    {!loaded && !failed && <p role="status">Loading image…</p>}
    <div className="pin-surface" role="group" aria-label={`Review image: ${name}`} aria-describedby="pin-help" tabIndex={0}
      onFocus={e => { if (e.target === e.currentTarget) setCursor({ x_pct: 50, y_pct: 50 }); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCursor(null); }}
      onClick={e => {
        if (!loaded || (e.target as Element).closest('button')) return;
        const rect = image.current?.getBoundingClientRect();
        if (rect && rect.width && rect.height) onCreate(percentagePoint(e.clientX, e.clientY, rect));
      }}
      onKeyDown={e => {
        if (e.target !== e.currentTarget || !loaded) return;
        const point = cursor ?? { x_pct: 50, y_pct: 50 };
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCreate(point); }
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault(); const step = e.shiftKey ? 10 : 1;
          setCursor({ x_pct: Math.max(0, Math.min(100, point.x_pct + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0))), y_pct: Math.max(0, Math.min(100, point.y_pct + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0))) });
        }
      }}>
      <img ref={image} src={src} alt={name} draggable={false} onLoad={() => { setLoaded(true); setFailed(false); }} onError={() => setFailed(true)} />
      {loaded && pins.map(pin => <button key={pin.id} id={`pin-${pin.id}`} className={`pin ${pin.status} ${activeId === pin.id ? 'active' : ''}`} style={{ left: `${pin.x_pct}%`, top: `${pin.y_pct}%` }} aria-label={`Pin ${pin.number}, ${pin.status}`} aria-pressed={activeId === pin.id} onClick={() => onSelect(pin)}>{pin.number}</button>)}
      {loaded && cursor && <span className="pin-cursor" aria-hidden="true" style={{ left: `${cursor.x_pct}%`, top: `${cursor.y_pct}%` }}>+</span>}
      {loaded && pending && <span className="pin pending" aria-hidden="true" style={{ left: `${pending.x_pct}%`, top: `${pending.y_pct}%` }}>+</span>}
    </div>
  </div>;
}
