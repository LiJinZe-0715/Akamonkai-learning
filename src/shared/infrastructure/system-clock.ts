import type { Clock } from "../kernel/clock";
export class SystemClock implements Clock { now() { return new Date().toISOString(); } }
