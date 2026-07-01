import os
OUT="/sessions/tender-serene-maxwell/mnt/outputs/icon/android_res"
os.makedirs(OUT+"/drawable",exist_ok=True)
os.makedirs(OUT+"/mipmap-anydpi-v26",exist_ok=True)

def circle_path(cx,cy,r):
    return f"M{cx},{cy-r:.3f} a{r},{r} 0 1 1 0,{2*r:.3f} a{r},{r} 0 1 1 0,{-2*r:.3f} z"

# viewport 108, center 54. rings r=30.5/23/15.5 (within 66 safe zone), core r=8
RINGS=[(30.5,0.16,0.6),(23.0,0.32,0.7),(15.5,0.60,0.9)]
CORE_R=8.0

# ---- background (radial gradient) ----
bg=f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
  <path android:pathData="M0,0h108v108h-108z">
    <aapt:attr name="android:fillColor">
      <gradient android:type="radial" android:centerX="35" android:centerY="26" android:gradientRadius="100">
        <item android:offset="0" android:color="#FF11161D"/>
        <item android:offset="0.62" android:color="#FF090B0F"/>
        <item android:offset="1" android:color="#FF05070A"/>
      </gradient>
    </aapt:attr>
  </path>
</vector>
'''

# ---- foreground (glow + rings + gradient core + highlight) ----
ring_paths=""
for r,a,w in RINGS:
    ring_paths+=f'  <path android:strokeColor="#38D6A3" android:strokeWidth="{w}" android:strokeAlpha="{a}" android:fillColor="#00000000" android:pathData="{circle_path(54,54,r)}"/>\n'
glow=f'''  <path android:pathData="{circle_path(54,54,26)}">
    <aapt:attr name="android:fillColor">
      <gradient android:type="radial" android:centerX="54" android:centerY="54" android:gradientRadius="26">
        <item android:offset="0" android:color="#6638D6A3"/>
        <item android:offset="0.5" android:color="#2638D6A3"/>
        <item android:offset="1" android:color="#0038D6A3"/>
      </gradient>
    </aapt:attr>
  </path>
'''
core=f'''  <path android:pathData="{circle_path(54,54,CORE_R)}">
    <aapt:attr name="android:fillColor">
      <gradient android:type="radial" android:centerX="51.8" android:centerY="51.2" android:gradientRadius="9">
        <item android:offset="0" android:color="#FF7CF2CC"/>
        <item android:offset="0.52" android:color="#FF38D6A3"/>
        <item android:offset="1" android:color="#FF16B98A"/>
      </gradient>
    </aapt:attr>
  </path>
  <path android:fillColor="#EAFFF7" android:fillAlpha="0.6" android:pathData="M50.5,50.5 a2.8,1.9 0 1 1 0,0.01 z"/>
'''
fg=f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
{glow}{ring_paths}{core}</vector>
'''

# ---- monochrome (single color #FFFFFF; system tints) ----
mono_rings=""
for r,a,w in [(30.5,1.0,0.8),(23.0,1.0,0.95),(15.5,1.0,1.25)]:
    mono_rings+=f'  <path android:strokeColor="#FFFFFFFF" android:strokeWidth="{w}" android:fillColor="#00000000" android:pathData="{circle_path(54,54,r)}"/>\n'
mono=f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
{mono_rings}  <path android:fillColor="#FFFFFFFF" android:pathData="{circle_path(54,54,8)}"/>
</vector>
'''

adaptive='''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
'''

open(OUT+"/drawable/ic_launcher_background.xml","w").write(bg)
open(OUT+"/drawable/ic_launcher_foreground.xml","w").write(fg)
open(OUT+"/drawable/ic_launcher_monochrome.xml","w").write(mono)
open(OUT+"/mipmap-anydpi-v26/ic_launcher.xml","w").write(adaptive)
open(OUT+"/mipmap-anydpi-v26/ic_launcher_round.xml","w").write(adaptive)
print("android vector resources written")
for root,_,files in os.walk(OUT):
    for f in files: print(os.path.join(root,f).replace(OUT,"android_res"))
