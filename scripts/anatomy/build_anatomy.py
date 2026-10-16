"""Builds the skinned, posed anatomy figure from the Z-Anatomy Startup.blend.

Run headless; see build.sh:
  blender -b --disable-autoexec Startup.blend --python build_anatomy.py -- --out raw.glb
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector, kdtree

HERE = os.path.dirname(os.path.abspath(__file__))

MUSCLE_BRANCHES = {
    'Muscles of lower limb.g', 'Muscles of upper limb.g', 'Muscles of abdomen.g', 'Muscles of thorax.g',
    'Epaxial muscles.g', 'Hypaxial muscles of back.g', 'Muscles of neck.g',
}
# Deep layers no viewer will see; they only cost triangles.
MUSCLE_SKIP = (
    'Innermost intercostal', 'Internal intercostal', 'Transversus thoracis', 'Levatores', 'Rotatores',
    'Interspinales', 'Intertransversarii', 'Dorsal parts of lateral', 'Ventral parts of lateral',
    'Subcostal', 'Diaphragm',
)
SOFT_SKIP = ('bursa', 'fascia', 'sheath', 'retinacul', 'septum', 'aponeurosis', 'ligament')
EXTRA_TENDONS = {'Iliotibial tract'}
BONE_BRANCHES = {
    'Bones of lower limb.g', 'Bones of upper limb.g', 'Cranium.g', 'Extracranial bones of head.g', 'Teeth.g',
    'Thoracic skeleton.g', 'Vertebral column.g',
}
BONE_SKIP = ('Sinus of', 'cells of ethmoid')
TISSUE_MATERIALS = {'Tendon', 'Cartilage'}

TURN_SIDE = {'R': 'outside', 'L': 'inside'}


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True, help='raw .glb path')
    p.add_argument('--muscle-tris', type=int, default=110_000)
    p.add_argument('--bone-tris', type=int, default=55_000)
    p.add_argument('--map', default=os.path.join(HERE, 'muscle-map.json'))
    p.add_argument('--pose', required=True, help='pose track JSON from pose-track.ts')
    p.add_argument('--report', help='optional JSON report path')
    p.add_argument('--save-blend', help='optional path to save the rigged scene')
    return p.parse_args(argv)


def log(*a):
    print('[anatomy]', *a, flush=True)


def chain(o):
    out = []
    while o.parent:
        o = o.parent
        out.append(o.name)
    return out


def base_name(name):
    return name[:-2] if name[-2:] in ('.r', '.l') else name


def side_of(name, centroid_x):
    if name.endswith('.r'):
        return 'R'
    if name.endswith('.l'):
        return 'L'
    if abs(centroid_x) < 0.01:
        return None
    # Z-Anatomy faces -Y, so anatomical right is -X.
    return 'R' if centroid_x < 0 else 'L'


# ---------------------------------------------------------------- extraction

def world_arrays(o, dg):
    """Evaluated, world-space triangles: (verts (n,3), tris (m,3), tissue flag per tri)."""
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0:
        me.flip_normals()
    # Slots may link materials to the object, so read them from the object, not the mesh.
    tissue = [bool(sl.material) and sl.material.name.split('.')[0] in TISSUE_MATERIALS for sl in o.material_slots]
    for poly in me.polygons:
        poly.material_index = 1 if (poly.material_index < len(tissue) and tissue[poly.material_index]) else 0
    # Indices are now 0/1; clearing slots would reset them, so only pad to two.
    while len(me.materials) < 2:
        me.materials.append(None)
    return me


def decimate(me, ratio):
    if ratio < 0.999:
        ob = bpy.data.objects.new('tmp', me)
        bpy.context.scene.collection.objects.link(ob)
        mod = ob.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        out = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        me = out
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    tris = np.zeros(n * 3, np.int32)
    mats = np.zeros(n, np.int32)
    me.loop_triangles.foreach_get('vertices', tris)
    me.loop_triangles.foreach_get('material_index', mats)
    verts = np.zeros(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get('co', verts)
    bpy.data.meshes.remove(me)
    tris = tris.reshape(-1, 3)
    verts = verts.reshape(-1, 3)
    used, inverse = np.unique(tris, return_inverse=True)
    return verts[used], inverse.reshape(-1, 3).astype(np.int32), mats


def tri_count(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


# ---------------------------------------------------------------- skeleton

def bone_part(name, ch):
    """Which armature bone a bone mesh follows rigidly; None for the patella, which blends."""
    n = base_name(name)
    if n in ('Hip bone', 'Sacrum', 'Coccyx'):
        return 'pelvis'
    if 'Lumbar vertebrae.g' in ch:
        return 'lumbar'
    if 'Cervical vertebrae.g' in ch or n == 'Hyoid bone':
        return 'neck'
    if {'Cranium.g', 'Extracranial bones of head.g', 'Teeth.g'} & set(ch):
        return 'head'
    if 'Bones of pectoral girdle.g' in ch:
        return 'scapula'
    if {'Thoracic vertebrae.g', 'Thoracic skeleton.g'} & set(ch):
        return 'chest'
    if n == 'Femur':
        return 'thigh'
    if n == 'Patella':
        return None
    if n in ('Tibia', 'Fibula'):
        return 'shin'
    if n == 'Talus':
        return 'talus'
    if 'Bones of foot.g' in ch:
        return 'foot'
    if n == 'Humerus':
        return 'upper_arm'
    if n in ('Radius', 'Ulna'):
        return 'forearm'
    if n == 'First metacarpal bone':
        return 'thumb'
    if 'phalanx' in n:
        if 'first finger' in n:
            return 'thumbtip'
        return 'fingers' if n.startswith('Proximal') else 'fingertips'
    if 'Bones of free part of upper limb.g' in ch:
        return 'hand'
    return 'chest'


def sided(part, side):
    return part if part in ('pelvis', 'lumbar', 'chest', 'neck', 'head') else f'{part}.{side}'


def anterior_centre(v):
    """Centre of a vertebral body: the front half of the vertebra (front is -Y)."""
    front = v[v[:, 1] < np.median(v[:, 1])]
    return front.mean(axis=0)


def landmarks(src):
    """Joint centres from the full-resolution bone meshes, in Blender world space (Z up, front -Y)."""
    J = {}
    for s in ('R', 'L'):
        femur = src[f'Femur.{s.lower()}']
        top = femur[femur[:, 2] > femur[:, 2].max() - 0.045]
        head = top[np.abs(top[:, 0]) < np.median(np.abs(top[:, 0]))]
        hip = head.mean(axis=0)
        hip[2] = femur[:, 2].max() - 0.023
        tibia = src[f'Tibia.{s.lower()}']
        knee = (femur[femur[:, 2] < femur[:, 2].min() + 0.025].mean(axis=0)
                + tibia[tibia[:, 2] > tibia[:, 2].max() - 0.02].mean(axis=0)) / 2
        talus = src[f'Talus.{s.lower()}']
        ankle = talus.mean(axis=0)
        clavicle = src[f'Clavicle.{s.lower()}']
        foot = np.concatenate([v for k, v in src.items() if k.startswith('foot:' + s)])
        humerus = src[f'Humerus.{s.lower()}']
        shoulder = humerus[humerus[:, 2] > humerus[:, 2].max() - 0.03].mean(axis=0)
        shoulder[2] = humerus[:, 2].max() - 0.022
        elbow = humerus[humerus[:, 2] < humerus[:, 2].min() + 0.02].mean(axis=0)
        radius = src[f'Radius.{s.lower()}']
        wrist = radius[radius[:, 2] < radius[:, 2].min() + 0.015].mean(axis=0)
        hand = np.concatenate([v for k, v in src.items() if k.startswith('hand:' + s)])
        # Knuckles and middle finger joints of fingers 2-5; the hand hangs, so proximal is up.
        top = lambda v: v[v[:, 2] > v[:, 2].max() - 0.006].mean(axis=0)
        low = lambda v: v[v[:, 2] < v[:, 2].min() + 0.006].mean(axis=0)
        proximal = [src[f'Proximal phalanx of {f} finger of hand.{s.lower()}'] for f in ('second', 'third', 'fourth', 'fifth')]
        tops = [top(v) for v in proximal]
        knuckle = np.mean(tops, axis=0)
        pip = np.mean([low(v) for v in proximal], axis=0)
        metacarpal = src[f'First metacarpal bone.{s.lower()}']
        thumb_tip = src[f'Distal phalanx of first finger of hand.{s.lower()}']
        J[s] = dict(hip=hip, knee=knee, ankle=ankle, shoulder=shoulder, elbow=elbow, wrist=wrist,
                    fingertip=hand[hand[:, 2].argmin()], knuckle=knuckle, pip=pip, row=tops[0] - tops[3],
                    cmc=top(metacarpal), mcp1=top(src[f'Proximal phalanx of first finger of hand.{s.lower()}']),
                    thumbtip=thumb_tip[thumb_tip[:, 2].argmin()],
                    toe=foot[foot[:, 1].argmin()], heel=foot[foot[:, 1].argmax()], sole=foot[:, 2].min(),
                    subtalar=ankle - np.array([0, -SUBTALAR_BEHIND, SUBTALAR_BELOW]), talus_head=talus[talus[:, 1].argmin()],
                    sc=clavicle[np.abs(clavicle[:, 0]).argmin()])
    l5, l1, t12 = src['Vertebra L5'], anterior_centre(src['Vertebra L1']), anterior_centre(src['Vertebra T12'])
    c7, t1 = anterior_centre(src['Vertebra C7']), anterior_centre(src['Vertebra T1'])
    l5s1 = anterior_centre(l5)
    l5s1[2] = l5[:, 2].min()
    J['pelvis'] = (J['R']['hip'] + J['L']['hip']) / 2
    J['l5s1'] = l5s1
    J['t12l1'] = (t12 + l1) / 2
    J['c7t1'] = (c7 + t1) / 2
    J['c1'] = src['Atlas (C1)'].mean(axis=0)
    J['crown'] = np.array([J['c1'][0], J['c1'][1], src['skull_top']])
    return J


def build_armature(J):
    arm = bpy.data.armatures.new('rig')
    ob = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')

    def add(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.roll = 0
        if parent:
            b.parent = arm.edit_bones[parent]
        return name

    add('pelvis', J['pelvis'], J['l5s1'])
    add('lumbar', J['l5s1'], J['t12l1'], 'pelvis')
    add('chest', J['t12l1'], J['c7t1'], 'lumbar')
    add('neck', J['c7t1'], J['c1'], 'chest')
    add('head', J['c1'], J['crown'], 'neck')
    for s in ('R', 'L'):
        j = J[s]
        add(f'thigh.{s}', j['hip'], j['knee'], 'pelvis')
        add(f'shin.{s}', j['knee'], j['ankle'], f'thigh.{s}')
        toe = j['toe'].copy()
        toe[2] = j['ankle'][2]
        add(f'foot.{s}', j['ankle'], toe, f'shin.{s}')
        # Child of the foot, which the boot sets: it turns back out the foot's roll under it (see world_pose).
        add(f'talus.{s}', j['subtalar'], j['talus_head'], f'foot.{s}')
        add(f'scapula.{s}', j['sc'], j['shoulder'], 'chest')
        add(f'upper_arm.{s}', j['shoulder'], j['elbow'], f'scapula.{s}')
        add(f'forearm.{s}', j['elbow'], j['wrist'], f'upper_arm.{s}')
        add(f'hand.{s}', j['wrist'], j['knuckle'], f'forearm.{s}')
        add(f'fingers.{s}', j['knuckle'], j['pip'], f'hand.{s}')
        add(f'fingertips.{s}', j['pip'], j['fingertip'], f'fingers.{s}')
        add(f'thumb.{s}', j['cmc'], j['mcp1'], f'hand.{s}')
        add(f'thumbtip.{s}', j['mcp1'], j['thumbtip'], f'thumb.{s}')
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


# ---------------------------------------------------------------- skinning

CANDIDATES = {
    'lower': lambda s: ['lumbar', 'pelvis', f'thigh.{s}', f'shin.{s}', f'foot.{s}', f'talus.{s}'],
    'upper': lambda s: ['chest', f'scapula.{s}', f'upper_arm.{s}', f'forearm.{s}', f'hand.{s}', f'fingers.{s}', f'fingertips.{s}',
                        f'thumb.{s}', f'thumbtip.{s}'],
    'trunk': lambda s: ['pelvis', 'lumbar', 'chest', 'neck'] + ([f'scapula.{s}', f'upper_arm.{s}'] if s else []),
    'neck': lambda s: ['chest', 'neck', 'head'],
}


def region_of(ch):
    if any('lower limb' in c for c in ch):
        return 'lower'
    if any('upper limb' in c for c in ch):
        return 'upper'
    if 'Muscles of neck.g' in ch:
        return 'neck'
    return 'trunk'


def soft_weights(verts, bones, trees, power=4.0, eps=0.004, keep=3):
    """Each vertex follows the bones whose surfaces are nearest, blended by inverse distance."""
    d = np.array([[trees[b].find(v)[2] for b in bones] for v in verts])
    w = 1.0 / (d + eps) ** power
    order = np.argsort(-w, axis=1)[:, :keep]
    top = np.take_along_axis(w, order, axis=1)
    top /= top.sum(axis=1, keepdims=True)
    return [[(bones[order[i, k]], float(top[i, k])) for k in range(keep) if top[i, k] > 0.01] for i in range(len(verts))]


# ---------------------------------------------------------------- fibres

def fibre_uv(verts, tris, deep_dir):
    """u: arc length around the principal axis (seam on the deep side); v: length along it. Metres."""
    c = verts.mean(axis=0)
    q = verts - c
    axis = np.linalg.svd(q, full_matrices=False)[2][0]
    perp = q - np.outer(q @ axis, axis)
    e1 = -deep_dir - (deep_dir @ axis) * -axis
    if np.linalg.norm(e1) < 1e-6:
        e1 = np.cross(axis, [0.0, 0.0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(axis, e1)
    r = max(float(np.linalg.norm(perp, axis=1).mean()), 1e-3)
    u = np.arctan2(perp @ e2, perp @ e1) * r
    v = q @ axis
    cu = u[tris]
    wrap = (cu.max(axis=1) - cu.min(axis=1)) > math.pi * r
    cu[wrap] = np.where(cu[wrap] < 0, cu[wrap] + 2 * math.pi * r, cu[wrap])
    return np.stack([cu, v[tris]], axis=-1)


# ---------------------------------------------------------------- pose (mirrors src/viewer/pose.ts)

def rot_x(a):
    return Matrix.Rotation(a, 4, 'X')


def rot_z3(a):
    """three.js rotationZ(a); three's +Z is Blender's -Y."""
    return Matrix.Rotation(-a, 4, 'Y')


def rot_y3(a):
    """three.js rotationY(a); three's +Y is Blender's +Z."""
    return Matrix.Rotation(a, 4, 'Z')


HEAD_LIFT, HEAD_LEVEL = 0.6, 0.7  # as in src/viewer/pose.ts
# Arm angles come from src/viewer/pose.ts through the pose track; see main.
ARMS = {}
# Pole from src/viewer/pose.ts through the pose track: basket height, carry height and heading, where the touch lands, and
# each clip's trim; main sets the clip's basket length.
POLE = {}
# Knuckles and fingertips sit this far from the grip's axis; the grip is about 18 mm in radius.
GRIP_R, TIP_R = 0.025, 0.028
# A power grip holds the pole across the palm, not along the knuckles: its top runs out toward the
# index knuckle and its bottom into the heel of the hand, so a pole trailing back needs less wrist.
GRIP_CANT = math.radians(17)
CURL_KNUCKLE = 1.45
# Boot sole below the lowest foot bone: heel pad, liner and shell sole.
BOOT_SOLE = 0.03
# Subtalar joint below and behind the talus's centre.
SUBTALAR_BELOW, SUBTALAR_BEHIND = 0.015, 0.01


def local_rotations(p, rest, inside_extra=0.0, reach=0.0):
    """Mirrors localRotation in src/viewer/pose.ts; the trunk's rotation is split over lumbar and chest."""
    pelvis = rot_y3(-p['counter']) @ rot_z3(p['pelvisList']) @ rot_x(p['pelvisPitch'])
    half = rot_y3(-p['spineTwist'] / 2) @ rot_z3(p['spineBend'] / 2) @ rot_x(p['spineFlex'] / 2)
    roll = HEAD_LEVEL * (p['pelvisList'] - p['lean'] + p['spineBend'])
    lift = rot_z3(-roll / 2) @ rot_x(-HEAD_LIFT * (p['pelvisPitch'] + p['spineFlex']) / 2)
    R = {'pelvis': pelvis, 'lumbar': half, 'chest': half, 'neck': lift, 'head': lift}
    # As armLean in pose.ts: past ARMS['lean'] the shoulder and elbow open, keeping the forearm's pitch.
    lean = p['pelvisPitch'] + p['spineFlex'] - ARMS['lean']
    for s, sign in (('R', -1), ('L', 1)):
        leg = p['outside'] if s == 'R' else p['inside']
        # The inside leg shortens at the hip, as in solvePose.
        hip, ankle = leg['hipFlex'] + (inside_extra if s == 'L' else 0.0), leg['ankleFlex']
        # Set in the body frame; the femur turns about its own axis.
        R[f'thigh.{s}'] = (pelvis.inverted() @ rot_z3(-p['hipAngulation'] - sign * leg.get('adduction', 0.0)) @ rot_x(-hip)
                           @ Matrix.Rotation(leg['femurRotation'], 4, rest['femur'][s]))
        R[f'shin.{s}'] = rot_x(hip + ankle)
        flex = ARMS['flexion'] - ARMS['leanShoulder'] * lean + (reach if s == 'L' else 0.0)
        girdle = p['outsideGirdle'] if s == 'R' else p['insideGirdle']
        R[f'scapula.{s}'] = rot_y3(-sign * girdle['protraction']) @ rot_z3(sign * girdle['elevation'])
        R[f'upper_arm.{s}'] = (rot_y3(sign * girdle['protraction']) @ rot_z3(sign * ARMS['abduction']) @ rot_x(-flex)
                               @ rot_z3(-rest['abduction'][s]))
        R[f'forearm.{s}'] = rot_x(-ARMS['forearmFlexion'] + (1 - ARMS['leanShoulder']) * lean)
        hand = rest['hands'][s]
        R[f'hand.{s}'] = hand['twist']
        R[f'fingers.{s}'] = hand['curl'][0]
        R[f'fingertips.{s}'] = hand['curl'][1]
        R[f'thumb.{s}'] = hand['thumb'][0]
        R[f'thumbtip.{s}'] = hand['thumb'][1]
    return R


