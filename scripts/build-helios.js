// Authored Graph Forge showcase. All asset geometry and animation live in Graph JSON.
import fs from "node:fs/promises";
import * as T from "three";
import { emptyDocument, makeNode, validateDocument, poseFor } from "../src/document.js";
import { geometryFor, createGLB } from "../src/scene.js";
import { stripEmptyFaces } from "../src/mesh-audit.js";
import { bakeMeshGeometry } from "../src/mesh-convert.js";

const out = process.argv[2] ?? "examples/helios";
await fs.mkdir(out, { recursive: true });
const doc = emptyDocument();
doc.name = "HELIOS · Autonomous solar reliquary";
doc.duration = 6; doc.fps = 24;
const mats = {
  armor: { color: "#24515b", metalness: .78, roughness: .29 },
  dark: { color: "#152329", metalness: .72, roughness: .36 },
  gold: { color: "#bc9053", metalness: .85, roughness: .25 },
  silver: { color: "#a6babe", metalness: .85, roughness: .23 },
  cyan: { color: "#93f5df", metalness: .28, roughness: .24, emissive: "#22d4bd", emissiveIntensity: 2.4 },
  amber: { color: "#ffe6a1", metalness: .15, roughness: .27, emissive: "#ff9a32", emissiveIntensity: 3 },
};
function add(type, id, parent, options = {}, mat = "dark") {
  const n = makeNode(type, { id, name: id.replaceAll("-", " "), parent,
    position: [0,0,0], ...mats[mat], ...options });
  doc.nodes.push(n); return n;
}
function mesh(id, parent, buffer, mat, options = {}) {
  let data = { positions: Array.from(buffer.attributes.position.array),
    normals: Array.from(buffer.attributes.normal.array), smooth: true };
  if (buffer.index) data.indices = Array.from(buffer.index.array);
  if (buffer.attributes.uv) data.uv = Array.from(buffer.attributes.uv.array);
  data = stripEmptyFaces(data); buffer.dispose();
  // Exact attribute tuples only: reduce delivery size without welding UV/normal
  // seams, rounding coordinates or changing the rendered triangle stream.
  const indexed={positions:[],normals:[],smooth:true,indices:[]};
  if(data.uv)indexed.uv=[];
  const slots=new Map();
  for(let i=0;i<data.positions.length/3;i++) {
    const tuple=[...data.positions.slice(i*3,i*3+3),...data.normals.slice(i*3,i*3+3),...(data.uv?.slice(i*2,i*2+2)??[])];
    const key=tuple.join(',');
    if(!slots.has(key)) {
      slots.set(key,indexed.positions.length/3);
      indexed.positions.push(...tuple.slice(0,3));indexed.normals.push(...tuple.slice(3,6));
      if(indexed.uv)indexed.uv.push(...tuple.slice(6));
    }
    indexed.indices.push(slots.get(key));
  }
  data=indexed;
  return add("mesh", id, parent, { geometry: data, ...options }, mat);
}
function plate(id, parent, outline, depth, mat, position = [0,0,0], bevel = .015) {
  const s = new T.Shape(outline.map(p => new T.Vector2(...p)));
  const b = new T.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1,
    curveSegments: 1 }).translate(0,0,-depth/2);
  return mesh(id,parent,b,mat,{position});
}
function ring(id, parent, radius, tube, mat, position = [0,0,0], rotation = [0,0,0]) {
  return mesh(id,parent,new T.TorusGeometry(radius,tube,8,72),mat,{position,rotation});
}
function rod(id,parent,a,b,r,mat) {
  const av = new T.Vector3(...a), bv = new T.Vector3(...b), delta = bv.clone().sub(av);
  const geo = new T.CylinderGeometry(r,r,delta.length(),10);
  geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
  geo.translate(...av.add(bv).multiplyScalar(.5).toArray());
  return mesh(id,parent,geo,mat);
}
function arc(id,parent,r0,r1,a0,a1,depth,mat,z=0) {
  const p = [], steps = Math.ceil((a1-a0)*18);
  for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps;p.push([r1*Math.cos(a),r1*Math.sin(a)]);}
  for(let i=steps;i>=0;i--){const a=a0+(a1-a0)*i/steps;p.push([r0*Math.cos(a),r0*Math.sin(a)]);}
  return plate(id,parent,p,depth,mat,[0,0,z],.008);
}
function cappedTube(curve) {
  const tube=new T.TubeGeometry(curve,30,.018,6,false);
  const p=Array.from(tube.attributes.position.array),n=Array.from(tube.attributes.normal.array),uv=Array.from(tube.attributes.uv.array),ix=Array.from(tube.index.array);
  for(const end of [0,1]) {
    const center=curve.getPointAt(end),normal=curve.getTangentAt(end).multiplyScalar(end?1:-1),id=p.length/3,start=end?30*7:0;
    p.push(...center.toArray());n.push(...normal.toArray());uv.push(.5,.5);
    for(let j=0;j<6;j++) {
      const a=start+j,b=start+j+1;
      const va=new T.Vector3().fromArray(p,a*3).sub(center),vb=new T.Vector3().fromArray(p,b*3).sub(center);
      ix.push(...(va.cross(vb).dot(normal)>0?[id,a,b]:[id,b,a]));
    }
  }
  tube.setAttribute('position',new T.Float32BufferAttribute(p,3));tube.setAttribute('normal',new T.Float32BufferAttribute(n,3));tube.setAttribute('uv',new T.Float32BufferAttribute(uv,2));tube.setIndex(ix);
  return tube;
}
const root = add("group","helios",null,{position:[0,2.55,0]});
add("group","rotor","helios");
add("group","heart","helios");
// Machined annular housing: separate inset panels, fasteners and front/back rims.
for(let i=0;i<12;i++) {
  const a = i*Math.PI/6;
  arc(`housing-${i}`,"helios",.91,1.12,a+.022,a+Math.PI/6-.022,.29,"armor");
  arc(`housing-inlay-${i}`,"helios",1.016,1.036,a+.065,a+Math.PI/6-.065,.014,"gold",.177);
  const mid=a+Math.PI/12;
  mesh(`housing-bolt-${i}`,"helios",new T.CylinderGeometry(.032,.032,.025,6),"silver",{
    position:[1.065*Math.cos(mid),1.065*Math.sin(mid),.19],rotation:[Math.PI/2,0,0]});
  arc(`charge-slot-${i}`,"helios",.918,.945,a+.085,a+.28,.014,"cyan",.18);
}
ring("front-lip","helios",1.115,.019,"gold",[0,0,.175]);
ring("back-lip","helios",1.115,.025,"dark",[0,0,-.175]);
ring("inner-bearing","helios",.864,.048,"dark");
ring("inner-guide","helios",.82,.014,"gold",[0,0,.13]);
ring("rotor-rim","rotor",.72,.025,"gold",[0,0,.04]);
for(let i=0;i<24;i++) {
  const a=i*Math.PI/12;
  plate(`rotor-tooth-${i}`,"rotor",[[-.025,-.07],[.025,-.07],[.035,.06],[-.035,.06]],.07,"silver",
    [.775*Math.cos(a),.775*Math.sin(a),-.03]).rotation=[0,0,a-Math.PI/2];
}
// Faceted crystal and two counter-oriented gimbals, with a real open center.
mesh("heart-crystal","heart",new T.IcosahedronGeometry(.39,0),"amber",{scale:[.85,1.48,.85]});
add("group","gimbal-a","helios",{rotation:[.5,.4,0]});
add("group","gimbal-b","helios",{rotation:[-.45,-.55,0]});
ring("gimbal-a-band","gimbal-a",.565,.021,"gold");
ring("gimbal-b-band","gimbal-b",.615,.014,"cyan");
for(let i=0;i<6;i++) {
  const a=i*Math.PI/3;
  mesh(`core-prong-${i}`,"rotor",new T.ConeGeometry(.043,.19,4),"gold",{
    position:[.62*Math.cos(a),.62*Math.sin(a),.06],rotation:[0,0,a+Math.PI/2]});
}
// Four articulated, swept armor vanes: silhouette, inset, struts and cooling ribs.
const wings=[];
const outline=[[0,-.13],[.55,-.23],[1.36,.04],[1.8,.39],[1.94,.77],[1.72,.87],[.72,.45],[.14,.21]];
for(const side of [-1,1]) for(const tier of [0,1]) {
  const label=`vane-${side<0?"left":"right"}-${tier}`, sign=side;
  const angle=side*(tier===0?.18:-.78);
  const wing=add("group",label,"helios",{position:[side*1.02,tier===0?.15:-.13,-.06],rotation:[0,0,angle]});
  wings.push(wing);
  plate(`${label}-rim`,label,outline.map(([x,y])=>[sign*x,y]),.15,"gold");
  plate(`${label}-armor`,label,outline.map(([x,y])=>[sign*(x*.94+.035),y*.86+.015]),.11,"armor",[0,0,.095],.012);
  plate(`${label}-spine`,label,[[.12,.02],[.65,.21],[1.7,.72],[1.77,.7],[.65,.12],[.12,-.04]].map(([x,y])=>[sign*x,y]),.03,"dark",[0,0,.169],.005);
  rod(`${label}-spine-inlay`,label,[sign*.18,.04,.195],[sign*1.68,.66,.195],.013,"cyan");
  for(let j=0;j<7;j++) {
    const x=.5+j*.145, y=.035+(x-.5)*.33;
    rod(`${label}-rib-${j}`,label,[sign*x,y-.11,.185],[sign*(x+.07),y+.12,.185],.017,"silver");
  }
  for(const x of [.3,1.65]) mesh(`${label}-pin-${Math.round(x*100)}`,label,new T.CylinderGeometry(.025,.025,.025,6),"gold",{
    position:[sign*x,x<1?.14:.65,.19],rotation:[Math.PI/2,0,0]});
  mesh(`${label}-hinge`,label,new T.CylinderGeometry(.13,.13,.27,20),"dark",{rotation:[Math.PI/2,0,0]});
  mesh(`${label}-hinge-cap`,label,new T.CylinderGeometry(.085,.085,.035,12),"gold",{position:[0,0,.16],rotation:[Math.PI/2,0,0]});
  ring(`${label}-hinge-light`,label,.06,.01,"cyan",[0,0,.183]);
}
// Crown and keel retain a single visual axis and a deliberate tapered silhouette.
for(const [label,flip] of [["crown",1],["keel",-1]]) {
  plate(label,"helios",[[-.19,.94],[-.23,1.2],[0,1.64],[.23,1.2],[.19,.94]].map(([x,y])=>[x,y*flip]),.22,"gold");
  plate(`${label}-inset`,"helios",[[-.11,1.04],[0,1.49],[.11,1.04]].map(([x,y])=>[x,y*flip]),.06,"dark",[0,0,.16]);
  rod(`${label}-trace`,"helios",[0,flip*1.08,.205],[0,flip*1.42,.205],.012,"cyan");
}
// Braided, curved conduits across the back of the housing.
for(const side of [-1,1]) for(let j=0;j<3;j++) {
  const curve=new T.CatmullRomCurve3([[side*.25,-1,-.16],[side*.66,-.87,-.34-j*.035],[side*1.05,-.3,-.34-j*.035],[side*.95,.25,-.17]].map(p=>new T.Vector3(...p)));
  mesh(`conduit-${side}-${j}`,"helios",cappedTube(curve),j===1?"gold":"dark");
}
// Profile-authored docking pedestal and engraved concentric deck details.
add("lathe","dock",null,{position:[0,.02,0],geometry:{segments:64,smooth:true,profile:[
  [0,0],[1.38,0],[1.43,.07],[1.43,.15],[1.31,.22],[1.2,.24],[1.2,.32],[1.05,.38],[.65,.38],[.58,.45],[.58,.57],[.49,.62],[0,.62],
]}},"dark");
ring("dock-rim",null,1.31,.022,"gold",[0,.26,0],[Math.PI/2,0,0]);
ring("dock-emitter",null,.5,.025,"cyan",[0,.66,0],[Math.PI/2,0,0]);
for(let i=0;i<32;i++) {
  const a=2*Math.PI*i/32;
  rod(`dock-tick-${i}`,null,[1.13*Math.cos(a),.405,1.13*Math.sin(a)],[1.24*Math.cos(a),.405,1.24*Math.sin(a)],.008,i%4===0?"gold":"silver");
}
// Named, independent clips. Euler samples stay within quarter turns for glTF slerp.
const track=(n,times,transform)=>times.map(t=>({time:t,position:[...n.position],rotation:[...n.rotation],scale:[...n.scale],...transform(t)}));
const times=Array.from({length:25},(_,i)=>i/4);
const idle={id:"orbit",name:"Orbit · stabilized reactor",duration:6,loop:true,tracks:{}};
idle.tracks.helios=track(root,times,t=>({position:[0,2.55+.075*Math.sin(t/6*Math.PI*2),0]}));
for(const [id,rate] of [["rotor",1],["heart",-.5]]) {
  const n=doc.nodes.find(n=>n.id===id);
  idle.tracks[id]=track(n,times,t=>({rotation:[0,id==="heart"?t/6*Math.PI*2:0,id==="rotor"?t/6*Math.PI*2*rate:0]}));
}
for(const [id,sign] of [["gimbal-a",1],["gimbal-b",-1]]) {
  const n=doc.nodes.find(n=>n.id===id);
  idle.tracks[id]=track(n,times,t=>({rotation:[n.rotation[0],n.rotation[1],sign*t/6*Math.PI*2]}));
}
for(const wing of wings) idle.tracks[wing.id]=track(wing,times,t=>({rotation:[0,.08*Math.sin(t/6*Math.PI*2),wing.rotation[2]+.025*Math.sin(t/6*Math.PI*2)]}));
const deploy={id:"deploy",name:"Deploy · armor vanes",duration:3,loop:false,tracks:{}};
for(const wing of wings) deploy.tracks[wing.id]=track(wing,[0,.5,1,1.5,2,2.5,3],t=>{
  const u=t/3, eased=u*u*(3-2*u), side=wing.id.includes("left")?-1:1;
  return {rotation:[0,side*(1-eased)*1.1,wing.rotation[2]]};
});
doc.clips=[idle,deploy];
// Preserve the editable lathe recipe separately and omit zero-area pole triangles
// from the delivery mesh using the editor's existing conversion operation.
const dock=doc.nodes.find(n=>n.id==='dock');
await fs.writeFile(`${out}/dock-profile.json`,JSON.stringify(dock,null,2));
dock.geometry=bakeMeshGeometry(dock);dock.type='mesh';
const validated=validateDocument(doc);
await fs.writeFile(`${out}/helios.graph.json`,JSON.stringify(validated));
// The offline renderer consumes samples from Graph Forge, not reauthored animation.
const frames=[];
for(let frame=0;frame<48;frame++) {
  const time=frame/8;
  frames.push(Object.fromEntries(validated.nodes.filter(n=>idle.tracks[n.id]).map(n=>[n.id,poseFor(validated,n,time,"orbit")])));
}
await fs.writeFile(`${out}/orbit-samples.json`,JSON.stringify({fps:8,duration:6,frames}));
if(!globalThis.FileReader) globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();},e=>this.onerror?.(e));}};
const bytes=await createGLB(validated);
await fs.writeFile(`${out}/helios.glb`,new Uint8Array(bytes));
let triangles=0,vertices=0;
for(const n of validated.nodes.filter(n=>!["group","bone"].includes(n.type))) {
  const g=geometryFor(n);triangles+=(g.index?.count??g.attributes.position.count)/3;vertices+=g.attributes.position.count;g.dispose();
}
await fs.writeFile(`${out}/manifest.json`,JSON.stringify({name:doc.name,nodes:doc.nodes.length,vertices,triangles,clips:doc.clips.map(c=>({id:c.id,duration:c.duration,tracks:Object.keys(c.tracks).length})),glbBytes:bytes.byteLength,units:"meters",forward:"+Z",up:"+Y",preview:"Render of the actual GLB; studio and labels are presentation-only."},null,2));
console.log(JSON.stringify({out,nodes:doc.nodes.length,triangles,vertices,glbBytes:bytes.byteLength}));
