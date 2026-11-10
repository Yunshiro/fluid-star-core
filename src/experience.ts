import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import type { LogoPoint } from './logo.ts';
import { WORD_WIDTH } from './logo.ts';
import type { Profile } from './quality.ts';
import { detectTier, profileFor, supportsColorBuffer } from './quality.ts';
import { clamp, smoothstep, state } from './state.ts';
import type { YunnBridge } from './state.ts';

import backgroundFrag from './shaders/background.frag.glsl?raw';
import backgroundVert from './shaders/background.vert.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';
import glowFrag from './shaders/glow.frag.glsl?raw';
import glowVert from './shaders/glow.vert.glsl?raw';
import liquid from './shaders/liquid.glsl?raw';
import noise from './shaders/noise.glsl?raw';
import passVert from './shaders/pass.vert.glsl?raw';
import pointsFrag from './shaders/points.frag.glsl?raw';
import pointsVert from './shaders/points.vert.glsl?raw';
import positionShader from './shaders/position.glsl?raw';
import velocityShader from './shaders/velocity.glsl?raw';

export interface Experience {
  start(): void;
  reveal(): void;
  resize(): void;
  renderFrame(): void;
  settle(steps: number): void;
  setLogo(points: LogoPoint[]): void;
  dispose(): void;
}

interface Assignment {
  index: number;
  jx: number;
  jy: number;
  jz: number;
  dx: number;
  dy: number;
  dz: number;
}

