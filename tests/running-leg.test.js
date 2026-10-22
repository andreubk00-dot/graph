import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Euler} from 'three';
import {solveLimb} from '../src/limb-ik.js';
import {solveRunningLeg} from '../src/running-leg.js';
import {COMBAT_RUN_PROFILE as cfg,runningBody,createSoleRoll} from '../src/running-motion.js';
const points=[[-.05,-.12,-.09],[.05,-.12,-.09],[-.06,-.12,.13],[.06,-.12,.13],[-.05,-.108,.215],[.05,-.108,.215],[0,0,0]];
const sole=createSoleRoll(points);
const sample=(time,side='L')=>{
  const b=runningBody(time),s=side==='L'?-1:1;
  const q=new Quaternion().setFromEuler(new Euler(b.pelvisPitch,b.pelvisYaw,b.pelvisRoll));
  const hip=new Vector3(s*.105,0,0).applyQuaternion(q).add(new Vector3(b.lateral,b.height,b.pelvisForward));
  return {hip,...solveRunningLeg({time,side,hip,upperLength:.47,lowerLength:.45,sole})};
};
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('coupled recovery keeps fixed limb lengths, toe clearance and moderate shank-relative ankle angles',()=>{
  for(const side of ['L','R'])for(let i=0;i<=480;i++){
    const s=sample(i*cfg.cycle/480,side);
    near(s.hip.distanceTo(s.knee),.47);near(s.knee.distanceTo(s.ankle),.45);
    for(const point of points)assert.ok(new Vector3(...point).applyQuaternion(s.footQuaternion).add(s.ankle).y>=-1e-8);
    if(!s.gait.contact){assert.ok(s.ankleFlexion>-.32&&s.ankleFlexion<.40,`Recovery ankle ${s.ankleFlexion}`);assert.ok(s.iterations<80);}
  }
});
test('rear recovery follows the shank instead of holding the boot horizontal',()=>{
  for(const q of [.25,.35,.45]){
    const s=sample(cfg.cycle*cfg.duty+cfg.cycle*(1-cfg.duty)*q);
    assert.ok(s.pitch>1.1,'Recovery boot must visibly point down with the shank');
    assert.ok(Math.abs(s.pitch-s.shankPitch)<.25,'No extreme dorsiflexion to cancel shank motion');
  }
});
test('coupled ankle position and orientation join contact and swing with continuous velocity',()=>{
  const e=1e-6;
  for(const t of [cfg.cycle*cfg.duty,cfg.cycle]){
    const a=sample(t-e),b=sample(t),c=sample(t+e);
    for(const axis of ['x','y','z']){
      near(a.ankle[axis],c.ankle[axis],2e-5);
      near((b.ankle[axis]-a.ankle[axis])/e,(c.ankle[axis]-b.ankle[axis])/e,3e-3);
    }
    near((b.pitch-a.pitch)/e,(c.pitch-b.pitch)/e,3e-3);
  }
});
test('shared two-bone IK respects both distances and rejects unreachable or undefined bend planes',()=>{
  const a=new Vector3(0,1,0),b=new Vector3(.1,.3,.25),pole=new Vector3(0,0,1),k=solveLimb(a,b,.47,.45,pole);
  near(a.distanceTo(k),.47);near(b.distanceTo(k),.45);
  assert.throws(()=>solveLimb(a,new Vector3(0,-1,0),.47,.45,pole),/Unreachable/);
  assert.throws(()=>solveLimb(a,new Vector3(0,.5,0),.47,.45,new Vector3(0,1,0)),/parallel/);
});
