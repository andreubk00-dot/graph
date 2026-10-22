import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBAT_RUN_PROFILE as cfg,runningBody,runningFoot,createSoleRoll,motionCurve} from '../src/running-motion.js';
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const sole=createSoleRoll([[0,-.12,-.09],[0,-.12,.13],[0,-.108,.215],[0,0,0]]);
test('stance impulse supports a periodic ballistic flight with gravity and continuous velocity',()=>{
  const step=cfg.cycle/2,stance=cfg.duty*cfg.cycle,flight=step-stance;
  const a=runningBody(stance+flight*.2),b=runningBody(stance+flight*.8);
  near(a.acceleration,-9.81);near(b.acceleration,-9.81);
  near(b.velocity-a.velocity,-9.81*(flight*.6));
  near(runningBody(stance).height,cfg.touchHeight);
  near(runningBody(stance+flight/2).height-cfg.touchHeight,9.81*flight*flight/8);
  near(runningBody(stance-1e-8).velocity,runningBody(stance+1e-8).velocity,1e-6);
  near(runningBody(step-1e-8).velocity,runningBody(step+1e-8).velocity,1e-6);
  let impulse=0,n=20000;for(let i=0;i<n;i++)impulse+=runningBody((i+.5)*step/n).forceBodyWeights*cfg.gravity*step/n;
  near(impulse,cfg.gravity*step,1e-5);
  assert.ok(runningBody(stance/2).height<cfg.touchHeight);
});
test('rolling contact keeps the actual support feature stationary in virtual world space',()=>{
  for(const range of [[.002,.045],[.075,.14],[.17,.21],[.23,.265]]) {
    let first,lastFeature;
    for(let i=0;i<=30;i++) {
      const t=range[0]+(range[1]-range[0])*i/30,f=runningFoot(t,'L',sole),s=f.supportPoint;
      const c=Math.cos(f.pitch),si=Math.sin(f.pitch),yaw=f.yaw;
      const z=si*s[1]+c*s[2];
      const point=[f.lateral+z*Math.sin(yaw),f.height+c*s[1]-si*s[2],f.forward+z*Math.cos(yaw)+t*cfg.distance/cfg.cycle];
      // A polygonal sole changes support feature at a corner. Check sticking
      // within each feature, rather than asking a lifted heel to stay planted.
      const feature=s.join(',');if(feature!==lastFeature){first=undefined;lastFeature=feature;}
      first??=point;near(point[0],first[0],2e-6);near(point[1],0,2e-6);near(point[2],first[2],2e-6);
    }
  }
});
test('foot roll and swing join with matching positions and velocities and a closed loop',()=>{
  const eps=1e-6,td=cfg.cycle*cfg.duty;
  for(const t of [td,cfg.cycle]) {
    const before=runningFoot(t-eps,'L',sole),at=runningFoot(t,'L',sole),after=runningFoot(t+eps,'L',sole);
    for(const k of ['forward','height','lateral','pitch']) {
      near(before[k],after[k],2e-5);
      near((at[k]-before[k])/eps,(after[k]-at[k])/eps,2e-3);
    }
  }
  near(runningFoot(0,'L',sole).forward,runningFoot(cfg.cycle,'L',sole).forward);
  assert.ok(runningFoot(.10,'L',sole).pitch===0);
  assert.ok(runningFoot(td-.002,'L',sole).pitch>.45);
});
test('weight shifts toward the support side and knee recovery precedes foot extension',()=>{
  assert.ok(runningBody(.13).lateral<0);assert.ok(runningBody(.53).lateral>0);
  const ts=cfg.cycle*(1-cfg.duty),start=cfg.cycle*cfg.duty;
  const early=runningFoot(start+ts*.42,'L',sole),late=runningFoot(start+ts*.82,'L',sole);
  assert.ok(early.forward<0);assert.ok(late.forward>0);assert.ok(early.clearance>late.clearance*2);
  for(let i=0;i<100;i++)assert.ok(runningFoot(i*cfg.cycle/100,'L',sole).clearance>=-1e-8);
  const a=runningFoot(.11,'L',sole),b=runningFoot(.51,'R',sole);
  near(a.forward,b.forward);near(a.height,b.height);
});
test('quintic timing is C2 at shared keys instead of easing to a stop at every waypoint',()=>{
  const keys=[[0,0,0],[.3,.2],[.6,.6],[1,1,0]],e=1e-7;
  const a=motionCurve(keys,.3-e),b=motionCurve(keys,.3+e);
  near(a.value,b.value,1e-6);near(a.velocity,b.velocity,1e-5);near(a.acceleration,b.acceleration,1e-3);
  assert.ok(a.velocity>.1);
  assert.throws(()=>runningFoot(0,'X',sole));assert.throws(()=>createSoleRoll([]));
});
