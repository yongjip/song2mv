import * as THREE from 'three';

export const BASS = Object.freeze({
  stringYs: Object.freeze([-.036, -.012, .012, .036]),
  stringZ: .083,
  faceZ: .045,
  bridgeX: -.224,
  nutX: .925,
  fretMinX: .39,
  fretMaxX: .78,
});

const point=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const material=(color,metalness=0,roughness=.7)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const clamp=x=>Math.min(1,Math.max(0,x));

export function createBass(parent){
  const root=new THREE.Group();root.name='four-string-bass';parent.add(root);
  const teal=material('#318e83',.08,.42),tealEdge=material('#21665f',.06,.53);
  const cream=material('#f3e6bf',0,.74),dark=material('#283e3d',.05,.55);
  const wood=material('#8d603e',0,.71),fingerboard=material('#4d382c',0,.74);
  const nickel=material('#d6d6bd',.58,.33),strings=material('#eee9d4',.5,.3);
  const amber=material('#bc9665',.08,.61);

  function mesh(geometry,paint,name){
    const object=new THREE.Mesh(geometry,paint);object.name=name;object.castShadow=true;object.receiveShadow=true;root.add(object);return object;
  }
  function box(size,position,paint,name){
    const object=mesh(new THREE.BoxGeometry(...size),paint,name);object.position.set(...position);return object;
  }
  function ball(position,scale,paint,name){
    const object=mesh(new THREE.SphereGeometry(1,16,12),paint,name);object.position.set(...position);object.scale.set(...scale);return object;
  }
  function rod(a,b,radius,paint,name){
    const start=point(...a),end=point(...b),delta=end.clone().sub(start);
    const object=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),10),paint,name);
    object.position.copy(start).lerp(end,.5);object.quaternion.setFromUnitVectors(point(0,1,0),delta.normalize());return object;
  }
  function shapeMesh(shape,paint,name,z,depth,bevel){
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:20});
    const object=mesh(geometry,paint,name);object.position.z=z;return object;
  }

  const outline=new THREE.Shape();
  outline.moveTo(.18,.065);
  outline.bezierCurveTo(.18,.105,.255,.175,.214,.242);
  outline.bezierCurveTo(.178,.294,.133,.219,.112,.126);
  outline.bezierCurveTo(.052,.146,.021,.252,-.063,.286);
  outline.bezierCurveTo(-.221,.349,-.315,.221,-.283,.047);
  outline.bezierCurveTo(-.349,-.142,-.25,-.311,-.062,-.311);
  outline.bezierCurveTo(.105,-.312,.227,-.169,.203,-.082);
  outline.bezierCurveTo(.175,-.027,.093,-.043,.122,.016);
  outline.bezierCurveTo(.145,.053,.178,.043,.18,.065);
  shapeMesh(outline,[teal,tealEdge],'bass-body',-.034,.068,.011);

  const neckShape=new THREE.Shape();
  neckShape.moveTo(.135,-.058);neckShape.lineTo(.94,-.047);neckShape.lineTo(.94,.047);neckShape.lineTo(.135,.058);neckShape.closePath();
  shapeMesh(neckShape,wood,'neck-wood',-.02,.057,.003);
  const board=new THREE.Shape();
  board.moveTo(.163,-.051);board.lineTo(.934,-.042);board.lineTo(.934,.042);board.lineTo(.163,.051);board.closePath();
  shapeMesh(board,fingerboard,'fingerboard',.039,.008,.001);

  const headstock=new THREE.Shape();
  headstock.moveTo(.922,-.051);headstock.bezierCurveTo(.985,-.076,1.075,-.071,1.112,-.033);
  headstock.bezierCurveTo(1.151,.016,1.109,.073,1.047,.072);
  headstock.lineTo(.928,.052);headstock.closePath();
  shapeMesh(headstock,[teal,tealEdge],'headstock',-.02,.055,.006);
  rod([.953,.035,.044],[1.074,.045,.044],.004,cream,'headstock-accent');

  const guard=new THREE.Shape();
  guard.moveTo(.134,.052);
  guard.bezierCurveTo(.127,.089,.161,.157,.119,.183);
  guard.bezierCurveTo(.086,.205,.059,.126,.025,.133);
  guard.bezierCurveTo(-.011,.166,-.072,.225,-.123,.188);
  guard.bezierCurveTo(-.212,.131,-.258,.06,-.232,-.077);
  guard.bezierCurveTo(-.229,-.213,-.135,-.275,-.046,-.259);
  guard.bezierCurveTo(.066,-.232,.159,-.145,.135,-.097);
  guard.bezierCurveTo(.107,-.056,.061,-.072,.078,-.018);
  guard.bezierCurveTo(.088,.014,.12,.013,.134,.052);
  shapeMesh(guard,cream,'cream-pickguard',.046,.005,.002);

  for(const x of [-.115,.023]){
    box([.039,.135,.022],[x,0,.063],dark,`pickup-${x}`);
    for(let i=0;i<4;i++)ball([x,BASS.stringYs[i],.076],[.006,.005,.003],nickel,`pickup-pole-${x}-${i}`);
  }
  box([.039,.135,.019],[BASS.bridgeX,0,.064],nickel,'bridge');
  for(let i=0;i<4;i++){
    const y=BASS.stringYs[i];
    box([.024,.014,.01],[BASS.bridgeX+.001,y,.079],dark,`bridge-saddle-${i}`);
    rod([BASS.bridgeX-.006,y,BASS.stringZ],[BASS.nutX,y,BASS.stringZ],.0018+i*.00023,strings,`string-${i}`);
  }
  box([.012,.092,.013],[BASS.nutX,0,.061],cream,'nut');

  const fretXs=[.218,.291,.359,.422,.48,.534,.584,.631,.674,.715,.752,.787,.82,.85,.878,.903];
  fretXs.forEach((x,i)=>rod([x,-.047,.052],[x,.047,.052],.0019,nickel,`fret-${i+1}`));
  [2,4,6,8,11].forEach((n,i)=>{
    const x=(fretXs[n]+fretXs[n+1])/2;
    if(i===4){ball([x,-.019,.052],[.005,.005,.002],cream,'double-dot-a');ball([x,.019,.052],[.005,.005,.002],cream,'double-dot-b');}
    else ball([x,0,.052],[.0055,.0055,.002],cream,`fret-dot-${n}`);
  });

  const pegXs=[.956,1.003,1.05,1.094];
  pegXs.forEach((x,i)=>{
    const y=.053+(x-.94)*.055;
    ball([x,.015,.069],[.011,.011,.008],nickel,`tuning-post-${i}`);
    rod([x,y,.01],[x,y+.044,.01],.005,nickel,`peg-stem-${i}`);
    ball([x,y+.052,.01],[.015,.012,.006],cream,`tuning-peg-${i}`);
    rod([BASS.nutX,BASS.stringYs[i],BASS.stringZ],[x,.015,.076],.00165,strings,`head-string-${i}`);
  });

  for(const [i,x,y] of [[0,-.011,-.173],[1,.076,-.132]]){
    const knob=mesh(new THREE.CylinderGeometry(.018,.019,.018,16),nickel,`control-knob-${i}`);
    knob.rotation.x=Math.PI/2;knob.position.set(x,y,.065);
    rod([x,y+.002,.075],[x+.008,y+.009,.075],.0018,dark,`knob-mark-${i}`);
  }
  for(const [i,x,y] of [[0,-.178,.118],[1,-.187,-.127],[2,-.052,-.23],[3,.098,-.104],[4,.105,.123]])
    ball([x,y,.056],[.0035,.0035,.0018],amber,`guard-screw-${i}`);

  const strapLow=point(-.291,-.095,0),strapHigh=point(.205,.205,0);
  for(const [name,v] of [['low',strapLow],['high',strapHigh]])ball(v.toArray(),[.012,.012,.012],nickel,`strap-button-${name}`);
  const anchors={
    pluck:point(-.055,0,BASS.stringZ),
    fretAt:u=>point(BASS.fretMinX+(BASS.fretMaxX-BASS.fretMinX)*clamp(u),0,BASS.stringZ),
    stringAt:(x,index)=>{if(!Number.isInteger(index)||index<0||index>3)throw new RangeError('String index must be 0 to 3');return point(x,BASS.stringYs[index],BASS.stringZ);},
    strapLow,
    strapHigh,
  };
  root.userData.instrument={type:'bass',strings:4,tuningPegs:4};
  return {root,anchors,stringYs:BASS.stringYs,stringZ:BASS.stringZ,faceZ:BASS.faceZ};
}
