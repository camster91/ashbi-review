import { Fragment,useEffect, useRef, useState } from 'react';
import { api, json, type Comment, type Pin, type ReviewData } from './api';
import {CaptureControls} from './CaptureControls';
import {ShareControls} from './ShareControls';
import { SiteLayer,type SitePoint } from './SiteLayer';
import { PinLayer, type Point } from './PinLayer';

export function ReviewWorkspace({ id, onBack, guestToken,userName='Cameron' }: { id: string; onBack: () => void;guestToken?:string;userName?:string }) {
  const [data, setData] = useState<(ReviewData & {guest?:{name:string}|null}) | null>(null);
  const base=guestToken?`/guest/${id}/${guestToken}`:`/reviews/${id}`;const readPath=guestToken?base+'/review':base;
  const [guestEmail,setGuestEmail]=useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [jump,setJump]=useState(0);
  const [siteUrl,setSiteUrl]=useState<string|null>(null);
  const [width,setWidth]=useState(()=>innerWidth<760?390:innerWidth<1000?768:1440);
  const [pagePath,setPagePath]=useState('/');
  const [showAll,setShowAll]=useState(false);
  const [filter, setFilter] = useState('open');
  const [pending, setPending] = useState<Point | SitePoint | null>(null);
  const [author, setAuthor] = useState(guestToken?'':userName);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const abort = new AbortController();
    api<ReviewData & {guest?:{name:string}}>(readPath, {}, abort.signal).then(result=>{setData(result);if(result.guest)setAuthor(result.guest.name);if(result.review.screenshot_mode){setWidth(result.review.screenshot_width??1440);setPagePath(result.review.screenshot_path??'/');setShowAll(false);}}).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { mounted.current = false; abort.abort(); };
  }, [id]);
  const selected = data?.pins.find(pin => pin.id === active);
  const comments = data?.comments.filter(comment => comment.pin_id === active) ?? [];
  async function refresh() { const result = await api<ReviewData>(readPath); if (mounted.current){setData(result);if(result.review.screenshot_mode){setWidth(result.review.screenshot_width??1440);setPagePath(result.review.screenshot_path??'/');setShowAll(false);}} }
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
        const result = await api<{pin: Pin}>(`${base}/pins`, json('POST', { ...pending, author_name: author, body,capture_version:data?.review.capture_version }));
        setActive(result.pin.id); setFilter('open');
      } else await api(guestToken?`${base}/pins/${active}/comments`:`/pins/${active}/comments`, json('POST', { author_name: author, body, parent_id: replyTo }));
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
  async function join(){setBusy(true);setError('');try{await api(`${base}/join`,json('POST',{name:author,email:guestEmail}));await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const visiblePins=(data?.pins??[]).filter(pin=>(filter==='all'||pin.status===filter)&&(data?.review.type!=='site'||showAll||(pin.page_path===pagePath&&pin.viewport===width))).sort((a,b)=>data?.review.type==='site'?a.page_path.localeCompare(b.page_path)||a.number-b.number:a.number-b.number);
  const children = (parent: string | null): Comment[] => comments.filter(comment => comment.parent_id === parent);
  function thread(comment: Comment, depth = 0): React.ReactNode {
    return <li key={comment.id} className="comment"><div><strong>{comment.author_name}</strong> <time dateTime={new Date(comment.created_at * 1000).toISOString()}>{new Date(comment.created_at * 1000).toLocaleDateString('en-CA')}</time></div>
      <p>{comment.body}</p><button className="text-button" disabled={busy} onClick={() => { setReplyTo(comment.id); input.current?.focus(); }}>Reply to {comment.author_name}</button>
      {children(comment.id).length > 0 && <ol className={depth < 2 ? 'replies' : ''}>{children(comment.id).map(child => thread(child, depth + 1))}</ol>}</li>;
  }
  return <>
    <header className="workspace-heading">{!guestToken&&<button className="secondary" onClick={onBack} disabled={busy}>← Projects</button>}<div><p className="eyebrow">{data?.review.type==='site'?'WEBSITE':'IMAGE'} REVIEW</p><h1>{data?.review.name ?? 'Review'}</h1></div>{!guestToken&&<ShareControls id={id}/>}</header>
    {error && <div className="error" role="alert">{error} <button className="text-button" onClick={() => { setError(''); void refresh().catch(e => setError(e.message)); }}>Reload review</button></div>}
    {!data ? <p role="status">{error ? 'Review unavailable.' : 'Loading review…'}</p> : guestToken&&!data.guest?<section className="empty-state"><h2>Welcome to the review</h2><p>Add your name so everyone knows whose feedback it is.</p><form className="auth-form" onSubmit={e=>{e.preventDefault();void join();}}><label>Your name<input autoComplete="name" maxLength={120} required value={author} onChange={e=>setAuthor(e.target.value)} disabled={busy}/></label><label>Email (optional)<input type="email" autoComplete="email" value={guestEmail} onChange={e=>setGuestEmail(e.target.value)} disabled={busy}/></label><button disabled={busy||!author.trim()}>Open review</button></form></section>:<div className="workspace-grid">
      {data.review.type==='site'&&!data.review.screenshot_mode?<div><div className="width-toolbar"><label>Width<select aria-label="Width" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={1440}>Desktop · 1440</option><option value={768}>Tablet · 768</option><option value={390}>Mobile · 390</option></select></label><label className="checkbox"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>Show all pages and widths</label></div><SiteLayer jump={jump} url={siteUrl??data.review.frame_url!} pins={data.pins.filter(pin=>filter==='all'||pin.status===filter)} activeId={active} width={width} showAll={showAll} onPage={setPagePath} onSelect={pin=>{if(!busy)select(pin);}} onCreate={point => { if (!busy) { setPending(point); setActive(null); setBody(''); setReplyTo(null); setTimeout(() => input.current?.focus(), 0); } }}/><p className="muted">{pagePath}</p></div> : <div>{data.review.screenshot_mode&&<p className="muted">Saved page capture · {data.review.screenshot_width}px · {new Date((data.review.captured_at??0)*1000).toLocaleString('en-CA')}</p>}<PinLayer key={id+':'+(data.review.capture_version??'image')} src={`/api${base}/${data.review.screenshot_mode?'snapshot':'image'}${data.review.screenshot_mode?'?v='+encodeURIComponent(data.review.capture_version??''):''}`}  name={data.review.name} pins={visiblePins.map(pin=>data.review.screenshot_mode?{...pin,x_pct:pin.page_x_pct??pin.x_pct,y_pct:pin.page_y_pct??pin.y_pct}:pin)} activeId={active} pending={pending} onSelect={select} onCreate={point => { if (!busy) { setPending(point); setActive(null); setBody(''); setReplyTo(null); setTimeout(() => input.current?.focus(), 0); } }} /></div>}
      <aside className="feedback" aria-label="Review feedback">{data.review.type==='site'&&!guestToken&&<CaptureControls id={id} path={pagePath} width={width} enabled={!!data.review.screenshot_mode} onChange={refresh}/>} <div className="sidebar-title"><h2>Feedback <span>{data.pins.length}</span></h2><label>Show<select aria-label="Show" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All pins</option></select></label></div>
        <ol className="pin-list">{visiblePins.map((pin,index) => <Fragment key={pin.id}>{data.review.type==='site'&&(index===0||visiblePins[index-1].page_path!==pin.page_path)&&<li className="page-label"><h3>{pin.page_path}</h3></li>}<li><button className={active === pin.id ? 'selected' : ''} aria-pressed={active === pin.id} disabled={busy} onClick={() => select(pin, true)}><span className="number">{pin.number}</span><span>{data.comments.find(comment => comment.pin_id === pin.id)?.body ?? 'Feedback'}<small>{data.review.type==='site'?`${pin.page_path} · ${pin.viewport}px · `:''}{pin.status === 'resolved' ? 'Resolved' : 'Open'}</small></span></button></li></Fragment>)}</ol>
        {!visiblePins.length && <p className="muted">{data.pins.length ? 'No pins match this filter.' : 'No feedback yet. Place your first pin to start a conversation.'}</p>}
        {(selected || pending) && <section className="thread" aria-label={pending ? 'New pin comment' : `Pin ${selected?.number} conversation`}>
          <div className="thread-heading"><h3>{pending ? 'New pin' : `Pin ${selected?.number}`}</h3>{selected && !guestToken && <button className="secondary" disabled={busy} onClick={() => void toggleStatus()}>{selected.status === 'open' ? 'Resolve pin' : 'Reopen pin'}</button>}</div>
          {selected&&data.review.type==='site'&&<div className="pin-capture">{selected.screenshot_key?<a href={`/api${guestToken?`${base}/pins/${selected.id}`:`/pins/${selected.id}`}/screenshot`} target="_blank" rel="noreferrer"><img alt={`Saved page capture for pin ${selected.number}`} src={`/api${guestToken?`${base}/pins/${selected.id}`:`/pins/${selected.id}`}/screenshot`}/></a>:<p className="muted">{selected.screenshot_status==='failed'?'Page capture unavailable. Your feedback is saved.':'Page capture pending. Reload to check it.'}{!guestToken&&<button className="text-button" onClick={()=>{void api(`/pins/${selected.id}/capture`,json('POST',{})).then(refresh).catch(e=>setError(e.message));}}>Retry page capture</button>}</p>}<p className="muted">Page captures may differ from interactive or signed-in content.</p></div>}<ol className="comments">{children(null).map(comment => thread(comment))}</ol>
          <form onSubmit={e => { e.preventDefault(); void save(); }}><label>Your name<input value={author} readOnly maxLength={120} required/></label>
            <label>{pending ? 'Comment' : replyTo ? `Reply to ${comments.find(c => c.id === replyTo)?.author_name ?? 'comment'}` : 'Add a reply'}<textarea ref={input} value={body} maxLength={10000} required rows={4} onChange={e => setBody(e.target.value)} disabled={busy}/></label>
            <div className="form-actions"><button disabled={busy || !body.trim() || !author.trim()}>{busy ? 'Saving…' : pending ? 'Save pin' : 'Post reply'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setPending(null); setReplyTo(null); setBody(''); if (!selected) document.querySelector<HTMLElement>('.pin-surface')?.focus(); }}>Cancel</button></div>
          </form></section>}
      </aside>
    </div>}
  </>;
}
