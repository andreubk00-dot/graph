"""Export the editor-composited pixel bytes losslessly and bundle the showcase."""
from pathlib import Path
from PIL import Image
import json, sys, zipfile
out = Path(sys.argv[1] if len(sys.argv)>1 else 'examples/helios')
data=(out/'icon-frames.rgba').read_bytes()
layout=json.loads((out/'helios-icon-atlas.json').read_text())
frames=[Image.frombytes('RGBA',(96,96),data[i*96*96*4:(i+1)*96*96*4]) for i in range(16)]
frames[0].save(out/'helios-icon.png')
atlas=Image.new('RGBA',(layout['meta']['size']['w'],layout['meta']['size']['h']))
for im,f in zip(frames,layout['frames']):
    atlas.paste(im,(f['frame']['x'],f['frame']['y']))
atlas.save(out/'helios-icon-atlas.png')
preview=[]
for frame in frames:
    canvas=Image.new('RGBA',(96,96),(15,27,35,255))
    canvas.alpha_composite(frame)
    preview.append(canvas.convert('RGB').resize((384,384),Image.Resampling.NEAREST))
# GIF stores 10 ms ticks; alternate 120/130 ms to preserve the 2 s total loop.
preview[0].save(out/'helios-icon.gif',save_all=True,append_images=preview[1:],duration=[120,130]*8,loop=0,disposal=2)
names=['README.md','helios.graph.json','helios.glb','helios-viewer.html','helios.png','helios.gif',
       'helios-icon.art.json','helios-icon.png','helios-icon.gif','helios-icon-atlas.png','helios-icon-atlas.json',
       'helios-emblem.art.json','helios-emblem.svg','manifest.json','verification.json','dock-profile.json']
with zipfile.ZipFile(out/'helios-showcase.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in names:
        path=out/name
        if path.exists(): archive.write(path, 'helios/'+name)
print(out/'helios-showcase.zip')
