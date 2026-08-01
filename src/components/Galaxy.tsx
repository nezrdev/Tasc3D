"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { installRestorableWebglLifecycle, isLikelyMobileRuntime, isLikelyWebKitRuntime, releaseWebglContext } from "./webglLifecycle";
const DEFAULT_FOCAL: [
    number,
    number
] = [0.5, 0.5];
const DEFAULT_ROTATION: [
    number,
    number
] = [1, 0];
const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;
const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
  uniform float uRepulsionStrength;
  uniform float uMouseActiveFactor;
  uniform float uAutoCenterRepulsion;
  uniform bool uTransparent;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      col += star * twinkle * size * base;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uTransparent) {
    float intensity = max(max(col.r, col.g), col.b);
    float alpha = smoothstep(0.035, 0.3, intensity);
    vec3 luminousColor = intensity > 0.0001
      ? clamp(col / intensity, 0.0, 1.0)
      : vec3(0.0);
    float finalAlpha = min(alpha, 1.0);
    gl_FragColor = vec4(luminousColor * finalAlpha, finalAlpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;
type GalaxyRuntimeProfile = {
    constrained: boolean;
    devicePixelRatio: number;
    dpr: number;
    fps: number;
    frameBudgeted: boolean;
    innerLoopMax: 0 | 1;
    layerCount: 2 | 3;
    precision: "highp" | "mediump";
    runtime: "desktop" | "mobile" | "webkit";
};
type GalaxyBudgetState = {
    active: number;
};
const GALAXY_CONTEXT_BUDGET_KEY = "__tascGalaxyContextBudgetV1__";
const getGalaxyContextBudget = () => {
    const globalScope = globalThis as typeof globalThis & {
        [GALAXY_CONTEXT_BUDGET_KEY]?: GalaxyBudgetState;
    };
    if (!globalScope[GALAXY_CONTEXT_BUDGET_KEY]) {
        globalScope[GALAXY_CONTEXT_BUDGET_KEY] = { active: 0 };
    }
    return globalScope[GALAXY_CONTEXT_BUDGET_KEY];
};
const reserveGalaxyContextBudget = (profile: GalaxyRuntimeProfile) => {
    const budget = getGalaxyContextBudget();
    const maxContexts = profile.constrained ? 1 : 3;
    if (budget.active >= maxContexts) {
        return null;
    }
    budget.active += 1;
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        budget.active = Math.max(0, budget.active - 1);
    };
};
const createGalaxyFragmentShader = (profile: GalaxyRuntimeProfile) => fragmentShader
    .replace("precision highp float;", `precision ${profile.precision} float;`)
    .replace("#define NUM_LAYER 4.0", `#define NUM_LAYER ${profile.layerCount.toFixed(1)}`)
    .replace("for (int y = -1; y <= 1; y++)", `for (int y = -1; y <= ${profile.innerLoopMax}; y++)`)
    .replace("for (int x = -1; x <= 1; x++)", `for (int x = -1; x <= ${profile.innerLoopMax}; x++)`);
const getGalaxyRuntimeProfile = (maxDevicePixelRatio: number, maxFps: number): GalaxyRuntimeProfile => {
    const webkit = isLikelyWebKitRuntime();
    const mobile = isLikelyMobileRuntime();
    const constrained = webkit || mobile;
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const requestedDpr = Number.isFinite(maxDevicePixelRatio)
        ? Math.max(0.35, Math.min(devicePixelRatio, maxDevicePixelRatio))
        : 1;
    const requestedFps = Number.isFinite(maxFps)
        ? Math.max(1, Math.min(60, maxFps))
        : 30;
    const desktopCanAttemptCrispMode = !constrained && maxDevicePixelRatio >= 0.8 && maxFps >= 30;
    return {
        constrained,
        devicePixelRatio,
        dpr: constrained ? Math.min(requestedDpr, 0.9) : desktopCanAttemptCrispMode ? Math.min(devicePixelRatio, 1) : requestedDpr,
        fps: constrained ? Math.min(requestedFps, 30) : desktopCanAttemptCrispMode ? 60 : requestedFps,
        frameBudgeted: desktopCanAttemptCrispMode,
        innerLoopMax: constrained ? 0 : 1,
        layerCount: constrained ? 2 : 3,
        precision: constrained ? "mediump" : "highp",
        runtime: webkit ? "webkit" : mobile ? "mobile" : "desktop",
    };
};
type GalaxyMotionTarget = {
    speed?: number;
    starSpeed?: number;
    density?: number;
    glowIntensity?: number;
    rotationSpeed?: number;
};
export type GalaxyHandle = {
    setMotion: (target: GalaxyMotionTarget) => void;
    setActive: (active: boolean) => void;
    setInteractionEnabled: (enabled: boolean) => void;
};
type GalaxyProps = HTMLAttributes<HTMLDivElement> & {
    focal?: [
        number,
        number
    ];
    rotation?: [
        number,
        number
    ];
    starSpeed?: number;
    density?: number;
    maxDevicePixelRatio?: number;
    maxFps?: number;
    pauseDuringScroll?: boolean;
    trackBoundsOnScroll?: boolean;
    hueShift?: number;
    disableAnimation?: boolean;
    disableOnReducedMotion?: boolean;
    speed?: number;
    mouseInteraction?: boolean;
    initialInteractionEnabled?: boolean;
    glowIntensity?: number;
    saturation?: number;
    mouseRepulsion?: boolean;
    twinkleIntensity?: number;
    rotationSpeed?: number;
    repulsionStrength?: number;
    autoCenterRepulsion?: number;
    transparent?: boolean;
    visibilityTargetSelector?: string;
    onStatusChange?: (status: "ready" | "unavailable") => void;
};
const Galaxy = forwardRef<GalaxyHandle, GalaxyProps>(function Galaxy({ focal = DEFAULT_FOCAL, rotation = DEFAULT_ROTATION, starSpeed = 0.5, density = 1, maxDevicePixelRatio = 1, maxFps = 30, pauseDuringScroll = false, trackBoundsOnScroll = true, hueShift = 140, disableAnimation = false, disableOnReducedMotion = true, speed = 1.0, mouseInteraction = true, initialInteractionEnabled = true, glowIntensity = 0.3, saturation = 0.0, mouseRepulsion = true, repulsionStrength = 2, twinkleIntensity = 0.3, rotationSpeed = 0.1, autoCenterRepulsion = 0, transparent = true, visibilityTargetSelector, onStatusChange, className = "", ...rest }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const targetMousePos = useRef({ x: 0.5, y: 0.5 });
    const smoothMousePos = useRef({ x: 0.5, y: 0.5 });
    const targetMouseActive = useRef(0.0);
    const smoothMouseActive = useRef(0.0);
    const motionRef = useRef({
        currentSpeed: speed,
        targetSpeed: speed,
        currentStarSpeed: starSpeed,
        targetStarSpeed: starSpeed,
        currentDensity: density,
        targetDensity: density,
        currentGlowIntensity: glowIntensity,
        targetGlowIntensity: glowIntensity,
        currentRotationSpeed: rotationSpeed,
        targetRotationSpeed: rotationSpeed,
        timePhase: 0,
        starPhase: 0,
        lastSeconds: 0,
    });
    const runtimeRef = useRef<{
        setActive: (active: boolean) => void;
        setInteractionEnabled: (enabled: boolean) => void;
    } | null>(null);
    useImperativeHandle(ref, () => ({
        setMotion: (target) => {
            if (target.speed !== undefined) {
                motionRef.current.targetSpeed = target.speed;
            }
            if (target.starSpeed !== undefined) {
                motionRef.current.targetStarSpeed = target.starSpeed;
            }
            if (target.density !== undefined) {
                motionRef.current.targetDensity = target.density;
            }
            if (target.glowIntensity !== undefined) {
                motionRef.current.targetGlowIntensity = target.glowIntensity;
            }
            if (target.rotationSpeed !== undefined) {
                motionRef.current.targetRotationSpeed = target.rotationSpeed;
            }
        },
        setActive: (active) => {
            runtimeRef.current?.setActive(active);
        },
        setInteractionEnabled: (enabled) => {
            runtimeRef.current?.setInteractionEnabled(enabled);
        },
    }), []);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        if (disableOnReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        let disposed = false;
        let reportedStatus: "pending" | "ready" | "unavailable" = "pending";
        const reportStatus = (status: "ready" | "unavailable") => {
            if (disposed || reportedStatus === status)
                return;
            reportedStatus = status;
            container.dataset.galaxyStatus = status;
            onStatusChange?.(status);
        };
        container.dataset.galaxyStatus = "pending";
        const runtimeProfile = getGalaxyRuntimeProfile(maxDevicePixelRatio, maxFps);
        const releaseGalaxyBudget = reserveGalaxyContextBudget(runtimeProfile);
        container.dataset.galaxyRuntime = runtimeProfile.runtime;
        container.dataset.galaxyLayers = String(runtimeProfile.layerCount);
        container.dataset.galaxyInnerLoop = runtimeProfile.innerLoopMax === 0 ? "2x2" : "3x3";
        container.dataset.galaxyPrecision = runtimeProfile.precision;
        if (!releaseGalaxyBudget) {
            container.dataset.galaxyContextBudget = "denied";
            reportStatus("unavailable");
            return;
        }
        container.dataset.galaxyContextBudget = "reserved";
        let renderer: Renderer;
        try {
            renderer = new Renderer({
                alpha: transparent,
                premultipliedAlpha: transparent,
                antialias: false,
                depth: false,
                stencil: false,
                dpr: runtimeProfile.dpr,
            });
        }
        catch {
            releaseGalaxyBudget();
            reportStatus("unavailable");
            return;
        }
        const gl = renderer.gl;
        if (!gl) {
            releaseGalaxyBudget();
            reportStatus("unavailable");
            return;
        }
        gl.canvas.className = "galaxy-canvas-element";
        gl.canvas.dataset.galaxyRuntime = runtimeProfile.runtime;
        gl.canvas.dataset.galaxyLayers = String(runtimeProfile.layerCount);
        gl.canvas.dataset.galaxyInnerLoop = runtimeProfile.innerLoopMax === 0 ? "2x2" : "3x3";
        gl.canvas.dataset.galaxyPrecision = runtimeProfile.precision;
        container.dataset.galaxyActive = "false";
        container.dataset.galaxyInteractive = String(mouseInteraction && initialInteractionEnabled);
        container.dataset.galaxyPointerActive = "false";
        if (transparent) {
            gl.disable(gl.BLEND);
            gl.clearColor(0, 0, 0, 0);
        }
        else {
            gl.clearColor(0, 0, 0, 1);
        }
        let program: Program | null = null;
        let geometry: Triangle | null = null;
        let mesh: Mesh | null = null;
        let contextLost = false;
        let waitingForActiveFrame = true;
        const galaxyFragmentShader = createGalaxyFragmentShader(runtimeProfile);
        let pointerRect = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        };
        let pointerRectFrame: number | null = null;
        let resizeFrame: number | null = null;
        let lastResizeWidth = 0;
        let lastResizeHeight = 0;
        let activeDpr = runtimeProfile.dpr;
        let activeFps = runtimeProfile.fps;
        let minFrameInterval = 1000 / Math.max(1, activeFps);
        let frameIntervalTolerance = Math.min(2, minFrameInterval * 0.08);
        let slowFrameCount = 0;
        const readPointerRect = () => {
            const rect = container.getBoundingClientRect();
            pointerRect = {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            };
        };
        const schedulePointerRectRead = () => {
            if (pointerRectFrame !== null)
                return;
            pointerRectFrame = requestAnimationFrame(() => {
                pointerRectFrame = null;
                readPointerRect();
            });
        };
        const updateFrameCadence = (nextFps: number) => {
            activeFps = Math.max(1, Math.min(60, nextFps));
            minFrameInterval = 1000 / activeFps;
            frameIntervalTolerance = Math.min(2, minFrameInterval * 0.08);
            container.dataset.galaxyFps = String(Math.round(activeFps));
            gl.canvas.dataset.galaxyFps = String(Math.round(activeFps));
        };
        const performResize = (force = false) => {
            if (pointerRectFrame !== null) {
                cancelAnimationFrame(pointerRectFrame);
                pointerRectFrame = null;
            }
            readPointerRect();
            const width = Math.max(1, Math.round(pointerRect.width));
            const height = Math.max(1, Math.round(pointerRect.height));
            if (!force && width === lastResizeWidth && height === lastResizeHeight)
                return;
            lastResizeWidth = width;
            lastResizeHeight = height;
            renderer.setSize(width, height);
            if (program) {
                program.uniforms.uResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
            }
        };
        const updateRendererDpr = (nextDpr: number) => {
            const normalizedDpr = Math.max(0.5, Math.min(runtimeProfile.devicePixelRatio, nextDpr));
            if (Math.abs(normalizedDpr - activeDpr) < 0.01)
                return;
            activeDpr = normalizedDpr;
            (renderer as unknown as { dpr: number }).dpr = activeDpr;
            container.dataset.galaxyDpr = activeDpr.toFixed(2);
            gl.canvas.dataset.galaxyDpr = activeDpr.toFixed(2);
            performResize(true);
        };
        const maybeDowngradeForFrameBudget = (renderCostMs: number) => {
            if (!runtimeProfile.frameBudgeted)
                return;
            const budget = Math.max(5, (1000 / activeFps) * 0.72);
            if (renderCostMs <= budget) {
                slowFrameCount = 0;
                return;
            }
            slowFrameCount += 1;
            if (slowFrameCount < 10)
                return;
            slowFrameCount = 0;
            if (activeFps > 45) {
                updateFrameCadence(45);
                return;
            }
            if (activeFps > 30) {
                updateFrameCadence(30);
                return;
            }
            if (activeDpr > 0.9) {
                updateRendererDpr(0.9);
                return;
            }
            if (activeDpr > 0.82) {
                updateRendererDpr(0.82);
            }
        };
        const resize = () => {
            if (resizeFrame !== null)
                return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;
                performResize();
            });
        };
        updateFrameCadence(runtimeProfile.fps);
        container.dataset.galaxyDpr = activeDpr.toFixed(2);
        gl.canvas.dataset.galaxyDpr = activeDpr.toFixed(2);
        updateRendererDpr(runtimeProfile.dpr);
        const disposeSceneResources = () => {
            try {
                geometry?.remove();
            }
            catch {
            }
            try {
                program?.remove();
            }
            catch {
            }
            geometry = null;
            program = null;
            mesh = null;
        };
        const initializeSceneResources = () => {
            disposeSceneResources();
            try {
                geometry = new Triangle(gl);
                program = new Program(gl, {
                    vertex: vertexShader,
                    fragment: galaxyFragmentShader,
                    depthTest: false,
                    depthWrite: false,
                    cullFace: null,
                    uniforms: {
                        uTime: { value: motionRef.current.timePhase },
                        uResolution: {
                            value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
                        },
                        uFocal: { value: new Float32Array(focal) },
                        uRotation: { value: new Float32Array(rotation) },
                        uStarSpeed: { value: motionRef.current.starPhase },
                        uDensity: { value: motionRef.current.currentDensity },
                        uHueShift: { value: hueShift },
                        uSpeed: { value: motionRef.current.currentSpeed },
                        uMouse: { value: new Float32Array([smoothMousePos.current.x, smoothMousePos.current.y]) },
                        uGlowIntensity: { value: motionRef.current.currentGlowIntensity },
                        uSaturation: { value: saturation },
                        uMouseRepulsion: { value: mouseRepulsion },
                        uTwinkleIntensity: { value: twinkleIntensity },
                        uRotationSpeed: { value: motionRef.current.currentRotationSpeed },
                        uRepulsionStrength: { value: repulsionStrength },
                        uMouseActiveFactor: { value: smoothMouseActive.current },
                        uAutoCenterRepulsion: { value: autoCenterRepulsion },
                        uTransparent: { value: transparent },
                    },
                });
                mesh = new Mesh(gl, { geometry, program });
                return true;
            }
            catch {
                disposeSceneResources();
                return false;
            }
        };
        if (!initializeSceneResources()) {
            releaseGalaxyBudget();
            reportStatus("unavailable");
            releaseWebglContext(gl.canvas, gl);
            return;
        }
        let animationId: number | null = null;
        let active = false;
        let manuallyActive = true;
        let interactionEnabled = initialInteractionEnabled;
        let visibleInViewport = false;
        let pageVisible = !document.hidden;
        let scrollPaused = false;
        let scrollResumeTimer: number | undefined;
        let lastRenderTime = 0;
        const lifecycleQaEnabled = new URLSearchParams(window.location.search).has("__tasc_webgl_lifecycle_qa");
        let lifecycleQaFrameCount = 0;
        const resizeObserver = new ResizeObserver(resize);
        const update = (time: number) => {
            if (disposed || contextLost || !active || !program || !mesh) {
                return;
            }
            animationId = requestAnimationFrame(update);
            if (time - lastRenderTime + frameIntervalTolerance < minFrameInterval) {
                return;
            }
            lastRenderTime = time;
            const seconds = time * 0.001;
            const motion = motionRef.current;
            const deltaSeconds = motion.lastSeconds > 0 ? Math.min(0.05, Math.max(0.001, seconds - motion.lastSeconds)) : 1 / 60;
            motion.lastSeconds = seconds;
            const rise = 1 - Math.exp(-deltaSeconds * 3.4);
            const release = 1 - Math.exp(-deltaSeconds * 1.35);
            const smoothTo = (current: number, target: number) => {
                const factor = target > current ? rise : release;
                return current + (target - current) * factor;
            };
            motion.currentSpeed = smoothTo(motion.currentSpeed, motion.targetSpeed);
            motion.currentStarSpeed = smoothTo(motion.currentStarSpeed, motion.targetStarSpeed);
            motion.currentDensity = smoothTo(motion.currentDensity, motion.targetDensity);
            motion.currentGlowIntensity = smoothTo(motion.currentGlowIntensity, motion.targetGlowIntensity);
            motion.currentRotationSpeed = smoothTo(motion.currentRotationSpeed, motion.targetRotationSpeed);
            motion.timePhase += deltaSeconds;
            motion.starPhase += (deltaSeconds * motion.currentStarSpeed) / 10;
            if (!disableAnimation) {
                program.uniforms.uTime.value = motion.timePhase;
                program.uniforms.uStarSpeed.value = motion.starPhase;
            }
            const pointerLerp = 0.05;
            smoothMousePos.current.x += (targetMousePos.current.x - smoothMousePos.current.x) * pointerLerp;
            smoothMousePos.current.y += (targetMousePos.current.y - smoothMousePos.current.y) * pointerLerp;
            smoothMouseActive.current += (targetMouseActive.current - smoothMouseActive.current) * pointerLerp;
            program.uniforms.uSpeed.value = motion.currentSpeed;
            program.uniforms.uDensity.value = motion.currentDensity;
            program.uniforms.uGlowIntensity.value = motion.currentGlowIntensity;
            program.uniforms.uRotationSpeed.value = motion.currentRotationSpeed;
            program.uniforms.uMouse.value[0] = smoothMousePos.current.x;
            program.uniforms.uMouse.value[1] = smoothMousePos.current.y;
            program.uniforms.uMouseActiveFactor.value = smoothMouseActive.current;
            try {
                const renderStart = performance.now();
                renderer.render({ scene: mesh });
                if (lifecycleQaEnabled) {
                    lifecycleQaFrameCount += 1;
                    const frameCount = String(lifecycleQaFrameCount);
                    const framePhase = motion.timePhase.toFixed(4);
                    container.dataset.galaxyFrameCount = frameCount;
                    container.dataset.galaxyFramePhase = framePhase;
                    gl.canvas.dataset.galaxyFrameCount = frameCount;
                    gl.canvas.dataset.galaxyFramePhase = framePhase;
                }
                if (waitingForActiveFrame) {
                    waitingForActiveFrame = false;
                    reportStatus("ready");
                }
                maybeDowngradeForFrameBudget(performance.now() - renderStart);
            }
            catch {
                if (gl.isContextLost()) {
                    return;
                }
                active = false;
                container.dataset.galaxyActive = "false";
                if (animationId !== null) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
                reportStatus("unavailable");
            }
        };
        const setActive = (nextActive: boolean) => {
            if (disposed || active === nextActive) {
                return;
            }
            if (nextActive && (contextLost || !program || !mesh)) {
                return;
            }
            active = nextActive;
            container.dataset.galaxyActive = String(active);
            if (active) {
                motionRef.current.lastSeconds = 0;
                lastRenderTime = 0;
                animationId = requestAnimationFrame(update);
                return;
            }
            if (animationId !== null) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        };
        const syncActiveState = () => {
            setActive(manuallyActive && visibleInViewport && pageVisible && !scrollPaused);
        };
        const handleScroll = () => {
            if (mouseInteraction && trackBoundsOnScroll) {
                schedulePointerRectRead();
            }
            if (!pauseDuringScroll) {
                return;
            }
            scrollPaused = true;
            syncActiveState();
            if (scrollResumeTimer !== undefined)
                window.clearTimeout(scrollResumeTimer);
            scrollResumeTimer = window.setTimeout(() => {
                scrollPaused = false;
                syncActiveState();
            }, 160);
        };
        const visibilityTargets = visibilityTargetSelector
            ? Array.from(document.querySelectorAll<HTMLElement>(visibilityTargetSelector))
            : [container.closest<HTMLElement>("[data-galaxy-visibility-root]") ?? container];
        const visibleTargets = new Set<Element>();
        const visibilityObserver = "IntersectionObserver" in window
            ? new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting)
                        visibleTargets.add(entry.target);
                    else
                        visibleTargets.delete(entry.target);
                });
                visibleInViewport = visibleTargets.size > 0;
                syncActiveState();
            }, { rootMargin: "0px", threshold: 0.01 })
            : null;
        if (!visibilityObserver) {
            visibleInViewport = true;
        }
        const handleVisibilityChange = () => {
            pageVisible = !document.hidden;
            syncActiveState();
        };
        const handleMouseMove = (event: MouseEvent) => {
            if (!interactionEnabled) {
                targetMouseActive.current = 0.0;
                container.dataset.galaxyPointerActive = "false";
                return;
            }
            const rect = pointerRect;
            if (rect.width <= 0 || rect.height <= 0) {
                schedulePointerRectRead();
                targetMouseActive.current = 0.0;
                container.dataset.galaxyPointerActive = "false";
                return;
            }
            const inside = event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;
            if (!inside) {
                targetMouseActive.current = 0.0;
                container.dataset.galaxyPointerActive = "false";
                return;
            }
            const x = (event.clientX - rect.left) / rect.width;
            const y = 1.0 - (event.clientY - rect.top) / rect.height;
            targetMousePos.current = { x, y };
            targetMouseActive.current = 1.0;
            container.dataset.galaxyPointerActive = "true";
        };
        const handleMouseLeave = () => {
            targetMouseActive.current = 0.0;
            container.dataset.galaxyPointerActive = "false";
        };
        const restorableLifecycle = installRestorableWebglLifecycle({
            canvas: gl.canvas,
            label: "galaxy",
            onLost: () => {
                contextLost = true;
                active = false;
                container.dataset.galaxyActive = "false";
                container.dataset.galaxyContext = "lost";
                waitingForActiveFrame = true;
                reportStatus("unavailable");
                if (animationId !== null) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
                geometry = null;
                program = null;
                mesh = null;
            },
            onPermanentFailure: (reason) => {
                contextLost = false;
                active = false;
                container.dataset.galaxyActive = "false";
                container.dataset.galaxyContext = `fallback:${reason}`;
                disposeSceneResources();
                reportStatus("unavailable");
            },
            onRestored: (attemptsUsed) => {
                container.dataset.galaxyContext = "restored";
                container.dataset.galaxyRestoreAttempts = String(attemptsUsed);
                waitingForActiveFrame = true;
                syncActiveState();
            },
            release: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
            restore: () => {
                contextLost = false;
                if (!initializeSceneResources()) {
                    return false;
                }
                try {
                    performResize(true);
                    if (mesh) {
                        renderer.render({ scene: mesh });
                    }
                }
                catch {
                    return false;
                }
                return true;
            },
        });
        container.appendChild(gl.canvas);
        try {
            performResize(true);
            if (mesh) {
                renderer.render({ scene: mesh });
            }
        }
        catch {
            reportStatus("unavailable");
            restorableLifecycle.dispose();
            if (gl.canvas.parentNode === container)
                container.removeChild(gl.canvas);
            disposeSceneResources();
            releaseGalaxyBudget();
            return;
        }
        runtimeRef.current = {
            setActive: (nextActive) => {
                manuallyActive = nextActive;
                syncActiveState();
            },
            setInteractionEnabled: (enabled) => {
                interactionEnabled = enabled;
                container.dataset.galaxyInteractive = String(mouseInteraction && interactionEnabled);
                if (!interactionEnabled) {
                    handleMouseLeave();
                }
            },
        };
        resizeObserver.observe(container);
        visibilityTargets.forEach((target) => visibilityObserver?.observe(target));
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("resize", resize, false);
        const listenForScroll = pauseDuringScroll || (mouseInteraction && trackBoundsOnScroll);
        if (listenForScroll) {
            window.addEventListener("scroll", handleScroll, { passive: true });
        }
        syncActiveState();
        if (mouseInteraction) {
            window.addEventListener("mousemove", handleMouseMove, { passive: true });
            window.addEventListener("blur", handleMouseLeave);
            document.addEventListener("mouseleave", handleMouseLeave);
        }
        return () => {
            disposed = true;
            runtimeRef.current = null;
            if (animationId !== null) {
                cancelAnimationFrame(animationId);
            }
            resizeObserver.disconnect();
            visibilityObserver?.disconnect();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("resize", resize);
            if (listenForScroll) {
                window.removeEventListener("scroll", handleScroll);
            }
            if (scrollResumeTimer !== undefined)
                window.clearTimeout(scrollResumeTimer);
            if (pointerRectFrame !== null)
                cancelAnimationFrame(pointerRectFrame);
            if (resizeFrame !== null)
                cancelAnimationFrame(resizeFrame);
            if (mouseInteraction) {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("blur", handleMouseLeave);
                document.removeEventListener("mouseleave", handleMouseLeave);
            }
            delete container.dataset.galaxyInteractive;
            delete container.dataset.galaxyPointerActive;
            restorableLifecycle.dispose();
            if (gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas);
            }
            disposeSceneResources();
            releaseGalaxyBudget();
        };
    }, [
        autoCenterRepulsion,
        density,
        disableAnimation,
        disableOnReducedMotion,
        focal,
        glowIntensity,
        hueShift,
        initialInteractionEnabled,
        maxDevicePixelRatio,
        maxFps,
        mouseInteraction,
        mouseRepulsion,
        onStatusChange,
        pauseDuringScroll,
        repulsionStrength,
        rotation,
        rotationSpeed,
        saturation,
        speed,
        starSpeed,
        trackBoundsOnScroll,
        transparent,
        twinkleIntensity,
        visibilityTargetSelector,
    ]);
    return <div ref={containerRef} className={`galaxy-canvas ${className}`} {...rest}/>;
});
export default Galaxy;
