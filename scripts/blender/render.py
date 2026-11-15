"""render.py — render one camera of milkyway.blend to a linear EXR.

    blender --background <dir>/milkyway.blend --python scripts/blender/render.py -- <camera> <width> <height> <samples> <out.exr>
"""
import sys
import time

import bpy

cam, w, h, spp, out = sys.argv[sys.argv.index("--") + 1:][:5]
scene = bpy.data.scenes["MilkyWay"]
bpy.context.window.scene = scene if bpy.context.window else scene
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "METAL"
scene.camera = scene.objects[cam]
scene.render.resolution_x, scene.render.resolution_y = int(w), int(h)
scene.cycles.samples = int(spp)
scene.render.filepath = out
t0 = time.time()
bpy.ops.render.render(write_still=True, scene=scene.name)
print("RENDER_OK %s %sx%s %sspp %.1fs" % (cam, w, h, spp, time.time() - t0))
