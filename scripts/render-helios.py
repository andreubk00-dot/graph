"""Presentation renderer of the exported Graph Forge GLB, using Blender CPU Cycles.
Asset geometry/materials and animation samples are never authored here.
Usage: blender -b --factory-startup --python scripts/render-helios.py -- examples/helios [still|animate|views] [CYCLES|BLENDER_EEVEE_NEXT]
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:]
out = Path(args[0]).resolve()
mode = args[1] if len(args) > 1 else 'still'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(out / 'helios.glb'))
objects = {o.name: o for o in bpy.context.scene.objects}
for o in objects.values():
    o.animation_data_clear()
samples = json.loads((out / 'orbit-samples.json').read_text())
conversion = Quaternion((1,0,0), math.pi/2)

def pose(index):
    for name, p in samples['frames'][index % len(samples['frames'])].items():
        o = objects[name]
        o.location = conversion @ Vector(p['position'])
        x,y,z = [a/2 for a in p['rotation']]
        cx,cy,cz,sx,sy,sz = math.cos(x),math.cos(y),math.cos(z),math.sin(x),math.sin(y),math.sin(z)
        q = Quaternion((cx*cy*cz-sx*sy*sz, sx*cy*cz+cx*sy*sz, cx*sy*cz-sx*cy*sz, cx*cy*sz+sx*sy*cz))
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = conversion @ q @ conversion.conjugated()
        o.scale = (p['scale'][0],p['scale'][2],p['scale'][1])
    bpy.context.view_layer.update()

scene = bpy.context.scene
scene.render.engine = args[2] if len(args) > 2 else 'CYCLES'
if scene.render.engine == 'BLENDER_EEVEE_NEXT':
    scene.eevee.taa_render_samples = 64 if mode == 'still' else 8
scene.cycles.device = 'CPU'
scene.cycles.samples = 32 if mode == 'still' else (8 if mode == 'views' else 4)
scene.cycles.use_denoising = False  # Distribution build has no OpenImageDenoise.
scene.cycles.max_bounces = 5
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.render.resolution_x = 1280 if mode == 'still' else (640 if mode == 'views' else 512)
scene.render.resolution_y = 1080 if mode == 'still' else (540 if mode == 'views' else 432)
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world.color = (.13,.13,.13)
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (.15,.20,.24,1)
bg.inputs['Strength'].default_value = .35
scene.view_settings.view_transform = 'AgX'

def material(name, color, metallic=0, roughness=.6):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color,1); m.use_nodes = True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metallic
    bsdf.inputs['Roughness'].default_value=roughness
    return m

# Presentation-only floor and studio lights. None are added to the GLB source.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.012))
floor=bpy.context.object; floor.name='STUDIO floor'
floor.data.materials.append(material('STUDIO graphite',(.018,.027,.032),.15,.48))
def area(name, pos, color, power, size, target=(0,0,2.1)):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO key',(1,-5,8),(1,.83,.65),1550,5)
area('STUDIO softbox',(-5,-2,3),(.45,.75,1),1350,4)
area('STUDIO rim',(3,4,6),(.55,1,.89),2000,3)
area('STUDIO upper',(-1,1,8),(1,.63,.29),950,2)
bpy.ops.object.camera_add(location=(6.8,-12.8,6))
cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=7.6
def camera(position, target=(0,0,2.2)):
    cam.location=position
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
camera((6.8,-12.8,6))
# Mild optical glare is part of this presentation render, not a Forge viewport claim.
scene.use_nodes=True
tree=scene.node_tree;tree.nodes.clear()
layer=tree.nodes.new('CompositorNodeRLayers')
glare=tree.nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='MEDIUM';glare.threshold=1.8
output=tree.nodes.new('CompositorNodeComposite')
tree.links.new(layer.outputs['Image'],glare.inputs['Image']);tree.links.new(glare.outputs['Image'],output.inputs['Image'])

def render(path):
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
pose(0)
if mode == 'animate':
    (out/'frames').mkdir(exist_ok=True)
    for i in range(48):
        pose(i)
        # Small orbit makes silhouette/depth visible while preserving a closed GIF loop.
        phase=i/48*math.tau
        camera((5.2+1.2*math.sin(phase),-13.3,5.6+.3*math.sin(phase)))
        render(out/'frames'/f'{i:03d}.png')
        print(f'HELIOS frame {i+1}/48',flush=True)
elif mode == 'views':
    for name,pos in [('front',(0,-15,2.2)),('side',(15,0,2.2)),('back',(0,15,2.2))]:
        camera(pos);render(out/f'{name}.png')
else:
    render(out/'helios.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'presentation.blend'))
