import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, sys, pickle
from PIL import Image
import torch
from mobile_sam import sam_model_registry, SamAutomaticMaskGenerator
sam=sam_model_registry["vit_t"](checkpoint="/tmp/mobile_sam.pt"); sam.eval()
gen=SamAutomaticMaskGenerator(sam,points_per_side=16,points_per_batch=4,pred_iou_thresh=0.80,stability_score_thresh=0.88,min_mask_region_area=800)
man=json.load(open(sys.argv[2]))
out={}
only=sys.argv[1]
for it in man:
    if it['name']!=only: continue
    im=Image.open(it['photo']).convert('RGB')
    if False:
        pass
    else:
        arr=np.asarray(im); out[it['name']]=dict(box=(0,0,im.size[0],im.size[1]))
    # upscale small crops so SAM sees ~1024 wide
    s=768/arr.shape[1]
    big=np.asarray(Image.fromarray(arr).resize((768,int(arr.shape[0]*s))))
    ms=gen.generate(big)
    out[it['name']]['scale']=s
    out[it['name']]['masks']=[dict(seg=m['segmentation'],area=m['area'],bbox=m['bbox'],iou=m['predicted_iou'],stab=m['stability_score']) for m in ms]
    print(it['name'],len(ms))
pickle.dump(out,open(f'/tmp/sam_{only}.pkl','wb'))
