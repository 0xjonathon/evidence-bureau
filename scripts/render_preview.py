import bpy, os
root='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
scene=bpy.context.scene
for obj in scene.objects:
 if obj.name.startswith('VisitorHand'):
  obj.hide_render=True
  for child in obj.children_recursive:child.hide_render=True
bpy.context.window.scene=scene
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=root+'/public/assets/bureau-preview.png'
bpy.ops.render.render(write_still=True)
print('PREVIEW_READY')
