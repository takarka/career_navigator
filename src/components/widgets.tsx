import type { ComponentType } from 'preact';
import { EventLoopSim } from './EventLoopSim.tsx';
import { PredictGame } from './PredictGame.tsx';
import { Sandbox } from './Sandbox.tsx';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const widgets: Record<string, ComponentType<any>> = {
  'event-loop-sim': EventLoopSim,
  'predict-output': PredictGame,
  sandbox: Sandbox,
};
