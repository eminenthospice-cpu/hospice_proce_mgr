import { assets,scriptHashes } from 'site-assets';
import { handleApi } from './api.ts';
import type { Env } from './types.ts';
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const path=new URL(request.url).pathname;
 let response:Response;
 if(path.startsWith('/api/'))response=await handleApi(request,env);
 else if(!['GET','HEAD'].includes(request.method))response=new Response('Method not allowed',{status:405});
 else {const asset=assets[path==='/'?'/index.html':path];if(!asset)response=new Response('Not found',{status:404});else response=new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':path.startsWith('/_next/')?'public, max-age=31536000, immutable':'no-store'}});}
 const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' ${scriptHashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com; form-action 'self'`);if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');return new Response(response.body,{status:response.status,headers});
}};
