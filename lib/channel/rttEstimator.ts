const ALPHA = 0.125;
const BETA = 0.25;
const INITIAL_RTO = 1000;
const MIN_RTO = 1000;
const MAX_RTO = 60000;
const CLOCK_GRANULARITY = 100;

export class RttEstimator {
  private srtt = 0;
  private rttvar = 0;
  private rto = INITIAL_RTO;

  updateRtt(sample: number): void {
    if (this.srtt === 0) {
      this.srtt = sample;
      this.rttvar = sample / 2;
    } else {
      this.rttvar = (1 - BETA) * this.rttvar + BETA * Math.abs(this.srtt - sample);
      this.srtt = (1 - ALPHA) * this.srtt + ALPHA * sample;
    }
    this.rto = Math.min(MAX_RTO, Math.max(MIN_RTO, this.srtt + Math.max(CLOCK_GRANULARITY, 4 * this.rttvar)));
  }

  getRto(): number {
    return this.rto;
  }
}
