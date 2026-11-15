"""build_scene.py — build the Milky Way as a Cycles volume and save milkyway.blend.

    blender --background --python scripts/blender/build_scene.py -- <out_dir> [N] [NZ]

Writes <out_dir>/milkyway.vdb and <out_dir>/milkyway.blend (scene "MilkyWay": the volume, its
emission+absorption material with render-time detail noise, and three cameras — PanoSun (the sky
from the Sun's position, galactic l/b), TopOrtho (face-on), Beauty (three-quarter view)).
1 Blender unit = 1 kly.
"""
import os
import sys
import time

import bpy
import numpy as np
import openvdb as vdb
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import galaxy_model as gm  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0])
N = int(argv[1]) if len(argv) > 1 else 768
NZ = int(argv[2]) if len(argv) > 2 else 64
os.makedirs(OUT, exist_ok=True)

t0 = time.time()
grids, meta = gm.volume_grids(N, NZ)
dx, dz = meta["dx"], meta["dz"]
xf = vdb.createLinearTransform([[dx, 0, 0, 0], [0, dx, 0, 0], [0, 0, dz, 0],
                                [-gm.L_MAP + dx / 2, -gm.L_MAP + dx / 2, -gm.ZMAX + dz / 2, 1]])
vg = []
for name in list(grids):
    g = vdb.FloatGrid()
    g.copyFromArray(grids.pop(name), tolerance=1e-6)
    g.name = name
    g.transform = xf
    vg.append(g)
vdb_path = os.path.join(OUT, "milkyway.vdb")
vdb.write(vdb_path, grids=vg)
del vg
print("VDB written %.0f MB in %.1fs" % (os.path.getsize(vdb_path) / 1e6, time.time() - t0))

# ---------------- scene ----------------
scene = bpy.data.scenes.new("MilkyWay")
vol = bpy.data.volumes.new("MilkyWay")
vol.filepath = vdb_path
obj = bpy.data.objects.new("MilkyWay", vol)
scene.collection.objects.link(obj)

mat = bpy.data.materials.new("MilkyWayVolume")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
N_ = nt.nodes.new
L_ = nt.links.new


def attr(name, y):
    n = N_("ShaderNodeAttribute"); n.attribute_type = "GEOMETRY"; n.attribute_name = name; n.location = (-900, y); n.label = name
    return n.outputs["Fac"]


def scaled(color, fac, y):
    n = N_("ShaderNodeVectorMath"); n.operation = "SCALE"; n.location = (-300, y)
    n.inputs[0].default_value = color
    L_(fac, n.inputs["Scale"])
    return n.outputs["Vector"]


def mul(a, b, y, x=-600):
    n = N_("ShaderNodeMath"); n.operation = "MULTIPLY"; n.location = (x, y)
    L_(a, n.inputs[0])
    if isinstance(b, (int, float)): n.inputs[1].default_value = b
    else: L_(b, n.inputs[1])
    return n.outputs[0]


def detail(scale, zstretch, lo, hi, out_lo, out_hi, y, rough=0.62, distortion=0.5):
    tc = N_("ShaderNodeTexCoord"); tc.location = (-1500, y)
    mp = N_("ShaderNodeMapping"); mp.location = (-1320, y); mp.inputs["Scale"].default_value = (1, 1, zstretch)
    L_(tc.outputs["Object"], mp.inputs["Vector"])
    nz = N_("ShaderNodeTexNoise"); nz.location = (-1120, y); nz.noise_dimensions = "3D"
    nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 7.0
    nz.inputs["Roughness"].default_value = rough; nz.inputs["Distortion"].default_value = distortion
    L_(mp.outputs["Vector"], nz.inputs["Vector"])
    mr = N_("ShaderNodeMapRange"); mr.location = (-900, y - 60); mr.clamp = True
    mr.inputs["From Min"].default_value = lo; mr.inputs["From Max"].default_value = hi
    mr.inputs["To Min"].default_value = out_lo; mr.inputs["To Max"].default_value = out_hi
    L_(nz.outputs["Fac"], mr.inputs["Value"])
    return mr.outputs["Result"]


