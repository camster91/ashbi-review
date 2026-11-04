import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Projects } from './Projects';
import { ReviewWorkspace } from './ReviewWorkspace';
import './style.css';
function App() {
  const readId = () => new URLSearchParams(location.search).get('review');
  const [id, setId] = useState(readId);
  useEffect(() => { const back = () => setId(readId()); addEventListener('popstate', back); return () => removeEventListener('popstate', back); }, []);
  function navigate(review: string | null) { const url = new URL(location.href); if (review) url.searchParams.set('review', review); else url.searchParams.delete('review'); history.pushState(null, '', url); setId(review); window.scrollTo(0, 0); }
  return <><div className="brandbar"><a href="/" onClick={e => { e.preventDefault(); navigate(null); }}>ASHBI <span>REVIEW</span></a><span>Thoughtful feedback. Clear next steps.</span></div><main>{id ? <ReviewWorkspace key={id} id={id} onBack={() => navigate(null)}/> : <Projects onReview={navigate}/>}</main></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
