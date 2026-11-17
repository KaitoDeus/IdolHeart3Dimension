import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  createTaubinHeartGeometry,
  createVolumetricHeartParticles,
  createVortexPoolAttributes,
  createVortexArcsGeometry,
  createFountainStreakCurves,
  createCosmicHighlightStarTexture,
  createTwinkleStarTexture,
  createGlowSpriteTexture,
  createMiniHeartTexture,
  createCardBackTexture,
  createPhotocardTexture
} from './heartGeometry.js';

export class HeartScene {
  constructor(canvas, idols, callbacks = {}) {
    this.canvas = canvas;
    this.idols = idols;
    this.onHeartClick = callbacks.onHeartClick || (() => {});
    this.onCardClick = callbacks.onCardClick || (() => {});
    this.onDragStateChange = callbacks.onDragStateChange || (() => {});
    this.onCardsVisibilityChange = callbacks.onCardsVisibilityChange || (() => {});

    this.mode = 'orbit'; // 'orbit' | 'drag'
    this.cardsRevealed = false;
    this.cardRevealProgress = 0;
    this.autoRotate = true;
    this.isDisposed = false;

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Pointer tracking for click vs drag
    this.pointerDown = false;
    this.pointerId = null;
    this.downPos = { x: 0, y: 0 };
    this.downTime = 0;
    this.maxMoveDist = 0;
    this.isHoveringHeart = false;
    this.hoveredCard = null;

    // Free drag-and-drop state
    this.dragTarget = null; // 'heart' | cardGroup
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    this.dragVelocity = new THREE.Vector3();
    this.prevDragPos = new THREE.Vector3();

    // Smooth camera/position reset tween state
    this.resetTween = null;

    // Heart assembly, fountain wave, color theme & click burst state
    this.clickImpulse = 0;
    this.hoverLerp = 0;
    this.burstPool = [];
    this.heartTheme = 'cyan'; // 'cyan' | 'pink'
    this.themeMix = 0; // 0 = cyan, 1 = pink
    this.themeTarget = 0;
    this._bgCyan = new THREE.Color('#060813');
    this._bgPink = new THREE.Color('#11040c');
    this._lightCyan = new THREE.Color('#38bdf8');
    this._lightPink = new THREE.Color('#ff3b7a');
    this._starCoreCyan = new THREE.Color('#e0f7ff');
    this._starCorePink = new THREE.Color('#fff5e6');
    this._starHaloCyan = new THREE.Color('#c4b5fd');
    this._starHaloPink = new THREE.Color('#fda4af');

    this.introProgress = 0;
    this.introDuration = 3.5; // Initial draw-in & particle assembly from vortex
    this.introCompleted = false;

    // Rhythmic video-inspired fountain wave cycle (erupts from vortex into heart)
    this.waveActive = true;
    this.waveProgress = 0;
    this.waveDuration = 4.2;
    this.waveCooldown = 4.6;
    this.idleSinceWave = 0;

    this._initScene();
    this._initLightsAndEnv();
    this._initTextures();
    this._initHeartAssembly();
    this._initStarfield();
    this._initBurstSystem();
    this._initIdolCards();
    this._initPostProcessing();
    this._initControls();
    this._bindEvents();

    this.resize();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060813');
    this.scene.fog = new THREE.FogExp2('#060813', 0.026);

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 85);
    this.camera.position.set(0, 0.05, 5.4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initLightsAndEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.55;
    roomEnv.dispose();
    pmrem.dispose();

    const ambient = new THREE.AmbientLight('#dceeff', 0.55);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#e0f2fe', 1.9);
    keyLight.position.set(3.5, 4.5, 4.2);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#a855f7', 1.6);
    rimLight.position.set(-4.0, -1.8, -3.5);
    this.scene.add(rimLight);

    this.innerLight = new THREE.PointLight('#38bdf8', 2.8, 7.5, 1.5);
    this.innerLight.position.set(0, -0.3, 0.2);
    this.scene.add(this.innerLight);
  }

  _initTextures() {
    this.glowTex = createGlowSpriteTexture();
    this.twinkleStarTex = createTwinkleStarTexture();
    this.highlightStarTex = createCosmicHighlightStarTexture();
    this.miniHeartTex = createMiniHeartTexture();
  }

