// Development/QA only; GitHub Pages continues to serve the authored files directly.
import { defineConfig } from 'vite';
import fs from 'node:fs';
import { localConfig } from './tests/e2e/local-backend.mjs';
export default defineConfig(({mode})=>({
 server:{host:'0.0.0.0',port:4173,strictPort:true,allowedHosts:['terminal.local']},
 plugins:mode==='qa'?[{
  name:'isolated-fixture-preview',
  configureServer(server){server.middlewares.use((req,res,next)=>{
   if(req.url==='/' || req.url==='/__qa__'){
    res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('tests/preview/index.html','utf8'));return;
   }
   next();
  });},
  transformIndexHtml(html,context){
   if(!context.originalUrl?.includes('fixture='))return html;
   return html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^\"]*"><\/script>/,
    '<script type="module" src="/tests/preview/bootstrap.mjs"></script>');
  },
 }]:mode==='e2e'?[{
  name:'isolated-supabase-e2e',
  configureServer(server){
   const config=localConfig();
   server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0]!=='/supabase-config.js')return next();
    res.setHeader('Content-Type','application/javascript');
    res.end('window.SUPABASE_CONFIG = Object.freeze('+JSON.stringify({url:config.API_URL,anonKey:config.ANON_KEY})+');');
   });
  },
 }]:[],
}));
