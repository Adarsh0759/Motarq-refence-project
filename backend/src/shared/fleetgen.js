// Shared deterministic fleet layout used by seed + simulator so VINs/OEMs always agree.
import { makeVin } from './vin.js';
export const OEMS = ['A', 'B', 'C', 'D', 'E'];
export const oemForIndex = (i) => OEMS[i % OEMS.length];
export const vinForIndex = (i) => makeVin(i + 1);
