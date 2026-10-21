"""Molecules for the apps that are not in the problem-card deck, and problem-only molecules for the apps whose
solution stays private. Writes web/cf/apps_extra.json, read by gen_apps.py.

    .venv/bin/python web/cf/apps_extra.py      (needs RDKit)
"""
import json
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def embed(smi, seed=7):
    m = Chem.AddHs(Chem.MolFromSmiles(smi))
    AllChem.EmbedMolecule(m, randomSeed=seed)
    AllChem.MMFFOptimizeMolecule(m)
    return m


def pack(m, keep_h=False, center=True):
    """RDKit mol -> {els, X, bonds} (heavy atoms only unless keep_h), centred on the origin."""
    X = m.GetConformer().GetPositions()
    idx = [a.GetIdx() for a in m.GetAtoms() if keep_h or a.GetSymbol() != 'H']
    new = {o: n for n, o in enumerate(idx)}
    P = X[idx] - (X[idx].mean(0) if center else 0)
    bonds = [[new[b.GetBeginAtomIdx()], new[b.GetEndAtomIdx()], 2 if b.GetBondTypeAsDouble() == 2 else 1]
             for b in m.GetBonds() if b.GetBeginAtomIdx() in new and b.GetEndAtomIdx() in new]
    return dict(els=[m.GetAtomWithIdx(i).GetSymbol() for i in idx], X=np.round(P, 3).tolist(), bonds=bonds)


def manual(els, X, bonds):
    X = np.array(X, float); X -= X.mean(0)
    return dict(els=els, X=np.round(X, 3).tolist(), bonds=bonds)


mols = {}
# new apps: the molecule each problem is about, or today's product (never our design)
mols['boric'] = pack(embed('B(O)(O)O'), keep_h=True)
mols['dioxane'] = pack(embed('C1COCCO1'))
mols['tea'] = pack(embed('OCCN(CCO)CCO'))
mols['tmah'] = pack(embed('C[N+](C)(C)C'))
mols['tren'] = pack(embed('O=C(Nc1ccccc1)NCCN(CCNC(=O)Nc1ccccc1)CCNC(=O)Nc1ccccc1'))
crown, nh4 = embed('C1COCCOCCOCCOCCOCCO1'), embed('[NH4+]')
c = pack(crown); n = pack(nh4, keep_h=True)
mols['crown_nh4'] = dict(els=c['els'] + n['els'], X=c['X'] + (np.array(n['X']) + [0, 0, 0.6]).round(3).tolist(),
                         bonds=c['bonds'] + [[a + len(c['els']), b + len(c['els']), o] for a, b, o in n['bonds']], guest=[len(c['els']) + i for i in range(len(n['els']))])
mols['paraffin'] = pack(embed('CCCCCCCCCCCCCCCCCC'))

# problem-only molecules for the private apps: the target alone, no host
s = (ROOT / 'demo_cards' / 'problem-cards.html').read_text()
js = s[s.index('<script'):]
D = json.loads(js[js.index('const DATA=') + 11:js.index('\nconst COL')].rstrip().rstrip(';'))
def subset(d, keep):
    new = {o: n for n, o in enumerate(keep)}
    X = np.array([d['X'][i] for i in keep]); X -= X.mean(0)
    return dict(els=[d['els'][i] for i in keep], X=np.round(X, 3).tolist(),
                bonds=[[new[a], new[b], o] for a, b, o in d['bonds'] if a in new and b in new])
mols['cork_p'] = subset(D['cork'], list(range(D['cork']['guest'])))                       # TCA
mols['co2_p'] = manual(['O', 'C', 'O', 'O'], [[-1.16, 0, 0], [0, 0, 0], [1.16, 0, 0], [0.4, 2.9, 0]], [[0, 1, 2], [1, 2, 2]])  # CO2 + water
mols['gold_p'] = manual(['N', 'C', 'Au', 'C', 'N'], [[-3.15, 0, 0], [-1.99, 0, 0], [0, 0, 0], [1.99, 0, 0], [3.15, 0, 0]],
                        [[0, 1, 2], [1, 2, 1], [2, 3, 1], [3, 4, 2]])                          # gold cyanide
mols['ethylene_p'] = pack(embed('C=C'), keep_h=True)
mols['phosphate_p'] = subset(D['phosphate'], [0, 1, 2, 3, 4])                              # PO4 without the La
mols['rareearth_p'] = manual(['Nd', 'Pr'], [[-1.6, 0, 0], [1.6, 0, 0]], [])                  # two near-identical ions
(HERE / 'apps_extra.json').write_text(json.dumps(mols, separators=(',', ':')))
print({k: len(v['els']) for k, v in mols.items()})
