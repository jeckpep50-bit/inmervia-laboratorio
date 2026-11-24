import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('docs');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
export const server=http.createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Permissions-Policy':'xr-spatial-tracking=(self)'});res.end(data);}catch{res.writeHead(404).end('Archivo no encontrado');}});
const port=Number(process.env.PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
