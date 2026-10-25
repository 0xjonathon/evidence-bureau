"""Editable chassis source; coordinate dimensions are shared with runtime colliders."""
import bpy, json, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0,rough=.4,emission=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=1.4
 return m
case=material('Anodized petrol aluminum',(.028,.092,.094),.68,.3)
metal=material('Brushed titanium',(.37,.46,.42),.85,.27)
glass=material('Optical bed',(.035,.20,.16),.45,.17)
light=material('Status phosphor',(.27,.95,.67),0,.25,True)
screen=material('Agent screen',(.02,.09,.075),0,.7,True)
def xyz(p):return(p[0],-p[2],p[1])
def box(name,size,pos,mat,bevel=.018):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Machined edge radius','BEVEL');m.width=min(bevel,min(size)/4);m.segments=3
  n=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
 return o
specs=json.load(open(root+'/docs/visual-v7/workstation-dimensions.json'))
for s in specs:
 if s['name'].startswith('instrument-'):box(s['name'],s['size'],s['position'],glass if s['name'].endswith('glass') else metal if s['name'].endswith('output') else case)
# Vertical front panel. Mesh UVs face the visitor (+Z in runtime).
bpy.ops.mesh.primitive_plane_add(size=1,location=xyz((1.24,1.992,.203)),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='VisitorFacingAgentScreen';o.scale=(.99,.40,1);o.data.materials.append(screen);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for x in [.704,1.776]:box('MachinedRail',(.018,.50,.025),(x,1.975,.21),metal,.004)
for z in [-.77,.13]:box('ScannerRail',(1.04,.014,.018),(1.24,2.228,z),metal,.003)
for i in range(12):box('CoolingFin',(.009,.18,.035),(1.812,1.97,-.64+i*.047),metal,.002)
for x in [.72,1.76]:
 for y in [1.795,2.18]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.012,depth=.006,location=xyz((x,y,.219)),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='BezelFastener';o.data.materials.append(metal)
box('InstrumentStatus',(.69,.009,.008),(1.24,1.758,.206),light,.002)
box('OpticalScanBar',(.94,.007,.012),(1.24,2.237,-.32),light,.002)
# V8 clearance: move the complete instrument 0.40 m toward the detective.
# Keep all native mesh details and the outlet geometry together.
for part in bpy.context.scene.objects:part.location.y+=.40
# Export a single measured asset, with mesh names retained for the live display and scan bar.
bpy.ops.wm.save_as_mainfile(filepath=root+'/instrument-source-v8.blend')
bpy.ops.export_scene.gltf(filepath=root+'/public/assets/instrument-v8.glb',export_format='GLB',export_apply=True,export_yup=True)
print('INSTRUMENT_V8_READY')
