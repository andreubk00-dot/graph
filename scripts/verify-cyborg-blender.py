"""Cross-check the presentation import against evaluated Graph Forge surfaces."""
import bpy, json, sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps=20
bpy.ops.import_scene.gltf(filepath=str(out/'cyborg.glb'))
for o in bpy.context.scene.objects:
    if o.animation_data:
        action=None
        for track in o.animation_data.nla_tracks:
            track.mute=True
            if track.name=='Combat run · in place': action=track.strips[0].action
        o.animation_data.action=action
worst=0
for sample in json.loads((out/'renderer-reference.json').read_text()):
    bpy.context.scene.frame_set(sample['frame'])
    deps=bpy.context.evaluated_depsgraph_get()
    for name,bounds in sample['meshes'].items():
        obj=bpy.data.objects[name].evaluated_get(deps)
        mesh=obj.to_mesh()
        points=[obj.matrix_world@v.co for v in mesh.vertices]
        for key,fn in [('min',min),('max',max)]:
            for axis in range(3):worst=max(worst,abs(fn(v[axis] for v in points)-bounds[key][axis]))
        obj.to_mesh_clear()
assert worst<.002, f'Presentation animation differs: {worst}'
(out/'renderer-verification.json').write_text(json.dumps({'sampledFrames':5,'meshesPerFrame':7,'maxWorldBoundsError':worst,'renderer':'Blender GLB import, original animation'},indent=2))
print('CYBORG presentation max bounds error:',worst)
