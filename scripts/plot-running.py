"""Plot authored motion channels, not measured biomechanics.
MPLCONFIGDIR=/tmp/graph-matplotlib python3 scripts/plot-running.py [examples/cyborg]
"""
from pathlib import Path
import json,sys,hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=Path(sys.argv[1] if len(sys.argv)>1 else 'examples/cyborg')
data=json.loads((out/'motion-style.json').read_text());samples=[s for s in data['samples'] if s['time']<=.8]
t=[s['time'] for s in samples];force=[s['forceBodyWeights'] for s in samples]
fig,axes=plt.subplots(3,1,figsize=(9,7),sharex=True)
for ax,field,label in zip(axes,['height','velocity','forceBodyWeights'],['Pelvis proxy Y (m)','Vertical speed (m/s)','Authored support / mg']):
 ax.plot(t,[s[field] for s in samples]);ax.set_ylabel(label)
fig.suptitle('VANGUARD: analytical vertical proxy, not measured full-body dynamics')
for ax in axes:
 for a,b in [(0,.272),(.4,.672)]:ax.axvspan(a,b,color='#63c7e8',alpha=.13)
 ax.grid(alpha=.2)
axes[-1].set_xlabel('Time (s), one leg cycle');fig.tight_layout();fig.savefig(out/'run-dynamics.png',dpi=130);plt.close(fig)
fig,axes=plt.subplots(3,1,figsize=(9,7),sharex=True)
channels=[('Lumbar pitch (rad)',[.045+.019*(f-1) for f in force],[s['upper']['lumbarRotation'][0] for s in samples]),
 ('Chest relative pitch (rad)',[.035+.022*(f-1) for f in force],[s['upper']['chestRotation'][0] for s in samples]),
 ('Weapon relative pitch (rad)',[.035+.016*(f-1) for f in force],[s['upper']['weaponRotation'][0] for s in samples])]
for ax,(label,target,response) in zip(axes,channels):
 ax.plot(t,target,'--',label='Authored target',alpha=.65);ax.plot(t,response,label='Periodic spring response');ax.set_ylabel(label);ax.grid(alpha=.2)
axes[0].legend();axes[-1].set_xlabel('Time (s), one leg cycle');fig.suptitle('VANGUARD: separate second-order channels, not full-body simulation')
fig.tight_layout();fig.savefig(out/'run-upper-body.png',dpi=130);plt.close(fig)
print('Saved authored vertical and secondary-response plots')
if (out/'ankle-review.json').exists():
 review=json.loads((out/'ankle-review.json').read_text());assert review['current']['sourceSha256']==hashlib.sha256((out/'cyborg.graph.json').read_bytes()).hexdigest(),'Stale ankle review';current=[s for s in review['current']['samples'] if s['side']=='L']
 fig,axes=plt.subplots(2,1,figsize=(9,6),sharex=True)
 q=[s['swing'] for s in current]
 axes[0].plot(q,[s['shankPitchDegrees'] for s in current],label='Shank pitch')
 axes[0].plot(q,[s['footPitchDegrees'] for s in current],label='Foot pitch after correction')
 axes[1].plot(q,[s['relativeFlexionDegrees'] for s in current],label='After: foot relative to shank')
 if 'previous' in review:
  previous=[s for s in review['previous']['samples'] if s['side']=='L']
  axes[1].plot([s['swing'] for s in previous],[s['relativeFlexionDegrees'] for s in previous],'--',label='Before: world-pitch cancellation',color='gray')
 for ax in axes:ax.axvspan(.25,.5,color='#63c7e8',alpha=.13);ax.grid(alpha=.2);ax.legend();ax.set_ylabel('Degrees, sagittal projection')
 axes[1].axhline(0,color='black',alpha=.3,linewidth=.7);axes[1].set_xlabel('Swing fraction: toe-off 0 -> landing 1')
 fig.suptitle('Actual Graph Forge poses: ankle projection, not clinical ROM or mocap')
 fig.tight_layout();fig.savefig(out/'ankle-review.png',dpi=130);plt.close(fig)
