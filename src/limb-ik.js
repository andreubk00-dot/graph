// Fixed-length two-bone IK. Inputs are Three.js Vector3 values in one frame.
// The pole selects the bend plane; it is not an anatomical joint-limit solver.
export function solveLimb(a,b,upper,lower,pole) {
  if(![...a,...b,...pole,upper,lower].every(Number.isFinite)||upper<=0||lower<=0)throw new Error('Invalid limb geometry');
  const delta=b.clone().sub(a),d=delta.length();
  if(d>upper+lower+1e-6||d<Math.abs(upper-lower)+1e-6)throw new Error(`Unreachable limb ${d}`);
  const u=delta.divideScalar(d),along=(upper*upper-lower*lower+d*d)/(2*d);
  const tangent=pole.clone().addScaledVector(u,-pole.dot(u));
  if(tangent.lengthSq()<1e-14)throw new Error('Limb pole parallel to target');
  tangent.normalize();
  return a.clone().addScaledVector(u,along).addScaledVector(tangent,Math.sqrt(Math.max(0,upper*upper-along*along)));
}