def foot_rotation(p, s, rest, outside_shin):
    """bootRotation in pose.ts: both skis on the outside shin's tilt plus its eversion, the foot heel-up by the ramp."""
    up = outside_shin.to_3x3() @ Vector((0, 0, 1))
    edge = math.atan2(up.x, up.z) + p['eversion']
    tail = (p['outside'] if s == 'R' else p['inside'])['tailLift']
    return rot_z3(p['lean']) @ rot_x(tail) @ rot_z3(-p['lean'] - edge) @ rot_x(rest['ramp'])


def subtalar_roll(shin, foot):
    """The foot's roll on the shin about its long axis (rest-frame forward, -Y): eversion or inversion below the talus."""
    q = (shin.to_3x3().inverted() @ foot.to_3x3()).to_quaternion()
    axis = Vector((0, -1, 0))
    twist = Vector((q.x, q.y, q.z)).dot(axis)
    return 2 * math.atan2(twist, q.w)


def subtalar_undo(shin, foot):
    """The talus's rotation in the foot: the foot's roll taken back out, so the talus stays square in the ankle mortise."""
    return Matrix.Rotation(-subtalar_roll(shin, foot), 4, Vector((0, -1, 0)))


def world_pose(bones, order, R, ski_pivot, p, rest):
    D = {}
    for name in order:
        b = bones[name]
        j = Vector(b.head_local)
        parent = D[b.parent.name] if b.parent else Matrix()
        if name.startswith('foot.'):
            r = parent.to_3x3().to_4x4().inverted() @ foot_rotation(p, name[-1], rest, D['shin.R'])
        elif name.startswith('talus.'):
            r = subtalar_undo(D[f'shin.{name[-1]}'], parent)
        else:
            r = R[name]
        D[name] = parent @ Matrix.Translation(j) @ r @ Matrix.Translation(-j)
    c = D['foot.R'] @ Vector(ski_pivot)
    tilt = Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(p['lean'], 4, 'Y') @ Matrix.Translation(-c)
    return {k: tilt @ m for k, m in D.items()}