function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function mulberry(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function asFloat(texture: THREE.DataTexture): Float32Array {
  const data = texture.image.data;
  if (!(data instanceof Float32Array)) throw new Error('Expected float texture data');
  return data;
}

function viewportSize(): { width: number; height: number } {
  const view = window.visualViewport;
  return {
    width: Math.max(1, Math.round(view?.width ?? window.innerWidth)),
    height: Math.max(1, Math.round(view?.height ?? window.innerHeight)),
  };
}

export function createExperience(
  canvas: HTMLCanvasElement,
  bridge: YunnBridge,
  qualityOverride: string | null,
): Experience {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setClearColor(0x07060b, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = false;

  const gl = renderer.getContext() as WebGL2RenderingContext;
  const half = supportsColorBuffer(gl, gl.RGBA16F, gl.HALF_FLOAT);
  const full = supportsColorBuffer(gl, gl.RGBA32F, gl.FLOAT);
  renderer.resetState();

  const tier = detectTier(gl, qualityOverride);
  const profile: Profile = profileFor(tier);
  let dprCap = profile.dprCap;
  renderer.toneMappingExposure = profile.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
  scene.add(camera);

  const backgroundMaterial = new THREE.ShaderMaterial({
    vertexShader: backgroundVert,
    fragmentShader: backgroundFrag,
    uniforms: {
      uMorph: { value: 0 },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: true,
  });
  const background = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 24), backgroundMaterial);
  camera.add(background);

  const envTarget = buildEnvironment(renderer);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = profile.envIntensity * 0.72;

  const key = new THREE.DirectionalLight(0xfff1df, 1.35);
  key.position.set(2.8, 3.4, 4.6);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 1.15);
  rim.position.set(-4.6, 1.5, -2.4);
  const blush = new THREE.DirectionalLight(0xff7eb6, 0.22);
  blush.position.set(1.2, -3, 2.4);
  scene.add(key, rim, blush);
  const pointerLight = new THREE.PointLight(0xffe0bf, 0, 7.5, 1.45);
  scene.add(pointerLight);

  const uTime = { value: 0 };
  const liquidDistort = { value: 0.11 };
  const liquidDissolve = { value: 0 };
  const glowIntensity = { value: 0.42 };

  const orbMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9bea6,
    metalness: 1,
    roughness: 0.2,
    iridescence: 1,
    iridescenceIOR: 1.38,
    iridescenceThicknessMinimum: 140,
    iridescenceThicknessMaximum: 540,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.55,
  });
  const ringMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe8b48a,
    metalness: 1,
    roughness: 0.32,
    iridescence: 1,
    iridescenceIOR: 1.28,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 460,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.85,
  });
  bindLiquid(orbMaterial, 1, uTime, liquidDistort, liquidDissolve);
  bindLiquid(ringMaterial, 0.42, uTime, liquidDistort, liquidDissolve);

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, profile.orbDetail), orbMaterial);
  const tube = profile.tier === 'low' ? 0.03 : 0.02;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.86, tube * 0.65, profile.tier === 'low' ? 8 : 14, profile.ringTubular),
    ringMaterial,
  );
  ring.rotation.x = 1.28;
  ring.rotation.y = 0.18;

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uIntensity: glowIntensity },
    vertexShader: glowVert,
    fragmentShader: glowFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.24, 48, 32), glowMaterial);
  glow.renderOrder = 2;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0xffd8b4,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.2,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(3.1, 3.1, 1);
  sprite.renderOrder = 3;

  const size = profile.simSize;
  const count = size * size;
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const uvs = new Float32Array(count * 2);
  const textData = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = x + y * size;
      const t = (index + 0.5) / count;
      const fy = 1 - t * 2;
      const radiusXY = Math.sqrt(Math.max(0, 1 - fy * fy));
      const theta = golden * index;
      const slot = index % 20;
      let radius = 1.08 + hash(index) * 0.22;
      if (slot >= 15 && slot < 18) radius = 0.62 + hash(index + 3) * 0.28;
      if (slot >= 18) radius = 1.38 + hash(index + 5) * 0.28;
      base[index * 3] = Math.cos(theta) * radiusXY * radius;
      base[index * 3 + 1] = fy * radius;
      base[index * 3 + 2] = Math.sin(theta) * radiusXY * radius;
      seeds[index] = hash(index + 19);
      uvs[index * 2] = (x + 0.5) / size;
      uvs[index * 2 + 1] = (y + 0.5) / size;
    }
  }

  const baseData = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    baseData[index * 4] = base[index * 3] ?? 0;
    baseData[index * 4 + 1] = base[index * 3 + 1] ?? 0;
    baseData[index * 4 + 2] = base[index * 3 + 2] ?? 0;
    baseData[index * 4 + 3] = seeds[index] ?? 0;
  }
  const baseTexture = new THREE.DataTexture(baseData, size, size, THREE.RGBAFormat, THREE.FloatType);
  baseTexture.colorSpace = THREE.NoColorSpace;
  baseTexture.wrapS = THREE.ClampToEdgeWrapping;
  baseTexture.wrapT = THREE.ClampToEdgeWrapping;
  baseTexture.magFilter = THREE.NearestFilter;
  baseTexture.minFilter = THREE.NearestFilter;
  baseTexture.generateMipmaps = false;
  baseTexture.needsUpdate = true;

  const textTexture = new THREE.DataTexture(textData, size, size, THREE.RGBAFormat, THREE.FloatType);
  textTexture.colorSpace = THREE.NoColorSpace;
  textTexture.wrapS = THREE.ClampToEdgeWrapping;
  textTexture.wrapT = THREE.ClampToEdgeWrapping;
  textTexture.magFilter = THREE.NearestFilter;
  textTexture.minFilter = THREE.NearestFilter;
  textTexture.generateMipmaps = false;
  textTexture.needsUpdate = true;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
  const textAttribute = new THREE.BufferAttribute(textData, 4);
  textAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aText', textAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
  geometry.computeBoundingBox();

  const uMorph = { value: 0 };
  const uMotion = { value: state.motion };
  const uPointer = { value: new THREE.Vector3(0, -8, 0) };
  const uPointerForce = { value: 0 };
  const uTextScale = { value: 1 };
  const uDt = { value: 0.016 };
  const uScroll = { value: 0 };
  const uCurl = { value: profile.curl ? 1 : 0 };

  let gpu: GPUComputationRenderer | null = null;
  let posVar: ReturnType<GPUComputationRenderer['addVariable']> | null = null;
  let velVar: ReturnType<GPUComputationRenderer['addVariable']> | null = null;
  let mode: 'gpgpu' | 'analytic' = 'analytic';

  if (half || full) {
    try {
      const computation = new GPUComputationRenderer(size, size, renderer);
      computation.setDataType(half ? THREE.HalfFloatType : THREE.FloatType);
      const pos0 = computation.createTexture();
      const vel0 = computation.createTexture();
      asFloat(pos0).set(baseData);
      const velocityData = asFloat(vel0);
      for (let index = 0; index < count; index += 1) {
        const px = baseData[index * 4] ?? 0;
        const py = baseData[index * 4 + 1] ?? 0;
        const pz = baseData[index * 4 + 2] ?? 0;
        const planar = Math.hypot(px, pz) || 1;
        velocityData[index * 4] = (-pz / planar) * 0.12;
        velocityData[index * 4 + 1] = (py === 0 ? 0 : (seeds[index] ?? 0.5) - 0.5) * 0.03;
        velocityData[index * 4 + 2] = (px / planar) * 0.12;
        velocityData[index * 4 + 3] = 1;
      }
      pos0.needsUpdate = true;
      vel0.needsUpdate = true;
      pos0.colorSpace = THREE.NoColorSpace;
      vel0.colorSpace = THREE.NoColorSpace;

      const positionVar = computation.addVariable('texturePosition', positionShader, pos0);
      const velocityVar = computation.addVariable('textureVelocity', `${noise}\n${velocityShader}`, vel0);
      computation.setVariableDependencies(velocityVar, [velocityVar, positionVar]);
      computation.setVariableDependencies(positionVar, [velocityVar, positionVar]);
      positionVar.material.precision = 'highp';
      velocityVar.material.precision = 'highp';
      positionVar.material.uniforms.uDt = uDt;
      positionVar.material.uniforms.uBase = { value: baseTexture };
      velocityVar.material.uniforms.uDt = uDt;
      velocityVar.material.uniforms.uTime = uTime;
      velocityVar.material.uniforms.uMorph = uMorph;
      velocityVar.material.uniforms.uMotion = uMotion;
      velocityVar.material.uniforms.uCurl = uCurl;
      velocityVar.material.uniforms.uScroll = uScroll;
      velocityVar.material.uniforms.uPointerForce = uPointerForce;
      velocityVar.material.uniforms.uPointer = uPointer;
      velocityVar.material.uniforms.uBase = { value: baseTexture };
      velocityVar.material.uniforms.uText = { value: textTexture };

      const error = computation.init();
      if (error) {
        computation.dispose();
      } else {
        for (const variable of [positionVar, velocityVar]) {
          for (const target of variable.renderTargets) {
            target.texture.colorSpace = THREE.NoColorSpace;
          }
        }
        gpu = computation;
        posVar = positionVar;
        velVar = velocityVar;
        mode = 'gpgpu';
      }
    } catch {
      gpu = null;
      mode = 'analytic';
    }
  }

  const pointUniforms: { [key: string]: THREE.IUniform } = {
    uMorph,
    uTime,
    uPointScale: { value: profile.pointScale },
    uPixelRatio: { value: 1 },
    uTextScale,
    uMotion,
    uFocus: { value: 6 },
    uPointer,
    uPointerForce,
  };
  if (mode === 'gpgpu' && gpu && posVar) {
    pointUniforms.uPosition = { value: gpu.getCurrentRenderTarget(posVar).texture };
    pointUniforms.uText = { value: textTexture };
  }

  const pointsMaterial = new THREE.ShaderMaterial({
    defines: mode === 'analytic' ? { ANALYTIC: 1 } : {},
    uniforms: pointUniforms,
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  pointsMaterial.precision = 'highp';
  const points = new THREE.Points(geometry, pointsMaterial);
  points.frustumCulled = false;
  points.renderOrder = 10;

  const group = new THREE.Group();
  group.add(orb, ring, glow, sprite, points);
  scene.add(group);

  backgroundMaterial.uniforms.uMorph = uMorph;
  backgroundMaterial.uniforms.uTime = uTime;

  const { width, height } = viewportSize();
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  const composer = new EffectComposer(renderer);
  if (!half) {
    composer.renderTarget1.texture.type = THREE.UnsignedByteType;
    composer.renderTarget2.texture.type = THREE.UnsignedByteType;
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.renderTarget1.setSize(buffer.x, buffer.y);
    composer.renderTarget2.setSize(buffer.x, buffer.y);
  }
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    profile.bloomStrength,
    profile.bloomRadius,
    profile.bloomThreshold,
  );
  bloom.enabled = profile.bloom;
  const composite = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uChroma: { value: profile.chroma },
      uGrain: { value: profile.grain },
      uVignette: { value: profile.vignette },
      uDof: { value: state.reduced ? 0 : profile.dof },
      uBloomTap: { value: profile.bloomTap },
      uAspect: { value: width / height },
    },
    vertexShader: passVert,
    fragmentShader: compositeFrag,
  });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(composite);
  composer.addPass(new OutputPass());

  state.tier = profile.tier;
  state.particles = count;
  state.sim = mode;
  state.bloom = profile.bloom;
  state.dpr = dpr;
  bridge.tier = profile.tier;
  bridge.particles = count;
  bridge.sim = mode;
  bridge.dpr = dpr;

  let logoPoints: LogoPoint[] = [];
  let assignment: Assignment[] = [];
  let restZ = 6.5;
  let displayed = state.morph;
  let simTime = 0;
  let revealStart = 0;
  let revealing = false;
  let smoothX = 0;
  let smoothY = 0;
  let force = 0;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let statFrames = 0;
  let statStart = performance.now();
  let workSum = 0;
  let adapted = false;
  const frameTimes: number[] = [];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const startNow = performance.now();

  function wordFit(): number {
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const visibleWidth = 2 * tan * restZ * camera.aspect;
    return Math.min(1, (visibleWidth * 0.8) / WORD_WIDTH);
  }

  function writeLogo(scale: number): void {
    uTextScale.value = scale;
    for (let index = 0; index < count; index += 1) {
      const item = assignment[index];
      if (!item) continue;
      if (item.index >= 0) {
        const point = logoPoints[item.index];
        if (!point) continue;
        textData[index * 4] = point.x * scale + item.jx * scale;
        textData[index * 4 + 1] = point.y * scale + item.jy * scale;
        textData[index * 4 + 2] = item.jz;
        textData[index * 4 + 3] = 1;
      } else {
        textData[index * 4] = item.dx * scale;
        textData[index * 4 + 1] = item.dy * scale;
        textData[index * 4 + 2] = item.dz;
        textData[index * 4 + 3] = 0;
      }
    }
    textAttribute.needsUpdate = true;
    textTexture.needsUpdate = true;
  }

  function setLogo(points: LogoPoint[]): void {
    logoPoints = points;
    const random = mulberry(0x51c0de);
    const ratio = points.length === 0 ? 0 : Math.min(0.72, profile.assignedTarget / count);
    assignment = [];
    for (let index = 0; index < count; index += 1) {
      if (points.length > 0 && random() < ratio) {
        assignment.push({
          index: Math.floor(random() * points.length),
          jx: (random() - 0.5) * 0.008,
          jy: (random() - 0.5) * 0.008,
          jz: (random() - 0.5) * 0.04,
          dx: 0,
          dy: 0,
          dz: 0,
        });
      } else {
        const angle = random() * Math.PI * 2;
        const radius = 1.55 + Math.sqrt(random()) * 1.7;
        assignment.push({
          index: -1,
          jx: 0,
          jy: 0,
          jz: 0,
          dx: Math.cos(angle) * radius,
          dy: (random() - 0.45) * 0.95,
          dz: (random() - 0.5) * 0.5,
        });
      }
    }
    writeLogo(wordFit());
  }

  function layout(): void {
    const view = viewportSize();
    const ratio = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(ratio);
    renderer.setSize(view.width, view.height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(view.width, view.height);
    camera.aspect = view.width / Math.max(1, view.height);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const fill = camera.aspect < 1 ? 0.5 * camera.aspect : 0.5;
    restZ = Math.max(5, 1.05 / (tan * Math.max(0.18, fill)));
    const visibleHeight = 2 * tan * restZ;
    group.position.y = visibleHeight * 0.055;
    pointUniforms.uPixelRatio = pointUniforms.uPixelRatio ?? { value: ratio };
    pointUniforms.uPixelRatio.value = ratio;
    pointUniforms.uFocus = pointUniforms.uFocus ?? { value: restZ };
    pointUniforms.uFocus.value = restZ;
    const aspectUniform = composite.uniforms.uAspect;
    if (aspectUniform) aspectUniform.value = camera.aspect;
    state.dpr = ratio;
    bridge.dpr = ratio;
    camera.updateProjectionMatrix();
    writeLogo(wordFit());
  }

  function revealAmount(now: number): number {
    if (state.shot === 'intro') return 0;
    if (state.reduced || state.shot) return 1;
    if (!revealing) return 0;
    const t = clamp((now - revealStart) / 2200, 0, 1);
    return 1 - (1 - t) ** 3;
  }

  function sync(dt: number, now: number): void {
    const follow = state.reduced || state.shot ? 1 : 1 - Math.exp(-dt * 5);
    displayed += (state.morph - displayed) * follow;
    uMorph.value = displayed;
    uMotion.value = state.motion;
    simTime += dt * (state.reduced ? 0.2 : 1);
    uTime.value = simTime;
    state.scrollVelocity *= Math.exp(-dt * 2.2);
    uScroll.value = state.scrollVelocity;

    const pointerK = 1 - Math.exp(-dt * (state.reduced ? 20 : 4.2));
    smoothX += (state.pointerX - smoothX) * pointerK;
    smoothY += (state.pointerY - smoothY) * pointerK;
    const active = state.pointerAt > 0 && now - state.pointerAt < 1500;
    const forceTarget = active ? 1 : 0;
    force += (forceTarget - force) * (1 - Math.exp(-dt * 3));
    uPointerForce.value = force;

    const reveal = revealAmount(now);
    const logoMix = smoothstep(1.05, 1.7, displayed);
    camera.position.z = restZ * (1 + (1 - reveal) * 0.16);
    camera.position.x = smoothX * 0.16 * (1 - logoMix);
    camera.position.y = smoothY * 0.1 * (1 - logoMix);
    camera.lookAt(0, group.position.y - restZ * 0.012, 0);
    camera.updateMatrixWorld();

    ndc.set(smoothX, smoothY);
    raycaster.setFromCamera(ndc, camera);
    const found = raycaster.ray.intersectPlane(plane, hit);
    if (found) {
      pointerLight.position.copy(hit);
      group.worldToLocal(hit);
      uPointer.value.copy(hit);
    }
    pointerLight.intensity = force * (profile.tier === 'low' ? 8 : 16);

    const tilt = (1 - logoMix) * state.motion;
    group.rotation.y += (smoothX * 0.08 * tilt - group.rotation.y) * 0.08;
    group.rotation.x += (-smoothY * 0.05 * tilt - group.rotation.x) * 0.08;
    orb.rotation.y += dt * 0.16 * state.motion;
    orb.rotation.z = Math.sin(simTime * 0.17) * 0.08 * state.motion;
    ring.rotation.z += dt * 0.09 * state.motion;

    const dissolve = smoothstep(0.04, 0.84, displayed);
    liquidDissolve.value = dissolve;
    const showMetal = displayed < 0.94;
    orb.visible = showMetal;
    ring.visible = showMetal;
    glow.visible = displayed < 0.9;
    sprite.visible = displayed < 0.88;
    glowIntensity.value = (1 - dissolve) * 0.42;
    spriteMaterial.opacity = (1 - dissolve) * 0.2;
    const swell = 1 + dissolve * 0.16;
    orb.scale.setScalar(swell);
    ring.scale.setScalar(1 + dissolve * 0.24);

    const grainTime = composite.uniforms.uTime;
    if (grainTime) grainTime.value = simTime;
    const chroma = composite.uniforms.uChroma;
    if (chroma) {
      const shifting = displayed > 0.2 && displayed < 1.85 && Math.abs(displayed - Math.round(displayed)) > 0.08;
      chroma.value = profile.chroma * (shifting ? 1.7 : 1);
    }
    if (bloom.enabled) {
      const boost = state.shot || state.reduced ? 1 : 1 + (1 - reveal) * 0.16;
      bloom.strength = profile.bloomStrength * boost;
    }

    uDt.value = dt;
    if (gpu && posVar && velVar && !state.hidden) {
      gpu.compute();
      const positionUniform = pointUniforms.uPosition;
      if (positionUniform) positionUniform.value = gpu.getCurrentRenderTarget(posVar).texture;
    }
  }

  function renderFrame(): void {
    composer.render();
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.hidden) {
      const workStart = performance.now();
      sync(Math.min(dt, 0.033), now);
      composer.render();
      const work = performance.now() - workStart;
      frames += 1;
      statFrames += 1;
      workSum += work;
      frameTimes.push(work);
      if (frameTimes.length > 40) frameTimes.shift();
      bridge.frames = frames;
      bridge.morph = displayed;
      const span = now - statStart;
      if (span >= 500) {
        state.fps = (statFrames * 1000) / span;
        state.ms = workSum / Math.max(1, statFrames);
        bridge.fps = state.fps;
        bridge.ms = state.ms;
        statFrames = 0;
        workSum = 0;
        statStart = now;
      }
      if (!adapted && !state.shot && profile.tier === 'high' && now - startNow > 2800 && frameTimes.length >= 30) {
        const average = frameTimes.reduce((sum, sample) => sum + sample, 0) / frameTimes.length;
        if (average > 20) {
          adapted = true;
          state.adapted = true;
          dprCap = Math.min(dprCap, 1.15);
          if (average > 26) uCurl.value = 0;
          layout();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    state.hidden = true;
    window.dispatchEvent(new CustomEvent('core-lost'));
  }
  canvas.addEventListener('webglcontextlost', onContextLost);

  const onResize = (): void => layout();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  layout();
  setLogo([]);

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      statStart = last;
      raf = requestAnimationFrame(frame);
    },
    reveal() {
      revealing = true;
      revealStart = performance.now();
    },
    resize: layout,
    renderFrame,
    settle(steps: number) {
      displayed = state.morph;
      uMorph.value = displayed;
      for (let index = 0; index < steps; index += 1) {
        sync(1 / 60, performance.now());
      }
      renderFrame();
    },
    setLogo,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      gpu?.dispose();
      baseTexture.dispose();
      textTexture.dispose();
      geometry.dispose();
      orbMaterial.dispose();
      ringMaterial.dispose();
      glowMaterial.dispose();
      spriteMaterial.map?.dispose();
      spriteMaterial.dispose();
      pointsMaterial.dispose();
      backgroundMaterial.dispose();
      background.geometry.dispose();
      orb.geometry.dispose();
      ring.geometry.dispose();
      glow.geometry.dispose();
      envTarget.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (!context) return texture;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,246,236,1)');
  gradient.addColorStop(0.18, 'rgba(255,196,140,0.58)');
  gradient.addColorStop(0.48, 'rgba(170,70,48,0.12)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  texture.needsUpdate = true;
  return texture;
}

function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x09080d);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(16, 12, 16),
    new THREE.MeshStandardMaterial({
      color: 0x100e14,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),
  );
  envScene.add(room);
  const geo = new THREE.PlaneGeometry(1, 1);
  const cards = [
    { color: 0xffc48a, intensity: 8, position: [4.4, 1.5, -2.1], rotY: -0.55, scale: [5.4, 2.3, 1] },
    { color: 0x8fd4ff, intensity: 5.4, position: [-4.7, -0.2, 0.5], rotY: 0.72, scale: [2.7, 4.5, 1] },
    { color: 0xff78d2, intensity: 3.3, position: [0.5, 3.7, 1.1], rotY: 0.12, scale: [7.2, 0.55, 1] },
    { color: 0xfff6ea, intensity: 12, position: [-0.15, 0.15, 4.3], rotY: Math.PI, scale: [1.15, 1.7, 1] },
  ];
  for (const card of cards) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: new THREE.Color(card.color),
        emissiveIntensity: card.intensity,
        roughness: 1,
        metalness: 0,
      }),
    );
    mesh.position.set(card.position[0] ?? 0, card.position[1] ?? 0, card.position[2] ?? 0);
    mesh.rotation.y = card.rotY;
    mesh.scale.set(card.scale[0] ?? 1, card.scale[1] ?? 1, 1);
    envScene.add(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0, 0.1, 50);
  pmrem.dispose();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  envScene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    const material = obj.material;
    if (Array.isArray(material)) for (const item of material) materials.add(item);
    else materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  return target;
}

