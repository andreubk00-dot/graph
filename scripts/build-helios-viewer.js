// One downloadable HTML file: bundled Three.js, actual exported GLB and PNG fallback.
import fs from "node:fs/promises";
import { build } from "esbuild";
const out = process.argv[2] ?? "examples/helios";
const glb = (await fs.readFile(`${out}/helios.glb`)).toString("base64");
const png = (await fs.readFile(`${out}/helios.png`)).toString("base64");
const manifest = JSON.parse(await fs.readFile(`${out}/manifest.json`,"utf8"));
const runtime = `
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const mount=document.querySelector('#stage'),status=document.querySelector('#status');
const bytes=Uint8Array.from(atob(${JSON.stringify(glb)}),c=>c.charCodeAt(0));
document.querySelector('#download').href=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
try {
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 mount.appendChild(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#14232a');
 const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
 const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
 room.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight('#d9e8ff','#68706a',2.3));
 const light=new T.DirectionalLight('#fff3dd',4.5);light.position.set(4,8,5);light.castShadow=true;
 light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-5,right:5,top:6,bottom:-3});
 light.shadow.normalBias=.025;scene.add(light);
 const rim=new T.DirectionalLight('#acc9ff',2);rim.position.set(-5,4,-3);scene.add(rim);
 const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#26363c',roughness:.85}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-.012;ground.receiveShadow=true;scene.add(ground);
 const camera=new T.PerspectiveCamera(36,1,.05,100);camera.position.set(5.8,4.8,11.5);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,2.2,0);controls.enableDamping=true;
 controls.minDistance=4;controls.maxDistance=23;controls.maxPolarAngle=Math.PI*.49;controls.update();
 const asset=await new GLTFLoader().parseAsync(bytes.buffer,'');scene.add(asset.scene);
 asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const mixer=new T.AnimationMixer(asset.scene),selector=document.querySelector('#clip'),seek=document.querySelector('#seek');
 for(const clip of asset.animations){const op=document.createElement('option');op.textContent=clip.name;selector.append(op);}
 let action,active,playing=true,last=performance.now();
 function choose(){mixer.stopAllAction();active=asset.animations[selector.selectedIndex];action=mixer.clipAction(active);action.reset();
  action.setLoop(selector.selectedIndex===1?T.LoopOnce:T.LoopRepeat,Infinity);action.clampWhenFinished=true;action.play();seek.value=0;playing=true;document.querySelector('#play').textContent='Пауза';}
 choose();selector.onchange=choose;
 mixer.addEventListener('finished',()=>{playing=false;document.querySelector('#play').textContent='Повторить';});
 document.querySelector('#play').onclick=()=>{if(selector.selectedIndex===1&&action.time>=active.duration){action.reset().play();playing=false;}playing=!playing;document.querySelector('#play').textContent=playing?'Пауза':'Продолжить';};
 seek.oninput=()=>{action.time=Number(seek.value)*active.duration;action.paused=false;action.enabled=true;mixer.update(0);playing=false;document.querySelector('#play').textContent='Продолжить';};
 document.querySelector('#view').onclick=()=>{camera.position.set(5.8,4.8,11.5);controls.target.set(0,2.2,0);controls.update();};
 document.querySelector('#wire').onchange=e=>asset.scene.traverse(o=>{if(o.isMesh)o.material.wireframe=e.target.checked;});
 new ResizeObserver(()=>{renderer.setSize(mount.clientWidth,mount.clientHeight);camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();}).observe(mount);
 status.textContent='ЛКМ — вращать · колесо — масштаб · ПКМ — перемещать';
 renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;if(playing){mixer.update(dt);seek.value=action.time/active.duration;}controls.update();renderer.render(scene,camera);});
} catch(error) { mount.querySelector('canvas')?.remove();status.textContent='WebGL недоступен — показан сохранённый рендер. GLB можно скачать.';console.error(error); }
`;
// Keep ES imports at module scope while allowing awaited GLB loading.
const imports = runtime.match(/import[^;]+;/g).join("\n");
const bundled = await build({ stdin: { contents: imports + "\n" + `(async()=>{${runtime.replace(/import[^;]+;/g,"")} })();`, resolveDir: process.cwd(), sourcefile: "helios-viewer.js" }, bundle:true, minify:true, write:false });
const js=bundled.outputFiles[0].text.replaceAll("</script", "<\\/script");
await fs.writeFile(`${out}/helios-viewer.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HELIOS · Graph Forge</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0e1b22;color:#dceae5;font:14px system-ui}header{padding:22px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #32464b}h1{font-size:25px;letter-spacing:.22em;margin:0;color:#e6c18a}small{color:#94b3b9}#stage{height:calc(100vh - 190px);min-height:380px;position:relative;background:center/contain no-repeat url(data:image/png;base64,${png})}canvas{display:block;width:100%;height:100%}footer{padding:18px 28px}nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,select,a{background:#1c353c;color:#e2ece7;border:1px solid #446269;border-radius:6px;padding:9px 12px;font:inherit;text-decoration:none;cursor:pointer}#seek{flex:1;min-width:120px;accent-color:#d2ad70}#status{margin:12px 0 0;color:#9bb2b7;font-size:12px}@media(max-width:600px){header{padding:16px}h1{font-size:20px}header small{max-width:130px;text-align:right}footer{padding:14px}#stage{height:60vh;min-height:300px}}</style>
<header><div><h1>HELIOS</h1><small>GRAPH FORGE / SOLAR RELIQUARY</small></div><small>${manifest.triangles.toLocaleString('ru-RU')} треугольников<br>2 клипа · ${manifest.nodes} узлов</small></header>
<main id="stage" aria-label="Интерактивная 3D-модель HELIOS"></main><footer><nav><button id="play">Пауза</button><select id="clip" aria-label="Анимация"></select><input id="seek" aria-label="Время анимации" type="range" min="0" max="1" step=".001" value="0"><button id="view">Вид</button><label><input id="wire" type="checkbox"> Каркас</label><a id="download" download="helios.glb">GLB ↓</a></nav><p id="status">Загрузка 3D. Сохранённый рендер виден до запуска WebGL.</p></footer><script>${js}</script></html>`);
console.log(`${out}/helios-viewer.html (self-contained; no server or CDN)`);
