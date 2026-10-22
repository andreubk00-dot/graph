// Actual shared editor renders: a camera overview of a static 3D asset and a 2D icon preview.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {rune} from '../src/art-examples.js';
const doc=JSON.parse(await fs.readFile('examples/warden.graph.json','utf8'));
const root=doc.nodes.find(n=>n.id==='warden'),duration=2.4;
doc.duration=duration;doc.clips=[{id:'overview',name:'Turntable preview',duration,tracks:{warden:Array.from({length:5},(_,i)=>({time:i*duration/4,position:root.position,rotation:[0,i*Math.PI/2,0],scale:root.scale}))}}];
const icon=rune(),original=icon.frames[0];icon.frames=Array.from({length:16},(_,i)=>{
 const f=structuredClone(original),phase=i/16*Math.PI*2,a=.045*Math.sin(phase),dy=7*Math.sin(phase),c=Math.cos(a),s=Math.sin(a);
 const point=(x,y)=>[256+(x-256)*c-(y-256)*s,256+(x-256)*s+(y-256)*c+dy];
 f.id=`preview-${i}`;f.name=`Float ${i+1}`;f.duration=100;
 for(const l of f.layers){if(l.id==='accents')l.opacity=.65+.35*Math.sin(phase+1);for(const p of l.paths){p.d=p.d.map(([op,...v])=>[op,...v.flatMap((_,j)=>j%2?[]:point(v[j],v[j+1]))]);if(p.fill?.linear){const g=p.fill.linear;g.from=point(...g.from);g.to=point(...g.to);}}}
 return f;
});
const server=await createServer({root:process.cwd(),logLevel:'error',server:{host:'127.0.0.1',port:0}});let browser;
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:768,height:768}});page.setDefaultTimeout(90000);
 await page.addInitScript(()=>{const request=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>request(time=>{if(!window.__capturePaused)callback(time);});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.forge);
 await page.addStyleTag({content:'.viewport{position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh}.viewport>:not(canvas){display:none!important}'});
 await page.waitForTimeout(200);
 await page.evaluate(d=>{window.forge.load(d);window.forge.select(null);window.forge.setClip('overview');window.forge.seek(0);document.querySelector('#grid').click();window.forge.focus();},doc);
 await page.mouse.move(700,700);await page.mouse.wheel(0,-200);await page.waitForTimeout(300);
 await page.evaluate(()=>window.__capturePaused=true);await page.waitForTimeout(200);
 await fs.mkdir('/tmp/warden-gallery',{recursive:true});
 for(let i=0;i<24;i++){const data=await page.evaluate(t=>{window.forge.seek(t);return window.forge.screenshot();},i*duration/24);await fs.writeFile(`/tmp/warden-gallery/${String(i).padStart(3,'0')}.png`,Buffer.from(data.split(',')[1],'base64'));if(i%8===0)console.log(`Warden ${i+1}/24`);}
 await fs.mkdir('/tmp/tideglass-gallery',{recursive:true});
 for(let i=0;i<16;i++){const data=await page.evaluate(async({d,i})=>{const {artPNG}=await import('/src/art-render.js');return artPNG(d,i);},{d:icon,i});await fs.writeFile(`/tmp/tideglass-gallery/${String(i).padStart(3,'0')}.png`,Buffer.from(data.split(',')[1],'base64'));}
 if(errors.length)throw new Error(errors.join('\n'));console.log('Rendered Warden overview and Tideglass floating-icon preview.');
}finally{await browser?.close();await server.close();}
