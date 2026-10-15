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
    'Interspinales', 'Intertransversarii', 'Multifidus', 'Dorsal parts of lateral', 'Ventral parts of lateral',
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
    if {'Thoracic vertebrae.g', 'Thoracic skeleton.g', 'Bones of pectoral girdle.g'} & set(ch):
        return 'chest'
    if n == 'Femur':
        return 'thigh'
    if n == 'Patella':
        return None
    if n in ('Tibia', 'Fibula'):
        return 'shin'
    if 'Bones of foot.g' in ch:
        return 'foot'
    if n == 'Humerus':
        return 'upper_arm'
    if n in ('Radius', 'Ulna'):
        return 'forearm'
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
        ankle = src[f'Talus.{s.lower()}'].mean(axis=0)
        foot = np.concatenate([v for k, v in src.items() if k.startswith('foot:' + s)])
        humerus = src[f'Humerus.{s.lower()}']
        shoulder = humerus[humerus[:, 2] > humerus[:, 2].max() - 0.03].mean(axis=0)
        shoulder[2] = humerus[:, 2].max() - 0.022
        elbow = humerus[humerus[:, 2] < humerus[:, 2].min() + 0.02].mean(axis=0)
        radius = src[f'Radius.{s.lower()}']
        wrist = radius[radius[:, 2] < radius[:, 2].min() + 0.015].mean(axis=0)
        hand = np.concatenate([v for k, v in src.items() if k.startswith('hand:' + s)])
        J[s] = dict(hip=hip, knee=knee, ankle=ankle, shoulder=shoulder, elbow=elbow, wrist=wrist,
                    fingertip=hand[hand[:, 2].argmin()],
                    toe=foot[foot[:, 1].argmin()], heel=foot[foot[:, 1].argmax()], sole=foot[:, 2].min())
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
        add(f'upper_arm.{s}', j['shoulder'], j['elbow'], 'chest')
        add(f'forearm.{s}', j['elbow'], j['wrist'], f'upper_arm.{s}')
        add(f'hand.{s}', j['wrist'], j['fingertip'], f'forearm.{s}')
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


# ---------------------------------------------------------------- skinning

