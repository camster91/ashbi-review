import {useState} from 'react';
import {api,json} from './api';
export function CaptureControls({id,path,width,enabled,onChange}:{id:string;path:string;width:number;enabled:boolean;onChange:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(capture:boolean){setBusy(true);setError('');try{await api(`/reviews/${id}/${capture?'capture':'mode'}`,json(capture?'POST':'PATCH',capture?{page_path:path,width}:{}));await onChange();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="capture-controls"><div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>void change(true)}>{busy?'Capturing page…':enabled?'Refresh page capture':'Use screenshot mode'}</button>{enabled&&<button className="secondary" disabled={busy} onClick={()=>void change(false)}>Return to website</button>}</div><p className="muted">{enabled?'Comment on this saved full-page image. Refreshing creates a new capture.':'If the website cannot load, capture a full-page image for feedback.'}</p>{error&&<p className="error" role="alert">{error}</p>}</section>;
}
