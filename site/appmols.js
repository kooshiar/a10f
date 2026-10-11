// Molecule tiles for the application cards and pages (renderer from the problem-card deck, site colours).

// App tiles: dark, full site colours (trapped molecule orange), drawn small; hovering one makes it spin.
const REST = { bond:'#5A6378', cell:'#2E3547' }, SCALE = .72;
import { DATA } from './appsdata.js';
const COL={C:'#1A1A1A',O:'#E10600',N:'#0057FF',F:'#00A651',S:'#FFC400',P:'#FF7A00',Cl:'#00A651',Li:'#8A2BE2',Zn:'#0057FF',Si:'#FF7A00',Al:'#FF7A00',Ir:'#0057FF',Zr:'#00A651',Y:'#FFC400',Fe:'#E10600',Ni:'#00A651',Ru:'#FF7A00',Pt:'#0057FF',I:'#8A2BE2',Au:'#FF7A00',Mg:'#FF7A00',Hv:'#0057FF',Nd:'#8A2BE2',B:'#FF7A00',La:'#8A2BE2',K:'#8A2BE2',Gd:'#8A2BE2',H:null};
const RAD={C:.62,O:.6,N:.6,F:.55,S:.95,P:.85,Cl:1.0,Li:.55,Zn:.85,Si:.85,Al:.85,Ir:.8,Zr:.8,Y:.85,Fe:.75,Ni:.75,Ru:.8,Pt:.8,I:1.1,Au:1.0,Mg:.8,Hv:.4,Nd:1.1,B:.6,La:1.1,K:1.1,Gd:1.1};
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function hex(c){return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));}
function tone(c,t){const x=hex(c),y=t>0?[255,255,255]:[5,8,11],k=Math.abs(t);return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*k)).join(',')})`;}
export function setup(fig){
  const d=DATA[fig.dataset.k], cv=fig.querySelector('canvas'), ctx=cv.getContext('2d');
  const guest=new Set(Array.isArray(d.guest)?d.guest:d.guest?[...Array(d.guest).keys()]:[]);
  const show=d.els.map(e=>COL[e]!=null);
  // site palette only: guest orange, host elements by count -> pearl, blue, sky, lilac, pink
  const PAL=['#F4EBF0','#3B74D6','#8DB3F0','#D8CFEE','#EAD6E2'], cnt={};
  d.els.forEach((e,i)=>{if(show[i]&&!guest.has(i))cnt[e]=(cnt[e]||0)+1;});
  const ecol={}; Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).forEach((e,k)=>ecol[e]=PAL[Math.min(k,PAL.length-1)]);
  const cols=d.els.map((e,i)=>guest.has(i)?'#FF6B1A':ecol[e]);
  const rank={}; Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).forEach((e,k)=>rank[e]=k);
  // fig.orig: the deck's own element colours (dark carbon, red oxygen, blue nitrogen ...) for light backgrounds
  const restCol=fig.orig?(i=>COL[d.els[i]]):(i=>cols[i]), LINE=fig.orig?{bond:'#3A3F4A',cell:'#C9CFDA'}:REST;
  let R=0; d.X.forEach((p,i)=>{if(show[i])R=Math.max(R,Math.hypot(...p));});
  const st={th:.6,ph:d.ph??-.35,drag:null,auto:false,on:false};
  const lines=[];
  if(d.cell){const a=d.cell/2,v=[-a,a];for(const x of v)for(const y of v){lines.push([[x,y,-a],[x,y,a]],[[x,-a,y],[x,a,y]],[[-a,x,y],[a,x,y]]);}}
  function rot(p){const [x,y,z]=p,c=Math.cos(st.th),s=Math.sin(st.th),x1=c*x+s*z,z1=-s*x+c*z,c2=Math.cos(st.ph),s2=Math.sin(st.ph);return [x1,c2*y-s2*z1,s2*y+c2*z1];}
  function draw(){
    const dpr=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight; if(!W)return;
    if(cv.width!==Math.round(W*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    const sc=Math.min(W,H)/(2*R+3)*.98*(fig.scale||SCALE), cx=W/2, cy=H/2;
    const P=d.X.map(rot), pr=p=>[cx+p[0]*sc,cy-p[1]*sc];
    ctx.strokeStyle=LINE.cell;ctx.lineWidth=1;
    lines.forEach(([a,b])=>{const A=pr(rot(a)),B=pr(rot(b));ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();});
    const items=[];
    d.bonds.forEach(([i,j,o])=>{if(show[i]&&show[j])items.push({z:(P[i][2]+P[j][2])/2-.3,b:[i,j,o]});});
    d.els.forEach((e,i)=>{if(show[i])items.push({z:P[i][2],a:i});});
    items.sort((u,v)=>u.z-v.z);
    for(const it of items){
      if(it.b){const [i,j,o]=it.b,A=pr(P[i]),B=pr(P[j]);const host=guest.size&&!guest.has(i);
        ctx.strokeStyle=LINE.bond;ctx.lineWidth=Math.max(1,sc*(host?.09:(o>1?.2:.16)));ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();continue;}
      const i=it.a,e=d.els[i],[x,y]=pr(P[i]);const g=guest.size&&guest.has(i);
      let r=RAD[e]*sc*(d.cell||d.solid?.85:.62)*(guest.size?(g?(d.guestScale||1.35):.8):1); if(d.cell&&e==='Li')r*=.8;
      const depth=(P[i][2]/R+1)/2, c=restCol(i);
      ctx.globalAlpha=(d.cell&&e==='Li')?.8:1;
      const gr=ctx.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);
      gr.addColorStop(0,tone(c,.45));gr.addColorStop(.55,tone(c,-.05+(1-depth)*-.15));gr.addColorStop(1,tone(c,-.45));
      ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.globalAlpha=1;
    }
  }
  return {draw,tick(dt){if(st.on&&!reduce){st.th+=dt*.0006;draw();}},active(on){st.on=on;draw();}};
}
