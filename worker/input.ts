import {InputError,readBounded} from './images';
export async function jsonBody(request:Request):Promise<Record<string,unknown>>{
 const bytes=await readBounded(request,64*1024);try{const data:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data as Record<string,unknown>;}catch{throw new InputError('Invalid request.');}
}
export function text(value:unknown,label:string,max:number):string{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new InputError(`${label} is required (maximum ${max} characters).`);return value.trim();}
export function email(value:unknown):string|null{if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new InputError('Enter a valid email address.');return value.trim().toLowerCase();}
