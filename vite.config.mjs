// Development/QA only; GitHub Pages continues to serve the authored files directly.
import { defineConfig } from 'vite';
import fs from 'node:fs';
export default defineConfig(({mode})=>({
 server:{host:'127.0.0.1',port:4173,strictPort:true,allowedHosts:['terminal.local']},
 plugins:mode==='qa'?[{
  name:'isolated-fixture-preview',
  configureServer(server){server.middlewares.use((req,res,next)=>{
   res.setHeader('X-EFL-Environment','isolated-qa');
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname==='/' || pathname==='/__qa__'){
    res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('tests/preview/index.html','utf8'));return;
   }
   next();
  });},
  transformIndexHtml(html,context){
   // Every app entrypoint in QA mode uses fixtures, including navigation links
   // and legacy launchers without a fixture parameter. Live mode is explicit.
   return html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^\"]*"><\/script>/,
    '<script type="module" src="/tests/preview/bootstrap.mjs"></script>');
  },
 }]:[],
}));
