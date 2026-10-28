from pathlib import Path
import io
import cairosvg
from PIL import Image
root=Path(__file__).resolve().parents[2]
svg=(root/'mobile/icon.svg').read_bytes()
for base in [root/'mobile/android/app/src/main/res',root/'mobile/ios/App/App/Assets.xcassets']:
 for target in base.rglob('*.png'):
  with Image.open(target) as old: size=old.size
  if 'splash' in str(target).lower():
   image=Image.new('RGB',size,'#172234')
   side=min(size)//3
   logo=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg,output_width=side,output_height=side))).convert('RGB')
   image.paste(logo,((size[0]-side)//2,(size[1]-side)//2));image.save(target)
  else:
   cairosvg.svg2png(bytestring=svg,write_to=str(target),output_width=size[0],output_height=size[1])
