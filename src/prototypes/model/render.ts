import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { MuscleLevel } from '../../content/activation';
import type { CameraPose, Quat, V3 } from '../capture/data';
import { ViewMode, createStage } from '../capture/stage';
import type { Shown, Stage } from '../capture/stage';

/** Fixed views in the root frame: x across toward the inside, y the snow normal, z along the outside ski. */
export const View = { Behind: 'behind', Front: 'front', Side: 'side' } as const;
export type View = (typeof View)[keyof typeof View];
// Behind is azimuth π from the ski heading ("skis fixed"); side looks from the outside.
const AZIMUTH: Readonly<Record<View, number>> = { [View.Behind]: Math.PI, [View.Front]: 0, [View.Side]: -Math.PI / 2 };

const DIST = 4.2;
const ELEVATION = 0.14;
// Aim between the pelvis and the skis so both stay framed.
const AIM_DROP = 0.38;
// The trunk leans forward over the skis; aim ahead of the pelvis.
const AIM_AHEAD = 0.35;
const FOV = 34;

/** Camera relative to the outside ski's heading, so the skis hold still across frames. */
export const cameraFor = (pelvis: V3, skiYaw: number, view: View): CameraPose => {
  const az = skiYaw + AZIMUTH[view];
  const target = new Vector3(pelvis[0] + AIM_AHEAD * Math.sin(skiYaw), pelvis[1] - AIM_DROP, pelvis[2] + AIM_AHEAD * Math.cos(skiYaw));
  const eye = new Vector3(
    target.x + DIST * Math.cos(ELEVATION) * Math.sin(az),
    target.y + DIST * Math.sin(ELEVATION),
    target.z + DIST * Math.cos(ELEVATION) * Math.cos(az),
  );
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye, target, new Vector3(0, 1, 0)));
  return { pos: [eye.x, eye.y, eye.z], quat: [q.x, q.y, q.z, q.w] as Quat, fovY: FOV };
};

/** One hidden stage draws every frame in turn; each frame keeps a 2D copy, so nothing redraws on its own. */
interface Staged {
  readonly stage: Stage;
  readonly canvas: HTMLCanvasElement;
  readonly key: string;
}
let stage: Promise<Staged> | null = null;
let queue: Promise<unknown> = Promise.resolve();

// The slot table is fixed at build, so a new muscle set needs a new stage.
const stageFor = async (dark: boolean, levels: ReadonlyArray<MuscleLevel> | undefined): Promise<Staged> => {
  const muscles = [...new Set((levels ?? []).map((l) => l.muscle))].toSorted();
  const key = `${String(dark)} ${muscles.join(' ')}`;
  const current = await stage;
  if (current?.key === key) return current;
  current?.stage.dispose();
  current?.canvas.remove();
  const canvas = document.createElement('canvas');
  canvas.className = 'offstage';
  document.body.append(canvas);
  stage = createStage(canvas, dark, muscles).then((s) => {
    s.setView(ViewMode.Footage);
    return { stage: s, canvas, key };
  });
  return stage;
};

/** Poses the figure, lights `levels` when given, draws it once and copies the picture into `target`. */
export const snapshot = (target: HTMLCanvasElement, shown: Shown, camera: CameraPose, dark: boolean, levels?: ReadonlyArray<MuscleLevel>): Promise<void> => {
  const job = queue.then(async () => {
    const { stage: s, canvas } = await stageFor(dark, levels);
    s.show(shown, null, camera, null, levels);
    const w = canvas.width;
    const h = canvas.height;
    target.width = w;
    target.height = h;
    // Same task as the draw: the WebGPU canvas still holds the frame.
    target.getContext('2d')?.drawImage(canvas, 0, 0);
  });
  queue = job.catch(() => undefined);
  return job;
};
