// step-types.ts — re-export shared constants to keep single source of truth
export { STEP_TYPES } from 'brauzio-shared';
export type StepTypeConst =
  (typeof import('brauzio-shared'))['STEP_TYPES'][keyof (typeof import('brauzio-shared'))['STEP_TYPES']];
