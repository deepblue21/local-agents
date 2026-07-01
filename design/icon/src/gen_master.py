import os, math
import cairosvg
OUT=os.path.dirname(os.path.abspath(__file__)); S=1080; C=S/2
EM,EM_HI,EM_DEEP="#38D6A3","#7CF2CC","#16B98A"
BG0,BG1,BG2="#11161d","#090B0F","#05070A"

def bloom(cx,cy,r,op,idn,color=EM):
    return (f'<radialGradient id="{idn}" cx="50%" cy="50%" r="50%">'
            f'<stop offset="0%" stop-color="{color}" stop-opacity="{op}"/>'
            f'<stop offset="45%" stop-color="{color}" stop-opacity="{op*0.4:.3f}"/>'
            f'<stop offset="100%" stop-color="{color}" stop-opacity="0"/></radialGradient>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{idn})"/>')

def bg_inner():
    return (f'<radialGradient id="bg" cx="32%" cy="24%" r="92%">'
            f'<stop offset="0%" stop-color="{BG0}"/><stop offset="62%" stop-color="{BG1}"/>'
            f'<stop offset="100%" stop-color="{BG2}"/></radialGradient>'
            f'<rect width="{S}" height="{S}" fill="url(#bg)"/>')

def ring(r,op,w,color=EM): return f'<circle cx="{C}" cy="{C}" r="{r}" fill="none" stroke="{color}" stroke-width="{w}" stroke-opacity="{op}"/>'
def core(rr=78,idn="m",cx=C,cy=C):
    return (bloom(cx,cy,260,0.5,"cg"+idn)+
            f'<radialGradient id="cr{idn}" cx="42%" cy="36%" r="66%">'
            f'<stop offset="0%" stop-color="{EM_HI}"/><stop offset="52%" stop-color="{EM}"/>'
            f'<stop offset="100%" stop-color="{EM_DEEP}"/></radialGradient>'
            f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="url(#cr{idn})"/>'
            f'<ellipse cx="{cx-22}" cy="{cy-27}" rx="28" ry="19" fill="#EAFFF7" fill-opacity="0.62"/>')

# Vector-faithful foreground (what the Android VectorDrawable renders): solid rings + gradient core
FG_VEC = ring(300,0.16,6)+ring(228,0.32,7)+ring(150,0.6,9)+core()
# Hero foreground (adds subtle sweep accent on top ring, presentation only)
def sweep(r,w):
    return (f'<linearGradient id="sw" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0%" stop-color="#CFFFEE" stop-opacity="0.9"/>'
            f'<stop offset="50%" stop-color="{EM}" stop-opacity="0.35"/>'
            f'<stop offset="100%" stop-color="{EM}" stop-opacity="0"/></linearGradient>'
            f'<circle cx="{C}" cy="{C}" r="{r}" fill="none" stroke="url(#sw)" stroke-width="{w}" stroke-linecap="round"/>')
FG_HERO = ring(300,0.16,6)+ring(228,0.30,7)+ring(150,0.45,8)+sweep(150,9)+core()

# Monochrome silhouette (white) for themed icon / notification
FG_MONO = (ring(300,0.9,7,"#FFFFFF")+ring(228,0.9,8,"#FFFFFF")+ring(150,1.0,11,"#FFFFFF")
           +f'<circle cx="{C}" cy="{C}" r="78" fill="#FFFFFF"/>')

def compose(fg, mask, bg=True):
    if mask=="circle": clip=f'<clipPath id="m"><circle cx="{C}" cy="{C}" r="{C}"/></clipPath>'
    elif mask=="full": clip=f'<clipPath id="m"><rect width="{S}" height="{S}"/></clipPath>'
    else:
        r=int(S*0.235); clip=f'<clipPath id="m"><rect width="{S}" height="{S}" rx="{r}" ry="{r}"/></clipPath>'
    body = (bg_inner() if bg else "")+fg
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">'
            f'<defs>{clip}</defs><g clip-path="url(#m)">{body}</g></svg>')

def render(svg,name,size):
    cairosvg.svg2png(bytestring=svg.encode(),write_to=os.path.join(OUT,name),output_width=size,output_height=size)

# App icon (vector-faithful) squircle + circle
render(compose(FG_VEC,"squircle"),"app_squircle_512.png",512)
render(compose(FG_VEC,"circle"),"app_circle_512.png",512)
render(compose(FG_VEC,"squircle"),"app_96.png",96)
render(compose(FG_VEC,"squircle"),"app_48.png",48)
# Hero full-bleed (Play feature) + masked hero
render(compose(FG_HERO,"squircle"),"hero_squircle_1024.png",1024)
render(compose(FG_HERO,"full"),"playstore_512.png",512)
# Mono on transparent (no bg)
render(compose(FG_MONO,"full",bg=False),"monochrome_432.png",432)
# white silhouette on emerald tile (themed-icon preview)
def themed_preview():
    r=int(S*0.235)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">'
            f'<rect width="{S}" height="{S}" rx="{r}" fill="#0B0E13"/>{FG_MONO}</svg>')
render(themed_preview(),"themed_preview_512.png",512)
print("master done")
