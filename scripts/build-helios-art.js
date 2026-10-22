// Companion game UI assets using the editor's actual pixel/vector document schemas.
import fs from "node:fs/promises";
import { emptyArt, validateArt, compositePixels, frameSVG, atlasLayout } from "../src/art-document.js";
const out = process.argv[2] ?? "examples/helios";
await fs.mkdir(out, { recursive: true });
const d = emptyArt("pixel",96,96);
d.name = "HELIOS · reactor inventory icon";
d.palette = ["#00000000","#101f2cff","#203d4aff","#316472ff","#68a1a5ff","#825e35ff","#c09655ff","#f2d690ff","#237e86ff","#36c5b7ff","#a4ffe1ff","#fff5c5ff","#eea84aff","#9f5736ff"];
d.frames = [];
for(let frame=0;frame<16;frame++) {
  const phase=frame/16*Math.PI*2;
  const layers=["Armor","Core","Particles"].map((name,i)=>({id:`layer-${i}`,name,visible:true,opacity:1,pixels:Array(96*96).fill(0)}));
  let target=layers[0].pixels;
  const pixel=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<96&&y<96)target[y*96+x]=c;};
  const poly=(points,color)=>{
    for(let y=0;y<96;y++)for(let x=0;x<96;x++) {
      let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const [a,b]=points[i],[c,e]=points[j];
        if((b>y+.5)!==(e>y+.5)&&(x+.5)<(c-a)*(y+.5-b)/(e-b)+a)inside=!inside;
      }
      if(inside)pixel(x,y,color);
    }
  };
  const line=(a,b,c)=>{const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=count;i++)pixel(a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count,c);};
  const mirror=(p,s)=>p.map(([x,y])=>[48+s*x,y]);
  for(const s of [-1,1]) for(const lower of [false,true]) {
    const wing=[[16,37],[24,30],[44,19],[41,30],[30,40],[19,45]];
    const transform=p=>mirror(p.map(([x,y])=>[x,lower?91-y:y]),s);
    poly(transform(wing),1);
    poly(transform([[18,38],[25,32],[41,22],[38,30],[29,38],[20,42]]),6);
    poly(transform([[20,37],[26,33],[38,26],[35,32],[27,37],[21,40]]),3);
    for(let i=0;i<4;i++)line(...[transform([[24+i*3,34-i],[25+i*3,37-i]])[0],transform([[24+i*3,34-i],[25+i*3,37-i]])[1],4]);
  }
  poly([[44,21],[48,9],[52,21],[51,28],[45,28]],6);
  poly([[46,21],[48,14],[50,21],[49,27],[47,27]],3);
  poly([[44,64],[48,79],[52,64],[50,59],[46,59]],6);
  for(let y=22;y<67;y++)for(let x=25;x<71;x++) {
    const dx=x-48,dy=y-44,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    if(r>=17&&r<=23)pixel(x,y,r>21?6:r<18?5:2);
    if(r>18.4&&r<20.5&&Math.cos(angle*12)>.45)pixel(x,y,9);
  }
  target=layers[1].pixels;
  const pulse=Math.sin(phase);
  poly([[48,32],[54,43],[48,57],[42,43]],12);
  poly([[48,34],[51,43],[48,54],[45,43]],7);
  poly([[48,36],[49,43],[48,51],[47,43]],11);
  for(let j=0;j<3;j++) {
    const angle=phase+j*Math.PI*2/3;
    const a=[48+12*Math.cos(angle),44+12*Math.sin(angle)];
    const b=[48+14*Math.cos(angle+.7),44+14*Math.sin(angle+.7)];
    line(a,b,10);pixel(a[0],a[1]-1,9);
  }
  target=layers[2].pixels;
  for(let j=0;j<6;j++) {
    const a=phase*.6+j*Math.PI/3,r=26+2*Math.sin(phase+j);
    pixel(48+r*Math.cos(a),44+r*Math.sin(a),j%2?7:9);
  }
  d.frames.push({id:`charge-${frame}`,name:`Charge ${frame+1}`,duration:125,layers});
}
validateArt(d);
await fs.writeFile(`${out}/helios-icon.art.json`,JSON.stringify(d));
await fs.writeFile(`${out}/icon-frames.rgba`,Buffer.concat(d.frames.map((_,i)=>Buffer.from(compositePixels(d,i)))));
await fs.writeFile(`${out}/helios-icon-atlas.json`,JSON.stringify(atlasLayout(d,{padding:2}),null,2));

const v=emptyArt("vector",256,256);v.name="HELIOS · vector insignia";
const paths=v.frames[0].layers[0].paths;
const path=(p,fill,stroke,width=2)=>paths.push({d:p.map((q,i)=>[i?"L":"M",...q]).concat([["Z"]]),fill,...(stroke?{stroke,strokeWidth:width}:{})});
for(const s of [-1,1])for(const k of [1,-1]) {
  const wing=[[48,-15],[68,-30],[116,-67],[104,-33],[78,-10],[51,2]];
  path(wing.map(([x,y])=>[128+s*x,128+k*y]),{linear:{from:[0,40],to:[0,210],stops:[[0,"#f2d690"],[1,"#825e35"]]}},"#d6b478",1);
  path([[57,-16],[72,-28],[104,-53],[96,-33],[77,-16]].map(([x,y])=>[128+s*x,128+k*y]),"#24515b");
}
for(let j=0;j<12;j++) {
  const a=j*Math.PI/6,p=[];
  for(let i=0;i<=6;i++){const t=a+.05+i*(Math.PI/6-.1)/6;p.push([128+49*Math.cos(t),128+49*Math.sin(t)]);}
  for(let i=6;i>=0;i--){const t=a+.05+i*(Math.PI/6-.1)/6;p.push([128+39*Math.cos(t),128+39*Math.sin(t)]);}
  path(p,j%2?"#bc9053":"#24515b","#d6b478",1);
}
path([[128,96],[143,128],[128,160],[113,128]],{linear:{from:[128,96],to:[128,160],stops:[[0,"#fff5c5"],[1,"#eea84a"]]}},"#fff5c5",2);
for(const s of [-1,1])path([[128,128+s*57],[119,128+s*68],[128,128+s*104],[137,128+s*68]],"#bc9053");
validateArt(v);
await fs.writeFile(`${out}/helios-emblem.art.json`,JSON.stringify(v));
await fs.writeFile(`${out}/helios-emblem.svg`,frameSVG(v));
console.log("HELIOS: 16-frame layered pixel source, RGBA frames, atlas metadata, vector source and SVG");
