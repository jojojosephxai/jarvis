/**
 * A cancellable timeline.
 *
 * The boot cinematic is a chain of awaited pauses. Pressing Skip or Esc calls
 * `cut()`, which resolves every pending pause immediately so the chain runs to
 * its end state in one tick instead of being abandoned half-built.
 */
export function createSequence() {
  let isCut = false;
  /** @type {Set<{ settle: () => void }>} */
  const pending = new Set();

  function wait(ms) {
    if (isCut || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { settle: () => {} };
      const timer = window.setTimeout(() => {
        pending.delete(entry);
        resolve();
      }, ms);
      entry.settle = () => {
        window.clearTimeout(timer);
        pending.delete(entry);
        resolve();
      };
      pending.add(entry);
    });
  }

  return {
    wait,
    get isCut() {
      return isCut;
    },
    cut() {
      if (isCut) return;
      isCut = true;
      for (const entry of [...pending]) entry.settle();
    },
  };
}
