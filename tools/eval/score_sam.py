import pickle, numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
TOL=14
man={m['name']:m for m in json.load(open(__import__('sys').argv[1]))}
def tooth_masks(n):
    d=pickle.load(open(f'{__import__('sys').argv[2]}/sam_{n}.pkl','rb'))[n]
    im=Image.open(man[n]['photo']).convert('RGB'); H0=im.height; W0=im.width
    a=np.asarray(im.resize((768,int(im.height*768/im.width)))).astype(float)
    H,W=a.shape[:2]; tot=H*W
    r,g,b=a[...,0],a[...,1],a[...,2]; lum=0.299*r+0.587*g+0.114*b; red=(r-g)/(lum+1)
    L=[]
    for m in d['masks']:
        sg=m['segmentation'] if 'segmentation' in m else m['seg']
        ar=sg.sum()
        if not (0.004*tot<ar<0.2*tot): continue
        ys,xs=np.where(sg); bw=xs.max()-xs.min()+1; bh=ys.max()-ys.min()+1
        sol=ar/ (bw*bh)
        hull_ok=sol>0.55
        ml=lum[sg].mean(); mr=red[sg].mean()
        L.append(dict(x0=xs.min(),x1=xs.max(),y0=ys.min(),y1=ys.max(),cy=ys.mean(),area=ar,lum=ml,red=mr,sol=sol,bw=bw,bh=bh,ok=hull_ok))
    return L,W,H,lum,red
def pick(L,lum_all,red_all):
    lt=np.percentile(lum_all,50); rt=np.percentile(red_all,45)
    c=[m for m in L if m['ok'] and m['lum']>lt*0.95 and m['red']<np.percentile(red_all,70) and 0.6<m['bh']/m['bw']<3.5 ]
    if not c: return []
    # keep the row of teeth: masks whose vertical centre is within 0.5 of the largest mask's height
    big=max(c,key=lambda m:m['area']); ref=big['cy']; h=big['bh']
    return [m for m in c if abs(m['cy']-ref)<0.55*h]
tot=dict(h=0,t=0,f=0,s=0)
for n in ['ex2','ex3','ex4','ex5']:
    L,W,H,lum,red=tooth_masks(n); S=man[n]['photo']
    sel=pick(L,lum,red)
    s=1280.0/W
    ext=sorted(set([int(m['x0']*s) for m in sel]+[int(m['x1']*s) for m in sel]))
    # merge extents within 12px
    mg=[]
    for x in ext:
        if mg and x-mg[-1][-1]<=14: mg[-1].append(x)
        else: mg.append([x])
    cand=[int(np.mean(g)) for g in mg]
    truth=man[n]['truth']
    hits=sum(any(abs(c-t)<=TOL for c in cand) for t in truth)
    fp=sum(all(abs(c-t)>TOL for t in truth) for c in cand)
    errs=[min(abs(c-t) for c in cand) for t in truth]
    print(n,'teeth masks',len(sel),'| borders hit',hits,'/',len(truth),'| false',fp,'of',len(cand),'| err px',errs)
    tot['h']+=hits;tot['t']+=len(truth);tot['f']+=fp;tot['s']+=len(cand)
print('TOTAL (zero-shot, no training on his photos):',tot)