def pole_direction(grip, s, touch, ankle):
    """Unit shaft direction, fist to tip, in Blender space; mirrors poleDirection in pose.ts."""
    g, a = to_gltf(grip), to_gltf(ankle)
    out = 1 if s == 'L' else -1
    b = POLE['basket']
    dx = a[0] + out * POLE['plantSide'] - g[0]
    dz = -math.sqrt(max(0.0, b ** 2 - g[1] ** 2 - dx ** 2))
    turn = math.atan2(out * dx, dz) - POLE['carryHeading']
    heading = POLE['carryHeading'] + math.atan2(math.sin(turn), math.cos(turn)) * touch
    drop = min(b, max(0.0, g[1] - POLE['carry'] * (1 - touch) ** 2))
    flat = math.sqrt(b ** 2 - drop ** 2)
    return Vector((out * math.sin(heading) * flat / b, -math.cos(heading) * flat / b, -drop / b))


def touch_ahead(D, rest):
    """How far ahead of the inside ankle a full touch lands."""
    grip = D['hand.L'] @ rest['grip']['L']
    ankle = D['foot.L'] @ rest['ankle']['L']
    return -(grip + pole_direction(grip, 'L', 1, ankle) * POLE['basket'] - ankle).y


# Per clip: the largest wrist angle, hand axis to forearm axis, and what the plain swing onto the pole gave, degrees.
WRIST = {}


