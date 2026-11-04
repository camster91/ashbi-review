import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function App() { return <main><p className="eyebrow">ASHBI DESIGN</p><h1>Ashbi Review</h1><p>A clear place for client feedback.</p><section aria-labelledby="setup"><h2 id="setup">Your review workspace is taking shape.</h2><p>Website and image reviews are being built. Sharing and commenting will be available after the proxy proof is verified.</p><a href="/api/health">Check service health</a></section></main>; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
