import * as T from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { makeNode } from "../../src/document.js";
import { stripEmptyFaces } from "../../src/mesh-audit.js";

export const V = p => new T.Vector3(...p);
export const euler = q => new T.Euler().setFromQuaternion(q).toArray().slice(0,3);
export const downTo = v => new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),v.clone().normalize());
export function solveLimb(a,b,upper,lower,pole) {
  const delta=b.clone().sub(a),d=delta.length();
  if(d>upper+lower+1e-6||d<Math.abs(upper-lower)+1e-6)throw new Error(`Unreachable limb ${d}`);
  const u=delta.divideScalar(d),along=(upper*upper-lower*lower+d*d)/(2*d);
  const tangent=pole.clone().addScaledVector(u,-pole.dot(u)).normalize();
  return a.clone().addScaledVector(u,along).addScaledVector(tangent,Math.sqrt(Math.max(0,upper*upper-along*along)));
}
export function canonical(buffer) {
  buffer.normalizeNormals();
  let g={positions:Array.from(buffer.attributes.position.array),normals:Array.from(buffer.attributes.normal.array),smooth:true};
  if(buffer.index)g.indices=Array.from(buffer.index.array);
  if(buffer.attributes.uv)g.uv=Array.from(buffer.attributes.uv.array);
  g=stripEmptyFaces(g);buffer.dispose();
  const out={positions:[],normals:[],indices:[],smooth:true},slots=new Map();
  if(g.uv)out.uv=[];
  for(let i=0;i<g.positions.length/3;i++) {
    const p=g.positions.slice(i*3,i*3+3),n=g.normals.slice(i*3,i*3+3),uv=g.uv?.slice(i*2,i*2+2),key=[...p,...n,...(uv??[])].join(',');
    if(!slots.has(key)) {slots.set(key,out.positions.length/3);out.positions.push(...p);out.normals.push(...n);if(uv)out.uv.push(...uv);}
    out.indices.push(slots.get(key));
  }
  return out;
}
export function assetBuilder(doc,materials) {
  const add=(type,id,parent,options={},mat='dark')=>{
    const n=makeNode(type,{id,name:id.replaceAll('-',' '),parent,position:[0,0,0],...materials[mat],...options});doc.nodes.push(n);return n;
  };
  const mesh=(id,parent,buffer,mat='dark',options={})=>add('mesh',id,parent,{geometry:canonical(buffer),...options},mat);
  const plate=(id,parent,outline,depth,mat,position=[0,0,0],bevel=.004)=>{
    const s=new T.Shape(outline.map(p=>new T.Vector2(...p)));
    const b=new T.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:1,steps:1}).translate(0,0,-depth/2);
    return mesh(id,parent,b,mat,{position});
  };
  const cylinder=(id,parent,radius,length,mat,position=[0,0,0],axis='x',segments=16)=>
    mesh(id,parent,new T.CylinderGeometry(radius,radius,length,segments),mat,{position,rotation:axis==='x'?[0,0,Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:[0,0,0]});
  const rod=(id,parent,a,b,r,mat)=>{
    const av=V(a),bv=V(b),delta=bv.clone().sub(av),g=new T.CylinderGeometry(r,r,delta.length(),10);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());
    return mesh(id,parent,g,mat);
  };
  return {add,mesh,plate,cylinder,rod};
}
export function loft(rings,crease=.55) {
  const width=rings[0].length,p=rings.flat(2),ix=[];
  for(let r=0;r<rings.length-1;r++)for(let j=0;j<width;j++) {
    const a=r*width+j,b=r*width+(j+1)%width,c=(r+1)*width+j,d=(r+1)*width+(j+1)%width;
    ix.push(a,b,c,b,d,c);
  }
  for(const [r,reverse] of [[0,true],[rings.length-1,false]]) {
    const center=rings[r].reduce((s,p)=>s.map((v,k)=>v+p[k]/width),[0,0,0]),id=p.length/3;p.push(...center);
    for(let j=0;j<width;j++)ix.push(...(reverse?[id,r*width+(j+1)%width,r*width+j]:[id,r*width+j,r*width+(j+1)%width]));
  }
  let volume=0;
  for(let i=0;i<ix.length;i+=3)volume+=V(p.slice(ix[i]*3,ix[i]*3+3)).dot(V(p.slice(ix[i+1]*3,ix[i+1]*3+3)).cross(V(p.slice(ix[i+2]*3,ix[i+2]*3+3))));
  if(volume<0)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];
  const b=new T.BufferGeometry();b.setAttribute('position',new T.Float32BufferAttribute(p,3));b.setIndex(ix);b.computeVertexNormals();
  const creased=toCreasedNormals(b,crease);b.dispose();return creased;
}
export function bodyRings(profile) {
  return profile.map(([y,w,d,z=0])=>[[-w*.72,y,z-d], [w*.72,y,z-d], [w,y,z-d*.65], [w,y,z+d*.65], [w*.72,y,z+d], [-w*.72,y,z+d], [-w,y,z+d*.65], [-w,y,z-d*.65]]);
}