def grip_turn(row, along, axis, want):
    """Hand rotation that lays the knuckle row (the grip channel) along `want`. Any roll of the fist about
    the pole keeps that grip, so the roll is chosen to bring the hand's axis, wrist to knuckles, nearest the
    forearm's: the wrist stays near straight instead of bending to wherever the shortest swing leaves it."""
    swing = row.rotation_difference(want).to_matrix()
    w = want.normalized()
    flat = lambda v: v - v.dot(w) * w
    h, a = flat(swing @ along), flat(axis)
    roll = math.atan2(h.cross(a).dot(w), h.dot(a)) if h.length > 1e-9 and a.length > 1e-9 else 0.0
    turn = Matrix.Rotation(roll, 3, w) @ swing
    return turn.to_4x4(), math.degrees((turn @ along).angle(axis)), math.degrees((swing @ along).angle(axis))


def posed(bones, order, p, rest, flex, reach, ski_pivot, clip=None):
    """World pose with each wrist turned so the fist's grip channel runs along its pole."""
    R = local_rotations(p, rest, flex, reach)
    last = {}
    for _ in range(4):
        D = world_pose(bones, order, R, ski_pivot, p, rest)
        for s in ('R', 'L'):
            grip = D[f'hand.{s}'] @ rest['grip'][s]
            ankle = D[f'foot.{s}'] @ rest['ankle'][s]
            d = pole_direction(grip, s, p['poleTouch'] if s == 'L' else 0, ankle)
            hand = rest['hands'][s]
            want = (D[f'forearm.{s}'].to_3x3() @ hand['twist'].to_3x3()).inverted() @ -d
            turn, bend, swung = grip_turn(hand['row'], hand['along'], hand['axis'], want)
            R[f'hand.{s}'] = hand['twist'] @ turn
            last[s] = (bend, swung)
    if clip is not None:
        worst = WRIST.setdefault(clip, dict(bend=0.0, swing=0.0))
        for k, key in enumerate(('bend', 'swing')):
            worst[key] = max(worst[key], *(v[k] for v in last.values()))
    return world_pose(bones, order, R, ski_pivot, p, rest)


