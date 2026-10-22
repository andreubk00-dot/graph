// Measure actual authored poses, not the target curve used to generate them.
// node scripts/review-ankle.js [output-directory] [previous.graph.json]
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {validateDocument,poseFor} from '../src/document.js';
import {buildContent,disposeScene} from '../src/scene.js';
const out=process.argv[2]??'examples/cyborg';
async function measure(path){
  const bytes=await fs.readFile(path),doc=validateDocument(JSON.parse(bytes)),root=new T.Scene(),objects=new Map();buildContent(root,doc,objects);
  const samples=[];let min=Infinity,max=-Infinity;
  try {
    for(const side of ['L','R'])for(let i=0;i<=160;i++){
      const q=i/160,time=.8*.34+.8*.66*q+(side==='R'?.4:0);
      for(const n of doc.nodes){const p=poseFor(doc,n,time,'run'),o=objects.get(n.id);o.position.fromArray(p.position);o.rotation.set(...p.rotation);o.scale.fromArray(p.scale);}
      root.updateMatrixWorld(true);
      const knee=objects.get(`shin-${side}`).getWorldPosition(new T.Vector3()),ankle=objects.get(`foot-${side}`).getWorldPosition(new T.Vector3());
      const shank=ankle.clone().sub(knee),toe=new T.Vector3(0,0,1).applyQuaternion(objects.get(`foot-${side}`).getWorldQuaternion(new T.Quaternion()));
      const heading=new T.Vector3(Math.sin((side==='L'?-1:1)*.045),0,Math.cos(.045));
      const pitch=Math.atan2(-toe.y,toe.dot(heading))*180/Math.PI,beta=Math.atan2(-shank.dot(heading),-shank.y)*180/Math.PI,relative=pitch-beta;
      min=Math.min(min,relative);max=Math.max(max,relative);samples.push({side,swing:q,time,footPitchDegrees:pitch,shankPitchDegrees:beta,relativeFlexionDegrees:relative});
    }
  }finally{disposeScene(root);}
  return {sourceSha256:createHash('sha256').update(bytes).digest('hex'),maxSwingDorsiflexionDegrees:-min,maxSwingPlantarflexionDegrees:max,samples};
}
const report={convention:'VANGUARD +Y up +Z forward; sagittal projection in toe-out plane; positive plantarflexion. Authored mechanical diagnostic, not clinical ROM.',cycle:.8,duty:.34,current:await measure(`${out}/cyborg.graph.json`)};
if(process.argv[3])report.previous=await measure(process.argv[3]);
await fs.writeFile(`${out}/ankle-review.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({currentDorsiflexion:report.current.maxSwingDorsiflexionDegrees,previousDorsiflexion:report.previous?.maxSwingDorsiflexionDegrees}));
