// Periodic, driven second-order response for authored animation channels.
// Unit-mass angular/linear channel: x'' + 2 ζω x' + ω²(x − target) = 0.
// This does not solve full-body dynamics, contact forces or collisions.
export function periodicSpring(target,{period,frequency=3,damping=.85,samples=480}={}) {
  if(typeof target!=='function'||![period,frequency,damping,samples].every(Number.isFinite)||period<=0||frequency<=0||damping<.1||damping>2||!Number.isInteger(samples)||samples<32||samples>8192)throw new Error('Invalid periodic spring');
  const dt=period/samples,w=2*Math.PI*frequency;
  if(w*dt>.25)throw new Error('Spring sampling too coarse');
  const value=t=>{const v=target(((t%period)+period)%period);if(!Number.isFinite(v))throw new Error('Nonfinite spring target');return v;};
  const deriv=(t,x,v)=>[v,w*w*(value(t)-x)-2*damping*w*v];
  let x=value(0),v=0;
  const step=t=>{
    const a=deriv(t,x,v),b=deriv(t+dt/2,x+dt*a[0]/2,v+dt*a[1]/2),c=deriv(t+dt/2,x+dt*b[0]/2,v+dt*b[1]/2),d=deriv(t+dt,x+dt*c[0],v+dt*c[1]);
    x+=dt*(a[0]+2*b[0]+2*c[0]+d[0])/6;v+=dt*(a[1]+2*b[1]+2*c[1]+d[1])/6;
  };
  // Warm up until residual transient is below exp(-30), including overdamping.
  const decay=w*(damping<=1?damping:damping-Math.sqrt(damping*damping-1));
  const cycles=Math.ceil(30/(decay*period));
  if(cycles>1000)throw new Error('Spring convergence budget exceeded');
  for(let k=0;k<cycles;k++)for(let i=0;i<samples;i++)step(i*dt);
  const positions=[],velocities=[];
  for(let i=0;i<samples;i++){positions.push(x);velocities.push(v);step(i*dt);}
  return time=>{
    if(!Number.isFinite(time))throw new Error('Invalid spring time');
    const phase=(((time/period)%1)+1)%1*samples,i=Math.floor(phase)%samples,j=(i+1)%samples,u=phase-Math.floor(phase);
    const a=positions[i],b=positions[j],av=velocities[i]*dt,bv=velocities[j]*dt;
    const position=(2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*av+(-2*u**3+3*u*u)*b+(u**3-u*u)*bv;
    const velocity=((6*u*u-6*u)*a+(3*u*u-4*u+1)*av+(-6*u*u+6*u)*b+(3*u*u-2*u)*bv)/dt;
    return {position,velocity};
  };
}
