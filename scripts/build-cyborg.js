// Graph Forge character: authored armor meshes, actual bones/skins and baked IK.
import fs from 'node:fs/promises';
import * as T from 'three';
import {emptyDocument,validateDocument,applyCommands,poseFor} from '../src/document.js';
import {geometryFor,createGLB} from '../src/scene.js';
import {COMBAT_RUN_PROFILE,runningBody,runningFoot,createSoleRoll} from '../src/running-motion.js';
import {assetBuilder,loft,bodyRings,solveLimb,downTo,V,euler} from './lib/game-asset.js';
const out=process.argv[2]??'examples/cyborg';await fs.mkdir(out,{recursive:true});
let doc=emptyDocument();doc.name='VANGUARD M-07 · Armed cyborg run';doc.duration=1.6;doc.fps=30;
const materials={
  dark:{color:'#17252e',metalness:.55,roughness:.39},
  armor:{color:'#bdc7c4',metalness:.52,roughness:.32},
  steel:{color:'#657b82',metalness:.8,roughness:.28},
  orange:{color:'#d9683d',metalness:.38,roughness:.36},
  rubber:{color:'#101a22',metalness:.06,roughness:.77},
  visor:{color:'#56a9b8',metalness:.6,roughness:.19,emissive:'#329fac',emissiveIntensity:.7},
  glow:{color:'#a3e9ed',metalness:.25,roughness:.25,emissive:'#39a9ba',emissiveIntensity:1.3},
  gun:{color:'#263139',metalness:.7,roughness:.34},
};
const {add,mesh,plate,cylinder,rod}=assetBuilder(doc,materials);
const bone=(id,parent,position,rotation=[0,0,0])=>add('bone',id,parent,{position,rotation});
const box=(id,parent,scale,position,mat='dark',rotation=[0,0,0])=>{
  const g=new T.BoxGeometry(...scale);return mesh(id,parent,g,mat,{position,rotation});
};
const profile=(id,parent,rows,mat='armor',options={})=>mesh(id,parent,loft(bodyRings(rows)),mat,options);
add('group','vanguard',null);
bone('hips','vanguard',[0,1.035,0]);
bone('spine','hips',[0,.12,0]);
bone('head','spine',[0,.66,0]);
// Pelvis and torso: fitted octagonal sections, separated pectorals and abdominal plates.
profile('pelvis-shell','hips',[[-.15,.11,.073,.025],[-.09,.175,.105,0],[.035,.175,.10,0],[.085,.14,.085,0]],'dark');
for(const s of [-1,1]) {
  const tag=s<0?'L':'R';
  plate(`pelvis-front-${tag}`,'hips',[[.02,.025],[.145,.035],[.16,-.055],[.075,-.13],[.025,-.10]].map(([x,y])=>[s*x,y]),.025,'armor',[0,0,.106]);
  cylinder(`hip-axle-${tag}`,'hips',.07,.085,'steel',[s*.15,-.015,0]);
  cylinder(`hip-cap-${tag}`,'hips',.048,.018,'orange',[s*.20,-.015,0]);
}
profile('torso-underframe','spine',[[.0,.125,.075],[.14,.16,.09],[.32,.22,.115],[.43,.225,.11],[.48,.13,.075]],'dark');
for(const s of [-1,1]) {
  const tag=s<0?'L':'R';
  plate(`pectoral-${tag}`,'spine',[[.018,.26],[.045,.42],[.16,.45],[.235,.37],[.20,.23],[.055,.19]].map(([x,y])=>[s*x,y]),.055,'armor',[0,0,.112],.009);
  plate(`chest-inlay-${tag}`,'spine',[[.04,.40],[.17,.42],[.21,.36],[.185,.34],[.07,.36]].map(([x,y])=>[s*x,y]),.014,s>0?'orange':'steel',[0,0,.153],.002);
  rod(`chest-status-${tag}`,'spine',[s*.055,.225,.153],[s*.155,.252,.16],.005,'glow');
  for(let i=0;i<3;i++)plate(`rib-${tag}-${i}`,'spine',[[.09,.13-i*.035],[.175,.16-i*.035],[.185,.135-i*.035],[.10,.105-i*.035]].map(([x,y])=>[s*x,y]),.026,'steel',[0,0,.075],.003);
}
for(let i=0;i<3;i++)profile(`abdomen-${i}`,'spine',[[.015+i*.05,.105,.078],[.045+i*.05,.12,.085]],i===1?'armor':'dark');
plate('sternum','spine',[[-.018,.18],[-.022,.35],[0,.41],[.022,.35],[.018,.18]],.027,'orange',[0,0,.15]);
profile('backpack','spine',[[.10,.13,.075,-.15],[.15,.16,.08,-.15],[.36,.16,.08,-.15],[.42,.12,.06,-.15]],'dark');
for(const s of [-1,1]) {
  profile(`pack-pod-${s<0?'L':'R'}`,'spine',[[.15,.04,.035],[.34,.052,.045],[.39,.035,.03]],'armor',{position:[s*.13,0,-.20]});
  for(let i=0;i<5;i++)box(`pack-vent-${s<0?'L':'R'}-${i}`,'spine',[.061,.009,.012],[s*.12,.19+i*.027,-.25],'steel');
  rod(`pack-light-${s<0?'L':'R'}`,'spine',[s*.14,.15,-.255],[s*.14,.29,-.255],.005,'glow');
}
// Helmet with a wrapped visor, cheek shields, jaw vents and comms hardware.
cylinder('neck-gaiter','head',.054,.095,'rubber',[0,-.135,0],'y');
{
 const rows=[[-.105,.062,.073],[-.065,.093,.099],[.06,.098,.105],[.12,.075,.083],[.14,.045,.047]];
 const rings=rows.map(([y,w,d])=>Array.from({length:20},(_,i)=>{const a=i/20*Math.PI*2,c=Math.cos(a),s=Math.sin(a);return[w*Math.sign(c)*Math.pow(Math.abs(c),.62),y,d*Math.sign(s)*Math.pow(Math.abs(s),.62)];}));
 mesh('helmet-shell','head',loft(rings,.9),'armor');
}
plate('visor-frame','head',[[-.091,.048],[-.063,.080],[.063,.080],[.091,.048],[.075,.002],[-.075,.002]],.020,'dark',[0,0,.099],.004);
plate('visor-glass','head',[[-.08,.045],[-.054,.067],[.054,.067],[.08,.045],[.065,.017],[-.065,.017]],.014,'visor',[0,0,.115],.003);
plate('helmet-brow','head',[[-.085,.076],[0,.096],[.085,.076],[.075,.067],[0,.081],[-.075,.067]],.021,'dark',[0,0,.103],.002);
plate('jaw-mask','head',[[-.065,-.02],[-.038,-.088],[.038,-.088],[.065,-.02],[.018,-.006],[-.018,-.006]],.032,'dark',[0,0,.094],.004);
plate('jaw-bridge','head',[[-.018,-.009],[-.023,-.061],[0,-.077],[.023,-.061],[.018,-.009]],.012,'steel',[0,0,.116],.002);
for(const s of [-1,1]) {
  const tag=s<0?'L':'R';
  cylinder(`helmet-comms-${tag}`,'head',.043,.023,'dark',[s*.099,.016,-.017],'x');
  cylinder(`helmet-comms-cap-${tag}`,'head',.027,.027,'orange',[s*.113,.016,-.017],'x');
  for(let j=0;j<3;j++)rod(`jaw-vent-${tag}-${j}`,'head',[s*(.030+j*.010),-.033,.118],[s*(.032+j*.010),-.055,.118],.003,'rubber');
}
rod('comms-antenna','head',[.111,.035,-.036],[.118,.205,-.075],.005,'dark');
// Legs: rigid armor around a genuinely skinned flexible inner sleeve.
const lengths={upper:.47,lower:.45,arm:.31,forearm:.30};
for(const s of [-1,1]) {
  const tag=s<0?'L':'R';
  bone(`thigh-${tag}`,'hips',[s*.105,0,0]);
  bone(`shin-${tag}`,`thigh-${tag}`,[0,-lengths.upper,0]);
  bone(`foot-${tag}`,`shin-${tag}`,[0,-lengths.lower,0]);
  profile(`thigh-frame-${tag}`,`thigh-${tag}`,[[-.06,.075,.07],[-.12,.095,.085],[-.32,.070,.072],[-.40,.058,.061]],'dark');
  plate(`thigh-plate-${tag}`,`thigh-${tag}`,[[-.069,-.10],[.070,-.10],[.084,-.19],[.047,-.365],[-.046,-.365],[-.077,-.22]],.037,'armor',[0,0,.073],.007);
  plate(`thigh-inlay-${tag}`,`thigh-${tag}`,[[-.048,-.145],[-.029,-.155],[-.025,-.30],[-.043,-.32]],.010,'orange',[s*.005,0,.101],.002);
  profile(`shin-frame-${tag}`,`shin-${tag}`,[[-.045,.071,.067],[-.12,.078,.073],[-.29,.056,.058],[-.39,.043,.045]],'dark');
  plate(`shin-plate-${tag}`,`shin-${tag}`,[[-.052,-.07],[.053,-.07],[.068,-.13],[.036,-.37],[-.031,-.39],[-.057,-.23]],.034,'armor',[0,0,.067],.006);
  plate(`shin-inlay-${tag}`,`shin-${tag}`,[[-.014,-.12],[.013,-.12],[.009,-.31],[-.007,-.33]],.010,'orange',[0,0,.092],.002);
  cylinder(`knee-hinge-${tag}`,`shin-${tag}`,.066,.157,'steel',[0,0,0],'x',20);
  cylinder(`knee-bolt-${tag}`,`shin-${tag}`,.038,.017,'orange',[s*.088,0,0],'x',10);
  plate(`kneecap-${tag}`,`shin-${tag}`,[[-.062,.018],[0,.042],[.062,.018],[.053,-.065],[0,-.095],[-.053,-.065]],.035,'dark',[0,0,.084],.006);
  plate(`kneecap-inset-${tag}`,`shin-${tag}`,[[-.038,.008],[.039,.008],[.029,-.048],[0,-.061],[-.030,-.048]],.015,'armor',[0,0,.108],.003);
  for(let j=0;j<3;j++)cylinder(`ankle-collar-${tag}-${j}`,`foot-${tag}`,.045-j*.002,.020,'rubber',[0,.008+j*.02,-.005],'y');
  const boot=(bottom,top)=>[-.09,-.035,.13,.215].map((z,j)=>{
    const w=[.050,.063,.066,.052][j],lo=bottom+(j===3?.012:0),hi=top[j],b=.009;
    return [[-w+b,lo,z],[w-b,lo,z],[w,lo+b,z],[w,hi-b,z],[w-b,hi,z],[-w+b,hi,z],[-w,hi-b,z],[-w,lo+b,z]];
  });
  mesh(`boot-sole-${tag}`,`foot-${tag}`,loft(boot(-.12,[-.091,-.091,-.091,-.085])),'rubber');
  mesh(`boot-armor-${tag}`,`foot-${tag}`,loft(boot(-.090,[-.016,.012,-.033,-.063])),'dark');
  plate(`boot-toe-${tag}`,`foot-${tag}`,[[-.047,-.035],[.047,-.035],[.056,-.06],[.046,-.086],[-.046,-.086],[-.056,-.06]],.06,'armor',[0,0,.16],.003);
  box(`boot-heel-${tag}`,`foot-${tag}`,[.075,.028,.015],[0,-.065,-.096],'steel');
  for(let j=0;j<2;j++)box(`boot-buckle-${tag}-${j}`,`foot-${tag}`,[.085,.009,.018],[0,-.011-j*.018,.006+j*.040],'steel');
  // World-space rest sleeve; four influence buffers are attached through bindSkin.
  const g=new T.CylinderGeometry(.059,.060,.91,12,42,false).translate(s*.105,1.035-.455,0);
  const sleeve=mesh(`flex-sleeve-${tag}`,'vanguard',g,'rubber');
  const indices=[],weights=[];
  for(let i=0;i<sleeve.geometry.positions.length/3;i++) {
    const down=1.035-sleeve.geometry.positions[i*3+1],u=T.MathUtils.clamp((down-.405)/.13,0,1),w=u*u*(3-2*u);
    indices.push(0,1,0,0);weights.push(1-w,w,0,0);
  }
  sleeve._bind={joints:[`thigh-${tag}`,`shin-${tag}`],indices,weights};
}
// Rifle geometry is a decorative game prop; both hands share explicit grip targets.
add('group','rifle','spine',{position:[.055,.20,.28]});
const gunPanel=(id,outline,depth,mat='gun',position=[0,0,0],bevel=.002)=>{
  const n=plate(id,'rifle',outline,depth,mat,position,bevel);n.rotation=[0,-Math.PI/2,0];return n;
};
gunPanel('rifle-receiver',[[-.035,-.035],[.18,-.035],[.245,.015],[.23,.065],[-.02,.065],[-.055,.025]],.071);
gunPanel('rifle-stock',[[-.19,.065],[-.07,.055],[-.025,.035],[-.035,-.02],[-.16,-.045],[-.205,-.025]],.057,'dark');
gunPanel('stock-pad',[[-.205,.065],[-.185,.065],[-.175,-.045],[-.205,-.055]],.063,'rubber');
gunPanel('pistol-grip',[[.008,-.025],[.068,-.033],[.054,-.145],[.014,-.151],[-.006,-.11]],.035,'rubber');
gunPanel('magazine',[[.095,-.035],[.158,-.035],[.179,-.19],[.151,-.245],[.097,-.239],[.12,-.18]],.045,'dark');
for(let j=0;j<3;j++)gunPanel(`magazine-rib-${j}`,[[.119+j*.012,-.09],[.125+j*.012,-.09],[.144+j*.008,-.21],[.138+j*.008,-.21]],.047,'steel');
gunPanel('fore-end',[[.205,-.022],[.455,-.022],[.477,.02],[.46,.064],[.215,.064]],.065);
for(let i=0;i<5;i++) {
  gunPanel(`handguard-vent-${i}`,[[.25+i*.038,.008],[.272+i*.038,.008],[.272+i*.038,.035],[.25+i*.038,.035]],.068,'rubber');
  box(`rail-tooth-${i}`,'rifle',[.042,.010,.012],[0,.079,.245+i*.039],'steel');
}
cylinder('rifle-barrel','rifle',.011,.17,'steel',[0,.023,.54],'z');
cylinder('muzzle-shroud','rifle',.020,.062,'gun',[0,.023,.65],'z',12);
cylinder('muzzle-dark-bore','rifle',.012,.002,'rubber',[0,.023,.683],'z',12);
gunPanel('front-support-grip',[[.224,-.02],[.26,-.02],[.26,-.107],[.232,-.113],[.219,-.09]],.033,'rubber');
box('optic-mount','rifle',[.044,.033,.065],[0,.096,.081],'dark');
cylinder('optic-body','rifle',.024,.11,'gun',[0,.135,.095],'z',16);
cylinder('optic-lens','rifle',.018,.003,'visor',[0,.135,.152],'z',16);
// Hollow trigger guard, not a solid box under the receiver.
{
 const sh=new T.Shape([[-.005,-.035],[.084,-.035],[.08,-.093],[.016,-.098]].map(p=>new T.Vector2(...p)));
 sh.holes.push(new T.Path([[.012,-.047],[.022,-.084],[.065,-.080],[.069,-.047]].map(p=>new T.Vector2(...p))));
 const n=mesh('trigger-guard','rifle',new T.ExtrudeGeometry(sh,{depth:.009,bevelEnabled:false}).translate(0,0,-.0045),'gun');n.rotation=[0,-Math.PI/2,0];
}
// Arms are solved around the two weapon grips in torso coordinates.
const grips={R:[.108,.095,.34],L:[.002,.14,.52]};
for(const s of [-1,1]) {
  const tag=s<0?'L':'R',shoulder=V([s*.25,.38,.025]),hand=V(grips[tag]);
  const elbow=solveLimb(shoulder,hand,lengths.arm,lengths.forearm,V([s*.9,-.25,-.3]));
  const upperQ=downTo(elbow.clone().sub(shoulder)),lowerQ=downTo(hand.clone().sub(elbow));
  bone(`upperarm-${tag}`,'spine',shoulder.toArray(),euler(upperQ));
  bone(`forearm-${tag}`,`upperarm-${tag}`,[0,-lengths.arm,0],euler(upperQ.clone().invert().multiply(lowerQ)));
  bone(`hand-${tag}`,`forearm-${tag}`,[0,-lengths.forearm,0],euler(lowerQ.clone().invert()));
  profile(`deltoid-${tag}`,`upperarm-${tag}`,[[.055,.075,.075],[-.015,.105,.095],[-.125,.09,.09],[-.155,.065,.07]],tag==='R'?'orange':'armor');
  profile(`upperarm-chassis-${tag}`,`upperarm-${tag}`,[[-.12,.054,.058],[-.18,.066,.065],[-.265,.048,.051]],'dark');
  plate(`bicep-plate-${tag}`,`upperarm-${tag}`,[[-.042,-.14],[.043,-.14],[.05,-.20],[.032,-.27],[-.035,-.27]],.028,'armor',[0,0,.055],.005);
  cylinder(`elbow-hinge-${tag}`,`forearm-${tag}`,.042,.104,'steel',[0,0,0],'x');
  cylinder(`elbow-cap-${tag}`,`forearm-${tag}`,.026,.012,'orange',[s*.058,0,0],'x',10);
  profile(`forearm-gauntlet-${tag}`,`forearm-${tag}`,[[-.035,.049,.048],[-.08,.060,.060],[-.20,.046,.05],[-.255,.032,.037]],'dark');
  plate(`forearm-plate-${tag}`,`forearm-${tag}`,[[-.043,-.06],[.043,-.06],[.048,-.12],[.025,-.235],[-.028,-.235]],.027,'armor',[0,0,.05],.005);
  rod(`forearm-inlay-${tag}`,`forearm-${tag}`,[s*.02,-.09,.07],[s*.015,-.19,.07],.004,'glow');
  cylinder(`wrist-ring-${tag}`,`forearm-${tag}`,.031,.027,'steel',[0,-.284,0],'y');
  const mirror=tag==='R'?1:-1;
  profile(`palm-${tag}`,`hand-${tag}`,[[-.035,.020,.019],[.026,.025,.025],[.037,.019,.016]],'dark',{position:[mirror*.013,0,0]});
  plate(`knuckle-plate-${tag}`,`hand-${tag}`,[[-.012,-.026],[.025,-.026],[.030,.023],[.015,.035],[-.012,.025]],.009,'armor',[mirror*.017,0,-.021],.002);
  for(let j=0;j<3;j++) {
    const y=-.025+j*.016;
    const pts=[[mirror*-.008,y,.015],[mirror*-.034,y,.025],[mirror*-.056,y,.007],[mirror*-.052,y,-.009]];
    for(let k=0;k<3;k++)rod(`finger-${tag}-${j}-${k}`,`hand-${tag}`,pts[k],pts[k+1],.0065,k===0?'steel':'dark');
  }
  const index=tag==='R'?[[0,.023,.018],[-.01,.025,.052],[-.018,.025,.075]]:[[.008,.025,.013],[.035,.026,.024],[.053,.024,.006]];
  for(let k=0;k<2;k++)rod(`index-${tag}-${k}`,`hand-${tag}`,index[k],index[k+1],.0065,'steel');
  const thumb=[[mirror*.020,.025,-.009],[mirror*-.006,.043,-.017],[mirror*-.027,.026,-.023]];
  for(let k=0;k<2;k++)rod(`thumb-${tag}-${k}`,`hand-${tag}`,thumb[k],thumb[k+1],.007,'dark');
}
// Countersunk fasteners, fitted panels and exposed telescopic knee actuators.
for(const tag of ['L','R']) {
  const s=tag==='L'?-1:1;
  for(const [part,y,z,x] of [['thigh',-.14,.099,.054],['thigh',-.31,.096,.029],['shin',-.115,.091,.043],['shin',-.31,.087,.022],['forearm',-.09,.071,.030]]) {
    for(const side of [-1,1]) {
      const id=`fastener-${part}-${tag}-${Math.round(-y*1000)}-${side<0?'a':'b'}`;
      cylinder(id,`${part}-${tag}`,.006,.005,'dark',[side*x,y,z],'z',10);
      rod(`${id}-slot`,`${part}-${tag}`,[side*x-.003,y,z+.003],[side*x+.003,y,z+.003],.001,'steel');
    }
  }
  mesh(`knee-rim-${tag}`,`shin-${tag}`,new T.TorusGeometry(.045,.005,6,24),'dark',{position:[s*.099,0,0],rotation:[0,Math.PI/2,0]});
  for(let j=0;j<3;j++)cylinder(`knee-screw-${tag}-${j}`,`shin-${tag}`,.004,.006,'steel',[s*.10,.025*Math.cos(j*Math.PI*2/3),.025*Math.sin(j*Math.PI*2/3)],'x',8);
  const restPiston=V([0,-.45,-.003]),restLength=restPiston.length();
  add('group',`piston-${tag}`,`thigh-${tag}`,{position:[s*.067,-.18,-.072],rotation:euler(downTo(restPiston))});
  cylinder(`piston-barrel-${tag}`,`piston-${tag}`,.018,.155,'steel',[0,-.0775,0],'y',16);
  cylinder(`piston-seal-${tag}`,`piston-${tag}`,.020,.018,'dark',[0,-.15,0],'y',16);
  cylinder(`piston-mount-${tag}`,`piston-${tag}`,.025,.051,'orange',[0,0,0],'x',12);
  add('group',`pistonrod-${tag}`,`piston-${tag}`,{position:[0,-.14,0],scale:[1,restLength-.14,1]});
  cylinder(`piston-shaft-${tag}`,`pistonrod-${tag}`,.009,1,'steel',[0,-.5,0],'y',12);
  add('group',`piston-end-${tag}`,`piston-${tag}`,{position:[0,-restLength,0]});
  cylinder(`piston-end-cap-${tag}`,`piston-end-${tag}`,.022,.045,'dark',[0,0,0],'x',12);
}
plate('unit-badge','spine',[[-.152,.282],[-.063,.282],[-.063,.334],[-.152,.334]],.004,'dark',[0,0,.153],.001);
{
 const sh=new T.Shape();sh.absellipse(0,0,.009,.016,0,Math.PI*2,false,0);
 const hole=new T.Path();hole.absellipse(0,0,.004,.010,0,Math.PI*2,true,0);sh.holes.push(hole);
 mesh('unit-zero','spine',new T.ExtrudeGeometry(sh,{depth:.002,bevelEnabled:false,curveSegments:12}),'armor',{position:[-.128,.307,.157]});
 plate('unit-seven','spine',[[0,.016],[.019,.016],[.019,.009],[.010,-.016],[.003,-.016],[.012,.009],[0,.009]],.002,'armor',[-.108,.307,.158],0);
}
// Capture bind matrices in the true standing rest pose, before adding animation.
const bindings=[];
// Export the complete fifteen-bone rig as glTF joints, including rigid armor
// bones with zero sleeve weight, so game importers retain the full skeleton.
const jointNames=doc.nodes.filter(n=>n.type==='bone').map(n=>n.id);
for(const n of doc.nodes)if(n._bind){
  const b=n._bind;
  bindings.push({op:'bindSkin',id:n.id,joints:jointNames,indices:b.indices.map(i=>jointNames.indexOf(b.joints[i])),weights:b.weights});
  delete n._bind;
}
doc=applyCommands(doc,bindings);
// The add() helper closed over the original document; no nodes are added afterward.
const cycle=COMBAT_RUN_PROFILE.cycle,stride=COMBAT_RUN_PROFILE.distance,duty=COMBAT_RUN_PROFILE.duty,footPoints={},soles={};
for(const tag of ['L','R']) {
  footPoints[tag]=[];
  for(const n of doc.nodes.filter(n=>n.parent===`foot-${tag}`&&n.type==='mesh')) {
    const g=geometryFor(n),m=new T.Matrix4().compose(V(n.position),new T.Quaternion().setFromEuler(new T.Euler(...n.rotation)),V(n.scale));
    for(let i=0;i<g.attributes.position.count;i++)footPoints[tag].push(new T.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(m));
    g.dispose();
  }
  soles[tag]=createSoleRoll(footPoints[tag].map(v=>v.toArray()));
}
const moving=['hips','spine','head','thigh-L','shin-L','foot-L','thigh-R','shin-R','foot-R','piston-L','pistonrod-L','piston-end-L','piston-R','pistonrod-R','piston-end-R','rifle','upperarm-L','forearm-L','hand-L','upperarm-R','forearm-R','hand-R'];
function motion(time,forward=false) {
  const body=runningBody(time),hipRotation=[0,body.pelvisYaw,body.pelvisRoll];
  const hipQ=new T.Quaternion().setFromEuler(new T.Euler(...hipRotation));
  const hipPosition=V([body.lateral,body.height,0]);
  const gunBase=V([.055,.20,.28]),gunPosition=gunBase.clone().add(V(body.weaponOffset));
  const gunQ=new T.Quaternion().setFromEuler(new T.Euler(...body.weaponRotation));
  const result={hips:{position:hipPosition.toArray(),rotation:hipRotation},
    spine:{rotation:[body.chestPitch,body.chestYaw,body.chestRoll]},
    head:{rotation:[-.08,body.headYaw,body.headRoll]},
    rifle:{position:gunPosition.toArray(),rotation:body.weaponRotation}};
  for(const s of [-1,1]) {
    const tag=s<0?'L':'R',gait=runningFoot(time,tag,soles[tag]);
    const footQ=new T.Quaternion().setFromAxisAngle(V([0,1,0]),gait.yaw).multiply(new T.Quaternion().setFromAxisAngle(V([1,0,0]),gait.pitch));
    const hip=V([s*.105,0,0]).applyQuaternion(hipQ).add(hipPosition),ankle=V([gait.lateral,gait.height,gait.forward]);
    const knee=solveLimb(hip,ankle,lengths.upper,lengths.lower,V([0,0,1]));
    const upperQ=downTo(knee.clone().sub(hip)),lowerQ=downTo(ankle.clone().sub(knee));
    result[`thigh-${tag}`]={rotation:euler(hipQ.clone().invert().multiply(upperQ))};
    const lowerLocal=upperQ.clone().invert().multiply(lowerQ);
    result[`shin-${tag}`]={rotation:euler(lowerLocal)};
    result[`foot-${tag}`]={rotation:euler(lowerQ.clone().invert().multiply(footQ))};
    const pistonStart=V([s*.067,-.18,-.072]);
    const pistonEnd=V([s*.067,-.16,-.075]).applyQuaternion(lowerLocal).add(V([0,-lengths.upper,0]));
    const vector=pistonEnd.sub(pistonStart),length=vector.length();
    if(length<.16)throw new Error('Piston barrel would bottom out');
    result[`piston-${tag}`]={rotation:euler(downTo(vector))};
    result[`pistonrod-${tag}`]={scale:[1,length-.14,1]};
    result[`piston-end-${tag}`]={position:[0,-length,0]};
    const shoulder=V([s*.25,.38,.025]),hand=V(grips[tag]).sub(gunBase).applyQuaternion(gunQ).add(gunPosition);
    const elbow=solveLimb(shoulder,hand,lengths.arm,lengths.forearm,V([s*.9,-.25,-.3]));
    const armQ=downTo(elbow.clone().sub(shoulder)),foreQ=downTo(hand.clone().sub(elbow));
    result[`upperarm-${tag}`]={rotation:euler(armQ)};
    result[`forearm-${tag}`]={rotation:euler(armQ.clone().invert().multiply(foreQ))};
    result[`hand-${tag}`]={rotation:euler(foreQ.clone().invert().multiply(gunQ))};
  }
  if(forward)result.vanguard={position:[0,0,time/cycle*stride]};
  return result;
}
const clips=[];
for(const [id,name,forward] of [['run','Combat run · in place',false],['run-forward','Combat run · root motion +Z',true]]) {
  const tracks={};
  for(const id of [...moving,...(forward?['vanguard']:[])])tracks[id]=[];
  for(let i=0;i<=384;i++) {
    const time=i/240,pose=motion(time,forward);
    for(const id of Object.keys(tracks)) {
      const n=doc.nodes.find(n=>n.id===id);
      tracks[id].push({time,position:[...n.position],rotation:[...n.rotation],scale:[1,1,1],...pose[id]});
    }
  }
  clips.push({id,name,duration:1.6,loop:id==='run',tracks});
}
doc.clips=clips;
const landmarks={};
for(const tag of ['L','R']) {
  for(const [label,point] of [['heel',[-.035,-.12,-.06]],['toe',[.035,-.12,.10]],['outer',[(tag==='L'?-1:1)*.05,-.12,.04]]])
    landmarks[`${tag}-${label}`]={node:`foot-${tag}`,point};
  landmarks[`${tag}-hand`]={node:`hand-${tag}`,point:[0,0,0]};
  landmarks[`${tag}-grip`]={node:'rifle',point:V(grips[tag]).sub(V([.055,.20,.28])).toArray()};
}
// A rolling foot does not pin one heel landmark throughout toe-off. Declare
// actual support-feature intervals, preserving the original audit tolerances.
const feet=[];
for(const tag of ['L','R']) {
  const contacts=[],supportIds=[];let feature=null,start=0,key;
  const parts=[];
  for(let i=0;i<=800;i++) {
    const u=Math.min(i/800,1-1e-10),time=u*duty*cycle;
    const localTime=tag==='R'?time+cycle*.5:time;
    const point=runningFoot(localTime,tag,soles[tag]).supportPoint;
    const current=point.map(x=>Math.round(x*1e6)/1e6).join(',');
    if(current!==feature) {
      if(feature!==null)parts.push({start,end:i/800,landmark:key});
      key=`${tag}-support-${supportIds.length}`;supportIds.push(key);landmarks[key]={node:`foot-${tag}`,point};
      feature=current;start=i/800;
    }
  }
  parts.push({start,end:1,landmark:key});
  for(const base of tag==='L'?[0,.5]:[.25,.75])for(const p of parts)
    contacts.push({start:base+p.start*duty/2,end:base+p.end*duty/2,landmark:p.landmark});
  feet.push({id:tag,sole:[`${tag}-heel`,`${tag}-toe`,`${tag}-outer`,...supportIds],contacts});
}
doc.review={version:1,landmarks,measurements:['L','R'].map(tag=>({id:`grip-${tag}`,between:[`${tag}-hand`,`${tag}-grip`],range:[0,.0002]})),symmetry:[],motion:{
  root:'vanguard',clip:'run',forward:[0,0,1],facingAxis:[0,0,1],mode:'inPlace',distance:stride*2,groundY:0,requireFlight:true,flightHeight:.007,
  tolerances:{slip:.004,ground:.003,penetration:.003,travel:.005,facingAngle:1,directionAngle:1},
  feet,
}};
doc=validateDocument(doc);
await fs.writeFile(`${out}/cyborg.graph.json`,JSON.stringify(doc));
if(!globalThis.FileReader)globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();},e=>this.onerror?.(e));}};
const bytes=await createGLB(doc);await fs.writeFile(`${out}/cyborg.glb`,new Uint8Array(bytes));
const frames=[];
for(let i=0;i<32;i++)frames.push(Object.fromEntries(moving.map(id=>{const n=doc.nodes.find(n=>n.id===id);return[id,poseFor(doc,n,i/20,'run')];})));
await fs.writeFile(`${out}/run-samples.json`,JSON.stringify({fps:20,duration:1.6,cycle,stride,frames}));
let triangles=0,vertices=0;for(const n of doc.nodes.filter(n=>n.type==='mesh')){const g=geometryFor(n);triangles+=(g.index?.count??g.attributes.position.count)/3;vertices+=g.attributes.position.count;g.dispose();}
await fs.writeFile(`${out}/manifest.json`,JSON.stringify({name:doc.name,nodes:doc.nodes.length,bones:doc.nodes.filter(n=>n.type==='bone').length,skins:doc.nodes.filter(n=>n.skin).length,triangles,vertices,glbBytes:bytes.byteLength,cycle,stride,speed:stride/cycle,forward:'+Z',up:'+Y',grips,lengths},null,2));
await fs.writeFile(`${out}/motion-style.json`,JSON.stringify({profile:COMBAT_RUN_PROFILE,model:'Authored stance-force / ballistic pelvis proxy; C2 foot arcs and sole rolling; baked 3D IK',samples:Array.from({length:121},(_,i)=>({time:i/120,...runningBody(i/120)}))},null,2));
console.log(JSON.stringify({out,nodes:doc.nodes.length,triangles,vertices,skins:2,bytes:bytes.byteLength}));
