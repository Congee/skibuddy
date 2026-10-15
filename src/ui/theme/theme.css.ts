import { assignVars, createGlobalTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';

export const vars = createThemeContract({
  color: {
    ground: null,
    frame: null,
    plate: null,
    plateInk: null,
    plateInk2: null,
    slat: null,
    slatOpen: null,
    well: null,
    ink: null,
    ink2: null,
    ink3: null,
    rule: null,
    field: null,
    snow: null,
    snowLine: null,
    tagRim: null,
    focus: null,
    selection: null,
    pinBg: null,
    pinInk: null,
    leader: null,
    l1: null,
    l1Ink: null,
    l2: null,
    l2Ink: null,
    l3: null,
    l3Ink: null,
  },
  font: { body: null },
  shadow: { tag: null, pop: null },
});

const level = {
  l1: '#F2B33D',
  l1Ink: '#1B140A',
  l2: '#E0602A',
  l2Ink: '#1A0C05',
  l3: '#9E1F63',
  l3Ink: '#FFFFFF',
};

const font = { body: '"Archivo Variable", "Archivo", system-ui, sans-serif' };

const light = {
  color: {
    ground: '#F3F5F1',
    frame: '#1E3A32',
    plate: '#1E3A32',
    plateInk: '#F3F5F1',
    plateInk2: '#CFDCD5',
    slat: '#FFFFFF',
    slatOpen: '#FFFFFF',
    well: '#EEF2EF',
    ink: '#12231E',
    ink2: '#33493F',
    ink3: '#4A5C54',
    rule: '#C2CDC7',
    field: '#1E3A32',
    snow: '#E4EBE7',
    snowLine: '#C3CFC9',
    tagRim: '#12231E',
    focus: '#9E1F63',
    selection: '#F2B33D',
    pinBg: '#FFFFFF',
    pinInk: '#12231E',
    leader: '#F3F5F1',
    ...level,
  },
  font,
  shadow: {
    tag: '0 1px 2px rgba(10, 25, 20, 0.28)',
    pop: '0 12px 32px -8px rgba(10, 25, 20, 0.35), 0 2px 6px rgba(10, 25, 20, 0.18)',
  },
};

const dark = {
  color: {
    ground: '#0D1915',
    frame: '#07110E',
    plate: '#12241F',
    plateInk: '#F3F5F1',
    plateInk2: '#C6D4CD',
    slat: '#1E3A32',
    slatOpen: '#234339',
    well: '#12241F',
    ink: '#F3F5F1',
    ink2: '#C6D4CD',
    ink3: '#A9BBB3',
    rule: '#3D5F53',
    field: '#142A23',
    snow: '#1B352D',
    snowLine: '#21403A',
    tagRim: 'rgba(243, 245, 241, 0.7)',
    focus: '#F2B33D',
    selection: '#9E1F63',
    pinBg: '#E4EBE7',
    pinInk: '#12231E',
    leader: '#F3F5F1',
    ...level,
  },
  font,
  shadow: {
    tag: '0 1px 2px rgba(0, 0, 0, 0.5)',
    pop: '0 12px 32px -8px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.5)',
  },
};

createGlobalTheme(':root', vars, light);

globalStyle(':root', {
  '@media': {
    '(prefers-color-scheme: dark)': { vars: assignVars(vars, dark) },
  },
});
