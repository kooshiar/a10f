// Colour sets, one per design. Each returns { base, accent, second, light } for a machine.
(function(){
  const HUE = { rotor:'#FF3B1F', niti:'#00A86B', electrolyte:'#FF8A00', mof:'#00A0E3', lce:'#2B4CFF', dna:'#7B2CFF', atp:'#E5007D' };
  window.PALETTES = {
    blue:     () => ({ base:'#0E0F12', accent:'#2B4CFF', second:'#FF4D1F', light:'#C9CDD5' }),
    spectrum: id => ({ base:'#0E0F12', accent:HUE[id], second:'#8B919C', light:'#D2D5DB' }),
    signal:   () => ({ base:'#15171B', accent:'#FF2D55', second:'#15171B', light:'#CDD0D6' }),
    primary:  () => ({ base:'#111111', accent:'#E3120B', second:'#1238D8', light:'#FFC400' }),
  };
})();
