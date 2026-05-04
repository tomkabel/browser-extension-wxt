export class RttEstimator {
  private rttAvg = 200;
  private rttVar = 100;
  private readonly alpha = 0.125;
  private readonly beta = 0.25;

  updateRtt(sample: number): void {
    this.rttVar = (1 - this.beta) * this.rttVar + this.beta * Math.abs(sample - this.rttAvg);
    this.rttAvg = (1 - this.alpha) * this.rttAvg + this.alpha * sample;
  }

  getRto(): number {
    return Math.max(this.rttAvg + 4 * this.rttVar, 1000);
  }

  getRttAvg(): number {
    return this.rttAvg;
  }

  getRttVar(): number {
    return this.rttVar;
  }
}