def solve_reach(bones, order, p, rest, flex, ski_pivot):
    """Inside-shoulder flexion that lands the touch PLANT_AHEAD in front of the ankle, as solveReach in pose.ts."""
    lo, hi = -0.5, 0.8
    for _ in range(20):
        mid = (lo + hi) / 2
        D = posed(bones, order, p, rest, flex, mid, ski_pivot)
        if touch_ahead(D, rest) < POLE['plantAhead']:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def bake(rig, ski_pivot, inside_tip, track, rest, name='stork-turn'):
    bones = rig.data.bones
    order = [b.name for b in bones]  # parents precede children
    frames = len(track) - 1
    scene = bpy.context.scene
    scene.render.fps = frames
    scene.frame_start, scene.frame_end = 0, frames
    rig.animation_data_create()
    clip = name
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for f, p in enumerate(track):
        # Re-solve the inside leg's flex for this body, so its ski tip stays on the snow.
        lo, hi = -0.3, 0.6
        for _ in range(20):
            mid = (lo + hi) / 2
            D = world_pose(bones, order, local_rotations(p, rest, mid), ski_pivot, p, rest)
            if (D['foot.L'] @ Vector(inside_tip)).z > 0:
                hi = mid
            else:
                lo = mid
        flex = (lo + hi) / 2
        reach = p['poleTouch'] * solve_reach(bones, order, p, rest, flex, ski_pivot) if p['poleTouch'] > 0 else 0.0
        D = posed(bones, order, p, rest, flex, reach, ski_pivot, clip)
        for bone in order:
            b = bones[bone]
            ml = b.matrix_local
            parent = D[b.parent.name] if b.parent else Matrix()
            pb = rig.pose.bones[bone]
            pb.matrix_basis = ml.inverted() @ parent.inverted() @ D[bone] @ ml
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('rotation_quaternion', frame=f)
    return action


# ---------------------------------------------------------------- output meshes
# Node names avoid ":" and ".", which three's GLTFLoader strips.

def make_object(name, verts, tris, mats, materials, rig, weights, uv=None, extras=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], tris.tolist())
    me.polygons.foreach_set('material_index', mats.astype(np.int32))
    me.shade_smooth()
    for m in materials:
        me.materials.append(m)
    if uv is not None:
        layer = me.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', uv.reshape(-1).astype(np.float32))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = rig
    groups = {b.name: ob.vertex_groups.new(name=b.name) for b in rig.data.bones}
    for i, ws in enumerate(weights):
        for b, w in ws:
            groups[b].add([i], w, 'ADD')
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = rig
    for k, v in (extras or {}).items():
        ob[k] = v
    return ob


def to_gltf(p):
    """Blender (Z up, front -Y) to glTF (Y up, front +Z)."""
    return [float(p[0]), float(p[2]), float(-p[1])]


def unit(v):
    return v / np.linalg.norm(v)


def hand_frame(j, s):
    """Rest-pose hand axes: f along the fingers, n out of the palm, k along the knuckle row toward the index."""
    k = unit(j['row'])
    f = j['pip'] - j['knuckle']
    f = unit(f - (f @ k) * k)
    n = unit(np.cross(f, k)) * (1 if s == 'L' else -1)
    return f, n, k


def grip_axis(j, s):
    """The pole's axis through the fist, toward its top: the knuckle row canted out toward the fingers by GRIP_CANT."""
    f, _, k = hand_frame(j, s)
    return math.cos(GRIP_CANT) * k + math.sin(GRIP_CANT) * f


def grip_point(j, s):
    """The grip's axis inside the curled fingers and against the palm, eased toward the wrist for the cant."""
    f, n, _ = hand_frame(j, s)
    # Half the cant's offset at the index knuckle: more digs the pinky in, less the index.
    pivot = 0.5 * math.tan(GRIP_CANT) * np.linalg.norm(j['row']) / 2
    return j['knuckle'] + GRIP_R * n - (GRIP_R * math.tan(CURL_KNUCKLE / 2) + pivot) * f


def rotation(axis, angle):
    return np.array(Matrix.Rotation(angle, 3, Vector(axis.tolist())))


def off_axis(x, c, k):
    """Distance of each point from the grip's axis through c along k."""
    q = x - c
    return np.linalg.norm(q - (q @ k)[..., None] * k, axis=-1)


def curls(j, s):
    """Knuckle and middle-joint curls about the grip's axis; the second is solved so the fingertips wrap the grip."""
    f, n, _ = hand_frame(j, s)
    k = grip_axis(j, s)
    # Curling about the canted axis, not the knuckle row, keeps every finger the same distance off the grip.
    w = k * np.sign(np.cross(f, n) @ k)
    c = grip_point(j, s)
    pip = j['knuckle'] + rotation(w, CURL_KNUCKLE) @ (j['pip'] - j['knuckle'])
    tip = unit(j['fingertip'] - j['pip'])
    middle = next(t for t in np.arange(0, math.pi, 0.005)
                  if off_axis(pip + 0.02 * rotation(w, CURL_KNUCKLE + t) @ tip, c, k) <= TIP_R)
    return Matrix.Rotation(CURL_KNUCKLE, 4, Vector(w.tolist())), Matrix.Rotation(float(middle), 4, Vector(w.tolist()))


def rotvecs(rv):
    """Rotation matrices (N, 3, 3) from rotation vectors (N, 3)."""
    t = np.maximum(np.linalg.norm(rv, axis=1), 1e-9)[:, None, None]
    x, y, z = (rv / t[:, :, 0]).T
    K = np.zeros((len(rv), 3, 3))
    K[:, 0, 1], K[:, 0, 2], K[:, 1, 2] = -z, y, -x
    K[:, 1, 0], K[:, 2, 0], K[:, 2, 1] = z, -y, x
    return np.eye(3) + np.sin(t) * K + (1 - np.cos(t)) * (K @ K)


