// Copy and per-machine render settings for the live hero. Data lives in live/<id>/ (exported from the films).
export const COLORS = { blue:'#3B74D6', sky:'#8DB3F0', pearl:'#F4EBF0', pink:'#EAD6E2', lilac:'#D8CFEE', orange:'#FF6B1A' };

const r = Math.round;
export const FILMS = [
  { id:'rotor', name:'Light-driven rotor', size:'10 Å', kind:'Small molecule',
    lede:'A molecule that turns when light hits it. Light loosens its central double bond; the top half swings round and locks in a new position.',
    style:'balls', groups:{ stator:'pearl', rotor:'blue' }, stick:.15, view:{ yaw:62, elev:22, fill:.62 },
    labels:[ { at:'rotor', text:['Rotor half', 'turns on the axle'] }, { at:'axle', text:['Central C=C bond', 'the axle'] }, { at:'stator', text:['Stator half', 'held still'] } ],
    readout:(s, f) => [`TWIST ${r(s.twist[f])}°`, `t = ${r(s.t_ps[f] * 1000)} fs`, 'xTB MOLECULAR DYNAMICS · 48 ATOMS'],
    burst:{ at:'axle', on:'light', age:'light_age', label:'Light' } },
  { id:'niti', name:'Shape-memory alloy', size:'17 Å', kind:'Alloy',
    lede:'Nickel-titanium remembers its shape. Cooled, the crystal shears into a new lattice; heated, it snaps back. Stents and actuators run on this.',
    style:'balls', groups:{ ti:'pearl', ni:'blue' }, stick:0, view:{ yaw:0, elev:6, fill:.6 }, box:true,
    labels:[ { at:'ni', text:['Nickel', 'atoms'] }, { at:'ti', text:['Titanium', 'atoms'] } ],
    readout:(s, f) => [`LATTICE ANGLE ${s.angle[f].toFixed(1)}°`, `${s.temp[f]} K · t = ${s.t_ps[f].toFixed(1)} ps`, 'MACE ML POTENTIAL · 250 ATOMS'] },
  { id:'electrolyte', name:'Solid electrolyte', size:'20 Å', kind:'Crystal',
    lede:'The core of a solid-state battery. Lithium ions hop through a fixed sulfide frame; with a voltage on, they all drift one way: a current.',
    style:'balls', groups:{ ps4:'pearl', anion:'lilac', li:'blue' }, stick:0, tets:true, trails:true, view:{ yaw:-18, elev:16, fill:.62 },
    labels:[ { at:'li', text:['Lithium ions', 'carry the charge'] }, { at:'ps4', text:['PS₄ cages', 'the fixed frame'] }, { at:'anion', text:['Cl⁻ and S²⁻', 'between the cages'] } ],
    readout:(s, f) => [`LI⁺ DRIFT ${s.drift[f] >= 0 ? '+' : ''}${s.drift[f].toFixed(1)} Å`, `${s.field[f] ? 'VOLTAGE ON' : s.temp[f] + ' K'} · t = ${s.t_ps[f].toFixed(1)} ps`, 'MACE ML POTENTIAL · 416 ATOMS'],
    arrow:{ on:'field', label:'Voltage' } },
  { id:'mof', name:'CO₂-capture MOF', size:'40 Å', kind:'Porous framework',
    lede:'A crystal full of channels. Flue gas meets it; CO₂ slips into the pores and stays, while N₂ is pushed back out.',
    style:'balls', groups:{ frame:'pearl', metal:'pink', co2:'blue', n2:'lilac' }, stick:.11, view:{ yaw:0, elev:20, fill:.7 },
    labels:[ { at:'frame', text:['MIL-53 framework', 'Cr and terephthalate'] } ],
    readout:(s, f) => [`CO₂ INSIDE ${s.co2_in[f]} / ${s.n_co2}`, `N₂ INSIDE ${s.n2_in[f]} / ${s.n_n2}`, `t = ${(s.t_ps[f] / 1000).toFixed(2)} ns · CLASSICAL MD`],
    legend:[ ['blue', 'CO₂'], ['lilac', 'N₂'] ] },
  { id:'atp', name:'ATP synthase', size:'220 Å', kind:'Protein',
    lede:'The rotary motor in every living cell. Protons flowing through the membrane turn its rotor; each third of a turn makes one ATP.',
    style:'surface', view:{ yaw:-28, elev:8, fill:.78 },
    labels:[ { at:'head', text:['Stator head', 'α₃β₃ · makes ATP'] }, { at:'stalk', text:['Central stalk', 'γε · turns inside the head'] }, { at:'ring', text:['Rotor ring', 'c₁₀ · in the membrane'] } ],
    readout:(s, f) => [`ROTOR ${r(Math.abs(s.rotor_deg[f]))}°`, 'COARSE-GRAINED MD · 4,849 RESIDUES', 'E. COLI · PDB 6OQR'] },
];
