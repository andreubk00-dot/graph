import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {validateDocument,poseFor} from '../src/document.js';
import {buildContent,disposeScene,geometryFor} from '../src/scene.js';
import {auditMesh} from '../src/mesh-audit.js';
import {auditLocomotion,auditMeasurements} from '../src/model-review.js';
const out=process.argv[2]??'examples/cyborg';
const d=validateDocument(JSON.parse(await fs.readFile(`${out}/cyborg.graph.json`)));
const root=new T.Scene(),objects=new Map();buildContent(root,d,objects);
const bytes=await fs.readFile(`${out}/cyborg.glb`),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const report={nodes:d.nodes.length,bones:d.nodes.filter(n=>n.type==='bone').length,skins:d.nodes.filter(n=>n.skin).length,triangles:0,topologyIssues:[],maxMatrixError:0,maxSkinPositionError:0,maxGripError:0,maxPistonEndpointError:0,maxLimbLengthError:0,minFootSurfaceY:Infinity,clips:[]};
const point=(o,p=[0,0,0])=>new T.Vector3(...p).applyMatrix4(o.matrixWorld);
function setPose(clip,time){for(const n of d.nodes){const p=poseFor(d,n,time,clip),o=objects.get(n.id);o.position.fromArray(p.position);o.rotation.set(...p.rotation);o.scale.fromArray(p.scale);}root.updateMatrixWorld(true);}
try {
  for(const n of d.nodes.filter(n=>n.skin)) {
    const exported=gltf.scene.getObjectByName(n.id).skeleton.bones.map(b=>b.name);
    assert.equal(exported.length,15);
    assert.deepEqual(new Set(exported),new Set(d.nodes.filter(n=>n.type==='bone').map(n=>n.id)));
  }
  for(const n of d.nodes.filter(n=>n.type==='mesh')) {
    const g=geometryFor(n),a=auditMesh({positions:Array.from(g.attributes.position.array),normals:Array.from(g.attributes.normal.array),indices:Array.from(g.index.array)});
    report.triangles+=a.triangles;
    for(const key of ['boundaryEdges','nonManifoldEdges','windingConflicts','degenerate','normalErrors','inwardNormals'])if(a[key])report.topologyIssues.push({id:n.id,key,count:a[key]});
    const actual=gltf.scene.getObjectByName(n.id).geometry;
    for(const key of ['position','normal','uv','skinIndex','skinWeight'])if(g.attributes[key]) {
      const av=actual.attributes[key].array,ev=g.attributes[key].array;
      assert.equal(av.length,ev.length,`${n.id}/${key}`);
      assert.ok(av.every((v,i)=>Math.abs(v-ev[i])<2e-6),`${n.id}/${key}`);
    }
    assert.deepEqual(Array.from(actual.index.array),Array.from(g.index.array));g.dispose();
  }
  assert.deepEqual(report.topologyIssues,[]);
  for(const c of d.clips) {
    const animation=gltf.animations.find(a=>a.name===c.name);assert.ok(animation);
    const mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(animation).setLoop(T.LoopOnce,1).play();
    for(const t of [0,.013,.111,.237,.401,.599,.777,1.013,1.199,1.423,1.599]) {
      setPose(c.id,t);
      // Restore rest transforms between separate clips before applying GLB animation.
      for(const n of d.nodes){const o=gltf.scene.getObjectByName(n.id);o.position.fromArray(n.position);o.rotation.set(...n.rotation);o.scale.fromArray(n.scale);}
      mixer.setTime(t);gltf.scene.updateMatrixWorld(true);
      for(const n of d.nodes){const a=objects.get(n.id).matrixWorld.elements,b=gltf.scene.getObjectByName(n.id).matrixWorld.elements;report.maxMatrixError=Math.max(report.maxMatrixError,...a.map((v,i)=>Math.abs(v-b[i])));}
      for(const tag of ['L','R']) {
        const source=objects.get(`flex-sleeve-${tag}`),actual=gltf.scene.getObjectByName(`flex-sleeve-${tag}`);
        const count=source.geometry.attributes.position.count;
        for(let i=0;i<count;i+=Math.max(1,Math.floor(count/29))) {
          const a=source.getVertexPosition(i,new T.Vector3()).applyMatrix4(source.matrixWorld),b=actual.getVertexPosition(i,new T.Vector3()).applyMatrix4(actual.matrixWorld);
          report.maxSkinPositionError=Math.max(report.maxSkinPositionError,a.distanceTo(b));
        }
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);report.clips.push({id:c.id,duration:animation.duration,sampledTimes:11});
  }
  // Dense checks include interpolated frames, complete boot surfaces and both grips.
  for(let i=0;i<=240;i++) {
    setPose('run',i/150);
    for(const tag of ['L','R']) {
      const hand=point(objects.get(`hand-${tag}`)),grip=d.review.landmarks[`${tag}-grip`];
      report.maxGripError=Math.max(report.maxGripError,hand.distanceTo(point(objects.get(grip.node),grip.point)));
      const endpoint=point(objects.get(`piston-end-${tag}`)),mount=point(objects.get(`shin-${tag}`),[(tag==='L'?-1:1)*.067,-.16,-.075]);
      report.maxPistonEndpointError=Math.max(report.maxPistonEndpointError,endpoint.distanceTo(mount));
      for(const [a,b,length] of [[`thigh-${tag}`,`shin-${tag}`,.47],[`shin-${tag}`,`foot-${tag}`,.45],[`upperarm-${tag}`,`forearm-${tag}`,.31],[`forearm-${tag}`,`hand-${tag}`,.30]])
        report.maxLimbLengthError=Math.max(report.maxLimbLengthError,Math.abs(point(objects.get(a)).distanceTo(point(objects.get(b)))-length));
      for(const n of d.nodes.filter(n=>n.parent===`foot-${tag}`&&n.type==='mesh')) {
        const o=objects.get(n.id),p=o.geometry.attributes.position;
        for(let j=0;j<p.count;j++)report.minFootSurfaceY=Math.min(report.minFootSurfaceY,new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld).y);
      }
    }
  }
  assert.ok(report.maxMatrixError<2e-5);assert.ok(report.maxSkinPositionError<2e-5);
  assert.ok(report.maxGripError<1e-6);assert.ok(report.maxPistonEndpointError<.001);
  assert.ok(report.maxLimbLengthError<1e-8);assert.ok(report.minFootSurfaceY>-.003);
  const motion=auditLocomotion(d);assert.deepEqual(motion.issues,[]);
  assert.deepEqual(auditMeasurements(d,{pose:'clip',clip:'run',time:.317}).issues,[]);
  const forward=auditLocomotion(d,{clip:'run-forward',mode:'root'});assert.deepEqual(forward.issues,[]);
  report.motion={samples:motion.samples,speed:motion.averageSpeed,airborne:motion.airborne,forwardDistance:forward.forwardDistance,issues:motion.issues,feet:motion.feet.map(({id,maxSlip,maxSlipSpeed,maxGroundError,maxPenetration})=>({id,maxSlip,maxSlipSpeed,maxGroundError,maxPenetration}))};
  const rendererReference=[];
  for(const frame of [0,3,6,11,17]) {
    setPose('run',frame/20);const meshes={};
    for(const id of ['boot-sole-L','boot-sole-R','flex-sleeve-L','flex-sleeve-R','helmet-shell','palm-L','palm-R']) {
      const o=objects.get(id),p=o.geometry.attributes.position,box=new T.Box3();
      for(let i=0;i<p.count;i++){const v=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld);box.expandByPoint(new T.Vector3(v.x,-v.z,v.y));}
      meshes[id]={min:box.min.toArray(),max:box.max.toArray()};
    }
    rendererReference.push({frame,meshes});
  }
  await fs.writeFile(`${out}/renderer-reference.json`,JSON.stringify(rendererReference));
  await fs.writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));
  await fs.writeFile(`${out}/motion-report.json`,JSON.stringify(motion,null,2));
  console.log(JSON.stringify(report));
}finally{disposeScene(root);disposeScene(gltf.scene);}
