# Original sculpted noir character, authored in Blender. Coordinates: Z up.
# Profile lofts supply an adult jaw, cheekbones and tailored silhouette.
M['coat']=mat('Midnight tailored wool',(.065,.095,.102),0,.8)
M['lapel']=mat('Camel gabardine',(.34,.255,.17),0,.78)
M['skin']=mat('Portrait skin',(.48,.285,.205),0,.57)
M['lip']=mat('Muted lips',(.34,.16,.125),0,.65)
M['shadow']=mat('Beard shadow',(.24,.17,.137),0,.85)
M['nail']=mat('Natural nails',(.66,.43,.325),0,.46)
M['iris']=mat('Grey green iris',(.12,.20,.18),0,.35)
def loft(name,rings,ma,parent=None,sides=40):
 verts=[]
 for z,rx,ry,cy in rings:
  for j in range(sides):
   a=2*math.pi*j/sides;verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
 faces=[]
 for k in range(len(rings)-1):
  for j in range(sides):faces.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
 faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+j for j in range(sides))])
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);apply(o,name,ma,parent)
 for p in me.polygons:p.use_smooth=True
 mod=o.modifiers.new('Portrait surface','SUBSURF');mod.levels=2
 return o

def capsule(name,a,b,r1,r2,ma,parent):
 d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=r1,radius2=r2,depth=d.length,location=mid)
 o=bpy.context.object;apply(o,name,ma,parent);o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 be=o.modifiers.new('Organic edge','BEVEL');be.width=min(r1,r2)*.65;be.segments=3
 for p in o.data.polygons:p.use_smooth=True
 return o

def hand(name,c,side,parent,visitor=False):
 g=empty(name);g.parent=parent
 x,y,z=c
 sphere('Thenar palm',(x,y,z),(.135,.19,.052),'skin',g)
 # Four independent fingers; tapered phalanges, knuckles and inset nails.
 for i in range(4):
  joint=empty('GripFinger'+str(i));joint.parent=g;joint['fingerIndex']=i
  xx=x+side*(-.096+i*.063);length=[.235,.28,.258,.20][i];rad=[.030,.033,.030,.026][i]
  a=(xx,y-.10,z);b=(xx+side*.008,y-.10-length*.48,z-.007);d=(xx+side*.014,y-.10-length,z-.025)
  capsule('Proximal phalanx',a,b,rad,rad*.94,'skin',joint);sphere('Knuckle',b,(rad*.98,rad,rad*.83),'skin',joint)
  capsule('Distal phalanx',b,d,rad*.94,rad*.72,'skin',joint)
  sphere('Fingertip',d,(rad*.73,rad*.9,rad*.7),'skin',joint)
  sphere('Fingernail',(d[0],d[1]+.017,d[2]+rad*.61),(rad*.58,.035,.006),'nail',joint)
  for segment in joint.children:segment.location-=Vector(a)
  joint.location=a
 a=(x-side*.11,y+.04,z);b=(x-side*.20,y-.025,z+.025);d=(x-side*.22,y-.13,z+.025)
 capsule('Thumb metacarpal',a,b,.052,.041,'skin',g);capsule('Thumb distal',b,d,.041,.03,'skin',g)
 sphere('Thumbnail',(d[0],d[1]+.018,d[2]+.028),(.022,.037,.006),'nail',g)
 box('Shirt wrist',(x,y+.19,z-.004),(.24,.13,.09),'paper',.025,g)
 box('Tailored cuff',(x,y+.29,z-.008),(.27,.15,.13),'coat',.025,g)
 return g

detective=empty('Detective');head=empty('DetectiveHead');head.parent=detective
loft('Tailored jacket',[(1.50,.42,.26,1.05),(1.72,.48,.29,1.05),(2.12,.53,.30,1.02),(2.43,.63,.25,1.04),(2.51,.52,.20,1.05),(2.58,.24,.16,1.02)],'coat',detective)
box('Crisp shirt',(0,.744,2.31),(.29,.06,.46),'paper',.03,detective)
capsule('Neck',(0,1,2.46),(0,.98,2.83),.145,.15,'skin',detective)
for side in [-1,1]:
 o=box('Sculpted lapel',(side*.235,.738,2.32),(.19,.055,.53),'lapel',.018,detective);o.rotation_euler.y=side*.39
 o=box('Shirt collar',(side*.10,.695,2.56),(.14,.05,.20),'paper',.012,detective);o.rotation_euler.y=side*.48
 sphere('Jacket button',(side*.16,.728,1.96),(.025,.018,.025),'brass',detective)
