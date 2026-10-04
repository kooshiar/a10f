// Render config, kept apart from the simulation data: change any of this and re-render, no recompute.
window.SCENES = {
  sn2: {
    order:1, size:'5 Å', style:'ballstick',
    colors:{ C:'#3a3a3a', H:'#d6d2c8', Cl:'#1baf7a', Br:'#e87ba4' },
    darkColors:{ C:'#c9ccd1', H:'#6a6e76' },
    view:{ rx:-12, ry:18, drift:10, zoom:1.55 }, labels:[{ atoms:[5], text:'Cl', dy:-34 }, { atoms:[1], text:'Br', dy:-34 }],
    leader:{ atoms:[0], text:'carbon' }
  },
  salt: {
    order:2, size:'10 Å', style:'salt',
    colors:{ Na:'#2a78d6', Cl:'#1baf7a', O:'#eb6834', H:'#d6d2c8' }, darkColors:{ H:'#6a6e76' },
    view:{ rx:-15, ry:25, drift:14, zoom:1.05, frameElems:['Na','Cl'] }, leader:{ atoms:'free_ion', text:'ion leaving' }
  },
  niti: {
    order:3, size:'20 Å', style:'spheres',
    colors:{ Ni:'#2a78d6', Ti:'#eb6834' },
    view:{ rx:-90, ry:0, drift:0, zoom:1.45, ortho:true }, smooth:12, sphere:.36, leader:{ atoms:'center', text:'lattice' }
  },
  crack: {
    order:4, size:'40 Å', style:'tagged',
    tagColors:[ [11, '#bdb8ad'], [9, '#eda100'], [0, '#eb6834'] ], darkTagColors:[ [11, '#5f636b'], [9, '#eda100'], [0, '#eb6834'] ],
    parts:[ { t1:4.0 }, { t0:4.0, t1:8.0 }, { t0:8.0 } ],
    view:{ rx:0, ry:0, drift:4, zoom:0.95 }, leader:{ atoms:'crack_tip', text:'crack tip' }
  },
  bind: {
    order:5, size:'80 Å', style:'cartoon',
    chainColors:{ A:'#2a78d6', D:'#eb6834' },
    view:{ rx:-10, ry:0, drift:18, zoom:0.9 }, leader:{ atoms:'interface', text:'interface' },
    extraTools:[{ id:'guide', label:'Contact springs', sub:'guided approach' }], extraAt:3, extraFire:[{ tool:'guide', t0:0, t1:150 }, { tool:'boltz', t0:0, t1:40 }]
  }
};
