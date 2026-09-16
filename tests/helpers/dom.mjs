import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fixtureClient } from './fixture.mjs';
export const root = path.resolve(import.meta.dirname,'../..');
export const settle = async () => { for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0)); };
export async function mount(page,options={}) {
 const errors=[];const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));virtualConsole.on('error',(...args)=>errors.push(args.join(' ')));
 const dom=new JSDOM(await fs.readFile(path.join(root,page),'utf8'),{url:'https://example.test/efootball-friends-league/'+page,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const {window}=dom;Object.defineProperty(window,'crypto',{value:webcrypto});window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const client=fixtureClient(options);window.supabase={createClient:()=>client};window.console.warn=()=>{};
 const context=dom.getInternalVMContext();const modules=new Map();
 async function moduleFor(file){file=path.resolve(file);if(!modules.has(file))modules.set(file,new vm.SourceTextModule(fsSync.readFileSync(file,'utf8'),{identifier:file,context}));return modules.get(file);}
 for(const script of window.document.querySelectorAll('script[src]')){
  if(script.src.startsWith('https://cdn.'))continue;
  const file=path.resolve(root,path.dirname(page),script.getAttribute('src'));
  if(script.type==='module'){const mod=await moduleFor(file);await mod.link((specifier,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),specifier)));await mod.evaluate();}
  else vm.runInContext(await fs.readFile(file,'utf8'),context,{filename:file});
 }
 await settle();
 return {window,document:window.document,client,errors,module:rel=>modules.get(path.join(root,rel))?.namespace,close(){window.dispatchEvent(new window.Event('pagehide'));window.close();}};
}
