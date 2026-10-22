// Authored animation model, not a full-body dynamics simulation or universal gait.
import {periodicSpring} from './secondary-motion.js';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const wrap=x=>((x%1)+1)%1;
export const COMBAT_RUN_PROFILE=Object.freeze({cycle:.8,distance:1.8,duty:.34,gravity:9.81,touchHeight:.982,lift:.255,stanceWidth:.17,landingPitch:-.10,toeOffPitch:.52});

// C2 piecewise quintics. Shared zero knot accelerations avoid sudden changes in
// acceleration; explicit endpoint velocities match contact/swing transitions.
export function motionCurve(keys,t) {
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],h=b[0]-a[0],u=clamp((t-a[0])/h,0,1);
  const tangent=j=>{
    if(keys[j][2]!==undefined)return keys[j][2];
    if(j===0||j===keys.length-1)return 0;
    const x=keys[j-1],y=keys[j],z=keys[j+1],d0=(y[1]-x[1])/(y[0]-x[0]),d1=(z[1]-y[1])/(z[0]-y[0]);
    return d0*d1<=0?0:2*d0*d1/(d0+d1);
  };
  const c0=a[1],c1=tangent(i)*h,d=b[1]-c0-c1,e=tangent(i+1)*h-c1;
  const c3=10*d-4*e,c4=-15*d+7*e,c5=6*d-3*e;
  return {value:c0+c1*u+c3*u**3+c4*u**4+c5*u**5,
    velocity:(c1+3*c3*u*u+4*c4*u**3+5*c5*u**4)/h,
    acceleration:(6*c3*u+12*c4*u*u+20*c5*u**3)/(h*h)};
}

export function runningBody(time,options={}) {
  const c={...COMBAT_RUN_PROFILE,...options};
  if(!Number.isFinite(time)||!Number.isFinite(c.cycle)||c.cycle<=0||c.duty<.2||c.duty>=.5||!(c.gravity>0))throw new Error('Invalid running dynamics');
  const step=c.cycle/2,contact=c.duty*c.cycle,flight=step-contact,t=wrap(time/step)*step;
  const g=c.gravity,A=Math.PI*g*step/(2*contact),landingV=-g*flight/2;
  let height,velocity,acceleration,force;
  if(t<contact) {
    const angle=Math.PI*t/contact;
    height=c.touchHeight+landingV*t+A*contact/Math.PI*(t-contact/Math.PI*Math.sin(angle))-.5*g*t*t;
    velocity=landingV+A*contact/Math.PI*(1-Math.cos(angle))-g*t;
    acceleration=A*Math.sin(angle)-g;force=A*Math.sin(angle)/g;
  } else {
    const f=t-contact;
    height=c.touchHeight+g*flight/2*f-.5*g*f*f;
    velocity=g*flight/2-g*f;acceleration=-g;force=0;
  }
  const p=wrap(time/c.cycle),weight=Math.sin(2*Math.PI*(p+.08));
  return {phase:p,height,velocity,acceleration,forceBodyWeights:force,inFlight:t>=contact,
    lateral:-.020*weight,pelvisForward:.012*Math.sin(4*Math.PI*p-.3),pelvisPitch:.075+.010*Math.sin(4*Math.PI*p-.3),pelvisYaw:-.070*weight,pelvisRoll:-.025*weight};
}

const upperBodyResponses=new Map();
// Separate lumbar/thoracic responses: support compression drives forward pitch,
// alternating leg drive produces counterrotation. A loaded weapon follows the
// hip region rather than inheriting the complete chest transform.
export function runningUpperBody(time,options={}) {
  const c={...COMBAT_RUN_PROFILE,...options};
  runningBody(time,c); // Validate the same temporal/dynamics parameters.
  const key=JSON.stringify([c.cycle,c.duty,c.gravity,c.touchHeight]);
  if(!upperBodyResponses.has(key)) {
    const spring=(target,frequency,damping)=>periodicSpring(target,{period:c.cycle,frequency,damping,samples:480});
    const phase=t=>2*Math.PI*t/c.cycle;
    const force=t=>runningBody(t,c).forceBodyWeights;
    upperBodyResponses.set(key,{
      lumbarPitch:spring(t=>.045+.019*(force(t)-1),3.4,.82),
      chestPitch:spring(t=>.035+.022*(force(t)-1),2.8,.88),
      yaw:spring(t=>Math.sin(phase(t)+.50),3.1,.85),
      roll:spring(t=>Math.sin(phase(t)+.50),2.5,.9),
      weaponY:spring(t=>-.008*(force(t)-1),3.8,.86),
      weaponPitch:spring(t=>.035+.016*(force(t)-1),3.0,.88),
    });
    if(upperBodyResponses.size>16)upperBodyResponses.delete(upperBodyResponses.keys().next().value);
  }
  const r=upperBodyResponses.get(key),yaw=r.yaw(time).position,roll=r.roll(time).position;
  return {
    lumbarRotation:[r.lumbarPitch(time).position,.025*yaw,.018*roll],
    chestRotation:[r.chestPitch(time).position,.18+.095*yaw,.020*roll],
    // The carry is on the right, below the abdomen; both grip targets are solved
    // after transforming the full shoulder hierarchy into world space.
    weaponAnchor:[.195,.20+r.weaponY(time).position,.12],
    weaponRotation:[r.weaponPitch(time).position,.025+.025*yaw,-.035+.015*roll],
    headResidual:[.012*Math.sin(4*Math.PI*time/c.cycle-.5),.012*yaw,.008*roll],
  };
}

