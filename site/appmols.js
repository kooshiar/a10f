// Molecule tiles for the application cards and pages (renderer from the problem-card deck, site colours).

// App tiles: dark, full site colours (trapped molecule orange), drawn small; hovering one makes it spin.
const REST = { bond:'#5A6378', cell:'#2E3547' }, SCALE = .72;
// deck colour -> version that reads on the dark tiles (same hue, lighter; carbon becomes light grey)
const DARK = { '#1A1A1A':'#CDD2DC', '#E10600':'#FF5A4F', '#0057FF':'#5C93FF', '#00A651':'#34D27A',
               '#FFC400':'#FFD24D', '#FF7A00':'#FF9440', '#8A2BE2':'#B37BFF' };
import { DATA } from './appsdata.js';
const COL={C:'#1A1A1A',O:'#E10600',N:'#0057FF',F:'#00A651',S:'#FFC400',P:'#FF7A00',Cl:'#00A651',Li:'#8A2BE2',Zn:'#0057FF',Si:'#FF7A00',Al:'#FF7A00',Ir:'#0057FF',Zr:'#00A651',Y:'#FFC400',Fe:'#E10600',Ni:'#00A651',Ru:'#FF7A00',Pt:'#0057FF',I:'#8A2BE2',Au:'#FF7A00',Mg:'#FF7A00',Hv:'#0057FF',Nd:'#8A2BE2',Pr:'#8A2BE2',B:'#FF7A00',La:'#8A2BE2',K:'#8A2BE2',Gd:'#8A2BE2',Cu:'#C8642A',H:null};
const RAD={C:.62,O:.6,N:.6,F:.55,S:.95,P:.85,Cl:1.0,Li:.55,Zn:.85,Si:.85,Al:.85,Ir:.8,Zr:.8,Y:.85,Fe:.75,Ni:.75,Ru:.8,Pt:.8,I:1.1,Au:1.0,Mg:.8,Hv:.4,Nd:1.1,Pr:1.1,B:.6,La:1.1,K:1.1,Gd:1.1,Cu:.75};
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function hex(c){return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));}
function tone(c,t){const x=hex(c),y=t>0?[255,255,255]:[5,8,11],k=Math.abs(t);return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*k)).join(',')})`;}
// molecular surface in 2D: a smooth union of atom spheres (soft max of their heights), shaded per pixel with one
// light from the top left, in the target colour (hex). C: [{x, y, r}] in CSS px.
const LT=(()=>{const v=[-.45,-.6,.66],n=Math.hypot(...v);return v.map(a=>a/n);})(), HV=(()=>{const v=[LT[0],LT[1],LT[2]+1],n=Math.hypot(...v);return v.map(a=>a/n);})();
const off=typeof document!=='undefined'?document.createElement('canvas'):null;
function surface(ctx,C,hex){
  const SURF=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const dpr=devicePixelRatio||1,pad=2;
  const x0=Math.min(...C.map(c=>c.x-c.r))-pad,y0=Math.min(...C.map(c=>c.y-c.r))-pad,x1=Math.max(...C.map(c=>c.x+c.r))+pad,y1=Math.max(...C.map(c=>c.y+c.r))+pad;
  const w=Math.max(1,Math.ceil((x1-x0)*dpr)),h=Math.max(1,Math.ceil((y1-y0)*dpr));
  off.width=w;off.height=h;const o=off.getContext('2d'),img=o.createImageData(w,h),D=img.data,p=4;
  for(let py=0;py<h;py++){const Y=y0+(py+.5)/dpr;
    for(let px=0;px<w;px++){const X=x0+(px+.5)/dpr;let S=0,gx=0,gy=0;
      for(const c of C){const dx=X-c.x,dy=Y-c.y,q=c.r*c.r-dx*dx-dy*dy;if(q<=0)continue;S+=q*q;gx-=q*dx;gy-=q*dy;}   // h_i^4 with h_i = sqrt(q); dH/dx = -Σ h_i² dx / H³
      if(S<=0)continue;const H=Math.pow(S,1/p),k=1/Math.pow(H,p-1),Hx=gx*k,Hy=gy*k;
      let nx=-Hx,ny=-Hy,nz=1;const nn=Math.hypot(nx,ny,nz);nx/=nn;ny/=nn;nz/=nn;
      const dif=Math.max(0,nx*LT[0]+ny*LT[1]+nz*LT[2]),spec=Math.pow(Math.max(0,nx*HV[0]+ny*HV[1]+nz*HV[2]),28),l=.34+.7*dif;
      const j=4*(py*w+px);D[j]=Math.min(255,SURF[0]*l+60*spec);D[j+1]=Math.min(255,SURF[1]*l+60*spec);D[j+2]=Math.min(255,SURF[2]*l+60*spec);D[j+3]=255*Math.min(1,H*dpr/1.2);}}
  o.putImageData(img,0,0);ctx.drawImage(off,x0,y0,w/dpr,h/dpr);
}
export function setup(fig){
  const d=DATA[fig.dataset.k], cv=fig.querySelector('canvas'), ctx=cv.getContext('2d');
  const guest=new Set(Array.isArray(d.guest)?d.guest:d.guest?[...Array(d.guest).keys()]:[]);
  // fig.focus: draw only the guest molecule, centred (tiles of apps that share the same host ring)
  const bulk=(fig.style||new URLSearchParams(location.search).get('style'))==='bulk';   // target as a surface (see drawBulk)
  const foc=!!(fig.focus&&guest.size&&!bulk);   // bulk shows the host ring too, around the target
  const show=d.els.map((e,i)=>COL[e]!=null&&(!foc||guest.has(i)));
  const gi=[...guest], C=foc?[0,1,2].map(j=>gi.reduce((s,i)=>s+d.X[i][j],0)/gi.length):[0,0,0];
  const X=d.X.map(p=>[p[0]-C[0],p[1]-C[1],p[2]-C[2]]);
  // site palette only: guest orange, host elements by count -> pearl, blue, sky, lilac, pink
  const PAL=fig.pal||globalThis.MOLPAL||['#F4EBF0','#3B74D6','#8DB3F0','#D8CFEE','#EAD6E2'], cnt={};   // fig.pal: host colours for other backgrounds; MOLPAL: page-wide (the /k14 brand)
  d.els.forEach((e,i)=>{if(show[i]&&!guest.has(i))cnt[e]=(cnt[e]||0)+1;});
  const ecol={}; Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).forEach((e,k)=>ecol[e]=PAL[Math.min(k,PAL.length-1)]);
  const cols=d.els.map((e,i)=>guest.has(i)?(globalThis.MOLGUEST||'#FF6B1A'):ecol[e]);
  const rank={}; Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).forEach((e,k)=>rank[e]=k);
  // fig.look: 'light' = the deck's element colours for light backgrounds; 'dark' = the same hues lifted for dark
  // backgrounds (carbon light grey instead of black); default = site palette (homepage cards)
  const look=fig.look||(fig.orig?'light':null);
  const restCol=look==='light'?(i=>COL[d.els[i]]):look==='dark'?(i=>DARK[COL[d.els[i]]]||COL[d.els[i]]):(i=>cols[i]);
  const LINE=look==='light'?{bond:'#3A3F4A',cell:'#C9CFDA'}:look==='dark'?{bond:'#6A7286',cell:'#2E3547'}:REST;
  let R=0; X.forEach((p,i)=>{if(show[i])R=Math.max(R,Math.hypot(...p));});
  const st={th:.6,ph:d.ph??-.35,drag:null,auto:false,on:false};
  const lines=[];
  if(d.cell){const a=d.cell/2,v=[-a,a];for(const x of v)for(const y of v){lines.push([[x,y,-a],[x,y,a]],[[x,-a,y],[x,a,y]],[[-a,x,y],[a,x,y]]);}}
  function rot(p){const [x,y,z]=p,c=Math.cos(st.th),s=Math.sin(st.th),x1=c*x+s*z,z1=-s*x+c*z,c2=Math.cos(st.ph),s2=Math.sin(st.ph);return [x1,c2*y-s2*z1,s2*y+c2*z1];}
  // fig.style or ?style=bulk: the target (guest) as one bulky surface, the rest as small see-through balls on thin bonds
  const surf=i=>show[i]&&(foc||guest.has(i));
  function drawBulk(P,pr,sc){
    const gi=d.els.map((e,i)=>i).filter(surf), gz=gi.length?gi.reduce((t,i)=>t+P[i][2],0)/gi.length:Infinity;
    const host=[];
    d.bonds.forEach(([i,j])=>{if(show[i]&&show[j]&&!surf(i)&&!surf(j))host.push({z:(P[i][2]+P[j][2])/2-.3,b:[i,j]});});
    d.els.forEach((e,i)=>{if(show[i]&&!surf(i))host.push({z:P[i][2],a:i});});
    host.sort((u,v)=>u.z-v.z);
    const nh=host.filter(it=>it.a!=null).length, dense=nh>=15?Math.max(.18,Math.sqrt(15/nh)*(nh>50?.7:1)):0;   // 15+ machine atoms: smaller dots, 50+ smaller still
    const one=it=>{
      if(it.b){const [i,j]=it.b,A=pr(P[i]),B=pr(P[j]);ctx.strokeStyle=LINE.bond;ctx.lineWidth=dense?Math.max(.6,sc*.03):Math.max(1,sc*.05);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();return;}
      const i=it.a,[x,y]=pr(P[i]),c=restCol(i);
      if(dense){const r=Math.max(1.1,RAD[d.els[i]]*sc*.4*dense);ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=c;ctx.fill();return;}   // many atoms: small solid dots
      const r=Math.max(2,RAD[d.els[i]]*sc*.4);
      ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.globalAlpha=.16;ctx.fillStyle=c;ctx.fill();ctx.globalAlpha=1;
      ctx.lineWidth=Math.max(1,r*.24);ctx.strokeStyle=c;ctx.stroke();};
    host.filter(it=>it.z<gz).forEach(one);
    if(gi.length){                                       // molecular surface, lit like the hero's target
      const big=gi.length<3?(d.guestScale||1.35):1, C=gi.map(i=>{const [x,y]=pr(P[i]);return {x,y,r:RAD[d.els[i]]*2.6*sc*.62*big};});
      surface(ctx,C,fig.target||globalThis.MOLTARGET||'#EDE7D9');}   // fig.target: the target's colour (hero cream by default)
    host.filter(it=>it.z>=gz).forEach(one);
  }
  function draw(){
    const dpr=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight; if(!W)return;
    if(cv.width!==Math.round(W*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    const sc=Math.min(W,H)/(2*R+3)*.98*(fig.scale||SCALE)*(foc?1.15:1), cx=W/2, cy=H/2;
    const P=X.map(rot), pr=p=>[cx+p[0]*sc,cy-p[1]*sc];
    ctx.strokeStyle=LINE.cell;ctx.lineWidth=1;
    lines.forEach(([a,b])=>{const A=pr(rot(a)),B=pr(rot(b));ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();});
    if(bulk){drawBulk(P,pr,sc);return;}
    const items=[];
    d.bonds.forEach(([i,j,o])=>{if(show[i]&&show[j])items.push({z:(P[i][2]+P[j][2])/2-.3,b:[i,j,o]});});
    d.els.forEach((e,i)=>{if(show[i])items.push({z:P[i][2],a:i});});
    items.sort((u,v)=>u.z-v.z);
    for(const it of items){
      if(it.b){const [i,j,o]=it.b,A=pr(P[i]),B=pr(P[j]);const host=guest.size&&!guest.has(i);
        ctx.strokeStyle=LINE.bond;ctx.lineWidth=Math.max(1,sc*(host?.09:(o>1?.2:.16)));ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();continue;}
      const i=it.a,e=d.els[i],[x,y]=pr(P[i]);const g=guest.size&&guest.has(i);
      let r=RAD[e]*sc*(d.cell||d.solid?.85:.62)*(guest.size&&!foc?(g?(d.guestScale||1.35):.8):1); if(d.cell&&e==='Li')r*=.8;
      const depth=(P[i][2]/R+1)/2, c=restCol(i);
      ctx.globalAlpha=(d.cell&&e==='Li')?.8:1;
      const gr=ctx.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);
      gr.addColorStop(0,tone(c,.45));gr.addColorStop(.55,tone(c,-.05+(1-depth)*-.15));gr.addColorStop(1,tone(c,-.45));
      ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.globalAlpha=1;
    }
  }
  // fig.drag: rotate by dragging (application pages); spin pauses while held
  if(fig.drag){cv.style.cursor='grab';cv.style.touchAction='none';
    cv.addEventListener('pointerdown',e=>{st.drag=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing';});
    cv.addEventListener('pointermove',e=>{if(!st.drag)return;st.th+=(e.clientX-st.drag[0])*.01;st.ph=Math.max(-1.5,Math.min(1.5,st.ph+(e.clientY-st.drag[1])*.01));st.drag=[e.clientX,e.clientY];draw();});
    const up=()=>{st.drag=null;cv.style.cursor='grab';};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);}
  return {draw,tick(dt){if(st.on&&!reduce&&!st.drag){st.th+=dt*.0006;draw();}},active(on){st.on=on;draw();}};
}
