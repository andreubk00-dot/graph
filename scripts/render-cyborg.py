"""Render the actual exported GLB and its imported skeletal animation in Blender.
No character geometry or animation is authored here. Lighting/track are presentation.
blender -b --factory-startup --python scripts/render-cyborg.py -- examples/cyborg [preview|hero|animate|views|side-cycle]
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
out=Path(args[0]).resolve();mode=args[1] if len(args)>1 else 'preview'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=20
bpy.ops.import_scene.gltf(filepath=str(out/'cyborg.glb'))
for obj in list(scene.objects):
    if obj.animation_data:
        selected=None
        for track in obj.animation_data.nla_tracks:
            track.mute=True
            if track.name=='Combat run · in place': selected=track.strips[0].action
        obj.animation_data.action=selected
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples=32 if mode=='hero' else 8
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=960 if mode=='hero' else 512
scene.render.resolution_y=1200 if mode=='hero' else 640
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.14,.18,.22,1);bg.inputs['Strength'].default_value=.45
scene.view_settings.view_transform='AgX'
def mat(name,color,rough=.6,metal=.0):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;return m
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002))
bpy.context.object.data.materials.append(mat('STUDIO ground',(.025,.036,.046),.6,.12))
def area(name,pos,color,power,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO key',(-2,-4,5),(1,.90,.77),650,4)
area('STUDIO fill',(4,-1,3),(.50,.72,1),550,3)
area('STUDIO rim',(-1,3,4),(.66,.88,1),900,3)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.6
def camera(pos,target=(0,-.12,.98)):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
camera((-3.2,-5.2,2.65))
# Treadmill markers move opposite +Z at exactly the declared virtual root speed.
track=[];trackmat=mat('STUDIO track markings',(.11,.17,.20),.85)
for i in range(17):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,i*.45-3.6,.0005))
    o=bpy.context.object;o.name=f'STUDIO track {i}';o.scale=(1.35,.025,.001);o.data.materials.append(trackmat);track.append(o)
def frame(index):
    scene.frame_set(index)
    # Graph +Z becomes Blender -Y. Ground travels +Y relative to this fixed root.
    distance=index/20*2.25
    for i,o in enumerate(track): o.location.y=((i*.45-3.6+distance+3.6)%7.2)-3.6
def render(path):
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
if mode=='side-cycle':
    (out/'side-frames').mkdir(exist_ok=True)
    camera((-6,0,1.1))
    for i in range(8):
        frame(i*2);render(out/'side-frames'/f'{i:03d}.png')
elif mode=='animate':
    (out/'frames').mkdir(exist_ok=True)
    for i in range(32):
        frame(i);render(out/'frames'/f'{i:03d}.png');print(f'CYBORG frame {i+1}/32',flush=True)
elif mode=='views':
    frame(3)
    for name,pos in [('front',(0,-6,1.1)),('side',(-6,0,1.1)),('back',(0,6,1.1))]:
        camera(pos);render(out/f'{name}.png')
else:
    frame(3);render(out/('cyborg.png' if mode=='hero' else 'preview.png'))
