import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateDocument, poseFor } from "../src/document.js";
import { geometryFor, buildContent, disposeScene } from "../src/scene.js";
import { auditMesh } from "../src/mesh-audit.js";
import { validateArt, compositePixels } from "../src/art-document.js";
const out=process.argv[2]??"examples/helios";
const doc=validateDocument(JSON.parse(await fs.readFile(`${out}/helios.graph.json`)));
const bytes=await fs.readFile(`${out}/helios.glb`);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
const root=new T.Scene(),map=new Map();buildContent(root,doc,map);
const report={nodes:doc.nodes.length,meshCount:0,triangles:0,topologyIssues:[],maxAnimationMatrixError:0,clips:[],pixelFrames:0};
try {
  for(const node of doc.nodes.filter(n=>n.type==='mesh')) {
    const expected=geometryFor(node),actual=gltf.scene.getObjectByName(node.id)?.geometry;
    assert.ok(actual,`Missing mesh: ${node.id}`);
    const aMat=gltf.scene.getObjectByName(node.id).material,eMat=map.get(node.id).material;
    assert.equal(aMat.roughness,eMat.roughness,`${node.id}/roughness`);
    assert.equal(aMat.metalness,eMat.metalness,`${node.id}/metalness`);
    for(const key of ['r','g','b']) {
      assert.ok(Math.abs(aMat.color[key]-eMat.color[key])<1e-6,`${node.id}/color`);
      assert.ok(Math.abs(aMat.emissive[key]*aMat.emissiveIntensity-eMat.emissive[key]*eMat.emissiveIntensity)<1e-6,`${node.id}/emission`);
    }
    try {
      // JSON canonicalizes -0 to 0; compare numeric values rather than signed-zero bits.
      for(const key of ['position','normal','uv']) if(expected.attributes[key]) {
        const a=actual.attributes[key].array,b=expected.attributes[key].array;
        assert.ok(a.length===b.length&&a.every((v,i)=>v===b[i]),`${node.id}/${key}`);
      }
      const index=g=>Array.from(g.index?.array??Array.from({length:g.attributes.position.count},(_,i)=>i));
      assert.deepEqual(index(actual),index(expected),`${node.id}/indices`);
      const audit=auditMesh({positions:Array.from(actual.attributes.position.array),normals:Array.from(actual.attributes.normal.array),indices:index(actual)});
      for(const key of ['boundaryEdges','nonManifoldEdges','windingConflicts','degenerate','normalErrors','inwardNormals'])
        if(audit[key])report.topologyIssues.push({id:node.id,key,count:audit[key]});
      report.triangles+=audit.triangles;report.meshCount++;
    } finally { expected.dispose(); }
  }
  for(const clip of doc.clips) {
    const animation=gltf.animations.find(a=>a.name===clip.name);
    assert.ok(animation,`Missing clip ${clip.id}`);
    assert.equal(animation.duration,clip.duration);
    const mixer=new T.AnimationMixer(gltf.scene);
    mixer.clipAction(animation).setLoop(T.LoopOnce,1).play();
    for(const fraction of [.023,.217,.513,.789,.977]) {
      const time=clip.duration*fraction;
      // Restore rest poses so a previous independent clip cannot leak into this one.
      for(const node of doc.nodes) {
        const expected=map.get(node.id),actual=gltf.scene.getObjectByName(node.id),p=poseFor(doc,node,time,clip.id);
        expected.position.fromArray(p.position);expected.rotation.set(...p.rotation);expected.scale.fromArray(p.scale);
        actual.position.fromArray(node.position);actual.rotation.set(...node.rotation);actual.scale.fromArray(node.scale);
      }
      mixer.setTime(time);root.updateMatrixWorld(true);gltf.scene.updateMatrixWorld(true);
      for(const node of doc.nodes) {
        const a=map.get(node.id).matrixWorld.elements,b=gltf.scene.getObjectByName(node.id).matrixWorld.elements;
        report.maxAnimationMatrixError=Math.max(report.maxAnimationMatrixError,...a.map((v,i)=>Math.abs(v-b[i])));
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
    report.clips.push({id:clip.id,duration:clip.duration,sampledTimes:5});
  }
  assert.ok(report.maxAnimationMatrixError<2e-5,JSON.stringify(report));
  assert.deepEqual(report.topologyIssues,[]);
  const icon=validateArt(JSON.parse(await fs.readFile(`${out}/helios-icon.art.json`)));
  const raw=await fs.readFile(`${out}/icon-frames.rgba`);
  for(let i=0;i<icon.frames.length;i++)
    assert.deepEqual(raw.subarray(i*96*96*4,(i+1)*96*96*4),Buffer.from(compositePixels(icon,i)));
  report.pixelFrames=icon.frames.length;
  validateArt(JSON.parse(await fs.readFile(`${out}/helios-emblem.art.json`)));
  await fs.writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {disposeScene(root);disposeScene(gltf.scene);}
