/* SpeedTest engine — Ping/Jitter, Download, Upload via Cloudflare speed edge. */
(function () {
  'use strict';

  const BASE = 'https://speed.cloudflare.com';
  const DOWN_URL = BASE + '/__down';
  const UP_URL = BASE + '/__up';

  const CFG = {
    pingCount: 10,
    pingMinCount: 3,        // always collect at least this many samples
    pingMaxTime: 6000,      // ms cap for the whole ping phase
    pingTimeout: 3000,      // ms per ping request
    testDuration: 10000,    // ms per download/upload phase (10s for full TCP saturation)
    warmup: 2000,           // ms excluded from final average (TCP ramp-up)
    downStreams: 4,
    upStreams: 3,
    sampleEvery: 200,       // ms between UI updates
    windowMs: 1000,         // sliding window for live speed
  };

  const COLO = {
    CGK: 'Jakarta', SUB: 'Surabaya', JOG: 'Yogyakarta', DPS: 'Denpasar', KNO: 'Medan', BTH: 'Batam',
    SIN: 'Singapore', KUL: 'Kuala Lumpur', BKK: 'Bangkok', HKG: 'Hong Kong', NRT: 'Tokyo', KIX: 'Osaka',
    ICN: 'Seoul', SYD: 'Sydney', MNL: 'Manila', SGN: 'Ho Chi Minh', HAN: 'Hanoi', BOM: 'Mumbai',
    DEL: 'New Delhi', LHR: 'London', FRA: 'Frankfurt', AMS: 'Amsterdam', CDG: 'Paris',
    LAX: 'Los Angeles', SJC: 'San Jose', SEA: 'Seattle', IAD: 'Ashburn', EWR: 'Newark', DFW: 'Dallas',
  };

  const ASN = {
    7713: 'Telkom Indonesia', 17974: 'Telkom Indonesia', 23693: 'Telkomsel', 23700: 'Link Net (First Media)',
    17451: 'Biznet', 4761: 'Indosat Ooredoo', 4795: 'Indosat (IM3)', 24203: 'XL Axiata', 63859: 'MyRepublic',
    45727: 'Hutchison 3 Indonesia', 18004: 'XL Axiata', 9341: 'CBN', 55699: 'CBN Fiber', 38758: 'Hypernet',
    131111: 'Iconnet (PLN)', 137366: 'Smartfren', 18103: 'Smartfren', 45287: 'Oxygen.id', 136052: 'Indihome',
  };

  const now = () => performance.now();
  const toMbps = (bytes, ms) => (ms > 0 ? (bytes * 8) / (ms * 1000) : 0);
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const rid = () => Math.random().toString(36).slice(2);

  function parseServerDuration(header) {
    // e.g. "cfSpeedEdge;dur=4, cfSpeedWorker;dur=33" — server-side processing time to subtract from RTT.
    if (!header) return 0;
    const edge = /cfSpeedEdge;dur=([\d.]+)/.exec(header);
    const worker = /cfSpeedWorker;dur=([\d.]+)/.exec(header);
    return Math.max(edge ? parseFloat(edge[1]) : 0, worker ? parseFloat(worker[1]) : 0);
  }

  class SpeedTest {
    constructor() {
      this.ctrl = null;
      this.xhrs = new Set();
      this.aborted = false;
    }

    abort() {
      this.aborted = true;
      if (this.ctrl) this.ctrl.abort();
      this.xhrs.forEach((x) => { try { x.abort(); } catch (_) { /* ignore */ } });
      this.xhrs.clear();
    }

    _check() {
      if (this.aborted) throw new DOMException('Aborted', 'AbortError');
    }

    /* ---------------- PING + JITTER + META ---------------- */
    async measurePing(onProgress) {
      this.ctrl = new AbortController();
      let signal = this.ctrl.signal;
      const samples = [];
      let meta = null;

      // +1 warm-up request (TLS handshake), discarded. Phase is time-capped for bad networks.
      const phaseEnd = now() + CFG.pingMaxTime;
      for (let i = 0; i <= CFG.pingCount; i++) {
        this._check();
        if (i > CFG.pingMinCount && now() > phaseEnd) break;
        const url = `${DOWN_URL}?bytes=0&r=${rid()}`;
        const t0 = now();
        const reqTimer = setTimeout(() => this.ctrl.abort(), CFG.pingTimeout);
        let res;
        try {
          res = await fetch(url, { cache: 'no-store', signal });
          await res.arrayBuffer();
        } catch (e) {
          if (this.aborted) throw e;
          // Single request timed out: renew controller and continue.
          this.ctrl = new AbortController();
          signal = this.ctrl.signal;
          if (samples.length === 0 && i >= CFG.pingMinCount) throw new Error('Ping timeout');
          continue;
        } finally {
          clearTimeout(reqTimer);
        }
        const t1 = now();

        if (!meta) {
          const h = res.headers;
          const asn = h.get('cf-meta-asn') || h.get('asn');
          const colo = h.get('cf-meta-colo') || h.get('colo') || '';
          meta = {
            ip: h.get('cf-meta-ip') || '',
            asn: asn || '',
            isp: asn ? (ASN[Number(asn)] || `AS${asn}`) : '',
            city: h.get('cf-meta-city') || h.get('city') || '',
            country: h.get('cf-meta-country') || h.get('country') || '',
            colo,
            serverCity: COLO[colo] || colo,
          };
        }

        // Prefer precise Resource Timing (Timing-Allow-Origin: * is sent).
        let rtt = t1 - t0;
        const entry = performance.getEntriesByName(url).pop();
        if (entry && entry.responseStart > 0 && entry.requestStart > 0) {
          rtt = entry.responseStart - entry.requestStart;
        }
        rtt -= parseServerDuration(res.headers.get('server-timing'));
        rtt = Math.max(1, rtt);

        if (i > 0) {
          samples.push(rtt);
          onProgress && onProgress({ ping: median(samples), last: rtt, meta });
        }
      }
      performance.clearResourceTimings();

      let jitter = 0;
      for (let i = 1; i < samples.length; i++) jitter += Math.abs(samples[i] - samples[i - 1]);
      jitter = samples.length > 1 ? jitter / (samples.length - 1) : 0;

      return { ping: median(samples), jitter, meta };
    }

    /* ---------------- shared sampler ---------------- */
    _sampler(getBytes, onProgress) {
      const start = now();
      const points = [{ t: start, b: 0 }];
      const samples = []; // live throughput samples recorded after warmup

      const timer = setInterval(() => {
        const t = now();
        const b = getBytes();
        points.push({ t, b });
        while (points.length > 2 && t - points[0].t > CFG.windowMs) points.shift();
        const p0 = points[0];
        const live = toMbps(b - p0.b, t - p0.t);

        // Discard initial warmup period, then record samples for percentile calculation
        if (t - start >= CFG.warmup && live > 0) {
          samples.push(live);
        }

        onProgress && onProgress({ mbps: live, progress: Math.min(1, (t - start) / CFG.testDuration) });
      }, CFG.sampleEvery);

      return {
        start,
        stop() {
          clearInterval(timer);
          const t = now();
          const totalBytes = getBytes();

          if (samples.length >= 5) {
            // Ookla-style 80th-percentile / trimmed mean:
            // Discard lowest 20% samples (temporary packet drops, TCP bufferbloat dips)
            const sorted = [...samples].sort((a, b) => a - b);
            const trimCount = Math.floor(sorted.length * 0.2);
            const upper = sorted.slice(trimCount);
            return upper.reduce((sum, v) => sum + v, 0) / upper.length;
          }

          // Fallback if samples are sparse
          return toMbps(totalBytes, t - start);
        },
      };
    }

    /* ---------------- DOWNLOAD ---------------- */
    async measureDownload(onProgress) {
      this._check();
      this.ctrl = new AbortController();
      const signal = this.ctrl.signal;
      let bytes = 0;
      const sampler = this._sampler(() => bytes, onProgress);
      const deadline = sampler.start + CFG.testDuration;

      // Progressive chunk sizes: start small to ramp up TCP instantly, then expand
      const CHUNK_TIERS = [500_000, 1_500_000, 5_000_000, 15_000_000, 25_000_000];

      const worker = async () => {
        let chunkIndex = 0;
        while (!this.aborted && now() < deadline) {
          const chunkSize = CHUNK_TIERS[Math.min(chunkIndex, CHUNK_TIERS.length - 1)];
          chunkIndex++;
          const res = await fetch(`${DOWN_URL}?bytes=${chunkSize}&r=${rid()}`, { cache: 'no-store', signal });
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (now() >= deadline) { reader.cancel().catch(() => {}); break; }
          }
        }
      };

      const timeout = setTimeout(() => this.ctrl.abort(), CFG.testDuration + 1500);
      let result = 0;
      try {
        await Promise.all(Array.from({ length: CFG.downStreams }, worker));
      } catch (e) {
        if (this.aborted) { sampler.stop(); throw e; }
        if (e.name !== 'AbortError' && bytes === 0) { sampler.stop(); throw e; } // real network failure
      } finally {
        clearTimeout(timeout);
      }
      result = sampler.stop();
      this._check();
      return result;
    }

    /* ---------------- UPLOAD ---------------- */
    _createPayload(size) {
      const buf = new Uint8Array(size);
      for (let i = 0; i < buf.length; i += 65536) {
        crypto.getRandomValues(buf.subarray(i, Math.min(i + 65536, buf.length)));
      }
      return new Blob([buf], { type: 'application/octet-stream' });
    }

    _payloads() {
      if (!this._blobs) {
        this._blobs = [
          this._createPayload(250_000),    // 250 KB
          this._createPayload(1_000_000),  // 1 MB
          this._createPayload(4_000_000),  // 4 MB
        ];
      }
      return this._blobs;
    }

    async measureUpload(onProgress) {
      this._check();
      const blobs = this._payloads();
      let bytes = 0;
      const sampler = this._sampler(() => bytes, onProgress);
      const deadline = sampler.start + CFG.testDuration;

      const sendOne = (blob) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let prev = 0;
        this.xhrs.add(xhr);
        xhr.upload.onprogress = (e) => {
          bytes += e.loaded - prev;
          prev = e.loaded;
          if (now() >= deadline) xhr.abort();
        };
        const done = () => { this.xhrs.delete(xhr); resolve(); };
        xhr.onload = done;
        xhr.onabort = done;
        xhr.onerror = () => { this.xhrs.delete(xhr); reject(new Error('Upload failed')); };
        xhr.open('POST', `${UP_URL}?r=${rid()}`, true);
        xhr.send(blob);
      });

      const worker = async () => {
        let step = 0;
        while (!this.aborted && now() < deadline) {
          const blob = blobs[Math.min(step, blobs.length - 1)];
          step++;
          await sendOne(blob);
        }
      };

      const timeout = setTimeout(() => {
        this.xhrs.forEach((x) => x.abort());
      }, CFG.testDuration + 1500);
      try {
        await Promise.all(Array.from({ length: CFG.upStreams }, worker));
      } catch (e) {
        if (bytes === 0) { sampler.stop(); throw e; }
      } finally {
        clearTimeout(timeout);
      }
      const result = sampler.stop();
      this._check();
      return result;
    }
  }

  window.SpeedTest = SpeedTest;
})();