CANDIDATES = {
    'lower': lambda s: ['lumbar', 'pelvis', f'thigh.{s}', f'shin.{s}', f'foot.{s}'],
    'upper': lambda s: ['chest', f'upper_arm.{s}', f'forearm.{s}', f'hand.{s}'],
    'trunk': lambda s: ['pelvis', 'lumbar', 'chest', 'neck'] + ([f'upper_arm.{s}'] if s else []),
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


HEAD_LIFT = 0.6  # matches HEAD_LIFT in src/viewer/pose.ts
REACH_SHOULDER, REACH_ELBOW = 0.15, 0.4  # match src/viewer/pose.ts
# Boot sole below the lowest foot bone: heel pad, liner and shell sole.
BOOT_SOLE = 0.03


def local_rotations(p, rest_abduction, inside_extra=0.0):
    """Mirrors localRotation in src/viewer/pose.ts; the trunk's rotation is split over lumbar and chest."""
    half = rot_z3(p['lean'] / 2) @ rot_y3(p['trunkTurn'] / 2) @ rot_x(p['trunkFlex'] / 2)
    lift = rot_x(-HEAD_LIFT * p['trunkFlex'] / 2)
    R = {'pelvis': Matrix(), 'lumbar': half, 'chest': half, 'neck': lift, 'head': lift}
    for s, sign in (('R', -1), ('L', 1)):
        leg = p['outside'] if s == 'R' else p['inside']
        extra = inside_extra if s == 'L' else 0.0
        hip, ankle = leg['hipFlex'] + extra, leg['ankleFlex'] + 0.6 * extra
        R[f'thigh.{s}'] = rot_z3(-p['hipAngulation']) @ rot_x(-hip)
        R[f'shin.{s}'] = rot_z3(-p['kneeAngulation']) @ rot_x(hip + ankle)
        # Undo the shin's net pitch so the sole stays level, then pitch the tail up.
        R[f'foot.{s}'] = rot_x(-ankle + leg['tailLift'])
        # The inside arm reaches to plant its pole.
        reach = p.get('poleTouch', 0.0) if s == 'L' else 0.0
        R[f'upper_arm.{s}'] = rot_z3(sign * 0.35) @ rot_x(-0.9 - REACH_SHOULDER * reach) @ rot_z3(-rest_abduction[s])
        R[f'forearm.{s}'] = rot_x(-1.1 + REACH_ELBOW * reach)
        R[f'hand.{s}'] = Matrix()
    return R


def world_pose(bones, order, R, ski_pivot, lean):
    D = {}
    for name in order:
        b = bones[name]
        j = Vector(b.head_local)
        parent = D[b.parent.name] if b.parent else Matrix()
        D[name] = parent @ Matrix.Translation(j) @ R[name] @ Matrix.Translation(-j)
    c = D['foot.R'] @ Vector(ski_pivot)
    tilt = Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(lean, 4, 'Y') @ Matrix.Translation(-c)
    return {k: tilt @ m for k, m in D.items()}


def bake(rig, ski_pivot, inside_tip, track, rest_abduction):
    bones = rig.data.bones
    order = [b.name for b in bones]  # parents precede children
    frames = len(track) - 1
    scene = bpy.context.scene
    scene.render.fps = frames
    scene.frame_start, scene.frame_end = 0, frames
    rig.animation_data_create()
    action = bpy.data.actions.new('stork-turn')
    rig.animation_data.action = action
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for f, p in enumerate(track):
        # Re-solve the inside leg's flex for this body, so its ski tip stays on the snow.
        lo, hi = -0.3, 0.6
        for _ in range(20):
            mid = (lo + hi) / 2
            D = world_pose(bones, order, local_rotations(p, rest_abduction, mid), ski_pivot, p['lean'])
            if (D['foot.L'] @ Vector(inside_tip)).z > 0:
                hi = mid
            else:
                lo = mid
        D = world_pose(bones, order, local_rotations(p, rest_abduction, (lo + hi) / 2), ski_pivot, p['lean'])
        for name in order:
            b = bones[name]
            ml = b.matrix_local
            parent = D[b.parent.name] if b.parent else Matrix()
            pb = rig.pose.bones[name]
            pb.matrix_basis = ml.inverted() @ parent.inverted() @ D[name] @ ml
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


def boot_fit(J, cloud):
    """Per side, the foot and lower-leg extents the viewer fits its boot around, in glTF coordinates."""
    fit = {}
    for s in ('R', 'L'):
        j = J[s]
        a = j['ankle']
        leg = cloud[np.abs(cloud[:, 0] - a[0]) < 0.08]
        foot = leg[(leg[:, 2] < a[2] + 0.01) & (leg[:, 1] > j['toe'][1] - 0.01) & (leg[:, 1] < j['heel'][1] + 0.01)]
        shin = leg[(leg[:, 2] > a[2] + 0.02) & (leg[:, 2] < a[2] + 0.22) & (np.abs(leg[:, 1] - a[1]) < 0.12)]
        fit[s] = dict(
            ankle=to_gltf(a), knee=to_gltf(j['knee']), wrist=to_gltf(j['wrist']), fingertip=to_gltf(j['fingertip']),
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
                if not extra and (not (MUSCLE_BRANCHES & set(ch)) or name.startswith(MUSCLE_SKIP)
                                  or any(k in name.lower() for k in SOFT_SKIP)):
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
        if part in ('foot', 'hand') and side:
            src[f'{part}:{side}:{b["name"]}'] = v
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
    make_object('bones', np.concatenate(vs), np.concatenate(ts), np.concatenate(ms),
                [mats['bone'], mats['cartilage']], rig, ws, extras={'gear_fit': json.dumps(fit)})

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

    # Skis: 1.6 m x 9 cm x 2 cm under each boot sole, as in figure.ts.
    ski_pivot = None
    for s in ('R', 'L'):
        j = J[s]
        mid_y = (j['toe'][1] + j['heel'][1]) / 2 - 0.03
        top = j['sole'] - BOOT_SOLE
        x0, x1, y0, y1, z0, z1 = j['ankle'][0] - 0.045, j['ankle'][0] + 0.045, mid_y - 0.8, mid_y + 0.8, top - 0.02, top
        verts = np.array([[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
        quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        tris = np.array([t for a, b, c, d in quads for t in ((a, b, c), (a, c, d))])
        make_object(f'gear_ski_{s}', verts, tris, np.zeros(len(tris), np.int32), [mats['gear']], rig,
                    [[(f'foot.{s}', 1.0)]] * len(verts))
        if s == 'R':
            ski_pivot = (float(j['ankle'][0]), float(mid_y), float(z0))
        else:
            inside_tip = (float(j['ankle'][0]), float(y0), float(z0))

    rest_abduction = {}
    for s in ('R', 'L'):
        d = J[s]['elbow'] - J[s]['shoulder']
        rest_abduction[s] = math.atan2(d[0], -d[2])
    with open(args.pose) as fh:
        track = json.load(fh)
    bake(rig, ski_pivot, inside_tip, track, rest_abduction)
    log(f'baked {len(track)} keyframes at {time.time() - t0:.1f}s')

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
    report.update(bone_tris=int(bone_tris), muscle_tris=int(muscle_tris), seconds=round(time.time() - t0, 1),
                  joints={k: to_gltf(v) for k, v in J.items() if not isinstance(v, dict)})
    if args.report:
        json.dump(report, open(args.report, 'w'), indent=1)
    log(f'wrote {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB) in {time.time() - t0:.1f}s')


main()
