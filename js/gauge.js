/* Precision Telemetry Progress Gauge (Raycast / Linear style) */
(function () {
  'use strict';

  // Scale checkpoints (Mbps) matching the visual markers
  const SCALE = [0, 10, 50, 100, 250, 500, 1000];

  function valueToFraction(v) {
    if (!(v > 0)) return 0;
    const last = SCALE.length - 1;
    if (v >= SCALE[last]) return 1;
    for (let i = 0; i < last; i++) {
      if (v < SCALE[i + 1]) {
        const local = (v - SCALE[i]) / (SCALE[i + 1] - SCALE[i]);
        return (i + local) / last;
      }
    }
    return 1;
  }

  class Gauge {
    constructor(fillEl) {
      this.fill = typeof fillEl === 'string' ? document.getElementById(fillEl) : fillEl;
      const wrap = this.fill ? this.fill.closest('.progress-bar-wrap') : null;
      this.scaleLabels = wrap ? Array.from(wrap.querySelectorAll('.progress-scale span')) : [];
      this.current = 0;
      this.target = 0;
      this.raf = 0;
      this._render();
    }

    setMode(mode) {
      if (!this.fill) return;
      if (mode === 'upload') {
        this.fill.style.background = 'var(--up)';
      } else {
        this.fill.style.background = 'var(--down)';
      }
    }

    set(valueMbps) {
      this.target = valueToFraction(valueMbps);
      if (!this.raf) {
        this.raf = requestAnimationFrame(() => this._tick());
      }
    }

    reset() {
      this.target = 0;
      if (!this.raf) {
        this.raf = requestAnimationFrame(() => this._tick());
      }
    }

    _tick() {
      const diff = this.target - this.current;
      if (Math.abs(diff) < 0.001) {
        this.current = this.target;
        this._render();
        this.raf = 0;
        return;
      }
      this.current += diff * 0.18;
      this._render();
      this.raf = requestAnimationFrame(() => this._tick());
    }

    _render() {
      if (!this.fill) return;
      this.fill.style.width = (this.current * 100).toFixed(1) + '%';
      if (this.scaleLabels.length) {
        const last = SCALE.length - 1;
        for (let i = 0; i < this.scaleLabels.length; i++) {
          const threshold = i / last;
          const reached = this.current > 0.002 && this.current >= threshold - 0.002;
          this.scaleLabels[i].classList.toggle('reached', reached);
        }
      }
    }

    destroy() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  window.Gauge = Gauge;
})();