export function createSoleRoll(points) {
  if(!Array.isArray(points)||points.length<3||points.some(p=>p.length!==3||p.some(x=>!Number.isFinite(x))))throw new Error('Foot surface points required');
  const yz=[...new Map(points.map(p=>[`${p[1]}:${p[2]}`,[p[1],p[2]]])).values()];
  const support=pitch=>{
    const s=Math.sin(pitch),c=Math.cos(pitch);let min=Infinity,point;
    for(const p of yz){const y=c*p[0]-s*p[1];if(y<min){min=y;point=[0,...p];}}
    return {height:-min,point};
  };
  const lo=-1,hi=1,steps=4000,dx=(hi-lo)/steps,integrals=new Float64Array(steps+1);
  let previous=support(lo).height;
  for(let i=1;i<=steps;i++){const current=support(lo+i*dx).height;integrals[i]=integrals[i-1]+(previous+current)*dx/2;previous=current;}
  const value=p=>{if(p<lo||p>hi)throw new Error('Foot pitch outside roll table');const x=(p-lo)/dx,i=Math.min(steps-1,Math.floor(x));return integrals[i]+(integrals[i+1]-integrals[i])*(x-i);};
  const zero=value(0);
  return {support,offset:p=>value(p)-zero};
}

export function runningFoot(time,side,sole,options={}) {
  const c={...COMBAT_RUN_PROFILE,...options};
  if(!['L','R'].includes(side)||!Number.isFinite(time)||!(c.cycle>0)||!(c.distance>0)||c.duty<.2||c.duty>=.5)throw new Error('Invalid foot gait');
  const p=wrap(time/c.cycle+(side==='R'?.5:0)),sign=side==='L'?-1:1;
  const contactTime=c.duty*c.cycle,swingTime=(1-c.duty)*c.cycle,speed=c.distance/c.cycle,yaw=sign*.045;
  const contactPitch=u=>motionCurve([[0,c.landingPitch,0],[.18,0,0],[.55,0,0],[1,c.toeOffPitch,2*contactTime]],u);
  const startRoll=sole.offset(c.landingPitch),touchForward=.24*c.distance/1.8;
  const endRoll=sole.offset(c.toeOffPitch)-startRoll;
  const toeForward=touchForward-speed*contactTime+endRoll*Math.cos(yaw);
  let pitch,forward,height,roll,clearance=0,swing=0;
  if(p<c.duty) {
    const u=p/c.duty;pitch=contactPitch(u).value;
    roll=sole.offset(pitch)-startRoll;
    forward=touchForward-speed*p*c.cycle+roll*Math.cos(yaw);
    height=sole.support(pitch).height;
  }else{
    swing=(p-c.duty)/(1-c.duty);
    pitch=motionCurve([[0,c.toeOffPitch,2*swingTime],[.18,.70,0],[.44,.10],[.72,-.20,0],[1,c.landingPitch,0]],swing).value;
    const v0=(-speed+sole.support(c.toeOffPitch).height*2*Math.cos(yaw))*swingTime;
    const scale=c.distance/1.8;
    forward=motionCurve([[0,toeForward,v0],[.20,-.43*scale,0],[.50,-.18*scale],[.80,.20*scale],[1,touchForward,-speed*swingTime]],swing).value;
    clearance=motionCurve([[0,0,0],[.20,c.lift*.72],[.42,c.lift,0],[.68,c.lift*.54],[.86,c.lift*.19],[1,0,0]],swing).value;
    height=sole.support(pitch).height+clearance;
    roll=motionCurve([[0,endRoll,2*sole.support(c.toeOffPitch).height*swingTime],[1,0,0]],swing).value;
  }
  return {phase:p,contact:p<c.duty,swing,pitch,yaw,forward,height,clearance,
    lateral:sign*c.stanceWidth/2+roll*Math.sin(yaw),supportPoint:sole.support(pitch).point};
}
