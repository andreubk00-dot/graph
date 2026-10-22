import test from 'node:test';
import assert from 'node:assert/strict';
import {periodicSpring} from '../src/secondary-motion.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('periodic spring matches the analytical amplitude and lag of harmonic forcing',()=>{
  const period=.8,frequency=3,damping=.85,omega=2*Math.PI/period,w=2*Math.PI*frequency;
  const spring=periodicSpring(t=>Math.sin(omega*t),{period,frequency,damping});
  const amplitude=w*w/Math.hypot(w*w-omega*omega,2*damping*w*omega),lag=Math.atan2(2*damping*w*omega,w*w-omega*omega);
  for(let i=0;i<100;i++){const t=i*period/100,s=spring(t);near(s.position,amplitude*Math.sin(omega*t-lag),1e-6);near(s.velocity,omega*amplitude*Math.cos(omega*t-lag),1e-5);}
});
test('periodic response has no startup pop and interpolates velocity through the loop',()=>{
  const spring=periodicSpring(t=>.1+.02*Math.cos(t*2*Math.PI/.8),{period:.8});
  const h=1e-6;
  near(spring(0).position,spring(.8).position);near(spring(-.2).position,spring(.6).position);
  near(spring(h).position,spring(-h).position,1e-6);
  near((spring(h).position-spring(-h).position)/(2*h),spring(0).velocity,1e-5);
  const constant=periodicSpring(()=>.37,{period:.8});near(constant(.3).position,.37);near(constant(.3).velocity,0);
  assert.throws(()=>periodicSpring(()=>0,{period:0}));assert.throws(()=>periodicSpring(()=>NaN,{period:1}));
});
