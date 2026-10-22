from pathlib import Path
from PIL import Image
import zipfile,sys
out=Path(sys.argv[1] if len(sys.argv)>1 else 'examples/cyborg')
im=Image.open(out/'cyborg.gif')
assert im.n_frames==32
duration=0
for i in range(im.n_frames):im.seek(i);duration+=im.info['duration']
assert duration==1600
for name,count,milliseconds in [('run-side.gif',16,800),('run-before-after.gif',32,1600)]:
    if (out/name).exists():
        image=Image.open(out/name);assert image.n_frames==count,name
        total=0
        for frame in range(image.n_frames):image.seek(frame);total+=image.info['duration']
        assert total==milliseconds,name
names=['README.md','cyborg.png','cyborg.gif','cyborg.glb','cyborg.graph.json','cyborg-viewer.html',
       'manifest.json','verification.json','motion-report.json','renderer-verification.json','motion-style.json']
names += [name for name in ['run-before-after.gif','run-side.gif','run-side-review.png','run-dynamics.png','run-upper-body.png','ankle-review.json','ankle-review.png','front.png','side.png','back.png'] if (out/name).exists()]
with zipfile.ZipFile(out/'vanguard-m07.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in names:z.write(out/name,'vanguard-m07/'+name)
print(f'{out}/vanguard-m07.zip · {len(names)} files · GIF {duration} ms')
