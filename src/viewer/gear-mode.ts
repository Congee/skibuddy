/** How the boots, gloves and poles draw; kept free of three so the UI can import it eagerly. */
export const GearMode = { Translucent: 'translucent', Solid: 'solid', Off: 'off' } as const;
export type GearMode = (typeof GearMode)[keyof typeof GearMode];

export const GEAR_MODES: ReadonlyArray<GearMode> = [GearMode.Translucent, GearMode.Solid, GearMode.Off];

export const isGearMode = (value: unknown): value is GearMode => (GEAR_MODES as ReadonlyArray<unknown>).includes(value);