function bindLiquid(
  material: THREE.MeshPhysicalMaterial,
  mul: number,
  uTime: { value: number },
  uDistort: { value: number },
  uDissolve: { value: number },
): void {
  const header = `uniform float uTime;\nuniform float uDistort;\nuniform float uDissolve;\nvarying vec3 vObjectPos;\n#define DISTORT_MUL ${mul.toFixed(3)}\n${noise}\n${liquid}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uDistort = uDistort;
    shader.uniforms.uDissolve = uDissolve;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${header}`)
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = coreNormal(position);\n#ifdef USE_TANGENT\n\tvec3 objectTangent = vec3( tangent.xyz );\n#endif',
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = coreDeform(position);\nvObjectPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uDissolve;\nvarying vec3 vObjectPos;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if (uDissolve > 0.001) {
  float n = fract(sin(dot(vObjectPos, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float bands = sin(vObjectPos.y * 8.0 + vObjectPos.x * 5.0 + uTime * 0.55) * 0.5 + 0.5;
  if (mix(bands, n, 0.35) < uDissolve) discard;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float fresnelTerm = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.6);
totalEmissiveRadiance += fresnelTerm * vec3(1.0, 0.62, 0.38) * 0.62 * (1.0 - uDissolve);`,
      );
  };
  material.customProgramCacheKey = () => `fluid-liquid-${mul.toFixed(3)}`;
}
