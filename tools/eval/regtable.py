import json,sys,glob,statistics as st
tag=sys.argv[1];rows=[json.load(open(f)) for f in sorted(glob.glob(f'/tmp/reg_{tag}/*.json'))]
print('photo  truth found hits  recall precision medErr  teeth lower')
H=T=F=G=0
for r in sorted(rows,key=lambda r:int(r['name'][2:])):
    if r['refused']: print(f"{r['name']:5} {r['truthN']:5}  REFUSED"); T+=r['truthN']; continue
    print(f"{r['name']:5} {r['truthN']:5} {r['found']:5} {r['hits']:4}  {r['recall']:.2f}   {r['precision']:.2f}    {r['medErr']:4}   {r['teeth']:3}   {r['lower']:3}")
    H+=r['hits'];T+=r['truthN'];F+=r['found'];G+=round(r['precision']*r['found'])
print(f"pooled over {len(rows)} photos: recall {H}/{T}={H/T:.2f}, precision {G}/{F}={G/F:.2f}")