def thumb_pose(j, s, parts):
    """Thumb rotations at its base and knuckle that lay it over the far side of the grip, outside the fingers."""
    f, n, _ = hand_frame(j, s)
    k = grip_axis(j, s)
    c = grip_point(j, s)
    c1, c2 = (np.array(m.to_3x3()) for m in curls(j, s))
    kn, pip = j['knuckle'], j['pip']
    every = lambda v, m: v[:: max(1, len(v) // m)]
    fingers = np.concatenate([kn + (every(parts[f'fingers.{s}'], 200) - kn) @ c1.T,
                              kn + ((pip - kn) + (every(parts[f'fingertips.{s}'], 300) - pip) @ c2.T) @ c1.T])
    meta, phal = every(parts[f'thumb.{s}'], 60), every(parts[f'thumbtip.{s}'], 80)
    cmc, mcp, tip = j['cmc'], j['mcp1'], j['thumbtip']

    def place(r1, r2, x, under):
        # under: 0 for the metacarpal, 1 for the phalanges.
        local = (x - mcp) @ np.swapaxes(r2, 1, 2) + (mcp - cmc) if under else x - cmc
        return cmc + local @ np.swapaxes(r1, 1, 2)

    def cost(rv1, rv2, collide):
        r1, r2 = rotvecs(rv1), rotvecs(rv2)
        m, p = place(r1, r2, meta[None], 0), place(r1, r2, phal[None], 1)
        t = place(r1, r2, tip[None, None], 1)[:, 0]
        r = off_axis(np.concatenate([m, p], axis=1), c, k)
        e = 1e4 * (np.maximum(0, GRIP_R - 0.006 - r) ** 2).sum(axis=1)
        e += 1e4 * np.maximum(0, GRIP_R - (t - c) @ n) ** 2
        e += 1e3 * (off_axis(p, c, k).mean(axis=1) - GRIP_R - 0.006) ** 2
        e += 0.002 * ((rv1 ** 2).sum(axis=1) + (rv2 ** 2).sum(axis=1))
        if collide:
            near = np.linalg.norm(p[:, :, None] - fingers[None, None], axis=-1).min(axis=(1, 2))
            e += 1e4 * np.maximum(0, 0.008 - near) ** 2
        return e

    rng = np.random.default_rng(0)

    def sample(count, scale, centre):
        v = rng.normal(size=(count, 6)) * scale + centre
        return v[:, :3], v[:, 3:]

    a, b = sample(40000, 0.8, np.zeros(6))
    e = np.concatenate([cost(a[i:i + 4000], b[i:i + 4000], False) for i in range(0, len(a), 4000)])
    keep = np.argsort(e)[:200]
    a, b = a[keep], b[keep]
    e = cost(a, b, True)
    best = np.concatenate([a[e.argmin()], b[e.argmin()]])
    for scale in (0.15, 0.06, 0.02):
        a, b = sample(400, scale, best)
        a, b = np.concatenate([a, best[None, :3]]), np.concatenate([b, best[None, 3:]])
        e = cost(a, b, True)
        best = np.concatenate([a[e.argmin()], b[e.argmin()]])
    log(f'thumb.{s}: cost {e.min():.4f}, base {np.degrees(np.linalg.norm(best[:3])):.0f} deg, '
        f'knuckle {np.degrees(np.linalg.norm(best[3:])):.0f} deg')
    to4 = lambda rv: Matrix(rotvecs(rv[None])[0].tolist()).to_4x4()
    return to4(best[:3]), to4(best[3:])


def palm_in(bones, track, J, rest):
    """Per side, the twist about the forearm that turns the palm to face in, thumb up, as on a pole grip."""
    order = [b.name for b in bones]
    still = (Matrix(), Matrix())
    flat = dict(rest, hands={s: dict(twist=Matrix(), curl=still, thumb=still) for s in ('R', 'L')})
    D = world_pose(bones, order, local_rotations(track[0], flat), (0, 0, 0), dict(track[0], lean=0), flat)
    out = {}
    for s, medial in (('R', 1.0), ('L', -1.0)):
        j = J[s]
        _, n, _ = hand_frame(j, s)
        axis = Vector(unit(j['wrist'] - j['elbow']).tolist())
        arm = D[f'forearm.{s}'].to_3x3()
        best = max(range(144), key=lambda k: (arm @ Matrix.Rotation(k * math.pi / 72, 3, axis) @ Vector(n.tolist())).x * medial)
        out[s] = Matrix.Rotation(best * math.pi / 72, 4, axis)
    return out


def rx3(a):
    """three.js rotationX(a) as a 4x4 glTF-space matrix."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1.0]])


def tr3(v):
    m = np.eye(4)
    m[:3, 3] = v
    return m


def binding_in_foot(f, b):
    """bindingInFoot in src/viewer/equipment.ts for the boot fit `f` (bootFitFrom's, ankle at the origin, glTF)."""
    sole, heel, toe = f['sole'], f['heel'], f['toe']
    shell = tr3([0, sole, toe]) @ rx3(-b['bootBoardRamp']) @ tr3([0, -sole, -toe])
    return shell @ tr3([0, sole, (heel + toe) / 2]) @ rx3(-b['deltaAngle']) @ tr3([0, -b['stackHeight'], 0])


def boot_fit(J, cloud):
    """Per side, the pole grip and the foot and lower-leg extents the viewer fits its boot around, in glTF coordinates."""
    fit = {}
    for s in ('R', 'L'):
        j = J[s]
        a = j['ankle']
        leg = cloud[np.abs(cloud[:, 0] - a[0]) < 0.08]
        foot = leg[(leg[:, 2] < a[2] + 0.01) & (leg[:, 1] > j['toe'][1] - 0.01) & (leg[:, 1] < j['heel'][1] + 0.01)]
        shin = leg[(leg[:, 2] > a[2] + 0.02) & (leg[:, 2] < a[2] + 0.22) & (np.abs(leg[:, 1] - a[1]) < 0.12)]
        fit[s] = dict(
            ankle=to_gltf(a), knee=to_gltf(j['knee']), grip=to_gltf(grip_point(j, s)),
            shoulder=to_gltf(j['shoulder']), elbow=to_gltf(j['elbow']),
            sole=float(j['sole'] - BOOT_SOLE), toe=float(-foot[:, 1].min()), heel=float(-foot[:, 1].max()),
            footX=[float(foot[:, 0].min()), float(foot[:, 0].max())],
            shinX=[float(shin[:, 0].min()), float(shin[:, 0].max())],
            shinZ=[float(-shin[:, 1].max()), float(-shin[:, 1].min())],
        )
    return fit


def main():
    args = parse_args()
    t0 = time.time()
    mapping = json.load(open(args.map))
    muscle_of = {name: mid for mid, names in mapping.items() for name in names}
    dg = bpy.context.evaluated_depsgraph_get()

    muscles, bone_meshes = [], []
    skull_top = 0.0
    for coll, kind in (('4: Muscular system', 'muscle'), ('1: Skeletal system', 'bone')):
        for o in bpy.data.collections[coll].objects:
            if o.type != 'MESH' or o.name[-2:] in ('.j', '.i', '.g'):
                continue
            ch = chain(o)
            name = base_name(o.name)
            if kind == 'muscle':
                extra = name in EXTRA_TENDONS
                # A mapped muscle is kept even if a skip word matches (tensor fasciae latae).
                skipped = name not in muscle_of and (name.startswith(MUSCLE_SKIP) or any(k in name.lower() for k in SOFT_SKIP))
                if not extra and (not (MUSCLE_BRANCHES & set(ch)) or skipped):
                    continue
            elif not (BONE_BRANCHES & set(ch)) or name.startswith(BONE_SKIP):
                continue
            me = world_arrays(o, dg)
            if kind == 'muscle' and name in EXTRA_TENDONS:
                for poly in me.polygons:
                    poly.material_index = 1
            area = np.zeros(len(me.polygons))
            me.polygons.foreach_get('area', area)
            entry = dict(name=o.name, chain=ch, mesh=me, tris=tri_count(me), area=float(area.sum()),
                         mapped=kind == 'muscle' and base_name(o.name) in muscle_of)
            (muscles if kind == 'muscle' else bone_meshes).append(entry)
    log(f'selected {len(muscles)} muscles ({sum(m["tris"] for m in muscles)} tris), '
        f'{len(bone_meshes)} bones ({sum(b["tris"] for b in bone_meshes)} tris) in {time.time() - t0:.1f}s')

    # Full-resolution landmarks before anything is decimated.
    src = {}
    for b in bone_meshes:
        v = np.array([x.co[:] for x in b['mesh'].vertices])
        b['centroid_x'] = float(v[:, 0].mean())
        src[b['name']] = v
        part = bone_part(b['name'], b['chain'])
        side = side_of(b['name'], b['centroid_x'])
        if part in ('foot', 'talus', 'hand', 'fingers', 'fingertips', 'thumb', 'thumbtip') and side:
            src[f'{"foot" if part in ("foot", "talus") else "hand"}:{side}:{b["name"]}'] = v
        if part == 'head':
            skull_top = max(skull_top, float(v[:, 2].max()))
    src['skull_top'] = skull_top
    J = landmarks(src)

    # Free the source scene so decimation doesn't re-evaluate 7000 objects.
    keep = {id(x['mesh']) for x in muscles + bone_meshes}
    bpy.data.batch_remove(list(bpy.data.objects))
    del keep
    log(f'landmarks ready, scene cleared at {time.time() - t0:.1f}s')

    def shrink(items, budget):
        # Even triangle density over the surface; muscles that light up get twice the density.
        share = [x['area'] * (2 if x['mapped'] else 1) for x in items]
        total = sum(share)
        for x, a in zip(items, share):
            r = min(1.0, max(budget * a / total, 60) / max(x['tris'], 1))
            x['verts'], x['tris_idx'], x['mats'] = decimate(x['mesh'], r)
            x['centroid'] = x['verts'].mean(axis=0)
            del x['mesh']
        return sum(len(x['tris_idx']) for x in items)

    bone_tris = shrink(bone_meshes, args.bone_tris)
    muscle_tris = shrink(muscles, args.muscle_tris)
    log(f'decimated: bones {bone_tris} tris, muscles {muscle_tris} tris at {time.time() - t0:.1f}s')

    rig = build_armature(J)

    # Bone surfaces per armature bone for muscle skinning.
    pts = {}
    for b in bone_meshes:
        part = bone_part(b['name'], b['chain'])
        side = side_of(b['name'], float(b['centroid'][0])) or 'R'
        b['bone'] = None if part is None else sided(part, side)
        b['side'] = side
        if b['bone']:
            pts.setdefault(b['bone'], []).append(b['verts'])
    trees = {}
    for name, arrs in pts.items():
        v = np.concatenate(arrs)
        tree = kdtree.KDTree(len(v))
        for i, p in enumerate(v):
            tree.insert(p, i)
        tree.balance()
        trees[name] = tree

    mats = {n: bpy.data.materials.new(n) for n in ('muscle', 'tendon', 'bone', 'cartilage', 'gear')}

    # Bones: one rigid mesh; the patella splits the knee.
    vs, ts, ms, ws, offset = [], [], [], [], 0
    for b in bone_meshes:
        vs.append(b['verts'])
        ts.append(b['tris_idx'] + offset)
        ms.append(b['mats'])
        if b['bone']:
            ws += [[(b['bone'], 1.0)]] * len(b['verts'])
        else:
            ws += [[(f'thigh.{b["side"]}', 0.5), (f'shin.{b["side"]}', 0.5)]] * len(b['verts'])
        offset += len(b['verts'])
    cloud = np.concatenate([x['verts'] for x in bone_meshes + muscles])
    fit = boot_fit(J, cloud)
    with open(args.pose) as fh:
        posed_track = json.load(fh)
    ARMS.update(posed_track['arms'])
    POLE.update(posed_track['pole'])
    # The drill scenarios the clips were solved for, so tests can tie the model to the content.
    make_object('bones', np.concatenate(vs), np.concatenate(ts), np.concatenate(ms),
                [mats['bone'], mats['cartilage']], rig, ws,
                extras={'gear_fit': json.dumps(fit), 'scenarios': json.dumps(posed_track['scenarios'])})

    # Muscles grouped by (muscle id, side); unmapped ones share one resting mesh.
    groups = {}
    for m in muscles:
        side = side_of(m['name'], float(m['centroid'][0]))
        mid = muscle_of.get(base_name(m['name']))
        key = f'muscle_{mid}_{TURN_SIDE[side]}' if mid and side else 'muscle_rest'
        region = region_of(m['chain'])
        bones = CANDIDATES[region](side or ('R' if m['centroid'][0] < 0 else 'L') if region != 'trunk' else side)
        m['weights'] = soft_weights(m['verts'], bones, trees)
        nearest = min((trees[b].find(m['centroid']) for b in bones), key=lambda r: r[2])
        deep = np.array(nearest[0]) - m['centroid']
        m['uv'] = fibre_uv(m['verts'], m['tris_idx'], deep / max(np.linalg.norm(deep), 1e-6))
        groups.setdefault(key, []).append(m)
    log(f'weights and fibres at {time.time() - t0:.1f}s')

    # Every mapped mesh must exist on both sides; a missing one is reported, never stood in for.
    found = {(base_name(m['name']), side_of(m['name'], float(m['centroid'][0]))) for m in muscles}
    missing = sorted(f'{n} ({s})' for names in mapping.values() for n in names for s in ('R', 'L') if (n, s) not in found)
    if missing:
        raise SystemExit(f'muscle-map.json names meshes not in the blend: {", ".join(missing)}')

    report = dict(groups={})
    for key, items in sorted(groups.items()):
        vs, ts, ms, ws, uvs, offset = [], [], [], [], [], 0
        for m in items:
            vs.append(m['verts'])
            ts.append(m['tris_idx'] + offset)
            ms.append(m['mats'])
            ws += m['weights']
            uvs.append(m['uv'])
            offset += len(m['verts'])
        verts = np.concatenate(vs)
        extras = {}
        if key != 'muscle_rest':
            # Pin anchor: a vertex near the centroid on the surface facing away from the bone.
            tris = np.concatenate(ts)
            fn = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
            vn = np.zeros_like(verts)
            for k in range(3):
                np.add.at(vn, tris[:, k], fn)
            vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
            c = verts.mean(axis=0)
            hit = min((trees[b].find(c) for b in trees), key=lambda r: r[2])
            out = c - np.array(hit[0])
            out /= max(np.linalg.norm(out), 1e-6)
            near = np.argsort(np.linalg.norm(verts - c, axis=1))[: max(8, len(verts) // 4)]
            score = vn[near] @ out + 10 * np.array([min(trees[b].find(verts[i])[2] for b in trees) for i in near])
            extras['anchor'] = to_gltf(verts[near[int(np.argmax(score))]])
        make_object(key, verts, np.concatenate(ts), np.concatenate(ms), [mats['muscle'], mats['tendon']],
                    rig, ws, np.concatenate(uvs), extras)
        report['groups'][key] = dict(meshes=[m['name'] for m in items], tris=int(sum(len(t) for t in ts)))

    binding, tracks = posed_track['binding'], posed_track['tracks']
    # The palm-in twist is found on the first posed turn, as the bake always has; else the still stance.
    track = next((v for k, v in tracks.items() if k != 'neutral'), tracks['neutral'])
    # Skis: 1.6 m x 9 cm slabs centred 3 cm ahead of the foot, under each binding as in figure.ts and equipment.ts.
    ski_pivot = None
    thick = binding['skiThickness']
    for s in ('R', 'L'):
        j = J[s]
        a = fit[s]['ankle']
        shell = dict(sole=fit[s]['sole'] - a[1], heel=fit[s]['heel'] - a[2] - binding['heelRoom'],
                     toe=fit[s]['toe'] - a[2] + binding['toeRoom'])
        mount = binding_in_foot(shell, binding)
        zc = j['ankle'][1] - (j['toe'][1] + j['heel'][1]) / 2 + 0.03 - (shell['heel'] + shell['toe']) / 2

        def rest_point(k):
            """A point in the binding frame (glTF), at the rest pose in Blender space."""
            g = mount @ np.array([k[0], k[1], k[2], 1.0])
            return np.array([a[0] + g[0], -(a[2] + g[2]), a[1] + g[1]])

        # Same corner order as an axis-aligned box: x, then front to back, then bottom to top.
        verts = np.array([rest_point((x, y, zc + z)) for x in (-0.045, 0.045) for z in (0.8, -0.8) for y in (-thick, 0.0)])
        quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        tris = np.array([t for a, b, c, d in quads for t in ((a, b, c), (a, c, d))])
        make_object(f'gear_ski_{s}', verts, tris, np.zeros(len(tris), np.int32), [mats['gear']], rig,
                    [[(f'foot.{s}', 1.0)]] * len(verts))
        if s == 'R':
            ski_pivot = tuple(float(x) for x in rest_point((0, -thick, zc)))
        else:
            inside_tip = tuple(float(x) for x in rest_point((0, -thick, zc + 0.8)))

    rest = dict(abduction={}, ramp=binding['bootBoardRamp'] + binding['deltaAngle'],
                femur={s: (Vector(J[s]['hip']) - Vector(J[s]['knee'])).normalized() for s in ('R', 'L')})
    for s in ('R', 'L'):
        d = J[s]['elbow'] - J[s]['shoulder']
        rest['abduction'][s] = math.atan2(d[0], -d[2])
    twist = palm_in(rig.data.bones, track, J, rest)
    parts = {k: np.concatenate(v) for k, v in pts.items()}
    rest['hands'] = {s: dict(twist=twist[s], curl=curls(J[s], s), thumb=thumb_pose(J[s], s, parts),
                             row=Vector(unit(grip_axis(J[s], s)).tolist()),
                             axis=Vector(unit(J[s]['wrist'] - J[s]['elbow']).tolist()),
                             along=Vector(unit(J[s]['knuckle'] - J[s]['wrist']).tolist())) for s in ('R', 'L')}
    rest['grip'] = {s: Vector(grip_point(J[s], s).tolist()) for s in ('R', 'L')}
    rest['ankle'] = {s: Vector(J[s]['ankle'].tolist()) for s in ('R', 'L')}
    # One clip per posed drill and intensity, named as motionClipName in src/viewer/anatomy-names.ts; the neutral stance stays active.
    # Fist to tip as regularPoleReach and standingArm in src/viewer: standing in boots, upper arm hanging, forearm level.
    l = J['L']
    snow = l['sole'] - BOOT_SOLE
    reach = l['shoulder'][2] - snow - float(np.linalg.norm(l['elbow'] - l['shoulder']))
    for name in sorted(tracks, key=lambda n: n == 'neutral'):
        POLE['basket'] = reach - POLE['trim'].get(name, 0.0) - POLE['basketUp']
        action = bake(rig, ski_pivot, inside_tip, tracks[name], rest, name)
        strip = rig.animation_data.nla_tracks.new()
        strip.name = name
        strip.strips.new(name, 0, action)
        w = WRIST[name]
        log(f'baked {name}: {len(tracks[name])} keyframes, wrist up to {w["bend"]:.0f} deg off the forearm '
            f'(the plain swing onto the pole: {w["swing"]:.0f} deg) at {time.time() - t0:.1f}s')

    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for ob in rig.children:
        ob.select_set(True)
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=args.save_blend, compress=True)
    bpy.ops.export_scene.gltf(
        filepath=args.out, export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
        export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_morph=False, export_cameras=False, export_lights=False,
    )
    report.update(bone_tris=int(bone_tris), muscle_tris=int(muscle_tris), seconds=round(time.time() - t0, 1), wrist=WRIST,
                  joints={k: to_gltf(v) for k, v in J.items() if not isinstance(v, dict)})
    if args.report:
        json.dump(report, open(args.report, 'w'), indent=1)
    log(f'wrote {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB) in {time.time() - t0:.1f}s')


main()
