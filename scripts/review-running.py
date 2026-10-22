"""Assemble actual GLB renders for motion review; no pose or model edits.
python3 scripts/review-running.py examples/cyborg [previous-cycle.gif]
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
out=Path(sys.argv[1] if len(sys.argv)>1 else 'examples/cyborg')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',19)
frames=[Image.open(out/'frames'/f'{i:03}.png').convert('RGB') for i in range(32)]
assert all(im.size==(512,640) for im in frames)
frames[0].save(out/'cyborg.gif',save_all=True,append_images=frames[1:],duration=50,loop=0,optimize=False,disposal=2)
if len(sys.argv)>2:
    old=Image.open(sys.argv[2]);assert old.n_frames==32
    comparison=[]
    for i,new in enumerate(frames):
        old.seek(i)
        canvas=Image.new('RGB',(1024,680),(18,25,32));draw=ImageDraw.Draw(canvas)
        canvas.paste(old.convert('RGB').resize((512,640)),(0,40));canvas.paste(new,(512,40))
        draw.text((18,9),'Было · прежний цикл',font=font,fill='white')
        draw.text((530,9),'После · хват у бедра / корпус',font=font,fill='white')
        comparison.append(canvas)
    comparison[0].save(out/'run-before-after.gif',save_all=True,append_images=comparison[1:],duration=50,loop=0,optimize=False,disposal=2)
side=list((out/'side-frames').glob('*.png'))
if len(side)==8:
    sheet=Image.new('RGB',(1280,864),(18,25,32));draw=ImageDraw.Draw(sheet)
    for i,path in enumerate(sorted(side)):
        im=Image.open(path).convert('RGB').resize((320,400))
        x=(i%4)*320;y=(i//4)*432
        sheet.paste(im,(x,y+32));draw.text((x+10,y+5),f'{i*.1:.1f} с · +Z →',font=font,fill='white')
    sheet.save(out/'run-side-review.png')
print('Saved actual-animation GIF and available comparison / side review')
