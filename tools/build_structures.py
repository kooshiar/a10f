"""Build the four structures that have no PubChem or PDB entry.

  nitinol.pdb  B2 NiTi supercell, built from the known lattice
  zsm5.pdb     MFI framework, symmetry-expanded from the IZA CIF
  ptfe.pdb     PTFE oligomer, RDKit
  kevlar.pdb   Kevlar oligomer, RDKit

Run: .venv/bin/python build_structures.py
"""
import re
import urllib.request

OUT = str(__import__("pathlib").Path(__file__).resolve().parent.parent / "data") + "/"


def write_pdb(path, atoms, cell=None, conect=None):
    lines = []
    if cell:
        a, b, c, al, be, ga = cell
        lines.append("CRYST1%9.3f%9.3f%9.3f%7.2f%7.2f%7.2f P 1           1" %
                     (a, b, c, al, be, ga))
    for i, (el, x, y, z) in enumerate(atoms, 1):
        lines.append("HETATM%5d %-4s MOL A   1    %8.3f%8.3f%8.3f  1.00  0.00          %2s"
                     % (i, el[:4], x, y, z, el[:2].rjust(2)))
    for line in conect or []:
        lines.append(line)
    lines.append("END")
    open(OUT + path, "w").write("\n".join(lines) + "\n")
    print("%-14s %d atoms" % (path, len(atoms)))


# ---------------------------------------------------------------- nitinol
def nitinol(n=3, a=3.015):
    """B2 (CsCl-type) NiTi: Ni at the corner, Ti at the body centre."""
    atoms = []
    for i in range(n + 1):
        for j in range(n + 1):
            for k in range(n + 1):
                atoms.append(("Ni", i * a, j * a, k * a))
    for i in range(n):
        for j in range(n):
            for k in range(n):
                atoms.append(("Ti", (i + .5) * a, (j + .5) * a, (k + .5) * a))
    write_pdb("nitinol.pdb", atoms, cell=(n * a, n * a, n * a, 90, 90, 90))


# ------------------------------------------------------------------- zsm5
def zsm5():
    url = "https://america.iza-structure.org/IZA-SC/cif/MFI.cif"
    cif = urllib.request.urlopen(url, timeout=30).read().decode("utf-8", "replace")

    def val(tag):
        m = re.search(re.escape(tag) + r"\s+([-\d.]+)", cif)
        return float(m.group(1))
    cell = [val("_cell_length_a"), val("_cell_length_b"), val("_cell_length_c"),
            val("_cell_angle_alpha"), val("_cell_angle_beta"), val("_cell_angle_gamma")]

    ops = re.findall(r"^\s*'?([-+xyz0-9/, ]+?)'?\s*$", cif, re.M)
    ops = [o for o in ops if o.count(",") == 2 and re.search(r"[xyz]", o)]

    # IZA labels the tetrahedral sites T1..T12, so take the element from column 2
    sites = []
    for m in re.finditer(r"^\s*(\w+)\s+([A-Za-z]{1,2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)",
                         cif, re.M):
        el = m.group(2)
        if el in ("Si", "O"):
            sites.append((el, float(m.group(3)), float(m.group(4)), float(m.group(5))))

    def apply(op, x, y, z):
        return [eval(p, {"x": x, "y": y, "z": z, "__builtins__": {}}) % 1.0
                for p in op.split(",")]

    seen, frac = set(), []
    for el, x, y, z in sites:
        for op in ops:
            fx, fy, fz = apply(op, x, y, z)
            key = (el, round(fx, 3), round(fy, 3), round(fz, 3))
            if key not in seen:
                seen.add(key)
                frac.append((el, fx, fy, fz))

    a, b, c = cell[:3]                      # MFI is orthorhombic, so this is exact
    atoms = [(el, fx * a, fy * b, fz * c) for el, fx, fy, fz in frac]
    write_pdb("zsm5.pdb", atoms, cell=cell)


# --------------------------------------------------------------- polymers
def from_smiles(path, smiles, seed=42):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    m = Chem.AddHs(Chem.MolFromSmiles(smiles))
    p = AllChem.ETKDGv3()
    p.randomSeed = seed
    AllChem.EmbedMolecule(m, p)
    AllChem.MMFFOptimizeMolecule(m, maxIters=2000)
    conf = m.GetConformer()
    atoms = [(a.GetSymbol(), *conf.GetAtomPosition(a.GetIdx()))
             for a in m.GetAtoms()]
    bonds = {}
    for b in m.GetBonds():
        bonds.setdefault(b.GetBeginAtomIdx() + 1, []).append(b.GetEndAtomIdx() + 1)
        bonds.setdefault(b.GetEndAtomIdx() + 1, []).append(b.GetBeginAtomIdx() + 1)
    conect = ["CONECT" + "".join("%5d" % n for n in [i] + sorted(v)[:4])
              for i, v in sorted(bonds.items())]
    write_pdb(path, atoms, conect=conect)


PTFE = "FC(F)(F)" + "C(F)(F)" * 14 + "F"
KEVLAR = ("CC(=O)" + "Nc1ccc(cc1)NC(=O)c1ccc(cc1)C(=O)" * 3 + "Nc1ccc(N)cc1")

# ------------------------------------------------------- stainless 304
def stainless(n=3, a=3.59, seed=7):
    """FCC iron with 18% Cr and 8% Ni substituted at random sites."""
    import random
    rng = random.Random(seed)
    basis = [(0, 0, 0), (.5, .5, 0), (.5, 0, .5), (0, .5, .5)]
    sites = [((i + bx) * a, (j + by) * a, (k + bz) * a)
             for i in range(n) for j in range(n) for k in range(n)
             for bx, by, bz in basis]
    kinds = ["Cr"] * round(len(sites) * .18) + ["Ni"] * round(len(sites) * .08)
    kinds += ["Fe"] * (len(sites) - len(kinds))
    rng.shuffle(kinds)
    atoms = [(el, x, y, z) for el, (x, y, z) in zip(kinds, sites)]
    write_pdb("ss304.pdb", atoms, cell=(n * a, n * a, n * a, 90, 90, 90))


# ------------------------------------------------------------ LiCoO2
def licoo2(n=3, a=2.8156, c=14.0542, zo=0.26):
    """Layered R-3m LiCoO2, hexagonal setting, n x n x 1 supercell."""
    import math
    cent = [(0, 0, 0), (2 / 3, 1 / 3, 1 / 3), (1 / 3, 2 / 3, 2 / 3)]
    base = [("Li", 0, 0, 0), ("Co", 0, 0, .5), ("O", 0, 0, zo), ("O", 0, 0, -zo)]
    frac = [(el, (x + cx) % 1, (y + cy) % 1, (z + cz) % 1)
            for el, x, y, z in base for cx, cy, cz in cent]
    atoms = []
    for i in range(n):
        for j in range(n):
            for el, fx, fy, fz in frac:
                u, v = fx + i, fy + j
                atoms.append((el, a * (u - v / 2), a * v * math.sqrt(3) / 2, c * fz))
    write_pdb("licoo2.pdb", atoms, cell=(n * a, n * a, c, 90, 90, 120))


PE = "C" * 28
NYLON66 = "CC(=O)" + "NCCCCCCNC(=O)CCCCC(=O)" * 3 + "NCCCCCCN"


if __name__ == "__main__":
    nitinol()
    zsm5()
    from_smiles("ptfe.pdb", PTFE)
    from_smiles("kevlar.pdb", KEVLAR)
    from_smiles("pe.pdb", PE)
    from_smiles("nylon66.pdb", NYLON66)
    stainless()
    licoo2()
