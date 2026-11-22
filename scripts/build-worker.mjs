import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root=process.cwd(),output=join(root,'out'),assets={};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(!entry.name.endsWith('.map')){const ext=entry.name.slice(entry.name.lastIndexOf('.'));assets['/'+relative(output,path).replaceAll('\\','/')]={body:(await readFile(path)).toString('base64'),type:mime[ext]||'application/octet-stream'};}}}
await walk(output);const html=await readFile(join(output,'index.html'),'utf8');const scriptHashes=Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
await mkdir(join(root,'dist/server'),{recursive:true});await mkdir(join(root,'dist/.openai'),{recursive:true});
await build({entryPoints:[join(root,'server/worker.ts')],outfile:join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,plugins:[{name:'inline-site-assets',setup(b){b.onResolve({filter:/^site-assets$/},()=>({path:'site-assets',namespace:'assets'}));b.onLoad({filter:/.*/,namespace:'assets'},()=>({contents:`export const assets=${JSON.stringify(assets)};export const scriptHashes=${JSON.stringify(scriptHashes)};`,loader:'js'}));}}]});
await copyFile(join(root,'.openai/hosting.json'),join(root,'dist/.openai/hosting.json'));
console.log(`Worker built with ${Object.keys(assets).length} embedded assets and server API.`);