  _initHeartAssembly() {
    this.heartGroup = new THREE.Group();
    this.heartGroup.position.set(0, 0.15, 0);
    this.scene.add(this.heartGroup);

    const heartScale = [1.18, 1.14, 1.18];
    const vortexY = -1.58;

    // 1) Invisible exact Taubin heart mesh for crisp raycast click & drag hit-testing
    const hitGeo = createTaubinHeartGeometry({ detail: 14, scale: heartScale });
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.heartMesh = new THREE.Mesh(hitGeo, hitMat);
    this.heartMesh.name = 'MainHeartCollider';
    this.heartGroup.add(this.heartMesh);

    // 2) Subtle translucent inner nebula heart silhouette for volumetric depth
    const coreGeo = createTaubinHeartGeometry({ detail: 14, scale: [1.06, 1.03, 1.06] });
    this.coreGlowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uReveal: { value: 0 },
        uPulse: { value: 0 },
        uTime: { value: 0 },
        uThemeMix: { value: 0 }
      },
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uReveal;
        uniform float uPulse;
        uniform float uThemeMix;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        void main() {
          vec3 V = normalize(vViewPos);
          vec3 N = normalize(vNormalView);
          float fresnel = pow(1.0 - abs(dot(N, V)), 2.2);
          float leftMix = clamp((-vLocalPos.x + 0.8) / 1.8, 0.0, 1.0);
          vec3 cyanCol = mix(vec3(0.22, 0.78, 0.98), vec3(0.68, 0.54, 0.98), leftMix * 0.75);
          vec3 pinkCol = mix(vec3(0.95, 0.16, 0.44), vec3(0.99, 0.64, 0.72), leftMix * 0.75);
          vec3 col = mix(cyanCol, pinkCol, uThemeMix);
          float alpha = (0.045 + fresnel * 0.10 + uPulse * 0.08) * uReveal;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.coreGlowMesh = new THREE.Mesh(coreGeo, this.coreGlowMaterial);
    this.heartGroup.add(this.coreGlowMesh);

    // 3) 5,400 volumetric stardust heart particles (ice-cyan + lavender-violet + diamond sparkles)
    const { positions, vortexPositions, seeds, sizes, colorMix } =
      createVolumetricHeartParticles(5400, heartScale, vortexY);

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('aVortex', new THREE.BufferAttribute(vortexPositions, 3));
    particleGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    particleGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    particleGeo.setAttribute('aColorMix', new THREE.BufferAttribute(colorMix, 1));

    this.heartParticlesMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAssemble: { value: 0 },
        uWave: { value: 0 },
        uImpulse: { value: 0 },
        uHeartScale: { value: 1.0 },
        uThemeMix: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: this.twinkleStarTex }
      },
      vertexShader: `
        attribute vec3 aVortex;
        attribute float aSeed;
        attribute float aSize;
        attribute float aColorMix;

        uniform float uTime;
        uniform float uAssemble;
        uniform float uWave;
        uniform float uImpulse;
        uniform float uHeartScale;
        uniform float uPixelRatio;

        varying float vAlpha;
        varying float vColorMix;
        varying float vBoost;

        void main() {
          // Staggered spiral ascent from bottom vortex pool into 3D heart
          float normY = clamp((position.y + 1.25) / 2.55, 0.0, 1.0);
          float delay = fract(aSeed * 3.17) * 0.42 + normY * 0.22;
          float tLocal = clamp((uAssemble - delay) / 0.36, 0.0, 1.0);
          float ease = tLocal * tLocal * (3.0 - 2.0 * tLocal);

          vec3 basePos = mix(aVortex, position * uHeartScale, ease);

          // Helical swirl during initial assembly
          float swirlAng = (1.0 - ease) * (3.2 + aSeed * 2.8);
          float cs = cos(swirlAng);
          float sn = sin(swirlAng);
          basePos.xz = mat2(cs, -sn, sn, cs) * basePos.xz;
          basePos.y += sin(ease * 3.14159) * 0.22 * (0.4 + fract(aSeed * 5.0));

          // Fountain eruption wave turbulence (inspired by reference video)
          float waveEnv = sin(clamp(uWave, 0.0, 1.0) * 3.14159265);
          float waveLocal = sin(clamp(uWave * 1.45 - normY * 0.35, 0.0, 1.0) * 3.14159265);
          float turbPhase = uTime * 2.8 + aSeed * 24.0;
          vec3 fountainOffset = vec3(
            sin(turbPhase + position.y * 2.5) * 0.16 * (0.3 + normY),
            waveLocal * (0.28 + fract(aSeed * 7.1) * 0.34),
            cos(turbPhase * 0.85 + position.x * 2.2) * 0.15
          ) * waveEnv;

          // Subtle idle stardust shimmer
          vec3 idleDrift = vec3(
            sin(uTime * 1.2 + aSeed * 18.0) * 0.018,
            cos(uTime * 1.5 + aSeed * 14.0) * 0.022,
            sin(uTime * 1.1 + aSeed * 22.0) * 0.018
          ) * ease;

          // Click burst radial pop
          vec3 dir = normalize(position + vec3(0.0001));
          vec3 pos = basePos + fountainOffset + idleDrift + dir * uImpulse * 0.24 * (0.4 + aSeed);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          float twinkle = 0.55 + 0.45 * sin(uTime * (2.2 + aSeed * 3.0) + aSeed * 19.0);
          float sizeBoost = 1.0 + waveEnv * 0.45 + uImpulse * 0.55;
          gl_PointSize = aSize * sizeBoost * (30.0 + twinkle * 12.0) * uPixelRatio / max(1.0, -mvPosition.z);

          vAlpha = (0.42 + 0.52 * twinkle) * smoothstep(0.0, 0.15, tLocal + 0.12);
          vColorMix = aColorMix;
          vBoost = clamp(waveEnv * 0.7 + uImpulse * 0.8 + (1.0 - ease) * 0.5, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uThemeMix;
        varying float vAlpha;
        varying float vColorMix;
        varying float vBoost;

        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.02) discard;

          vec3 iceCyan = vec3(0.32, 0.84, 1.0);
          vec3 softLavender = vec3(0.76, 0.62, 1.0);
          vec3 cyanTheme = mix(iceCyan, softLavender, vColorMix);

          vec3 rubyRose = vec3(1.0, 0.24, 0.48);
          vec3 sakuraPink = vec3(1.0, 0.66, 0.78);
          vec3 pinkTheme = mix(rubyRose, sakuraPink, vColorMix);

          vec3 baseCol = mix(cyanTheme, pinkTheme, uThemeMix);
          vec3 highlightTint = mix(vec3(0.94, 0.98, 1.0), vec3(1.0, 0.93, 0.96), uThemeMix);
          vec3 finalCol = mix(baseCol, highlightTint, vBoost * 0.65);

          gl_FragColor = vec4(finalCol * tex.rgb, tex.a * vAlpha);
        }
      `
    });

    this.heartParticles = new THREE.Points(particleGeo, this.heartParticlesMaterial);
    this.heartGroup.add(this.heartParticles);

    // 4) Glowing cosmic vortex pool beneath the heart tip
    const {
      positions: vPos,
      radii: vRad,
      angles: vAng,
      seeds: vSeeds,
      sizes: vSizes
    } = createVortexPoolAttributes(1500, vortexY);

    const vortexGeo = new THREE.BufferGeometry();
    vortexGeo.setAttribute('position', new THREE.BufferAttribute(vPos, 3));
    vortexGeo.setAttribute('aRadius', new THREE.BufferAttribute(vRad, 1));
    vortexGeo.setAttribute('aAngle', new THREE.BufferAttribute(vAng, 1));
    vortexGeo.setAttribute('aSeed', new THREE.BufferAttribute(vSeeds, 1));
    vortexGeo.setAttribute('aSize', new THREE.BufferAttribute(vSizes, 1));

    this.vortexMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uThemeMix: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: this.twinkleStarTex }
      },
      vertexShader: `
        attribute float aRadius;
        attribute float aAngle;
        attribute float aSeed;
        attribute float aSize;

        uniform float uTime;
        uniform float uEnergy;
        uniform float uPixelRatio;

        varying float vAlpha;
        varying float vCore;

        void main() {
          float spinSpeed = (1.15 / (0.35 + aRadius)) * (1.0 + uEnergy * 0.65);
          float angle = aAngle + uTime * spinSpeed;
          float r = aRadius * (1.0 + sin(uTime * 2.2 + aSeed * 12.0) * 0.04 + uEnergy * 0.08);

          vec3 pos = vec3(
            cos(angle) * r,
            position.y + sin(angle * 3.0 + uTime * 2.5) * 0.02,
            sin(angle) * r
          );

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (28.0 + uEnergy * 14.0) * uPixelRatio / max(1.0, -mvPosition.z);

          float radialFade = 1.0 - smoothstep(0.55, 1.48, r);
          vCore = 1.0 - smoothstep(0.15, 0.95, r);
          vAlpha = (0.38 + radialFade * 0.58) * (0.7 + 0.3 * sin(uTime * 3.0 + aSeed * 14.0));
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uThemeMix;
        varying float vAlpha;
        varying float vCore;

        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 outerCol = mix(vec3(0.22, 0.80, 1.0), vec3(0.98, 0.28, 0.54), uThemeMix);
          vec3 coreCol = mix(vec3(0.88, 0.97, 1.0), vec3(1.0, 0.88, 0.93), uThemeMix);
          vec3 col = mix(outerCol, coreCol, vCore);
          gl_FragColor = vec4(col * tex.rgb, tex.a * vAlpha);
        }
      `
    });
    this.vortexPoints = new THREE.Points(vortexGeo, this.vortexMaterial);
    this.heartGroup.add(this.vortexPoints);

    // 5) Spinning crescent energy rings inside the vortex pool
    const arcsGeo = createVortexArcsGeometry(vortexY);
    this.vortexArcsMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uThemeMix: { value: 0 }
      },
      vertexShader: `
        attribute float aProgress;
        attribute float aSpeed;
        uniform float uTime;
        varying float vProgress;
        void main() {
          vProgress = aProgress;
          float ang = uTime * aSpeed;
          float c = cos(ang);
          float s = sin(ang);
          vec3 pos = position;
          pos.xz = mat2(c, -s, s, c) * pos.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uEnergy;
        uniform float uThemeMix;
        varying float vProgress;
        void main() {
          float fade = sin(vProgress * 3.14159265);
          vec3 edgeCol = mix(vec3(0.25, 0.84, 1.0), vec3(0.98, 0.34, 0.58), uThemeMix);
          vec3 midCol = mix(vec3(0.92, 0.98, 1.0), vec3(1.0, 0.88, 0.94), uThemeMix);
          vec3 col = mix(edgeCol, midCol, fade);
          float alpha = fade * (0.45 + uEnergy * 0.45);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.vortexArcs = new THREE.LineSegments(arcsGeo, this.vortexArcsMaterial);
    this.heartGroup.add(this.vortexArcs);

    // 6) Upward sweeping fountain light streaks + leading sparks (video 00:01 -> 00:06)
    const { geometry: streakGeo, curves } = createFountainStreakCurves(46, heartScale, vortexY);
    this.fountainCurves = curves;

    this.fountainMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uStreamPhase: { value: 0 },
        uThemeMix: { value: 0 }
      },
      vertexShader: `
        attribute float aProgress;
        attribute float aSeed;
        varying float vProgress;
        varying float vSeed;
        void main() {
          vProgress = aProgress;
          vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uStreamPhase;
        uniform float uThemeMix;
        varying float vProgress;
        varying float vSeed;
        void main() {
          if (uStreamPhase <= 0.001) discard;
          float head = uStreamPhase * 1.28 - vSeed * 0.28;
          float tailStart = head - 0.34;
          if (vProgress > head || vProgress < tailStart) discard;

          float seg = smoothstep(tailStart, head, vProgress);
          float envelope = smoothstep(0.0, 0.14, uStreamPhase) * (1.0 - smoothstep(1.02, 1.35, uStreamPhase));
          vec3 tailCol = mix(vec3(0.30, 0.85, 1.0), vec3(0.98, 0.32, 0.56), uThemeMix);
          vec3 brightWhite = mix(vec3(0.92, 0.98, 1.0), vec3(1.0, 0.90, 0.95), uThemeMix);
          vec3 col = mix(tailCol, brightWhite, seg);
          float alpha = pow(seg, 1.35) * 0.88 * envelope;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.fountainLines = new THREE.LineSegments(streakGeo, this.fountainMaterial);
    this.heartGroup.add(this.fountainLines);

    // Leading spark particles riding the curved fountain trails
    const sparkCount = curves.length * 3;
    const sparkPos = new Float32Array(sparkCount * 3);
    const sparkAlpha = new Float32Array(sparkCount);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sparkAlpha, 1));

    this.fountainSparksMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: this.highlightStarTex },
        uThemeMix: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
      },
      vertexShader: `
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (64.0 * aAlpha + 12.0) * uPixelRatio / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uThemeMix;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.02) discard;
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 sparkTint = mix(vec3(0.76, 0.95, 1.0), vec3(1.0, 0.78, 0.88), uThemeMix);
          gl_FragColor = vec4(sparkTint * tex.rgb, tex.a * vAlpha);
        }
      `
    });
    this.fountainSparks = new THREE.Points(sparkGeo, this.fountainSparksMat);
    this.fountainSparks.frustumCulled = false;
    this.heartGroup.add(this.fountainSparks);
  }

  _initStarfield() {
    // 1) Deep-space twinkling starfield universe
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);

    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#e0f2fe'),
      new THREE.Color('#fef08a'),
      new THREE.Color('#ddd6fe'),
      new THREE.Color('#bae6fd')
    ];

    for (let i = 0; i < count; i++) {
      const radius = 8.5 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      seeds[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.7 + Math.pow(Math.random(), 2.2) * 2.4;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.starfieldMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: this.twinkleStarTex }
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          float twinkle = 0.45 + 0.55 * sin(uTime * (1.2 + fract(aSeed * 7.3) * 2.4) + aSeed * 6.2831);
          vAlpha = 0.3 + 0.65 * twinkle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (34.0 + twinkle * 12.0) * uPixelRatio / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
        }
      `
    });

    this.starfield = new THREE.Points(starGeo, this.starfieldMaterial);
    this.scene.add(this.starfield);

    // 2) Cosmic 4-point diffraction highlight stars scattered around the heart
    const highlightCount = 46;
    const hPos = new Float32Array(highlightCount * 3);
    const hCol = new Float32Array(highlightCount * 3);
    const hSeed = new Float32Array(highlightCount);
    const hSize = new Float32Array(highlightCount);

    const flareColors = [
      new THREE.Color('#fffbeb'),
      new THREE.Color('#e0f2fe'),
      new THREE.Color('#bae6fd'),
      new THREE.Color('#ede9fe')
    ];

    for (let i = 0; i < highlightCount; i++) {
      const radius = 3.8 + Math.random() * 11.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      hPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      hPos[i * 3 + 1] = radius * Math.cos(phi);
      hPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const fc = flareColors[i % flareColors.length];
      hCol[i * 3] = fc.r;
      hCol[i * 3 + 1] = fc.g;
      hCol[i * 3 + 2] = fc.b;

      hSeed[i] = Math.random() * Math.PI * 2;
      hSize[i] = 1.1 + Math.pow(Math.random(), 2.0) * 2.2;
    }

    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3));
    hGeo.setAttribute('aColor', new THREE.BufferAttribute(hCol, 3));
    hGeo.setAttribute('aSeed', new THREE.BufferAttribute(hSeed, 1));
    hGeo.setAttribute('aSize', new THREE.BufferAttribute(hSize, 1));

    this.highlightStarsMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: this.highlightStarTex }
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          float pulse = 0.5 + 0.5 * sin(uTime * (1.4 + fract(aSeed * 3.1) * 1.8) + aSeed * 12.0);
          vAlpha = 0.55 + 0.45 * pulse;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (105.0 + pulse * 48.0) * uPixelRatio / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
        }
      `
    });

    this.highlightStars = new THREE.Points(hGeo, this.highlightStarsMaterial);
    this.scene.add(this.highlightStars);

    // 3) Signature Hero Cosmic Highlight Star near the heart constellation
    this.heroStarAnchor = new THREE.Vector3(1.85, 1.55, -0.75);
    this.heroStarGroup = new THREE.Group();
    this.heroStarGroup.position.copy(this.heroStarAnchor);
    this.scene.add(this.heroStarGroup);

    this.heroStarCoreMat = new THREE.SpriteMaterial({
      map: this.highlightStarTex,
      color: '#e0f7ff',
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.heroStarCore = new THREE.Sprite(this.heroStarCoreMat);
    this.heroStarCore.scale.setScalar(1.3);
    this.heroStarGroup.add(this.heroStarCore);

    this.heroStarHaloMat = new THREE.SpriteMaterial({
      map: this.highlightStarTex,
      color: '#c4b5fd',
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      rotation: Math.PI / 4
    });
    this.heroStarHalo = new THREE.Sprite(this.heroStarHaloMat);
    this.heroStarHalo.scale.setScalar(0.88);
    this.heroStarGroup.add(this.heroStarHalo);
  }

  _initBurstSystem() {
    const maxParticles = 180;
    const positions = new Float32Array(maxParticles * 3);
    const alphas = new Float32Array(maxParticles);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: this.miniHeartTex },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
      },
      vertexShader: `
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (62.0 * aAlpha + 16.0) * uPixelRatio / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.01) discard;
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
        }
      `
    });

    this.burstPoints = new THREE.Points(geo, mat);
    this.burstPoints.frustumCulled = false;
    this.scene.add(this.burstPoints);

    for (let i = 0; i < maxParticles; i++) {
      this.burstPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1
      });
    }
  }

  _initIdolCards() {
    this.cardsGroup = new THREE.Group();
    this.scene.add(this.cardsGroup);

    this.cardBackTex = createCardBackTexture();
    this.cardItems = [];
    this.cardHitMeshes = [];

    const cardGeo = new THREE.PlaneGeometry(0.68, 0.91);
    const backGeo = new THREE.PlaneGeometry(0.68, 0.91);
    backGeo.rotateY(Math.PI);

    const backMat = new THREE.MeshStandardMaterial({
      map: this.cardBackTex,
      roughness: 0.35,
      metalness: 0.25
    });

    const total = this.idols.length;

    this.idols.forEach((idol, index) => {
      const cardPivot = new THREE.Group();
      cardPivot.visible = false;
      cardPivot.scale.setScalar(0.001);

      const frontMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 1
      });

      const frontMesh = new THREE.Mesh(cardGeo, frontMat);
      frontMesh.userData = { idolIndex: index, cardPivot };

      const backMesh = new THREE.Mesh(backGeo, backMat);
      backMesh.position.z = -0.004;
      backMesh.userData = { idolIndex: index, cardPivot };

      cardPivot.add(frontMesh);
      cardPivot.add(backMesh);
      this.cardsGroup.add(cardPivot);

      this.cardHitMeshes.push(frontMesh, backMesh);

      const isInner = index < 6;
      const ringIndex = isInner ? index : index - 6;
      const ringCount = isInner ? 6 : total - 6;
      const baseAngle = (ringIndex / ringCount) * Math.PI * 2 + (isInner ? 0.25 : 0.0);
      const radius = isInner ? 2.25 : 3.0;
      const yOffset = isInner
        ? Math.sin(ringIndex * 2.1) * 0.42
        : Math.cos(ringIndex * 1.7) * 0.72;
      const tiltAngle = isInner ? 0.14 : -0.18;

      this.cardItems.push({
        idol,
        index,
        group: cardPivot,
        frontMat,
        baseAngle,
        radius,
        yOffset,
        tiltAngle,
        orbitSpeed: isInner ? 0.14 : -0.1,
        bobPhase: index * 0.85,
        customOffset: new THREE.Vector3(),
        isCustomPlaced: false,
        hoverLerp: 0
      });

      const img = new Image();
      img.onload = () => {
        if (this.isDisposed) return;
        const tex = createPhotocardTexture(idol, img);
        frontMat.map = tex;
        frontMat.needsUpdate = true;
      };
      img.src = idol.image;
    });
  }

  _initPostProcessing() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.52,
      0.62,
      0.72
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.82;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.75;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 11.5;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.7;
  }

  _bindEvents() {
    this._onResize = () => this.resize();
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onDblClick = () => this.resetView();

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('dblclick', this._onDblClick);
  }

  _updatePointerNDC(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickTarget() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.cardsRevealed) {
      const cardHits = this.raycaster.intersectObjects(this.cardHitMeshes, false);
      if (cardHits.length > 0) {
        return {
          type: 'card',
          idolIndex: cardHits[0].object.userData.idolIndex,
          cardPivot: cardHits[0].object.userData.cardPivot,
          point: cardHits[0].point
        };
      }
    }

    const heartHits = this.raycaster.intersectObject(this.heartMesh, false);
    if (heartHits.length > 0) {
      return {
        type: 'heart',
        point: heartHits[0].point
      };
    }

    return null;
  }

  _handlePointerDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') {
      return;
    }

    this.pointerDown = true;
    this.pointerId = e.pointerId;
    this.downPos = { x: e.clientX, y: e.clientY };
    this.downTime = performance.now();
    this.maxMoveDist = 0;

    this._updatePointerNDC(e);
    const hit = this._pickTarget();
    this.resetTween = null;

    if (this.mode === 'drag' && hit) {
      this.controls.enabled = false;
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);

      if (hit.type === 'heart') {
        this.dragTarget = 'heart';
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), this.heartGroup.position);
        const intersectPt = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPt)) {
          this.dragOffset.copy(this.heartGroup.position).sub(intersectPt);
          this.prevDragPos.copy(this.heartGroup.position);
        }
      } else if (hit.type === 'card') {
        const item = this.cardItems[hit.idolIndex];
        this.dragTarget = item;
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), item.group.position);
        const intersectPt = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPt)) {
          this.dragOffset.copy(item.group.position).sub(intersectPt);
          this.prevDragPos.copy(item.group.position);
        }
      }

      this.canvas.style.cursor = 'grabbing';
      this.onDragStateChange(true);
    } else if (this.mode === 'orbit') {
      this.canvas.style.cursor = 'grabbing';
    }
  }

  _handlePointerMove(e) {
    this._updatePointerNDC(e);

    if (this.pointerDown && e.pointerId === this.pointerId) {
      const dist = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      if (dist > this.maxMoveDist) this.maxMoveDist = dist;

      if (this.mode === 'drag' && this.dragTarget) {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersectPt = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPt)) {
          const nextPos = intersectPt.add(this.dragOffset);
          nextPos.x = THREE.MathUtils.clamp(nextPos.x, -4.2, 4.2);
          nextPos.y = THREE.MathUtils.clamp(nextPos.y, -2.6, 3.2);
          nextPos.z = THREE.MathUtils.clamp(nextPos.z, -3.5, 2.5);

          if (this.dragTarget === 'heart') {
            this.dragVelocity.copy(nextPos).sub(this.prevDragPos);
            this.prevDragPos.copy(nextPos);
            this.heartGroup.position.copy(nextPos);
          } else {
            const cardItem = this.dragTarget;
            cardItem.isCustomPlaced = true;
            const delta = nextPos.clone().sub(cardItem.group.position);
            cardItem.customOffset.add(delta);
            cardItem.group.position.copy(nextPos);
          }
        }
        return;
      }
    }

    if (!this.pointerDown) {
      const hit = this._pickTarget();
      this.isHoveringHeart = hit?.type === 'heart';
      this.hoveredCard = hit?.type === 'card' ? hit.idolIndex : null;

      if (hit) {
        this.canvas.style.cursor = this.mode === 'drag' ? 'grab' : 'pointer';
      } else {
        this.canvas.style.cursor = 'grab';
      }
    }
  }

  _handlePointerUp(e) {
    if (!this.pointerDown || e.pointerId !== this.pointerId) return;

    const elapsed = performance.now() - this.downTime;
    const isClick = this.maxMoveDist < 8 && elapsed < 450;

    if (this.dragTarget) {
      this.dragTarget = null;
      this.controls.enabled = true;
      this.onDragStateChange(false);
    }

    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.style.cursor =
      this.isHoveringHeart || this.hoveredCard !== null
        ? this.mode === 'drag'
          ? 'grab'
          : 'pointer'
        : 'grab';

    if (isClick) {
      this._updatePointerNDC(e);
      const hit = this._pickTarget();
      if (hit?.type === 'card') {
        this.triggerBurst(hit.point, 45);
        this.onCardClick(hit.idolIndex);
      } else if (hit?.type === 'heart') {
        this.triggerHeartCelebration(hit.point);
        this.onHeartClick();
      }
    }
  }

  triggerFountainWave() {
    this.waveActive = true;
    this.waveProgress = 0;
    this.idleSinceWave = 0;
  }

  triggerHeartCelebration(originPoint = null) {
    this.clickImpulse = 1.0;
    this.triggerFountainWave();

    const burstOrigin = originPoint
      ? originPoint.clone()
      : this.heartGroup.position.clone();
    this.triggerBurst(burstOrigin, 115);

    if (!this.cardsRevealed) {
      this.cardsRevealed = true;
      this.onCardsVisibilityChange(true);
    }
  }

  triggerBurst(origin, count = 90) {
    let spawned = 0;
    for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
      const p = this.burstPool[i];
      if (p.active) continue;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.85 + Math.random() * 0.85;
      p.pos.copy(origin);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1.4 + Math.random() * 2.8;

      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 0.5,
        Math.sin(phi) * Math.sin(theta) * speed
      );
      spawned++;
    }
  }

  setMode(mode) {
    this.mode = mode === 'drag' ? 'drag' : 'orbit';
    if (this.mode === 'drag') {
      this.controls.autoRotate = false;
    } else {
      this.controls.autoRotate = this.autoRotate;
    }
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
    if (this.mode === 'orbit') {
      this.controls.autoRotate = enabled;
    }
  }

  setHeartTheme(theme) {
    this.heartTheme = theme === 'pink' ? 'pink' : 'cyan';
    this.themeTarget = this.heartTheme === 'pink' ? 1 : 0;
    this.clickImpulse = Math.max(this.clickImpulse, 0.42);
  }

  toggle3DCards(forceState = null) {
    this.cardsRevealed = forceState !== null ? forceState : !this.cardsRevealed;
    this.onCardsVisibilityChange(this.cardsRevealed);
  }

  resetView() {
    const targetCamPos = this._getResponsiveCameraPos();
    this.resetTween = {
      startCam: this.camera.position.clone(),
      endCam: targetCamPos,
      startTarget: this.controls.target.clone(),
      endTarget: new THREE.Vector3(0, 0, 0),
      startHeart: this.heartGroup.position.clone(),
      endHeart: new THREE.Vector3(0, 0.15, 0),
      progress: 0
    };

    for (const item of this.cardItems) {
      item.isCustomPlaced = false;
      item.customOffset.set(0, 0, 0);
    }
    this.dragVelocity.set(0, 0, 0);
  }

  _getResponsiveCameraPos() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / Math.max(1, height);

    if (aspect < 0.65) {
      return new THREE.Vector3(0, 0.05, 7.2);
    } else if (aspect < 0.9) {
      return new THREE.Vector3(0, 0.05, 6.4);
    } else if (aspect < 1.25) {
      return new THREE.Vector3(0, 0.08, 5.75);
    }
    return new THREE.Vector3(0, 0.08, 5.25);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    if (aspect < 0.72) {
      this.camera.fov = 52;
    } else if (aspect < 1.15) {
      this.camera.fov = 47;
    } else {
      this.camera.fov = 43;
    }

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    if (!this.hasInitializedViewport) {
      this.hasInitializedViewport = true;
      this.camera.position.copy(this._getResponsiveCameraPos());
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);

    if (this.heartParticlesMaterial) {
      this.heartParticlesMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.vortexMaterial) {
      this.vortexMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.fountainSparksMat) {
      this.fountainSparksMat.uniforms.uPixelRatio.value = dpr;
    }
    if (this.starfieldMaterial) {
      this.starfieldMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.highlightStarsMaterial) {
      this.highlightStarsMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.heroStarGroup) {
      this.heroStarAnchor =
        aspect < 0.75
          ? new THREE.Vector3(1.18, 1.62, -0.75)
          : new THREE.Vector3(1.85, 1.55, -0.75);
      this.heroStarGroup.position.copy(this.heroStarAnchor);
    }
  }

  _updateHeartAndVortex(dt, elapsed) {
    // 1) Initial load assembly (particles spiral up from vortex to build complete heart)
    if (!this.introCompleted) {
      this.introProgress = Math.min(1, this.introProgress + dt / this.introDuration);
      if (this.introProgress >= 1) {
        this.introCompleted = true;
      }
    }
    const assembleEased = 0.5 - 0.5 * Math.cos(this.introProgress * Math.PI);

    // 2) Periodic video-inspired fountain eruption cycle
    if (this.waveActive) {
      this.waveProgress += dt / this.waveDuration;
      if (this.waveProgress >= 1.05) {
        this.waveActive = false;
        this.waveProgress = 0;
        this.idleSinceWave = 0;
      }
    } else if (this.introCompleted) {
      this.idleSinceWave += dt;
      if (this.idleSinceWave >= this.waveCooldown) {
        this.triggerFountainWave();
      }
    }

    const waveNorm = this.waveActive ? THREE.MathUtils.clamp(this.waveProgress, 0, 1) : 0;
    const waveEnergy = Math.sin(waveNorm * Math.PI);

    // Organic double-lub-dub heartbeat
    const beatWeight = this.introCompleted
      ? 1.0
      : THREE.MathUtils.smoothstep(this.introProgress, 0.72, 1.0);
    const cycle = (elapsed * 1.05) % 1.0;
    const beat1 = Math.exp(-Math.pow((cycle - 0.14) * 14.0, 2));
    const beat2 = Math.exp(-Math.pow((cycle - 0.30) * 16.0, 2)) * 0.65;
    const lubDub = (beat1 + beat2) * beatWeight;

    this.clickImpulse = Math.max(0, this.clickImpulse - dt * 1.45);
    this.hoverLerp = THREE.MathUtils.lerp(
      this.hoverLerp,
      this.isHoveringHeart ? 1 : 0,
      Math.min(1, dt * 8)
    );

    const dragBoost = this.dragTarget === 'heart' ? 0.06 : 0;
    const heartScale =
      1.0 + lubDub * 0.038 + this.clickImpulse * 0.11 + this.hoverLerp * 0.045 + dragBoost;

    this.themeMix = THREE.MathUtils.lerp(this.themeMix, this.themeTarget, Math.min(1, dt * 4.5));

    this.heartParticlesMaterial.uniforms.uTime.value = elapsed;
    this.heartParticlesMaterial.uniforms.uAssemble.value = assembleEased;
    this.heartParticlesMaterial.uniforms.uWave.value = waveNorm;
    this.heartParticlesMaterial.uniforms.uImpulse.value = this.clickImpulse;
    this.heartParticlesMaterial.uniforms.uHeartScale.value = heartScale;
    this.heartParticlesMaterial.uniforms.uThemeMix.value = this.themeMix;

    this.coreGlowMaterial.uniforms.uReveal.value = THREE.MathUtils.smoothstep(
      this.introProgress,
      0.35,
      1.0
    );
    this.coreGlowMaterial.uniforms.uPulse.value =
      lubDub * 0.4 + waveEnergy * 0.6 + this.clickImpulse;
    this.coreGlowMaterial.uniforms.uTime.value = elapsed;
    this.coreGlowMaterial.uniforms.uThemeMix.value = this.themeMix;
    this.coreGlowMesh.scale.setScalar(heartScale);

    // Vortex pool & crescent energy rings
    const totalEnergy = Math.min(1.5, waveEnergy * 0.9 + this.clickImpulse + (1 - assembleEased) * 0.7);
    this.vortexMaterial.uniforms.uTime.value = elapsed;
    this.vortexMaterial.uniforms.uEnergy.value = totalEnergy;
    this.vortexMaterial.uniforms.uThemeMix.value = this.themeMix;
    this.vortexArcsMaterial.uniforms.uTime.value = elapsed;
    this.vortexArcsMaterial.uniforms.uEnergy.value = totalEnergy;
    this.vortexArcsMaterial.uniforms.uThemeMix.value = this.themeMix;

    // Fountain light streaks & leading sparks
    const streamPhase = this.waveActive
      ? this.waveProgress * 1.35
      : !this.introCompleted
        ? this.introProgress * 1.35
        : 0;
    this.fountainMaterial.uniforms.uStreamPhase.value = streamPhase;
    this.fountainMaterial.uniforms.uThemeMix.value = this.themeMix;
    this.fountainSparksMat.uniforms.uThemeMix.value = this.themeMix;
    this._updateFountainSparks(streamPhase, elapsed);

    this.scene.background.lerpColors(this._bgCyan, this._bgPink, this.themeMix);
    this.scene.fog.color.copy(this.scene.background);
    this.innerLight.color.lerpColors(this._lightCyan, this._lightPink, this.themeMix);
    this.heroStarCoreMat.color.lerpColors(this._starCoreCyan, this._starCorePink, this.themeMix);
    this.heroStarHaloMat.color.lerpColors(this._starHaloCyan, this._starHaloPink, this.themeMix);

    this.innerLight.intensity = 2.4 + lubDub * 1.2 + waveEnergy * 2.4 + this.clickImpulse * 4.0;
    this.innerLight.position.copy(this.heartGroup.position);
    this.bloomPass.strength = 0.48 + waveEnergy * 0.22 + this.clickImpulse * 0.26;

    // Tactile inertia/tilt when dragged freely
    if (this.dragTarget === 'heart') {
      this.heartGroup.rotation.z = THREE.MathUtils.lerp(
        this.heartGroup.rotation.z,
        -this.dragVelocity.x * 1.4,
        dt * 10
      );
      this.heartGroup.rotation.x = THREE.MathUtils.lerp(
        this.heartGroup.rotation.x,
        this.dragVelocity.y * 1.4,
        dt * 10
      );
    } else {
      const targetRotY = Math.sin(elapsed * 0.48) * 0.16;
      const targetRotZ = Math.sin(elapsed * 0.35) * 0.03;
      this.heartGroup.rotation.x = THREE.MathUtils.lerp(this.heartGroup.rotation.x, 0, dt * 5);
      this.heartGroup.rotation.y = THREE.MathUtils.lerp(this.heartGroup.rotation.y, targetRotY, dt * 3);
      this.heartGroup.rotation.z = THREE.MathUtils.lerp(this.heartGroup.rotation.z, targetRotZ, dt * 4);
    }
  }

  _updateFountainSparks(streamPhase, elapsed) {
    const posAttr = this.fountainSparks.geometry.getAttribute('position');
    const alphaAttr = this.fountainSparks.geometry.getAttribute('aAlpha');

    if (streamPhase <= 0.005 || streamPhase >= 1.35) {
      for (let i = 0; i < alphaAttr.count; i++) {
        alphaAttr.setX(i, 0);
      }
      alphaAttr.needsUpdate = true;
      return;
    }

    const fadeEnv =
      THREE.MathUtils.smoothstep(streamPhase, 0.0, 0.14) *
      (1.0 - THREE.MathUtils.smoothstep(streamPhase, 1.02, 1.35));

    const numCurves = this.fountainCurves.length;
    for (let i = 0; i < alphaAttr.count; i++) {
      const curveObj = this.fountainCurves[i % numCurves];
      const subOffset = Math.floor(i / numCurves) * 0.09;
      const head = streamPhase * 1.28 - curveObj.seed * 0.28 - subOffset;

      if (head <= 0.01 || head >= 1.0) {
        alphaAttr.setX(i, 0);
        continue;
      }

      const pts = curveObj.points;
      const fIdx = head * (pts.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const frac = fIdx - i0;

      const x = THREE.MathUtils.lerp(pts[i0].x, pts[i1].x, frac);
      const y = THREE.MathUtils.lerp(pts[i0].y, pts[i1].y, frac);
      const z = THREE.MathUtils.lerp(pts[i0].z, pts[i1].z, frac);

      const jitter = 0.03 * Math.sin(elapsed * 14.0 + i * 2.1);
      posAttr.setXYZ(i, x + jitter, y, z - jitter);
      alphaAttr.setX(i, (1.0 - subOffset * 5.0) * fadeEnv);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  _updateBurstParticles(dt) {
    const posAttr = this.burstPoints.geometry.getAttribute('position');
    const alphaAttr = this.burstPoints.geometry.getAttribute('aAlpha');

    for (let i = 0; i < this.burstPool.length; i++) {
      const p = this.burstPool[i];
      if (!p.active) {
        alphaAttr.setX(i, 0);
        continue;
      }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        alphaAttr.setX(i, 0);
        continue;
      }

      p.vel.multiplyScalar(1 - dt * 1.3);
      p.vel.y += dt * 0.35;
      p.pos.addScaledVector(p.vel, dt);

      const t = p.life / p.maxLife;
      const alpha = Math.sin(t * Math.PI);
      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      alphaAttr.setX(i, alpha);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  _updateIdolCards(dt, elapsed) {
    const targetReveal = this.cardsRevealed ? 1 : 0;
    this.cardRevealProgress = THREE.MathUtils.lerp(
      this.cardRevealProgress,
      targetReveal,
      Math.min(1, dt * 4.5)
    );

    const aspect = this.camera.aspect || 1;
    const responsiveOrbitScale = aspect < 0.72 ? 0.78 : aspect < 1.1 ? 0.9 : 1.0;
    const responsiveCardScale = aspect < 0.72 ? 0.78 : 1.0;

    const heartPos = this.heartGroup.position;

    for (const item of this.cardItems) {
      if (this.cardRevealProgress < 0.015) {
        item.group.visible = false;
        continue;
      }

      item.group.visible = true;

      const angle = item.baseAngle + elapsed * item.orbitSpeed;
      const r = item.radius * responsiveOrbitScale * (0.2 + 0.8 * this.cardRevealProgress);
      const bob = Math.sin(elapsed * 1.4 + item.bobPhase) * 0.08;

      const ox = Math.cos(angle) * r;
      const oz = Math.sin(angle) * r * 0.82;
      const oy =
        item.yOffset * responsiveOrbitScale +
        Math.sin(angle) * item.tiltAngle * r +
        bob;

      if (this.dragTarget !== item) {
        const targetPos = new THREE.Vector3(
          heartPos.x + ox + item.customOffset.x,
          heartPos.y + oy + item.customOffset.y,
          heartPos.z + oz + item.customOffset.z
        );
        item.group.position.lerp(targetPos, Math.min(1, dt * 8));
      }

      item.group.lookAt(this.camera.position);

      const isHovered = this.hoveredCard === item.index;
      item.hoverLerp = THREE.MathUtils.lerp(
        item.hoverLerp,
        isHovered ? 1 : 0,
        Math.min(1, dt * 10)
      );
      const scale =
        this.cardRevealProgress *
        responsiveCardScale *
        (1 + item.hoverLerp * 0.14);
      item.group.scale.setScalar(Math.max(0.001, scale));
      item.frontMat.opacity = this.cardRevealProgress;
    }
  }

  _updateResetTween(dt) {
    if (!this.resetTween) return;
    this.resetTween.progress = Math.min(1, this.resetTween.progress + dt * 2.2);
    const t = 1 - Math.pow(1 - this.resetTween.progress, 3);

    this.camera.position.lerpVectors(this.resetTween.startCam, this.resetTween.endCam, t);
    this.controls.target.lerpVectors(this.resetTween.startTarget, this.resetTween.endTarget, t);
    this.heartGroup.position.lerpVectors(this.resetTween.startHeart, this.resetTween.endHeart, t);

    if (this.resetTween.progress >= 1) {
      this.resetTween = null;
    }
  }

  _updateStars(elapsed) {
    if (this.starfieldMaterial) {
      this.starfieldMaterial.uniforms.uTime.value = elapsed;
      this.starfield.rotation.y = elapsed * 0.012;
    }

    if (this.highlightStarsMaterial) {
      this.highlightStarsMaterial.uniforms.uTime.value = elapsed;
      this.highlightStars.rotation.y = elapsed * 0.018;
      this.highlightStars.rotation.x = Math.sin(elapsed * 0.08) * 0.04;
    }

    if (this.heroStarGroup && this.heroStarAnchor) {
      const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 2.1);
      this.heroStarGroup.position.set(
        this.heroStarAnchor.x + Math.sin(elapsed * 0.55) * 0.08,
        this.heroStarAnchor.y + Math.cos(elapsed * 0.72) * 0.09,
        this.heroStarAnchor.z
      );
      this.heroStarCore.scale.setScalar(1.22 + shimmer * 0.34);
      this.heroStarCoreMat.opacity = 0.84 + shimmer * 0.16;
      this.heroStarHalo.scale.setScalar(0.76 + shimmer * 0.24);
      this.heroStarHaloMat.rotation = elapsed * 0.22 + Math.PI / 4;
      this.heroStarHaloMat.opacity = 0.45 + shimmer * 0.25;
    }
  }

  _animate() {
    if (this.isDisposed) return;
    this.rafId = requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this._updateResetTween(dt);
    this._updateHeartAndVortex(dt, elapsed);
    this._updateBurstParticles(dt);
    this._updateIdolCards(dt, elapsed);
    this._updateStars(elapsed);

    this.controls.update();
    this.composer.render();
  }

  dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.rafId);

    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('dblclick', this._onDblClick);

    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.envRenderTarget) this.envRenderTarget.dispose();
  }
}
