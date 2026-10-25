"""Load the official MPFB modelling dependency for this Blender session only.
Configuration and caches stay inside the project; no user preferences are saved.
"""
import bpy, sys, os
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
TOOL=ROOT+'/.tools/mpfb2-master/src'
if TOOL not in sys.path:sys.path.insert(0,TOOL)
import mpfb
if not mpfb.MPFB_CONTEXTUAL_INFORMATION:
 original_extension_path=bpy.utils.extension_path_user
 def local_extension_path(package,**kwargs):
  if package=='mpfb':return ROOT+'/.tools/mpfb-user'
  return original_extension_path(package,**kwargs)
 bpy.utils.extension_path_user=local_extension_path
 mpfb.get_preference=lambda key:{'mpfb_user_data':ROOT+'/.tools/mpfb-user','mpfb_second_root':ROOT+'/.tools/human-assets','mh_auto_user_data':False,'mh_user_data':'','mpfb_shelf_label':'MPFB','mpfb_show_start_here':True,'mpfb_codechecks':False}.get(key,False)
 try:mpfb.register()
 finally:bpy.utils.extension_path_user=original_extension_path
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
print('MPFB loaded with project-local data')