# colours (scene-linear): old disc tan, bulge gold, young arms blue-white, H-alpha pink
C_OLD, C_BULGE, C_YOUNG, C_HII = (1.00, 0.80, 0.60), (1.00, 0.72, 0.44), (0.60, 0.76, 1.00), (1.00, 0.30, 0.42)
dust_d = mul(attr("dust", -500), detail(1.5, 3.0, 0.36, 0.70, 0.18, 2.6, -760), -500)
young_d = mul(attr("young", 100), detail(0.8, 2.0, 0.34, 0.72, 0.45, 1.9, -180, 0.7), 100)
cols = [scaled(C_OLD, attr("old", 500), 500), scaled(C_BULGE, attr("bulge", 300), 300),
        scaled(C_YOUNG, mul(young_d, 2.2, 100, -450), 100), scaled(C_HII, mul(attr("hii", -100), 1.3, -100), -100)]
acc = cols[0]
for i, c in enumerate(cols[1:]):
    a = N_("ShaderNodeVectorMath"); a.operation = "ADD"; a.location = (-100 + 160 * i, 400 - 150 * i)
    L_(acc, a.inputs[0]); L_(c, a.inputs[1]); acc = a.outputs["Vector"]
em = N_("ShaderNodeEmission"); em.location = (500, 200); em.inputs["Strength"].default_value = 1.0
L_(acc, em.inputs["Color"])
ab = N_("ShaderNodeVolumeAbsorption"); ab.location = (500, -300)
ab.inputs["Color"].default_value = (0.42, 0.20, 0.02, 1.0)          # transmits red → reddening (R:G:B extinction 0.58:0.80:0.98)
L_(dust_d, ab.inputs["Density"])
add = N_("ShaderNodeAddShader"); add.location = (720, 0)
L_(em.outputs[0], add.inputs[0]); L_(ab.outputs[0], add.inputs[1])
out = N_("ShaderNodeOutputMaterial"); out.location = (920, 0)
L_(add.outputs[0], out.inputs["Volume"])
vol.materials.append(mat)

# world: pure black
world = bpy.data.worlds.new("Void"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
scene.world = world


def camera(name, mw, **kw):
    cd = bpy.data.cameras.new(name)
    for k, v in kw.items(): setattr(cd, k, v)
    co = bpy.data.objects.new(name, cd); scene.collection.objects.link(co); co.matrix_world = mw
    return co


# PanoSun: at the Sun, looking at the galactic centre (+x), north (+z) up. Image right = -y = decreasing l,
# so the render is flipped horizontally in post to make u grow with l.
M = Matrix(((0, 0, -1, -gm.RSUN), (-1, 0, 0, 0), (0, 1, 0, gm.ZSUN), (0, 0, 0, 1)))
camera("PanoSun", M, type="PANO", panorama_type="EQUIRECTANGULAR", latitude_min=-0.70, latitude_max=0.70,
       longitude_min=-np.pi, longitude_max=np.pi, clip_start=0.001, clip_end=1000)
camera("TopOrtho", Matrix.Translation((0, 0, 40)), type="ORTHO", ortho_scale=2 * gm.L_MAP, clip_start=0.1, clip_end=200)
import mathutils
bpos = mathutils.Vector((-78, -92, 52))
bq = (mathutils.Vector((0, 0, -3)) - bpos).to_track_quat("-Z", "Y")
camera("Beauty", Matrix.LocRotScale(bpos, bq, None), lens=50, clip_start=0.1, clip_end=1000)
scene.camera = scene.objects["Beauty"]

scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "GPU"
cy.samples = 32
cy.use_adaptive_sampling = False
cy.use_denoising = False
cy.max_bounces = 0; cy.diffuse_bounces = 0; cy.glossy_bounces = 0; cy.transmission_bounces = 0; cy.volume_bounces = 0
cy.transparent_max_bounces = 8
cy.volume_step_rate = 1.0
cy.volume_max_steps = 4096
scene.render.film_transparent = False
scene.render.image_settings.file_format = "OPEN_EXR"
scene.render.image_settings.color_depth = "32"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_percentage = 100
blend = os.path.join(OUT, "milkyway.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)
print("BUILD_OK", blend, "%.1fs" % (time.time() - t0))
