/* Popup controller: professional network telemetry UI, themes, auto-start (English only) */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    phase: $('phase'),
    speed: $('speed'),
    unit: $('unit'),
    timeElapsed: $('timeElapsed'),
    statusIndicator: $('statusIndicator'),
    connStatus: $('connStatus'),
    telemetryGrid: $('telemetryGrid'),
    telemetryCard: $('telemetryCard'),
    liveStage: $('liveStage'),
    completeStage: $('completeStage'),
    resultQuality: $('resultQuality'),
    resDown: $('resDown'),
    resUp: $('resUp'),
    resPing: $('resPing'),
    resJitter: $('resJitter'),
    btnAction: $('btnAction'),
    btnActionText: $('btnActionText'),
    actionIcon: $('actionIcon'),
    kbdHint: $('kbdHint'),
    vPing: $('vPing'),
    vJitter: $('vJitter'),
    vDown: $('vDown'),
    vUp: $('vUp'),
    mPing: $('mPing'),
    mDown: $('mDown'),
    mUp: $('mUp'),
    isp: $('ispName'),
    ip: $('ipAddr'),
    server: $('serverName'),
    loc: $('serverLoc'),
    err: $('errorMsg'),
    settings: $('settings'),
    chkAuto: $('chkAuto'),
  };

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>',
    cancel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M13.5 8A5.5 5.5 0 1 1 12 4.1L14 2m0 4h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const store = chrome.storage.local;
  const gauge = new window.Gauge('progressFill');
  let test = null;
  let running = false;
  let testStart = 0;
  let timerInterval = 0;
  let currentThemeSetting = 'dark';

  const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fmtMs = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

  function getQualityLabel(downMbps) {
    if (downMbps >= 100) return 'Excellent';
    if (downMbps >= 50) return 'Fast';
    if (downMbps >= 20) return 'Good';
    if (downMbps >= 5) return 'Fair';
    return 'Slow';
  }

  function setButtonState(state) {
    el.btnAction.className = 'action-btn ' + state;
    if (state === 'cancel') {
      el.actionIcon.innerHTML = ICONS.cancel;
      el.btnActionText.textContent = 'Abort Test';
      if (el.kbdHint) el.kbdHint.textContent = 'Esc';
    } else if (state === 'secondary') {
      el.actionIcon.innerHTML = ICONS.refresh;
      el.btnActionText.textContent = 'Run Again';
      if (el.kbdHint) el.kbdHint.textContent = 'Space';
    } else {
      el.actionIcon.innerHTML = ICONS.play;
      el.btnActionText.textContent = 'Run Speed Test';
      if (el.kbdHint) el.kbdHint.textContent = 'Space';
    }
  }

  function setActive(which) {
    [el.mPing, el.mDown, el.mUp].forEach((m) => m.classList.remove('active'));
    if (which) which.classList.add('active');
  }

  function resetValues() {
    el.vPing.textContent = '—';
    el.vJitter.textContent = 'jitter —';
    el.vDown.textContent = '—';
    el.vUp.textContent = '—';
    el.speed.textContent = '0.00';
    el.unit.textContent = 'Mbps';
    el.timeElapsed.textContent = '00:00';
    el.err.classList.add('hidden');
    el.telemetryGrid.classList.remove('hidden');
    el.liveStage.classList.remove('hidden');
    el.completeStage.classList.add('hidden');
    el.resultQuality.classList.add('hidden');
    el.telemetryCard.classList.remove('complete');
    [el.mPing, el.mDown, el.mUp].forEach((m) => m.classList.remove('done'));
  }

  function startTimer() {
    testStart = performance.now();
    timerInterval = setInterval(() => {
      const sec = Math.floor((performance.now() - testStart) / 1000);
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      el.timeElapsed.textContent = `${m}:${s}`;
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  function showMeta(meta) {
    if (!meta) return;
    el.isp.textContent = meta.isp || 'Detected Network';
    el.ip.textContent = (meta.ip || '—') + (meta.asn ? ` · AS${meta.asn}` : '');
    el.server.textContent = meta.serverCity ? `Cloudflare · ${meta.serverCity}` : 'Cloudflare Edge';
    el.loc.textContent = [meta.colo, meta.country].filter(Boolean).join(' · ') || 'Edge Server';
  }

  async function run() {
    if (running) return;
    running = true;
    test = new window.SpeedTest();
    resetValues();
    startTimer();
    setButtonState('cancel');
    el.statusIndicator.className = 'status-indicator testing';
    el.connStatus.textContent = 'Testing...';
    gauge.setMode('download');
    gauge.reset();

    try {
      // 1) Ping & Jitter
      setActive(el.mPing);
      el.phase.textContent = 'LATENCY';
      el.phase.className = 'state-pill active';
      el.unit.textContent = 'ms';
      const p = await test.measurePing(({ ping, meta }) => {
        el.speed.textContent = fmtMs(ping);
        el.vPing.textContent = fmtMs(ping);
        showMeta(meta);
      });
      el.vPing.textContent = fmtMs(p.ping);
      el.vJitter.textContent = `jitter ${fmtMs(p.jitter)} ms`;

      // 2) Download
      setActive(el.mDown);
      el.phase.textContent = 'DOWNLOAD';
      el.unit.textContent = 'Mbps';
      el.speed.textContent = '0.00';
      const down = await test.measureDownload(({ mbps }) => {
        el.speed.textContent = fmt(mbps);
        el.vDown.textContent = fmt(mbps);
        gauge.set(mbps);
      });
      el.vDown.textContent = fmt(down);
      gauge.reset();

      // 3) Upload
      setActive(el.mUp);
      el.phase.textContent = 'UPLOAD';
      el.unit.textContent = 'Mbps';
      el.speed.textContent = '0.00';
      gauge.setMode('upload');
      const up = await test.measureUpload(({ mbps }) => {
        el.speed.textContent = fmt(mbps);
        el.vUp.textContent = fmt(mbps);
        gauge.set(mbps);
      });
      el.vUp.textContent = fmt(up);
      gauge.reset();

      // 4) Complete
      setActive(null);
      stopTimer();
      el.phase.textContent = '✓ COMPLETE';
      el.phase.className = 'state-pill complete';
      el.statusIndicator.className = 'status-indicator done';
      el.connStatus.textContent = 'Finished';
      el.telemetryGrid.classList.add('hidden');
      el.liveStage.classList.add('hidden');
      el.completeStage.classList.remove('hidden');
      el.telemetryCard.classList.add('complete');
      el.resDown.textContent = fmt(down);
      el.resUp.textContent = fmt(up);
      el.resPing.textContent = fmtMs(p.ping);
      el.resJitter.textContent = fmtMs(p.jitter);
      el.resultQuality.textContent = getQualityLabel(down);
      el.resultQuality.classList.remove('hidden');
      finish(true);
    } catch (e) {
      stopTimer();
      if (e && e.name === 'AbortError') {
        finish(false);
      } else {
        el.err.textContent = 'Benchmark failed: check your network connection.';
        el.err.classList.remove('hidden');
        finish(false);
      }
    }
  }

  function finish(success) {
    running = false;
    test = null;
    setActive(null);
    if (success) {
      setButtonState('secondary');
    } else {
      gauge.reset();
      gauge.setMode('download');
      el.phase.textContent = 'IDLE';
      el.phase.className = 'state-pill';
      el.statusIndicator.className = 'status-indicator';
      el.connStatus.textContent = 'Ready';
      setButtonState('primary');
    }
  }

  function stop() {
    if (test) test.abort();
  }

  /* ---------------- Theme Management ---------------- */
  function applyTheme(theme) {
    currentThemeSetting = theme;
    store.set({ theme });

    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeVal === theme);
    });

    let resolved = theme;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = isDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentThemeSetting === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeVal);
    });
  });

  /* ---------------- Event Listeners ---------------- */
  el.btnAction.addEventListener('click', () => {
    if (running) {
      stop();
    } else {
      run();
    }
  });

  // Tactile keyboard shortcut handling
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, button')) {
      e.preventDefault();
      el.btnAction.click();
    } else if (e.code === 'Escape') {
      if (el.settings.classList.contains('open')) {
        el.settings.classList.remove('open');
      } else if (running) {
        stop();
      }
    }
  });

  $('btnSettings').addEventListener('click', () => {
    el.settings.classList.add('open');
    el.settings.setAttribute('aria-hidden', 'false');
  });

  $('btnCloseSettings').addEventListener('click', () => {
    el.settings.classList.remove('open');
    el.settings.setAttribute('aria-hidden', 'true');
  });

  el.chkAuto.addEventListener('change', () => store.set({ autoStart: el.chkAuto.checked }));

  window.addEventListener('pagehide', () => {
    stop();
    stopTimer();
    gauge.destroy();
  });

  /* ---------------- Init ---------------- */
  store.get(['autoStart', 'theme']).then(({ autoStart = false, theme = 'dark' }) => {
    applyTheme(theme);
    el.chkAuto.checked = autoStart;
    if (autoStart) run();
  });
})();
