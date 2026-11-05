import { useEffect, useRef, useState } from 'react';
import { api, ApiError, json, type Project, type Review } from './api';

export function Projects({ onReview }: { onReview: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [client, setClient] = useState('');
  const [siteUrl,setSiteUrl]=useState('');
  const [siteName,setSiteName]=useState('');
  const [name, setName] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const active = projects.find(project => project.id === selected);
  const requestVersion = useRef(0);
  async function reload() { const result = await api<{projects: Project[]}>('/projects'); setProjects(result.projects); }
  useEffect(() => { const abort = new AbortController();
    api<{projects: Project[]}>('/projects', {}, abort.signal).then(result => setProjects(result.projects)).catch(e => { if (!abort.signal.aborted) { if (e instanceof ApiError && e.status === 401) setLocked(true); else setError(e.message); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const version = ++requestVersion.current; const abort = new AbortController();
    setReviews([]); setEditing(false);
    if (!selected) { setReviewLoading(false); return; }
    setReviewLoading(true);
    api<{reviews: Review[]}>(`/projects/${selected}/reviews`, {}, abort.signal).then(result => { if (requestVersion.current === version) setReviews(result.reviews); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (requestVersion.current === version) setReviewLoading(false); });
    return () => abort.abort();
  }, [selected]);
  async function saveProject() {
    if (busy) return; setBusy(true); setError('');
    try {
      const result = await api<{project: Project}>(editing && active ? `/projects/${active.id}` : '/projects', json(editing ? 'PATCH' : 'POST', { client_name: client, name }));
      setCreating(false); setEditing(false); await reload(); setSelected(result.project.id); setClient(''); setName('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function archive() {
    if (!active || busy) return; setBusy(true); setError('');
    try { await api(`/projects/${active.id}`, json('PATCH', { archived: !active.archived })); await reload(); if (!active.archived && !showArchived) setSelected(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function uploadImage(file?: File) {
    if (!file || !active || busy) return;
    if (file.size > 25 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPG or WebP image up to 25 MB.'); return; }
    setBusy(true); setError('');
    try { const result = await api<{review: Review}>(`/projects/${active.id}/reviews`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file }); onReview(result.review.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); if (upload.current) upload.current.value = ''; }
  }
  async function addSite(){
    if(!active||busy)return;setBusy(true);setError('');
    try{const result=await api<{review:Review}>(`/projects/${active.id}/sites`,json('POST',{source_url:siteUrl,name:siteName}));onReview(result.review.id);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const visible = projects.filter(project => showArchived || !project.archived);
  const clients = [...new Set(visible.map(project => project.client_name))];
  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Projects</h1><p>Keep every design and conversation in one place.</p></div>{!locked && !loading && <button onClick={() => { setCreating(true); setEditing(false); setClient(''); setName(''); }}>New project</button>}</header>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading projects…</p> : locked ? <section className="empty-state"><h2>Your workspace is private.</h2><p>Sign-in is being prepared. Your projects and feedback will be available here when it is ready.</p><a href="/api/health">Check service health</a></section> : <>
      {(creating || editing) && <form className="project-form" onSubmit={e => { e.preventDefault(); void saveProject(); }}><h2>{editing ? 'Edit project' : 'Create a project'}</h2><label>Client name<input required maxLength={120} value={client} onChange={e => setClient(e.target.value)} disabled={busy} autoFocus/></label><label>Project name<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} disabled={busy}/></label><div className="form-actions"><button disabled={busy || !client.trim() || !name.trim()}>{busy ? 'Saving…' : 'Save project'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setCreating(false); setEditing(false); }}>Cancel</button></div></form>}
      <div className="projects-grid"><aside className="project-nav" aria-label="Projects by client"><label className="checkbox"><input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); if (!e.target.checked && active?.archived) setSelected(null); }} disabled={busy}/>Include archived</label>
        {clients.map(group => <section key={group}><h2>{group}</h2><ul>{visible.filter(project => project.client_name === group).map(project => <li key={project.id}><button className={selected === project.id ? 'selected' : ''} aria-pressed={selected === project.id} disabled={busy} onClick={() => { setSelected(project.id); setCreating(false); }}>{project.name}{project.archived ? <small>Archived</small> : null}</button></li>)}</ul></section>)}
        {!visible.length && <p className="muted">No projects yet. Create one to start collecting feedback.</p>}
      </aside><section className="review-list" aria-label="Project reviews">{!active ? <div className="empty-state"><h2>A little clarity for every project.</h2><p>Choose a project or create one, then upload a design to start a review.</p></div> : <>
        <div className="project-heading"><div><p className="eyebrow">{active.client_name}</p><h2>{active.name}</h2></div><div className="form-actions"><button className="secondary" disabled={busy} onClick={() => { setEditing(true); setCreating(false); setClient(active.client_name); setName(active.name); }}>Edit</button><button className="secondary" disabled={busy} onClick={() => void archive()}>{active.archived ? 'Restore' : 'Archive'}</button></div></div>
        {!active.archived && <div className="upload-box"><label htmlFor="image-upload">Upload a design</label><p>PNG, JPG or WebP · Up to 25 MB</p><input ref={upload} id="image-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void uploadImage(e.target.files?.[0])}/>{busy && <p role="status">Saving…</p>}</div>}
        {!active.archived&&<form className="project-form" onSubmit={e=>{e.preventDefault();void addSite();}}><h3>Review a website</h3><label>Website URL<input type="url" required value={siteUrl} onChange={e=>setSiteUrl(e.target.value)} placeholder="https://client.example.com" disabled={busy}/></label><label>Review name<input required maxLength={240} value={siteName} onChange={e=>setSiteName(e.target.value)} disabled={busy}/></label><button disabled={busy||!siteUrl||!siteName}>Add website</button></form>}
        {reviewLoading ? <p role="status">Loading reviews…</p> : !reviews.length ? <p className="muted">No reviews in this project yet.</p> : <ul className="review-cards">{reviews.map(review => <li key={review.id}><button onClick={() => onReview(review.id)} disabled={busy}><span className="review-kind">{review.type === 'image' ? 'IMAGE' : 'WEBSITE'}</span><strong>{review.name}</strong><span>Open review ↗</span></button></li>)}</ul>}
      </>}</section></div>
    </>}
  </>;
}
