import fs from "node:fs";
import path from "node:path";

/** Samples RSS every 500 ms; records peak and CPU time. */
export class ResourceMonitor {
  peakRss = 0;
  private timer: ReturnType<typeof setInterval>;
  private cpu0 = process.cpuUsage();
  private t0 = performance.now();

  constructor() {
    this.sample();
    this.timer = setInterval(() => this.sample(), 500);
    this.timer.unref();
  }

  sample() {
    this.peakRss = Math.max(this.peakRss, process.memoryUsage().rss);
    return this.peakRss;
  }

  stop() {
    clearInterval(this.timer);
    this.sample();
    const cpu = process.cpuUsage(this.cpu0);
    return {
      peakRssMB: Math.round(this.peakRss / 1048576),
      cpuUserSec: Number((cpu.user / 1e6).toFixed(1)),
      cpuSystemSec: Number((cpu.system / 1e6).toFixed(1)),
      wallSec: Number(((performance.now() - this.t0) / 1000).toFixed(1)),
    };
  }
}

export function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return n;
}
