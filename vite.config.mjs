// Development/QA only; GitHub Pages continues to serve the authored files directly.
import { defineConfig } from 'vite';
import fs from 'node:fs';
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
 }]:[],
}));