box('Silk necktie',(0,.687,2.29),(.075,.026,.35),'hair',.012,detective)
o=box('Tie knot',(0,.673,2.49),(.086,.04,.09),'hair',.018,detective);o.rotation_euler.y=.15
box('Tie bar',(0,.664,2.26),(.10,.015,.018),'brass',.004,detective)
box('Breast pocket',(-.36,.722,2.27),(.18,.018,.025),'lapel',.005,detective)
# Adult face: narrow chin, defined jaw, high cheeks and smaller eyes.
loft('Sculpted face',[(2.74,.11,.13,.94),(2.78,.21,.20,.94),(2.88,.285,.25,.95),(3.02,.32,.27,.96),(3.19,.345,.29,.985),(3.37,.33,.29,1.0),(3.53,.29,.265,1.03),(3.63,.12,.14,1.04)],'skin',head)
for side in [-1,1]:
 sphere('Ear',(side*.342,1.015,3.19),(.062,.055,.12),'skin',head)
 sphere('Inner ear',(side*.355,.967,3.20),(.026,.012,.068),'lip',head)
 # Cheek planes belong to the continuous face, without separate cheek discs.
 # Restrained eye proportions.
 sphere('Almond eye',(side*.145,.704,3.295),(.080,.018,.028),'white',head)
 sphere('Iris',(side*.139,.678,3.295),(.024,.007,.026),'iris',head)
 sphere('Pupil',(side*.139,.669,3.295),(.012,.005,.019),'ink',head)
 sphere('Catchlight',(side*.139-.008,.662,3.307),(.008,.004,.008),'white',head)
 o=sphere('Upper eyelid',(side*.145,.701,3.325),(.083,.013,.010),'skin',head);o.rotation_euler.y=side*.09
 brow=sphere('Defined eyebrow',(side*.146,.711,3.405),(.110,.018,.017),'hair',head);brow.rotation_euler.y=-side*.16
 sphere('Nostril wing',(side*.048,.66,3.105),(.035,.033,.027),'skin',head)
 sphere('Nostril',(side*.041,.637,3.09),(.014,.008,.009),'shadow',head)
# A continuous bridge rather than a spherical toy nose.
loft('Nose bridge',[(3.075,.038,.030,.658),(3.105,.063,.062,.662),(3.16,.047,.067,.690),(3.30,.036,.037,.720),(3.40,.022,.017,.735)],'skin',head,24)
sphere('Lower lip',(0,.704,2.97),(.087,.014,.017),'lip',head)
sphere('Mouth line',(0,.688,2.99),(.102,.008,.008),'shadow',head)
# Chin is sculpted into the continuous jaw profile.
# Swept hair with restrained sculpted locks.
sphere('Hair crown',(0,1.06,3.54),(.333,.28,.19),'hair',head)
for side in [-1,1]:sphere('Tapered sideburn',(side*.307,.968,3.37),(.031,.092,.15),'hair',head)
o=sphere('Swept quiff',(-.025,.845,3.555),(.29,.115,.075),'hair',head);o.rotation_euler.y=-.12
for i in range(2):
 o=sphere('Hair sweep',(-.055+i*.11,.80,3.565+i*.018),(.19,.07,.028),'hair',head);o.rotation_euler.y=-.15
# Pinched felt fedora, thinner brim, asymmetrical profile.
hat=cyl('Fedora brim',(0,1.025,3.68),.53,.035,'lapel',head);hat.scale.y=.79;hat.rotation_euler.y=-.07
loft('Pinched fedora',[(3.68,.34,.27,1.03),(3.73,.34,.27,1.03),(3.96,.29,.235,1.07),(4.02,.23,.19,1.07)],'coat',head)
band=cyl('Grosgrain hat band',(0,1.03,3.735),.346,.09,'hair',head);band.scale.y=.79
box('Hat ribbon buckle',(.28,.84,3.73),(.08,.015,.06),'brass',.01,head)
for side in [-1,1]:
 arm=empty('DetectiveArmL' if side<0 else 'DetectiveArmR');arm.parent=detective
 capsule('Tailored upper sleeve',(side*.56,1.,2.40),(side*.83,.49,1.96),.16,.135,'coat',arm)
 sphere('Elbow seam',(side*.83,.49,1.96),(.14,.145,.15),'coat',arm)
 capsule('Tapered forearm',(side*.83,.49,1.96),(side*.56,-.035,1.70),.134,.10,'coat',arm)
 hand('Articulated hand',(side*.55,-.20,1.69),side,arm)
# Viewer hands are independent nodes, positioned against the interactive paper at runtime.
for side in [-1,1]:
 g=hand('VisitorHandL' if side<0 else 'VisitorHandR',(0,0,0),side,None,True)
 # Local geometry designed to be viewed from above; runtime camera projection aligns the grip.
 g.hide_render=False
