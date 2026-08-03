// Shift the process clock forward, in-process, to expose "time bomb" tests --
// tests that pass today only because a hardcoded fixture date still happens to
// fall inside a rolling window measured from now.
//
// Loaded via NODE_OPTIONS="--import ...", so it applies to the Vitest runner AND
// to every worker it forks (NODE_OPTIONS is inherited by child node processes).
// This is deliberately NOT faketime/libfaketime: on macOS the DYLD injection does
// not reach Vitest's forked workers, so the suite would silently run at the real
// time and report a meaningless pass. Patching Date inside the process is
// portable and verifiable on every platform.
//
// Usage:
//   TIME_TRAVEL_DAYS=400 NODE_OPTIONS="--import ./scripts/time-travel.mjs" pnpm test

const days = Number(process.env.TIME_TRAVEL_DAYS ?? "0");

if (Number.isFinite(days) && days !== 0) {
  const offsetMs = days * 24 * 60 * 60 * 1000;
  const RealDate = Date;

  class ShiftedDate extends RealDate {
    constructor(...args) {
      // `new Date()` with no args means "now" and must be shifted; every other
      // form is an explicit instant and must be left exactly as given.
      if (args.length === 0) {
        super(RealDate.now() + offsetMs);
        return;
      }
      super(...args);
    }

    static now() {
      return RealDate.now() + offsetMs;
    }
  }

  globalThis.Date = ShiftedDate;

  // Every package runner and every forked Vitest worker loads this file too.
  // Announce once: child processes inherit this marker at spawn and stay quiet.
  if (!process.env.TIME_TRAVEL_ANNOUNCED) {
    process.env.TIME_TRAVEL_ANNOUNCED = "1";
    console.error(
      `[time-travel] clock shifted +${days}d -> ${new ShiftedDate().toISOString()}`
    );
  }
}
