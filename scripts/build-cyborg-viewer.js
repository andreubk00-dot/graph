import fs from 'node:fs/promises';
import {build} from 'esbuild';
const out=process.argv[2]??'examples/cyborg';
const bytes=(await fs.readFile(`${out}/cyborg.glb`)).toString('base64');
const png=(await fs.readFile(`${out}/cyborg.png`)).toString('base64');
const source=JSON.parse(await fs.readFile(`${out}/cyborg.graph.json`));
const jointIds=new Set(source.nodes.filter(n=>n.type==='bone').map(n=>n.id));
const links=source.nodes.filter(n=>jointIds.has(n.id)&&jointIds.has(n.parent)).map(n=>[n.parent,n.id]);
const code=`
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
(async()=>{
 const stage=document.querySelector('#stage'),status=document.querySelector('#status');
 const bytes=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0));
 document.querySelector('#download').href=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
 try{
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color('#1c2a35');
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight('#dce9ff','#55616b',2));
  const light=new T.DirectionalLight('#ffe7c6',4);light.position.set(-2,5,4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-3,right:3,top:4,bottom:-2});light.shadow.normalBias=.01;scene.add(light);
  const rim=new T.DirectionalLight('#9dc8ff',2.2);rim.position.set(3,4,-3);scene.add(rim);
  const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#253945',roughness:.75}));ground.rotation.x=-Math.PI/2;ground.position.y=-.002;ground.receiveShadow=true;scene.add(ground);
  const camera=new T.PerspectiveCamera(32,1,.02,100),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=1;controls.maxDistance=15;
  const asset=await new GLTFLoader().parseAsync(bytes.buffer,'');scene.add(asset.scene);asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const root=asset.scene.getObjectByName('vanguard'),lastRoot=new T.Vector3(),mixer=new T.AnimationMixer(asset.scene);
  const selector=document.querySelector('#clip'),seek=document.querySelector('#seek');
  for(const c of asset.animations){const o=document.createElement('option');o.textContent=c.name;selector.append(o);}
  let action,active,playing=true,last=performance.now();
  function resetView(){const p=root.getWorldPosition(new T.Vector3());controls.target.copy(p).add(new T.Vector3(0,.98,.17));camera.position.copy(controls.target).add(new T.Vector3(-2.6,1.1,4.6).multiplyScalar(1/Math.min(1,camera.aspect)));controls.update();}
  function choose(){mixer.stopAllAction();active=asset.animations[selector.selectedIndex];action=mixer.clipAction(active);action.reset();action.setLoop(selector.selectedIndex===1?T.LoopOnce:T.LoopRepeat,Infinity);action.clampWhenFinished=true;action.play();mixer.update(0);asset.scene.updateMatrixWorld(true);lastRoot.copy(root.getWorldPosition(new T.Vector3()));playing=true;document.querySelector('#play').textContent='Пауза';resetView();}
  choose();selector.onchange=choose;
  mixer.addEventListener('finished',()=>{playing=false;document.querySelector('#play').textContent='Повторить';});
  document.querySelector('#play').onclick=()=>{if(selector.selectedIndex===1&&action.time>=active.duration){choose();return;}playing=!playing;document.querySelector('#play').textContent=playing?'Пауза':'Продолжить';};
  seek.oninput=()=>{action.time=Number(seek.value)*active.duration;action.paused=false;action.enabled=true;mixer.update(0);playing=false;document.querySelector('#play').textContent='Продолжить';};
  document.querySelector('#view').onclick=resetView;
  document.querySelector('#wire').onchange=e=>asset.scene.traverse(o=>{if(o.isMesh)o.material.wireframe=e.target.checked;});
  const pairs=${JSON.stringify(links)}.map(([a,b])=>[asset.scene.getObjectByName(a),asset.scene.getObjectByName(b)]);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(pairs.length*6),3));
  const skeleton=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#ffa659',depthTest:false}));skeleton.visible=false;skeleton.renderOrder=10;skeleton.frustumCulled=false;scene.add(skeleton);
  document.querySelector('#bones').onchange=e=>skeleton.visible=e.target.checked;
  const markings=[];
  for(let i=0;i<17;i++){const m=new T.Mesh(new T.BoxGeometry(1.3,.001,.022),new T.MeshStandardMaterial({color:'#4a6473',roughness:1}));m.position.set(0,.001,i*.45-3.6);scene.add(m);markings.push(m);}
  let initialized=false;new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();if(!initialized){resetView();initialized=true;}}).observe(stage);
  status.textContent='ЛКМ — вращать · колесо — масштаб · ПКМ — перемещать';
  renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;if(playing)mixer.update(dt);asset.scene.updateMatrixWorld(true);
   const position=root.getWorldPosition(new T.Vector3()),delta=position.clone().sub(lastRoot);camera.position.add(delta);controls.target.add(delta);lastRoot.copy(position);
   for(let i=0;i<markings.length;i++)markings[i].position.z=i*.45-3.6-(selector.selectedIndex===0?(action.time*2.25)%3.6:0);
   for(let i=0;i<pairs.length;i++){const a=pairs[i][0].getWorldPosition(new T.Vector3()),b=pairs[i][1].getWorldPosition(new T.Vector3());geometry.attributes.position.setXYZ(i*2,a.x,a.y,a.z);geometry.attributes.position.setXYZ(i*2+1,b.x,b.y,b.z);}geometry.attributes.position.needsUpdate=true;
   seek.value=action.time/active.duration;controls.update();renderer.render(scene,camera);
  });
 }catch(error){stage.querySelector('canvas')?.remove();status.textContent='WebGL недоступен. Показан сохранённый рендер; GLB можно скачать.';console.error(error);}
})();`;
const result=await build({stdin:{contents:code,resolveDir:process.cwd(),sourcefile:'cyborg-viewer.js'},bundle:true,write:false,minify:true});
await fs.writeFile(`${out}/cyborg-viewer.html`,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VANGUARD M-07 · Graph Forge</title>
<style>*{box-sizing:border-box}body{margin:0;background:#111d26;color:#dbe5e6;font:14px system-ui}header{padding:18px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #344955}h1{font-size:22px;letter-spacing:.16em;margin:0;color:#e9946e}small{color:#9bb6c3}#stage{height:calc(100vh - 180px);min-height:380px;position:relative;background:center/contain no-repeat url(data:image/png;base64,${png})}canvas{display:block}footer{padding:16px 24px}nav{display:flex;align-items:center;flex-wrap:wrap;gap:9px}button,select,a{border:1px solid #48606d;background:#243a49;color:#dce6e7;padding:8px 10px;border-radius:5px;text-decoration:none;font:inherit;cursor:pointer}#seek{flex:1;min-width:100px;accent-color:#e88a63}#status{font-size:12px;color:#96aeba;margin-bottom:0}@media(max-width:600px){header{padding:14px}header small{max-width:120px;text-align:right}h1{font-size:17px}footer{padding:12px}#stage{height:60vh}}</style>
<header><div><h1>VANGUARD M-07</h1><small>GRAPH FORGE / HIP CARRY RUN</small></div><small>${jointIds.size} костей · 2 скин-сетки<br>2 клипа · 2.25 м/с</small></header>
<main id="stage"></main><footer><nav><button id="play">Пауза</button><select id="clip" aria-label="Клип"></select><input id="seek" type="range" min="0" max="1" step=".001" value="0" aria-label="Время"><button id="view">Вид</button><label><input id="bones" type="checkbox"> Кости</label><label><input id="wire" type="checkbox"> Каркас</label><a id="download" download="cyborg.glb">GLB ↓</a></nav><p id="status">Загрузка. До запуска WebGL виден сохранённый рендер.</p></footer><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
console.log(`${out}/cyborg-viewer.html`);
