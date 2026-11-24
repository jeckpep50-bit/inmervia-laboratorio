import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DragControls} from 'three/addons/controls/DragControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {ZONES,ANIMALS,JOINTS} from './zones.js';

const $=id=>document.getElementById(id);
const viewer=$('viewer');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.setClearColor(0x000000,0);
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
viewer.append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(39,1,.05,100);
camera.position.set(4,2.5,4.7);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,.95,0);controls.enableDamping=true;controls.minDistance=1.4;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;
const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
const hemi=new THREE.HemisphereLight(0xffffff,0x8e8278,2);scene.add(hemi);
const key=new THREE.DirectionalLight(0xffedd8,2.3);key.position.set(-3,6,4);scene.add(key);
const fill=new THREE.DirectionalLight(0xcbe5ee,1.1);fill.position.set(4,3,-3);scene.add(fill);
const ground=new THREE.Group();scene.add(ground);
const grid=new THREE.GridHelper(12,48,0xcbbfc8,0xe5dedb);grid.material.transparent=true;grid.material.opacity=.24;ground.add(grid);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const sc=shadowCanvas.getContext('2d'),grad=sc.createRadialGradient(64,64,4,64,64,64);grad.addColorStop(0,'rgba(58,37,46,.25)');grad.addColorStop(1,'rgba(58,37,46,0)');sc.fillStyle=grad;sc.fillRect(0,0,128,128);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.5,4.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.005;ground.add(shadow);
const actor=new THREE.Group();actor.rotation.y=.35;scene.add(actor);
const cache=new Map(),loader=new GLTFLoader(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
let current=null,animal='horse',mode='explore',selected=null,loading=false,labelsVisible=false,jointIndex=0,drag=null;
let loadSequence=0,savedDesktop=null,toastTimer;
const visited={horse:new Set(),cow:new Set()};
const labelEls=ZONES.map(z=>{const el=document.createElement('div');el.className='region-label';el.textContent=z.name;el.hidden=true;viewer.append(el);return el;});
const qIdentity=new THREE.Quaternion();
function status(text,success=false){$('xr-status').textContent=text;$('xr-status').classList.toggle('toast',success);}
function toast(text){status(text,true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>status(defaultStatus),4500);}
let defaultStatus='';

ZONES.forEach((z,i)=>{const b=document.createElement('button');b.type='button';b.dataset.region=z.id;b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${z.name}`;b.addEventListener('click',()=>select(z.id));$('regions').append(b);});
JOINTS.forEach((j,i)=>{const o=document.createElement('option');o.value=i;o.textContent=j.label;$('joint').append(o);});
function meshes(){return current?(mode==='assemble'?current.pieces:current.parts):[];}
function materials(o){return Array.isArray(o.material)?o.material:[o.material];}
function select(id){
 if(!current)return; selected=id;visited[animal].add(id);
 const z=ZONES.find(z=>z.id===id),i=ZONES.indexOf(z);
 $('region-number').textContent=`REGIÓN ${String(i+1).padStart(2,'0')} / 10`;$('region-name').textContent=z.name;$('region-text').textContent=z.text;$('challenge').textContent=z.prompt;
 $('visited').textContent=`${visited[animal].size} / 10`;
 document.querySelectorAll('[data-region]').forEach(b=>{b.classList.toggle('active',b.dataset.region===id);b.classList.toggle('visited',visited[animal].has(b.dataset.region));});
 [...current.parts,...current.pieces].forEach(o=>materials(o).forEach(m=>{m.emissive?.set(o.userData.region===id?0x237b82:0x000000);m.emissiveIntensity=o.userData.region===id ? .3 : 0;}));
 drawXRPanel();
}
function bakePieces(parts){
 actor.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(actor.matrixWorld).invert();
 return parts.map(source=>{
  const geometry=source.geometry.clone(),pos=geometry.getAttribute('position'),v=new THREE.Vector3();
  const toLocal=new THREE.Matrix4().multiplyMatrices(inverse,source.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(toLocal);
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);source.applyBoneTransform(i,v);v.applyMatrix4(toLocal);pos.setXYZ(i,v.x,v.y,v.z);}
  pos.needsUpdate=true;const normal=geometry.getAttribute('normal');
  if(normal)for(let i=0;i<normal.count;i++){v.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();normal.setXYZ(i,v.x,v.y,v.z);}
  geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeTangents();geometry.computeBoundingBox();
  const center=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);geometry.computeBoundingSphere();
  const mat=source.material.clone();mat.side=THREE.DoubleSide;
  const piece=new THREE.Mesh(geometry,mat);piece.position.copy(center);piece.name='piece_'+source.userData.region;
  piece.userData={region:source.userData.region,home:center.clone(),homeQuaternion:new THREE.Quaternion(),snapped:true};return piece;
 });
}
async function loadAnimal(id){
 if(loading&&id===animal)return;
 const ticket=++loadSequence;releaseAll();loading=true;animal=id;$('load-state').hidden=false;
 try{
  if(!cache.has(id)){
   const embedded=window.__INMERVIA_MODELS__?.[id];
   const gltf=embedded ? await loader.parseAsync(Uint8Array.from(atob(embedded),c=>c.charCodeAt(0)).buffer,'') : await loader.loadAsync(ANIMALS[id].file);
   const root=gltf.scene;actor.add(root);root.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(root,true),center=box.getCenter(new THREE.Vector3());
   const localCenter=actor.worldToLocal(center.clone());
   // Normalize the loaded authored root, retaining its skin hierarchy.
   root.position.x-=localCenter.x;root.position.z-=localCenter.z;
   root.updateMatrixWorld(true);
   const parts=[];root.traverse(o=>{if(o.isSkinnedMesh&&o.userData.region){o.material=o.material.clone();o.material.roughness=Math.max(.65,o.material.roughness);o.frustumCulled=false;parts.push(o);}});
   if(parts.length!==10)throw new Error('El modelo no contiene las diez regiones esperadas.');
   const bones=[];root.traverse(o=>{if(o.isBone){o.quaternion.normalize();bones.push(o);}});root.updateMatrixWorld(true);
   const tail=bones.find(b=>b.name===`${ANIMALS[id].prefix}_Tail`||b.name===`${ANIMALS[id].prefix} Tail`);
   if(tail){let tip=tail;while(tip.children.find(c=>c.isBone))tip=tip.children.find(c=>c.isBone);const a=tail.getWorldPosition(new THREE.Vector3()),b=tip.getWorldPosition(new THREE.Vector3()),direction=b.sub(a).normalize();if(direction.lengthSq()>.5){const delta=new THREE.Quaternion().setFromUnitVectors(direction,new THREE.Vector3(0,-1,0));const target=delta.multiply(tail.getWorldQuaternion(new THREE.Quaternion()));tail.quaternion.copy(tail.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target));root.updateMatrixWorld(true);}}
   const pieces=bakePieces(parts),assembly=new THREE.Group();pieces.forEach(p=>assembly.add(p));actor.add(assembly);assembly.visible=false;
   const joints=JOINTS.map(j=>{const bone=bones.find(b=>b.name===`${ANIMALS[id].prefix} ${j.suffix}`||b.name===`${ANIMALS[id].prefix}_${j.suffix.replaceAll(' ','_')}`);if(!bone)throw new Error('Articulación ausente: '+j.label);bone.quaternion.normalize();const worldAxis=new THREE.Vector3(j.axis==='x'?1:0,j.axis==='y'?1:0,0).applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));const axis=worldAxis.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();return{bone,rest:bone.quaternion.clone(),axis,angle:0};});
   const datum={root,parts,pieces,assembly,joints,centers:new Map(pieces.map(p=>[p.userData.region,p.userData.home.clone()]))};root.visible=false;cache.set(id,datum);
  }
  if(ticket!==loadSequence)return;
  if(current){current.root.visible=false;current.assembly.visible=false;}
  current=cache.get(id);selected=null;resetPose();restorePieces(false);setMode('explore');
  $('animal-name').textContent=ANIMALS[id].name;$('animal-scientific').textContent=ANIMALS[id].scientific;
  document.querySelectorAll('[data-animal]').forEach(b=>b.classList.toggle('active',b.dataset.animal===id));
  $('reference').hidden=id!=='horse';select('head');updateDrag();
 }catch(e){console.error(e);$('load-state').textContent='No se pudo cargar el animal. Recarga la página para volver a intentarlo.';status(e.message);}
 finally{if(ticket===loadSequence){loading=false;if(current)$('load-state').hidden=true;drawXRPanel();}}
}
function setMode(next){
 if(!current)return;releaseAll();mode=next;resetPose();
 current.root.visible=next==='explore';current.assembly.visible=next==='assemble';
 $('pose-card').hidden=next!=='explore';$('assembly-card').hidden=next!=='assemble';
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
 $('mode-note').textContent=next==='explore'?'Selecciona una región para conocerla.':'Separa y vuelve a colocar las diez piezas.';
 $('viewer-hint').textContent=next==='explore'?'Arrastra para girar · Rueda para acercar · Clic para seleccionar':'Arrastra las piezas · Acércalas a su lugar para encajar';
 if(drag)drag.enabled=next==='assemble'&&!renderer.xr.isPresenting;
 updateCount();drawXRPanel();
}
function setPose(angle){
 if(!current||mode!=='explore')return;const j=current.joints[jointIndex];j.angle=THREE.MathUtils.clamp(Number(angle),-25,25);
 j.bone.quaternion.copy(j.rest).multiply(new THREE.Quaternion().setFromAxisAngle(j.axis,THREE.MathUtils.degToRad(j.angle)));
 refreshBounds();$('pose').value=j.angle;$('pose-value').textContent=j.angle+'°';drawXRPanel();
}
function refreshBounds(){current.root.updateMatrixWorld(true);current.parts.forEach(p=>{p.computeBoundingBox();p.computeBoundingSphere();const world=p.localToWorld(p.boundingBox.getCenter(new THREE.Vector3()));current.centers.set(p.userData.region,actor.worldToLocal(world));});}
function resetPose(){if(!current)return;current.joints.forEach(j=>{j.bone.quaternion.copy(j.rest);j.angle=0;});refreshBounds();$('pose').value=0;$('pose-value').textContent='0°';}
function updateCount(){if(!current)return;const n=current.pieces.filter(p=>p.userData.snapped).length;$('assembly-count').textContent=`${n} / 10 piezas en su sitio`;drawXRPanel();}
function restorePieces(message=true){if(!current)return;releaseAll();current.pieces.forEach(p=>{p.position.copy(p.userData.home);p.quaternion.copy(p.userData.homeQuaternion);p.scale.setScalar(1);p.userData.snapped=true;});updateCount();if(message)toast('Las diez piezas vuelven a su posición inicial.');}
function explode(){if(!current)return;if(mode!=='assemble')setMode('assemble');releaseAll();actor.updateMatrixWorld(true);const view=renderer.xr.isPresenting?renderer.xr.getCamera():camera;const inv=new THREE.Matrix4().copy(actor.matrixWorld).invert();const right=new THREE.Vector3(1,0,0).applyQuaternion(view.getWorldQuaternion(new THREE.Quaternion())).transformDirection(inv);const up=new THREE.Vector3(0,1,0).applyQuaternion(view.getWorldQuaternion(new THREE.Quaternion())).transformDirection(inv);current.pieces.forEach(p=>{const i=ZONES.findIndex(z=>z.id===p.userData.region),a=i*Math.PI*2/10;const dir=right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up,Math.sin(a));p.position.copy(p.userData.home).addScaledVector(dir,.72+(i%3)*.08);p.quaternion.identity();p.userData.snapped=false;});updateCount();}
function trySnap(p){
 const close=p.position.distanceTo(p.userData.home)<.2,aligned=p.quaternion.angleTo(p.userData.homeQuaternion)<THREE.MathUtils.degToRad(28);
 if(close&&aligned){p.position.copy(p.userData.home);p.quaternion.copy(p.userData.homeQuaternion);p.userData.snapped=true;toast('Pieza colocada: '+ZONES.find(z=>z.id===p.userData.region).name);}
 else p.userData.snapped=false;
 updateCount();return p.userData.snapped;
}
function selectedPiece(){return current?.pieces.find(p=>p.userData.region===selected);}
function updateDrag(){if(drag)drag.dispose();drag=new DragControls(current.pieces,camera,renderer.domElement);drag.enabled=mode==='assemble'&&!renderer.xr.isPresenting;
 drag.addEventListener('dragstart',e=>{controls.enabled=false;e.object.userData.snapped=false;select(e.object.userData.region);updateCount();});
 drag.addEventListener('dragend',e=>{controls.enabled=true;trySnap(e.object);});
}
function resetView(){if(renderer.xr.isPresenting){placeInRoom();return;}camera.position.set(4,2.5,4.7);controls.target.set(0,.95,0);actor.position.set(0,0,0);actor.rotation.set(0,.35,0);actor.scale.setScalar(1);controls.update();}
document.querySelectorAll('[data-animal]').forEach(b=>b.addEventListener('click',()=>loadAnimal(b.dataset.animal)));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('joint').addEventListener('change',e=>{jointIndex=Number(e.target.value);$('pose').value=current.joints[jointIndex].angle;$('pose-value').textContent=$('pose').value+'°';drawXRPanel();});
$('pose').addEventListener('input',e=>setPose(e.target.value));$('reset-pose').addEventListener('click',()=>{resetPose();drawXRPanel();});
$('explode').addEventListener('click',explode);$('restore').addEventListener('click',()=>restorePieces());
$('rotate-piece').addEventListener('click',()=>{const p=selectedPiece();if(p){p.rotateY(Math.PI/12);p.userData.snapped=false;updateCount();}});
$('fit-piece').addEventListener('click',()=>{const p=selectedPiece();if(p){p.position.copy(p.userData.home);p.quaternion.identity();trySnap(p);}});
$('reset-view').addEventListener('click',resetView);
$('labels').addEventListener('click',()=>{labelsVisible=!labelsVisible;$('labels').textContent=labelsVisible?'Ocultar nombres':'Mostrar nombres';});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('reference').addEventListener('click',()=>$('reference-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{if(renderer.xr.isPresenting||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshes(),false)[0];if(hit)select(hit.object.userData.region);down=null;});

// The headset gets its own world-space panel; it never depends on DOM overlay support.
const panelCanvas=document.createElement('canvas');panelCanvas.width=1024;panelCanvas.height=1190;
const pc=panelCanvas.getContext('2d'),panelTexture=new THREE.CanvasTexture(panelCanvas);panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=new THREE.Mesh(new THREE.PlaneGeometry(.84,.976),new THREE.MeshBasicMaterial({map:panelTexture,side:THREE.DoubleSide,toneMapped:false}));panel.visible=false;scene.add(panel);
let panelButtons=[];
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=4){let line='',row=0;for(const word of text.split(' ')){const test=line+word+' ';if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line.trim(),x,y+row*lineHeight);row++;line='';if(row>=maxLines)return;}line+=word+' ';}if(row<maxLines)ctx.fillText(line.trim(),x,y+row*lineHeight);}
function drawXRPanel(){
 if(!pc)return;pc.fillStyle='#fcf9fc';pc.fillRect(0,0,1024,1190);pc.fillStyle='#511d4c';pc.fillRect(0,0,1024,135);pc.fillStyle='#fff';pc.font='bold 45px Arial';pc.fillText('INMERVIA · '+ANIMALS[animal].name,42,63);pc.font='27px Arial';pc.fillText('Anatomía externa · '+(mode==='explore'?'Explorar':'Montar piezas'),42,108);
 const z=ZONES.find(z=>z.id===selected);pc.fillStyle='#511d4c';pc.font='bold 36px Arial';pc.fillText(z?.name||'Selecciona una región',42,190);pc.fillStyle='#4d4250';pc.font='27px Arial';wrapText(pc,z?.text||'Apunta al animal y pulsa el gatillo.',42,236,938,35,4);
 pc.fillStyle='#29777d';pc.font='bold 29px Arial';const count=current?.pieces.filter(p=>p.userData.snapped).length||0;pc.fillText(mode==='assemble'?`${count} / 10 piezas en su sitio`:`${JOINTS[jointIndex].label}: ${current?.joints[jointIndex]?.angle||0}°`,42,410);
 const items=[['Caballo',()=>loadAnimal('horse')],['Vaca',()=>loadAnimal('cow')],['Explorar',()=>setMode('explore')],['Montar piezas',()=>setMode('assemble')],['Separar piezas',explode],['Restaurar',()=>{restorePieces(false);resetPose();drawXRPanel();}],['Región anterior',()=>cycleRegion(-1)],['Región siguiente',()=>cycleRegion(1)],['Movimiento −',()=>setPose((current?.joints[jointIndex].angle||0)-5)],['Movimiento +',()=>setPose((current?.joints[jointIndex].angle||0)+5)],['Otra articulación',()=>{jointIndex=(jointIndex+1)%JOINTS.length;$('joint').value=jointIndex;drawXRPanel();}],['Girar pieza',()=>{const p=selectedPiece();if(p&&mode==='assemble'){p.rotateY(Math.PI/12);p.userData.snapped=false;updateCount();}}],['Más pequeño',()=>actor.scale.multiplyScalar(.85)],['Más grande',()=>actor.scale.multiplyScalar(1.15)],['Reubicar animal',placeInRoom],['Salir de MR',()=>renderer.xr.getSession()?.end()]];
 panelButtons=items.map(([label,action],i)=>{const x=35+(i%2)*490,y=448+Math.floor(i/2)*81,w=465,h=66;pc.fillStyle=i<4?'#511d4c':'#e8f4f5';pc.fillRect(x,y,w,h);pc.fillStyle=i<4?'#fff':'#511d4c';pc.font='bold 29px Arial';pc.fillText(label,x+18,y+44);return{x,y,w,h,action};});
 pc.fillStyle='#6b5b6b';pc.font='23px Arial';pc.fillText('Gatillo: seleccionar · Agarre: mover piezas',40,1133);pc.fillText('Despiece superficial didáctico · Revisión docente pendiente',40,1167);panelTexture.needsUpdate=true;
}
function cycleRegion(delta){const i=ZONES.findIndex(z=>z.id===selected);select(ZONES[(i+delta+ZONES.length)%ZONES.length].id);}
const controllers=[];
for(let i=0;i<2;i++){
 const c=renderer.xr.getController(i);scene.add(c);controllers.push(c);
 const ray=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-4)]),new THREE.LineBasicMaterial({color:i?0xf5a13a:0x31bcc4,transparent:true,opacity:.85}));c.add(ray);
 c.addEventListener('selectstart',()=>{if(!current||loading)return;const hit=xrHit(c,true);if(!hit)return;if(hit.object===panel){const x=hit.uv.x*1024,y=(1-hit.uv.y)*1190;panelButtons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.action();}else select(hit.object.userData.region);});
 c.addEventListener('squeezestart',()=>{if(mode!=='assemble'||!current||loading||c.userData.held)return;const hit=xrHit(c,false);if(hit&&!controllers.some(other=>other.userData.held===hit.object)){const p=hit.object;select(p.userData.region);p.userData.snapped=false;c.attach(p);c.userData.held=p;updateCount();}});
 c.addEventListener('squeezeend',()=>release(c));c.addEventListener('disconnected',()=>release(c));
}
function xrHit(c,withPanel){c.updateWorldMatrix(true,false);const m=new THREE.Matrix4().extractRotation(c.matrixWorld);raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);raycaster.ray.direction.set(0,0,-1).applyMatrix4(m);return raycaster.intersectObjects(withPanel?[panel,...meshes()]:meshes(),false).find(h=>h.object.visible&&h.object.parent?.visible);}
function release(c){const p=c.userData.held;if(!p)return;delete c.userData.held;if(current){current.assembly.attach(p);trySnap(p);}}
function releaseAll(){for(const c of controllers)release(c);}
function placeInRoom(){
 if(!renderer.xr.isPresenting)return;releaseAll();const head=renderer.xr.getCamera(),pos=head.getWorldPosition(new THREE.Vector3()),dir=head.getWorldDirection(new THREE.Vector3());dir.y=0;dir.normalize();
 actor.position.copy(pos).addScaledVector(dir,2);actor.position.y=0;actor.rotation.set(0,Math.atan2(-dir.x,-dir.z)+.55,0);
 const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();panel.position.copy(pos).addScaledVector(dir,.95).addScaledVector(right,.78);panel.position.y=pos.y-.25;panel.lookAt(pos);drawXRPanel();
}
renderer.xr.addEventListener('sessionstart',()=>{savedDesktop={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:controls.target.clone(),actorPosition:actor.position.clone(),actorQuaternion:actor.quaternion.clone(),scale:actor.scale.clone()};controls.enabled=false;if(drag)drag.enabled=false;ground.visible=false;panel.visible=true;document.body.classList.add('xr-active');actor.scale.setScalar(.6);setTimeout(placeInRoom,250);});
renderer.xr.addEventListener('sessionend',()=>{releaseAll();panel.visible=false;ground.visible=true;document.body.classList.remove('xr-active');if(savedDesktop){camera.position.copy(savedDesktop.position);camera.quaternion.copy(savedDesktop.quaternion);controls.target.copy(savedDesktop.target);actor.position.copy(savedDesktop.actorPosition);actor.quaternion.copy(savedDesktop.actorQuaternion);actor.scale.copy(savedDesktop.scale);}controls.enabled=true;if(drag)drag.enabled=mode==='assemble';resize();controls.update();});
$('enter-mr').addEventListener('click',async()=>{if(loading||!current)return;try{const session=await navigator.xr.requestSession('immersive-ar',{optionalFeatures:['local-floor']});await renderer.xr.setSession(session);}catch(e){status('No se pudo iniciar MR: '+e.message);}});
async function checkXR(){const b=$('enter-mr');if(!window.isSecureContext||location.protocol==='file:'){b.textContent='MR requiere HTTPS';defaultStatus='Exploración 3D local disponible. Abre una dirección HTTPS en las gafas para utilizar realidad mixta.';status(defaultStatus);return;}try{if(navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar')){b.disabled=false;b.textContent='Entrar en realidad mixta';defaultStatus='MR disponible. Utiliza los mandos para seleccionar y agarrar.';}else{b.textContent='Abrir en Meta Quest';defaultStatus='Exploración 3D disponible. Para MR, abre este enlace en el navegador de las Meta Quest.';}}catch{b.textContent='MR no disponible';defaultStatus='No se pudo comprobar la compatibilidad de realidad mixta.';}status(defaultStatus);}
function resize(){const w=viewer.clientWidth,h=viewer.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();if(!renderer.xr.isPresenting)renderer.setSize(w,h);}
new ResizeObserver(resize).observe(viewer);resize();
renderer.setAnimationLoop(()=>{
 if(!renderer.xr.isPresenting)controls.update();
 labelEls.forEach((el,i)=>{el.hidden=!labelsVisible||renderer.xr.isPresenting||!current;if(el.hidden)return;const id=ZONES[i].id,p=mode==='assemble'?current.pieces.find(p=>p.userData.region===id).getWorldPosition(new THREE.Vector3()):actor.localToWorld(current.centers.get(id).clone());p.project(camera);el.hidden=p.z< -1||p.z>1;if(!el.hidden){el.style.left=(p.x*.5+.5)*viewer.clientWidth+'px';el.style.top=(-p.y*.5+.5)*viewer.clientHeight+'px';}});
 renderer.render(scene,camera);
});
// Small observable interface for automated checks of model integrity and interaction state.
window.lab={get ready(){return !!current&&!loading;},get animal(){return animal;},get mode(){return mode;},get selected(){return selected;},get current(){return current;},get actor(){return actor;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},select,loadAnimal,setMode,setPose,explode,restorePieces,trySnap,resetPose,resetView,get jointIndex(){return jointIndex;}};
drawXRPanel();checkXR();loadAnimal('horse');
