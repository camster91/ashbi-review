import { Fragment,useEffect, useRef, useState } from 'react';
import { api, json, type Comment, type Pin, type ReviewData } from './api';
import { SiteLayer,type SitePoint } from './SiteLayer';
import { PinLayer, type Point } from './PinLayer';

export function ReviewWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [jump,setJump]=useState(0);
  const [siteUrl,setSiteUrl]=useState<string|null>(null);
  const [width,setWidth]=useState(1440);
  const [pagePath,setPagePath]=useState('/');
  const [showAll,setShowAll]=useState(false);
  const [filter, setFilter] = useState('open');
  const [pending, setPending] = useState<Point | SitePoint | null>(null);
  const [author, setAuthor] = useState('Cameron');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const abort = new AbortController();
    api<ReviewData>(`/reviews/${id}`, {}, abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { mounted.current = false; abort.abort(); };
  }, [id]);
  const selected = data?.pins.find(pin => pin.id === active);
  const comments = data?.comments.filter(comment => comment.pin_id === active) ?? [];
  async function refresh() { const result = await api<ReviewData>(`/reviews/${id}`); if (mounted.current) setData(result); }
  function select(pin: Pin, scroll = false) {
    if (busy) return;
    setPending(null); setActive(pin.id); setReplyTo(null); setBody('');
    if(data?.review.type==='site'){if(pin.viewport)setWidth(pin.viewport);if(scroll&&pin.page_path!==pagePath){const frame=new URL(data.review.frame_url!,location.origin);setSiteUrl(frame.pathname.split('/').slice(0,5).join('/')+pin.page_path);}}
    if(scroll)setJump(n=>n+1);
    if (scroll) document.getElementById(`pin-${pin.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function save() {
    if (!body.trim() || !author.trim() || busy || (!pending && !selected)) return;
    setBusy(true); setError('');
    try {
      if (pending) {
        const result = await api<{pin: Pin}>(`/reviews/${id}/pins`, json('POST', { ...pending, author_name: author, body }));
        setActive(result.pin.id); setFilter('open');
      } else await api(`/pins/${active}/comments`, json('POST', { author_name: author, body, parent_id: replyTo }));
      // Clear the sent draft before refreshing; a failed refresh must not invite duplicate submission.
      setPending(null); setBody(''); setReplyTo(null);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function toggleStatus() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { await api(`/pins/${selected.id}`, json('PATCH', { status: selected.status === 'open' ? 'resolved' : 'open' })); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  const visiblePins=(data?.pins??[]).filter(pin=>(filter==='all'||pin.status===filter)&&(data?.review.type!=='site'||showAll||(pin.page_path===pagePath&&pin.viewport===width))).sort((a,b)=>data?.review.type==='site'?a.page_path.localeCompare(b.page_path)||a.number-b.number:a.number-b.number);
  const children = (parent: string | null): Comment[] => comments.filter(comment => comment.parent_id === parent);
  function thread(comment: Comment, depth = 0): React.ReactNode {
    return <li key={comment.id} className="comment"><div><strong>{comment.author_name}</strong> <time dateTime={new Date(comment.created_at * 1000).toISOString()}>{new Date(comment.created_at * 1000).toLocaleDateString('en-CA')}</time></div>
      <p>{comment.body}</p><button className="text-button" disabled={busy} onClick={() => { setReplyTo(comment.id); input.current?.focus(); }}>Reply to {comment.author_name}</button>
      {children(comment.id).length > 0 && <ol className={depth < 2 ? 'replies' : ''}>{children(comment.id).map(child => thread(child, depth + 1))}</ol>}</li>;
  }
  return <>
    <header className="workspace-heading"><button className="secondary" onClick={onBack} disabled={busy}>← Projects</button><div><p className="eyebrow">{data?.review.type==='site'?'WEBSITE':'IMAGE'} REVIEW</p><h1>{data?.review.name ?? 'Review'}</h1></div></header>
    {error && <div className="error" role="alert">{error} <button className="text-button" onClick={() => { setError(''); void refresh().catch(e => setError(e.message)); }}>Reload review</button></div>}
    {!data ? <p role="status">{error ? 'Review unavailable.' : 'Loading review…'}</p> : <div className="workspace-grid">
      {data.review.type==='site'?<div><div className="width-toolbar"><label>Width<select aria-label="Width" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={1440}>Desktop · 1440</option><option value={768}>Tablet · 768</option><option value={390}>Mobile · 390</option></select></label><label className="checkbox"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>Show all pages and widths</label></div><SiteLayer jump={jump} url={siteUrl??data.review.frame_url!} pins={data.pins.filter(pin=>filter==='all'||pin.status===filter)} activeId={active} width={width} showAll={showAll} onPage={setPagePath} onSelect={pin=>{if(!busy)select(pin);}} onCreate={point => { if (!busy) { setPending(point); setActive(null); setBody(''); setReplyTo(null); setTimeout(() => input.current?.focus(), 0); } }}/><p className="muted">{pagePath}</p></div> : <PinLayer key={id} src={`/api/reviews/${id}/image`} name={data.review.name} pins={data.pins.filter(pin => filter === 'all' || pin.status === filter)} activeId={active} pending={pending} onSelect={select} onCreate={point => { if (!busy) { setPending(point); setActive(null); setBody(''); setReplyTo(null); setTimeout(() => input.current?.focus(), 0); } }} />}
      <aside className="feedback" aria-label="Review feedback"><div className="sidebar-title"><h2>Feedback <span>{data.pins.length}</span></h2><label>Show<select aria-label="Show" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All pins</option></select></label></div>
        <ol className="pin-list">{visiblePins.map((pin,index) => <Fragment key={pin.id}>{data.review.type==='site'&&(index===0||visiblePins[index-1].page_path!==pin.page_path)&&<li className="page-label"><h3>{pin.page_path}</h3></li>}<li><button className={active === pin.id ? 'selected' : ''} aria-pressed={active === pin.id} disabled={busy} onClick={() => select(pin, true)}><span className="number">{pin.number}</span><span>{data.comments.find(comment => comment.pin_id === pin.id)?.body ?? 'Feedback'}<small>{data.review.type==='site'?`${pin.page_path} · ${pin.viewport}px · `:''}{pin.status === 'resolved' ? 'Resolved' : 'Open'}</small></span></button></li></Fragment>)}</ol>
        {!visiblePins.length && <p className="muted">{data.pins.length ? 'No pins match this filter.' : 'No feedback yet. Place your first pin to start a conversation.'}</p>}
        {(selected || pending) && <section className="thread" aria-label={pending ? 'New pin comment' : `Pin ${selected?.number} conversation`}>
          <div className="thread-heading"><h3>{pending ? 'New pin' : `Pin ${selected?.number}`}</h3>{selected && <button className="secondary" disabled={busy} onClick={() => void toggleStatus()}>{selected.status === 'open' ? 'Resolve pin' : 'Reopen pin'}</button>}</div>
          <ol className="comments">{children(null).map(comment => thread(comment))}</ol>
          <form onSubmit={e => { e.preventDefault(); void save(); }}><label>Your name<input value={author} maxLength={120} required onChange={e => setAuthor(e.target.value)} disabled={busy}/></label>
            <label>{pending ? 'Comment' : replyTo ? `Reply to ${comments.find(c => c.id === replyTo)?.author_name ?? 'comment'}` : 'Add a reply'}<textarea ref={input} value={body} maxLength={10000} required rows={4} onChange={e => setBody(e.target.value)} disabled={busy}/></label>
            <div className="form-actions"><button disabled={busy || !body.trim() || !author.trim()}>{busy ? 'Saving…' : pending ? 'Save pin' : 'Post reply'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setPending(null); setReplyTo(null); setBody(''); if (!selected) document.querySelector<HTMLElement>('.pin-surface')?.focus(); }}>Cancel</button></div>
          </form></section>}
      </aside>
    </div>}
  </>;
}
