(() => {
  const probeKey = "__tascPhysicalSafariProbe";
  const prior = window[probeKey];
  if (prior && typeof prior.destroy === "function") {
    prior.destroy();
  }

  const version = "1.0.0";
  const maxSamples = 12000;
  const videoEventNames = ["loadstart", "loadedmetadata", "loadeddata", "canplay", "play", "playing", "pause", "waiting", "stalled", "suspend", "ended", "error"];
  const sectionSelectors = [
    ["hero", "#main-content"],
    ["clients", ".figma-clients-section"],
    ["services", "#services"],
    ["how-we-work", "#work"],
    ["datum", "#datum"],
    ["process", "#process"],
    ["domino", "#brief"],
    ["footer", ".site-footer"],
  ];
  const clock = () => performance.now();
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };
  const percentile = (values, percentileValue) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
    return sorted[index];
  };
  const ratio = (count, total) => (total > 0 ? round(count / total, 6) : null);
  const safe = (fn, fallback = null) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const boundedPush = (items, item) => {
    if (items.length < maxSamples) items.push(item);
  };
  const timestampName = () => new Date().toISOString().replace(/[:.]/g, "-");
  const sanitizeName = (value) => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
  const supportedEntryTypes = safe(() => [...(PerformanceObserver.supportedEntryTypes || [])], []);
  const longTaskSupported = supportedEntryTypes.includes("longtask");
  const longAnimationFrameSupported = supportedEntryTypes.includes("long-animation-frame");
  const rvfcSupported = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  const state = {
    running: false,
    startedAt: 0,
    startedIso: "",
    rafId: 0,
    lastRaf: 0,
    statusTimer: 0,
    eventLoopTimer: 0,
    lastEventLoopTick: 0,
    observer: null,
    longAnimationObserver: null,
    frameDeltas: [],
    eventLoopLags: [],
    longTasks: [],
    longAnimationFrames: [],
    scrollSamples: [],
    inputEvents: [],
    mediaEvents: [],
    runtimeErrors: [],
    sectionVisits: [],
    lastSection: "",
    videos: new Map(),
    videoIds: new WeakMap(),
    nextVideoId: 1,
    listeners: [],
    lastScrollSampleAt: 0,
    lastTouchY: null,
    lastTouchAt: 0,
    resizeSamples: [],
  };

  const root = document.createElement("aside");
  root.id = "tasc-physical-safari-probe";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "TASC physical Safari probe");
  root.innerHTML = `
    <style>
      #tasc-physical-safari-probe{position:fixed;z-index:2147483647;right:10px;bottom:10px;width:min(340px,calc(100vw - 20px));max-height:min(620px,calc(100dvh - 20px));overflow:auto;color:#f5f7fb;background:rgba(7,10,16,.94);border:1px solid rgba(255,255,255,.28);border-radius:14px;padding:12px;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5);-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
      #tasc-physical-safari-probe *{box-sizing:border-box}
      #tasc-physical-safari-probe h2{margin:0 0 8px;font-size:15px;font-weight:600}
      #tasc-physical-safari-probe label{display:block;margin:7px 0;color:#dbe5f4}
      #tasc-physical-safari-probe input[type=text],#tasc-physical-safari-probe select{width:100%;margin-top:3px;padding:7px 8px;color:#fff;background:#111927;border:1px solid #34435a;border-radius:8px;font:inherit}
      #tasc-physical-safari-probe .tasc-probe-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:9px 0}
      #tasc-physical-safari-probe button{padding:8px;border:1px solid #5c7394;border-radius:9px;color:#fff;background:#172337;font:inherit;cursor:pointer}
      #tasc-physical-safari-probe button:disabled{opacity:.45;cursor:default}
      #tasc-physical-safari-probe .tasc-probe-checks{display:grid;gap:4px;margin:8px 0}
      #tasc-physical-safari-probe .tasc-probe-checks label{display:flex;gap:7px;align-items:flex-start;margin:0}
      #tasc-physical-safari-probe .tasc-probe-status{padding:7px 8px;border-radius:8px;background:#0d1522;color:#9dc3ff;white-space:pre-wrap}
      #tasc-physical-safari-probe .tasc-probe-note{margin:7px 0 0;color:#aebbd0}
      #tasc-physical-safari-probe .tasc-probe-close{position:absolute;right:8px;top:7px;width:28px;height:28px;padding:0;border-radius:50%}
    </style>
    <button class="tasc-probe-close" type="button" aria-label="Close probe">×</button>
    <h2>TASC Safari evidence</h2>
    <label>Run label
      <input class="tasc-probe-label" type="text" value="t5-candidate">
    </label>
    <label>Device
      <select class="tasc-probe-device">
        <option value="mac-safari">Mac Safari</option>
        <option value="iphone-safari">iPhone Safari</option>
        <option value="iphone-chrome">iPhone Chrome</option>
      </select>
    </label>
    <label>Web Inspector Timeline filename
      <input class="tasc-probe-timeline" type="text" placeholder="timeline-recording">
    </label>
    <label>HAR filename
      <input class="tasc-probe-har" type="text" placeholder="network.har">
    </label>
    <label>Screen recording filename
      <input class="tasc-probe-screen" type="text" placeholder="screen-recording.mov">
    </label>
    <div class="tasc-probe-checks">
      <label><input type="checkbox" data-check="visualParity">Header, Clients flare and cards match baseline</label>
      <label><input type="checkbox" data-check="scrollSmooth">Scroll is visibly smooth in both directions</label>
      <label><input type="checkbox" data-check="services">Services reaches all three forward and reverse stops</label>
      <label><input type="checkbox" data-check="datum">Datum loops autonomously without locking scroll</label>
      <label><input type="checkbox" data-check="domino">Domino completes forward, reverse and replay</label>
    </div>
    <div class="tasc-probe-actions">
      <button class="tasc-probe-start" type="button">Start capture</button>
      <button class="tasc-probe-stop" type="button" disabled>Stop + download</button>
    </div>
    <div class="tasc-probe-status">Ready</div>
    <p class="tasc-probe-note">Start before cold load journey. Traverse the full site down, reverse to the top, then replay Services and Domino.</p>
  `;
  document.documentElement.append(root);

  const labelInput = root.querySelector(".tasc-probe-label");
  const deviceSelect = root.querySelector(".tasc-probe-device");
  const timelineInput = root.querySelector(".tasc-probe-timeline");
  const harInput = root.querySelector(".tasc-probe-har");
  const screenInput = root.querySelector(".tasc-probe-screen");
  const startButton = root.querySelector(".tasc-probe-start");
  const stopButton = root.querySelector(".tasc-probe-stop");
  const closeButton = root.querySelector(".tasc-probe-close");
  const status = root.querySelector(".tasc-probe-status");

  const on = (target, eventName, listener, options) => {
    target.addEventListener(eventName, listener, options);
    state.listeners.push(() => target.removeEventListener(eventName, listener, options));
  };

  const videoKey = (video) => {
    if (!state.videoIds.has(video)) state.videoIds.set(video, state.nextVideoId++);
    const id = state.videoIds.get(video);
    const direction = video.dataset.dominoDirection ? `-${video.dataset.dominoDirection}` : "";
    const className = typeof video.className === "string" ? video.className.trim().split(/\s+/).slice(0, 2).join("-") : "video";
    return `${id}-${className || "video"}${direction}`;
  };

  const qualitySnapshot = (video) => {
    const quality = safe(() => video.getVideoPlaybackQuality(), null);
    return {
      totalVideoFrames: quality?.totalVideoFrames ?? safe(() => video.webkitDecodedFrameCount, null),
      droppedVideoFrames: quality?.droppedVideoFrames ?? safe(() => video.webkitDroppedFrameCount, null),
      corruptedVideoFrames: quality?.corruptedVideoFrames ?? null,
    };
  };

  const ensureVideo = (video) => {
    const key = videoKey(video);
    if (state.videos.has(key)) return state.videos.get(key);
    const entry = {
      key,
      className: typeof video.className === "string" ? video.className : "",
      direction: video.dataset.dominoDirection || null,
      sourceAtStart: video.currentSrc || video.getAttribute("src") || null,
      firstCurrentTime: round(video.currentTime || 0, 4),
      lastCurrentTime: round(video.currentTime || 0, 4),
      firstQuality: qualitySnapshot(video),
      lastQuality: null,
      rvfcCallbacks: 0,
      firstPresentedFrames: null,
      lastPresentedFrames: null,
      missedPresentedFrames: 0,
      firstMediaTime: null,
      lastMediaTime: null,
      maxProcessingDurationMs: 0,
      maxCallbackLatenessMs: 0,
      currentTimeSamples: [],
      stallWindows: [],
      waitingStartedAt: null,
      callbackId: null,
      lastProgressAt: clock(),
      lastProgressTime: video.currentTime || 0,
    };
    state.videos.set(key, entry);
    if (rvfcSupported && typeof video.requestVideoFrameCallback === "function") {
      const collectFrame = (now, metadata) => {
        if (!state.running) return;
        entry.rvfcCallbacks += 1;
        if (entry.firstPresentedFrames == null) entry.firstPresentedFrames = metadata.presentedFrames ?? null;
        if (entry.firstMediaTime == null) entry.firstMediaTime = metadata.mediaTime ?? null;
        if (entry.lastPresentedFrames != null && metadata.presentedFrames > entry.lastPresentedFrames + 1) {
          entry.missedPresentedFrames += metadata.presentedFrames - entry.lastPresentedFrames - 1;
        }
        entry.lastPresentedFrames = metadata.presentedFrames ?? entry.lastPresentedFrames;
        entry.lastMediaTime = metadata.mediaTime ?? entry.lastMediaTime;
        entry.maxProcessingDurationMs = Math.max(entry.maxProcessingDurationMs, (metadata.processingDuration || 0) * 1000);
        entry.maxCallbackLatenessMs = Math.max(entry.maxCallbackLatenessMs, now - (metadata.expectedDisplayTime || now));
        entry.callbackId = video.requestVideoFrameCallback(collectFrame);
      };
      entry.callbackId = video.requestVideoFrameCallback(collectFrame);
    }
    return entry;
  };

  const sampleVideos = () => {
    const now = clock();
    document.querySelectorAll("video").forEach((video) => {
      const entry = ensureVideo(video);
      const currentTime = video.currentTime || 0;
      const progressing = Math.abs(currentTime - entry.lastProgressTime) > 0.002;
      if (progressing) {
        entry.lastProgressAt = now;
        entry.lastProgressTime = currentTime;
      } else if (!video.paused && !video.ended && video.readyState >= 2 && now - entry.lastProgressAt >= 750) {
        const lastStall = entry.stallWindows[entry.stallWindows.length - 1];
        if (!lastStall || lastStall.resolvedAt != null) {
          entry.stallWindows.push({ startedAt: round(now - state.startedAt), resolvedAt: null, durationMs: null });
        }
      }
      const openStall = entry.stallWindows[entry.stallWindows.length - 1];
      if (progressing && openStall && openStall.resolvedAt == null) {
        openStall.resolvedAt = round(now - state.startedAt);
        openStall.durationMs = round(openStall.resolvedAt - openStall.startedAt);
      }
      boundedPush(entry.currentTimeSamples, {
        t: round(now - state.startedAt),
        currentTime: round(currentTime, 4),
        paused: video.paused,
        ended: video.ended,
        readyState: video.readyState,
        networkState: video.networkState,
        bufferedEnd: safe(() => (video.buffered.length ? round(video.buffered.end(video.buffered.length - 1), 4) : null), null),
      });
      entry.lastCurrentTime = round(currentTime, 4);
      entry.lastQuality = qualitySnapshot(video);
    });
  };

  const activeSection = () => {
    const element = document.elementFromPoint(Math.max(1, innerWidth / 2), Math.max(1, innerHeight / 2));
    if (!element) return "unknown";
    for (const [name, selector] of sectionSelectors) {
      const section = element.closest(selector);
      if (section) return name;
    }
    for (const [name, selector] of sectionSelectors) {
      const section = document.querySelector(selector);
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.top <= innerHeight / 2 && rect.bottom >= innerHeight / 2) return name;
    }
    return "unknown";
  };

  const sampleScroll = () => {
    if (!state.running) return;
    const now = clock();
    if (now - state.lastScrollSampleAt < 80) return;
    state.lastScrollSampleAt = now;
    const section = activeSection();
    boundedPush(state.scrollSamples, {
      t: round(now - state.startedAt),
      y: round(scrollY),
      section,
    });
    if (section !== state.lastSection) {
      state.lastSection = section;
      state.sectionVisits.push({ t: round(now - state.startedAt), section, y: round(scrollY) });
    }
  };

  const rafLoop = (now) => {
    if (!state.running) return;
    if (state.lastRaf > 0) boundedPush(state.frameDeltas, now - state.lastRaf);
    state.lastRaf = now;
    state.rafId = requestAnimationFrame(rafLoop);
  };

  const captureError = (event) => {
    boundedPush(state.runtimeErrors, {
      t: round(clock() - state.startedAt),
      type: event.type,
      message: event.message || event.reason?.message || String(event.reason || "unknown error"),
      source: event.filename || null,
      line: event.lineno || null,
      column: event.colno || null,
    });
  };

  const captureVideoEvent = (event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    const entry = ensureVideo(video);
    const now = clock();
    if (event.type === "waiting" || event.type === "stalled") entry.waitingStartedAt = now;
    if (event.type === "playing" && entry.waitingStartedAt != null) {
      entry.stallWindows.push({
        startedAt: round(entry.waitingStartedAt - state.startedAt),
        resolvedAt: round(now - state.startedAt),
        durationMs: round(now - entry.waitingStartedAt),
        source: "media-event",
      });
      entry.waitingStartedAt = null;
    }
    boundedPush(state.mediaEvents, {
      t: round(now - state.startedAt),
      video: entry.key,
      event: event.type,
      currentTime: round(video.currentTime || 0, 4),
      paused: video.paused,
      readyState: video.readyState,
      networkState: video.networkState,
      errorCode: video.error?.code ?? null,
      errorMessage: video.error?.message ?? null,
    });
  };

  const collectManual = () => Object.fromEntries([...root.querySelectorAll("[data-check]")].map((input) => [input.dataset.check, input.checked]));
  const styleSnapshot = () => {
    const selectors = [".site-header-glass", ".figma-client-card", ".clients-scroll-element", ".process-contact-section", ".site-footer"];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const style = getComputedStyle(element);
      return [selector, {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        transform: style.transform,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
        filter: style.filter,
        contentVisibility: style.contentVisibility || "visible",
        containIntrinsicSize: style.containIntrinsicSize || "none",
      }];
    }));
  };

  const summarize = () => {
    const deltas = state.frameDeltas.filter((value) => Number.isFinite(value) && value > 0);
    const medianCadence = percentile(deltas, 50);
    const adaptiveThreshold = medianCadence == null ? null : Math.max(16.7, medianCadence * 1.5);
    const adaptiveSlowCount = adaptiveThreshold == null ? 0 : deltas.filter((value) => value > adaptiveThreshold).length;
    const longTaskSum = state.longTasks.reduce((sum, entry) => sum + entry.duration, 0);
    const videos = [...state.videos.values()].map((entry) => ({
      ...entry,
      maxProcessingDurationMs: round(entry.maxProcessingDurationMs),
      maxCallbackLatenessMs: round(entry.maxCallbackLatenessMs),
      callbackId: undefined,
    }));
    const report = {
      schemaVersion: 1,
      probeVersion: version,
      run: {
        label: labelInput.value.trim() || "run",
        device: deviceSelect.value,
        startedAt: state.startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: round(clock() - state.startedAt),
        url: location.href,
      },
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform || null,
        language: navigator.language,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        visibilityState: document.visibilityState,
        webkitFlag: document.documentElement.getAttribute("data-tasc-webkit"),
        mobilePerformance: document.querySelector(".site-shell")?.getAttribute("data-mobile-performance") || null,
        macPerformance: document.querySelector(".site-shell")?.getAttribute("data-mac-performance") || null,
      },
      capabilities: {
        performanceEntryTypes: supportedEntryTypes,
        longtask: longTaskSupported,
        longAnimationFrame: longAnimationFrameSupported,
        requestVideoFrameCallback: rvfcSupported,
        videoPlaybackQuality: "getVideoPlaybackQuality" in HTMLVideoElement.prototype,
      },
      evidenceFiles: {
        timeline: timelineInput.value.trim() || null,
        har: harInput.value.trim() || null,
        screenRecording: screenInput.value.trim() || null,
      },
      manual: collectManual(),
      metrics: {
        raf: {
          samples: deltas.length,
          medianMs: medianCadence == null ? null : round(medianCadence),
          p95Ms: deltas.length ? round(percentile(deltas, 95)) : null,
          p99Ms: deltas.length ? round(percentile(deltas, 99)) : null,
          maxMs: deltas.length ? round(Math.max(...deltas)) : null,
          over16_7Count: deltas.filter((value) => value > 16.7).length,
          over16_7Ratio: ratio(deltas.filter((value) => value > 16.7).length, deltas.length),
          over33_4Ratio: ratio(deltas.filter((value) => value > 33.4).length, deltas.length),
          over50Ratio: ratio(deltas.filter((value) => value > 50).length, deltas.length),
          adaptiveThresholdMs: adaptiveThreshold == null ? null : round(adaptiveThreshold),
          adaptiveSlowRatio: ratio(adaptiveSlowCount, deltas.length),
        },
        eventLoop: {
          samples: state.eventLoopLags.length,
          p95LagMs: state.eventLoopLags.length ? round(percentile(state.eventLoopLags, 95)) : null,
          maxLagMs: state.eventLoopLags.length ? round(Math.max(...state.eventLoopLags)) : null,
        },
        longTasks: longTaskSupported ? {
          status: "supported",
          count: state.longTasks.length,
          durationSumMs: round(longTaskSum),
          entries: state.longTasks,
        } : { status: "unsupported", count: null, durationSumMs: null, entries: [] },
        longAnimationFrames: longAnimationFrameSupported ? {
          status: "supported",
          count: state.longAnimationFrames.length,
          blockingDurationSumMs: round(state.longAnimationFrames.reduce((sum, entry) => sum + entry.blockingDuration, 0)),
          entries: state.longAnimationFrames,
        } : { status: "unsupported", count: null, blockingDurationSumMs: null, entries: [] },
        videos,
      },
      journey: {
        sectionVisits: state.sectionVisits,
        scrollSamples: state.scrollSamples,
        inputEvents: state.inputEvents,
        mediaEvents: state.mediaEvents,
        resizeSamples: state.resizeSamples,
      },
      runtimeErrors: state.runtimeErrors,
      computedStyles: styleSnapshot(),
    };
    return report;
  };

  const updateStatus = () => {
    if (!state.running) return;
    const elapsed = (clock() - state.startedAt) / 1000;
    const active = activeSection();
    status.textContent = `Recording ${elapsed.toFixed(1)}s\nSection: ${active}\nrAF: ${state.frameDeltas.length} · videos: ${state.videos.size}\nerrors: ${state.runtimeErrors.length}`;
  };

  const resetState = () => {
    state.frameDeltas.length = 0;
    state.eventLoopLags.length = 0;
    state.longTasks.length = 0;
    state.longAnimationFrames.length = 0;
    state.scrollSamples.length = 0;
    state.inputEvents.length = 0;
    state.mediaEvents.length = 0;
    state.runtimeErrors.length = 0;
    state.sectionVisits.length = 0;
    state.resizeSamples.length = 0;
    state.videos.clear();
    state.videoIds = new WeakMap();
    state.nextVideoId = 1;
    state.lastSection = "";
    state.lastScrollSampleAt = 0;
    state.lastTouchY = null;
    state.lastTouchAt = 0;
  };

  const stop = (download = true) => {
    if (!state.running) return null;
    state.running = false;
    cancelAnimationFrame(state.rafId);
    clearInterval(state.statusTimer);
    clearInterval(state.eventLoopTimer);
    state.observer?.disconnect();
    state.longAnimationObserver?.disconnect();
    state.listeners.splice(0).forEach((remove) => remove());
    sampleVideos();
    for (const entry of state.videos.values()) {
      const video = [...document.querySelectorAll("video")].find((candidate) => videoKey(candidate) === entry.key);
      if (video && entry.callbackId != null && typeof video.cancelVideoFrameCallback === "function") {
        safe(() => video.cancelVideoFrameCallback(entry.callbackId));
      }
      const openStall = entry.stallWindows[entry.stallWindows.length - 1];
      if (openStall && openStall.resolvedAt == null) {
        openStall.resolvedAt = round(clock() - state.startedAt);
        openStall.durationMs = round(openStall.resolvedAt - openStall.startedAt);
      }
    }
    const report = summarize();
    window.__tascSafariEvidence = report;
    startButton.disabled = false;
    stopButton.disabled = true;
    status.textContent = `Captured ${(report.run.durationMs / 1000).toFixed(1)}s\nrAF p95: ${report.metrics.raf.p95Ms ?? "n/a"}ms\nLong Tasks: ${report.metrics.longTasks.status}\nSaved to window.__tascSafariEvidence`;
    if (download) {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `tasc-safari-${sanitizeName(report.run.device)}-${sanitizeName(report.run.label)}-${timestampName()}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    }
    return report;
  };

  const start = () => {
    if (state.running) return;
    resetState();
    state.running = true;
    state.startedAt = clock();
    state.startedIso = new Date().toISOString();
    state.lastRaf = 0;
    state.lastEventLoopTick = state.startedAt;
    startButton.disabled = true;
    stopButton.disabled = false;
    on(window, "error", captureError, true);
    on(window, "unhandledrejection", captureError, true);
    on(window, "scroll", sampleScroll, { passive: true });
    on(window, "resize", () => boundedPush(state.resizeSamples, { t: round(clock() - state.startedAt), width: innerWidth, height: innerHeight, y: round(scrollY) }), { passive: true });
    on(window, "wheel", (event) => boundedPush(state.inputEvents, { t: round(clock() - state.startedAt), type: "wheel", deltaX: round(event.deltaX), deltaY: round(event.deltaY), deltaMode: event.deltaMode, y: round(scrollY) }), { passive: true, capture: true });
    on(window, "touchstart", (event) => {
      const touch = event.touches[0];
      state.lastTouchY = touch?.clientY ?? null;
      state.lastTouchAt = clock();
      boundedPush(state.inputEvents, { t: round(state.lastTouchAt - state.startedAt), type: "touchstart", clientY: state.lastTouchY, y: round(scrollY) });
    }, { passive: true, capture: true });
    on(window, "touchend", (event) => {
      const touch = event.changedTouches[0];
      const now = clock();
      boundedPush(state.inputEvents, {
        t: round(now - state.startedAt),
        type: "touchend",
        clientY: touch?.clientY ?? null,
        deltaY: state.lastTouchY == null || touch == null ? null : round(touch.clientY - state.lastTouchY),
        durationMs: state.lastTouchAt ? round(now - state.lastTouchAt) : null,
        y: round(scrollY),
      });
      state.lastTouchY = null;
      state.lastTouchAt = 0;
    }, { passive: true, capture: true });
    videoEventNames.forEach((eventName) => on(document, eventName, captureVideoEvent, true));
    if (longTaskSupported) {
      state.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => boundedPush(state.longTasks, { start: round(entry.startTime), duration: round(entry.duration), name: entry.name }));
      });
      safe(() => state.observer.observe({ type: "longtask", buffered: true }));
    }
    if (longAnimationFrameSupported) {
      state.longAnimationObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => boundedPush(state.longAnimationFrames, {
          start: round(entry.startTime),
          duration: round(entry.duration),
          blockingDuration: round(entry.blockingDuration || 0),
        }));
      });
      safe(() => state.longAnimationObserver.observe({ type: "long-animation-frame", buffered: true }));
    }
    state.eventLoopTimer = setInterval(() => {
      const now = clock();
      const lag = now - state.lastEventLoopTick - 50;
      state.lastEventLoopTick = now;
      boundedPush(state.eventLoopLags, Math.max(0, lag));
      sampleVideos();
    }, 50);
    state.statusTimer = setInterval(updateStatus, 500);
    state.rafId = requestAnimationFrame(rafLoop);
    sampleScroll();
    sampleVideos();
    updateStatus();
  };

  const destroy = () => {
    if (state.running) stop(false);
    root.remove();
    delete window[probeKey];
  };

  startButton.addEventListener("click", start);
  stopButton.addEventListener("click", () => stop(true));
  closeButton.addEventListener("click", destroy);
  window[probeKey] = { version, start, stop, destroy, state, summarize };
})();
