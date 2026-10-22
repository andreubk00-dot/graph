import {Vector3,Quaternion} from 'three';
import {runningFoot} from './running-motion.js';
import {solveLimb} from './limb-ik.js';

// Coupled foot/leg solve: sole clearance changes ankle height, which changes
// knee/shank orientation, which determines the recovered foot orientation.
// Angles are sagittal projections in the toe-out plane, not clinical measures.
export function solveRunningLeg({time,side,hip,upperLength,lowerLength,sole,profile={}}) {
  const gait=runningFoot(time,side,sole,profile);
  const forward=new Vector3(Math.sin(gait.yaw),0,Math.cos(gait.yaw));
  const evaluate=pitch=>{
    // Preserve the authored ankle recovery arc. Rotating a long boot downward
    // must not lift the ankle by the full change of its support height, which
    // would overfold the knee. Only add height when actual toe clearance needs it.
    let height=gait.height;
    if(!gait.contact&&gait.swing>0&&gait.swing<1) {
      const envelope=Math.sin(Math.PI*gait.swing)**2;
      const required=sole.support(pitch).height+.015*envelope;
      height=(height+required+Math.hypot(height-required,.004*envelope))/2;
    }
    const ankle=new Vector3(gait.lateral,height,gait.forward);
    const knee=solveLimb(hip,ankle,upperLength,lowerLength,new Vector3(0,0,1));
    const shank=ankle.clone().sub(knee);
    const shankPitch=Math.atan2(-shank.dot(forward),-shank.y);
    return {ankle,knee,shankPitch};
  };
  let pitch=gait.pitch,state=evaluate(pitch),residual=0,iterations=0;
  if(gait.ankleBlend>0)for(;iterations<80;iterations++) {
    const target=gait.pitch+gait.ankleBlend*(state.shankPitch+gait.ankleFlexion-gait.pitch);
    residual=target-pitch;
    if(Math.abs(residual)<1e-10)break;
    pitch+=residual*.5;state=evaluate(pitch);
  }
  if(Math.abs(residual)>1e-7)throw new Error(`Ankle solve did not converge: ${residual}`);
  const footQuaternion=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),gait.yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),pitch));
  return {...state,gait,pitch,ankleFlexion:pitch-state.shankPitch,footQuaternion,iterations};
}
