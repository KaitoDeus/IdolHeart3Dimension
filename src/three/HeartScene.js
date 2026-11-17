import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  createTaubinHeartGeometry,
  createHeartAuraAttributes,
  createHeartDrawFilaments,
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

    // Heart pulse & first-load drawing animation state
    this.clickImpulse = 0;
    this.burstPool = [];
    this.introProgress = 0; // 0 -> 1 on initial page load
    this.introDuration = 3.4; // seconds to draw complete 3D heart
    this.introCompleted = false;
    this.introCleftBurstFired = false;

    this._initScene();
    this._initLightsAndEnv();
    this._initHeart();
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
    this.scene.background = new THREE.Color('#09030a');
    this.scene.fog = new THREE.FogExp2('#09030a', 0.032);

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 80);
    this.camera.position.set(0, 0.25, 5.1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initLightsAndEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.65;
    roomEnv.dispose();
    pmrem.dispose();

    const ambient = new THREE.AmbientLight('#ffdce8', 0.45);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#fff0f5', 2.4);
    keyLight.position.set(3.5, 4.5, 4.2);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#ff2e7a', 2.6);
    rimLight.position.set(-4.0, -1.8, -3.5);
    this.scene.add(rimLight);

    const violetFill = new THREE.DirectionalLight('#a855f7', 1.25);
    violetFill.position.set(-3.2, 3.0, 2.2);
    this.scene.add(violetFill);

    this.innerLight = new THREE.PointLight('#ff4d79', 3.5, 7.0, 1.6);
    this.innerLight.position.set(0, 0, 0.2);
    this.scene.add(this.innerLight);
  }

  _initHeart() {
    this.heartGroup = new THREE.Group();
    this.scene.add(this.heartGroup);

    const heartGeo = createTaubinHeartGeometry({
      detail: 22,
      scale: [1.15, 1.12, 1.2]
    });

    this.heartDrawUniforms = {
      uIntroDraw: { value: 0 },
      uIntroTime: { value: 0 }
    };

    this.heartMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e11d48'),
      emissive: new THREE.Color('#500724'),
      emissiveIntensity: 0.42,
      metalness: 0.06,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      iridescence: 0.45,
      iridescenceIOR: 1.32,
      sheen: 0.75,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color('#fda4af'),
      reflectivity: 0.95,
      side: THREE.DoubleSide
    });

    this.heartMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uIntroDraw = this.heartDrawUniforms.uIntroDraw;
      shader.uniforms.uIntroTime = this.heartDrawUniforms.uIntroTime;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vHeartLocalPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vHeartLocalPos = position;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uIntroDraw;
           uniform float uIntroTime;
           varying vec3 vHeartLocalPos;`
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           float heartNormY = clamp((vHeartLocalPos.y + 1.28) / 2.60, 0.0, 1.0);
           float heartAngle = atan(vHeartLocalPos.z, vHeartLocalPos.x);
           float swirlWave = 0.055 * sin(heartAngle * 3.0 + heartNormY * 6.0 - uIntroTime * 4.5);
           float revealThreshold = uIntroDraw * 1.18 - 0.09;
           float introFrontier = revealThreshold - (heartNormY + swirlWave);
           if (uIntroDraw < 0.999 && introFrontier < 0.0) {
             discard;
           }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           if (uIntroDraw < 0.999) {
             float edgeGlow = (1.0 - smoothstep(0.0, 0.11, introFrontier)) * step(0.0, introFrontier);
             float fadeOut = 1.0 - smoothstep(0.90, 1.0, uIntroDraw);
             vec3 drawSparkColor = mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.94, 0.76), edgeGlow);
             totalEmissiveRadiance += drawSparkColor * edgeGlow * 3.4 * fadeOut;
           }`
        );
    };

    this.heartMesh = new THREE.Mesh(heartGeo, this.heartMaterial);
    this.heartMesh.name = 'MainHeart';
    this.heartGroup.add(this.heartMesh);

    // Progressive wireframe constellation lattice leading ahead of solid crystal fill
    const veilGeo = createTaubinHeartGeometry({
      detail: 8,
      scale: [1.168, 1.138, 1.218]
    });
    this.veilMaterial = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uVeilDraw: { value: 0 },
        uOpacity: { value: 0.045 },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uVeilDraw;
        uniform float uOpacity;
        uniform float uTime;
        varying vec3 vLocalPos;
        void main() {
          float normY = clamp((vLocalPos.y + 1.28) / 2.60, 0.0, 1.0);
          float threshold = uVeilDraw * 1.18 - 0.08;
          if (uVeilDraw < 0.999 && normY > threshold) discard;

          float frontier = threshold - normY;
          float drawHighlight = (uVeilDraw < 0.999)
            ? (1.0 - smoothstep(0.0, 0.16, frontier)) * step(0.0, frontier) * 0.45
            : 0.0;
          vec3 col = mix(vec3(0.99, 0.64, 0.69), vec3(1.0, 0.92, 0.72), drawHighlight * 2.0);
          float alpha = uOpacity + drawHighlight * (1.0 - smoothstep(0.9, 1.0, uVeilDraw));
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.veilMesh = new THREE.Mesh(veilGeo, this.veilMaterial);
    this.heartGroup.add(this.veilMesh);

    // 3D sketch filaments & comet sparks that trace out the heart on first load
    const { geometry: sketchGeo, heroCurves } = createHeartDrawFilaments([1.15, 1.12, 1.2]);
    this.heroCurves = heroCurves;
    this.sketchMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uDrawProgress: { value: 0 },
        uFadeOut: { value: 1.0 }
      },
      vertexShader: `
        attribute float aProgress;
        attribute float aHero;
        varying float vProgress;
        varying float vHero;
        void main() {
          vProgress = aProgress;
          vHero = aHero;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDrawProgress;
        uniform float uFadeOut;
        varying float vProgress;
        varying float vHero;
        void main() {
          if (vProgress > uDrawProgress || uFadeOut <= 0.005) discard;
          float dist = uDrawProgress - vProgress;
          float headGlow = 1.0 - smoothstep(0.0, 0.11, dist);
          float trail = 1.0 - smoothstep(0.0, 0.55, dist);
          vec3 col = mix(vec3(1.0, 0.36, 0.62), vec3(1.0, 0.94, 0.78), headGlow);
          float baseLine = vHero > 0.5 ? 0.24 : 0.08;
          float alpha = (baseLine + trail * 0.55 + headGlow * 0.95) * uFadeOut;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.sketchLines = new THREE.LineSegments(sketchGeo, this.sketchMaterial);
    this.heartGroup.add(this.sketchLines);

    // Leading starlight sparks riding the left & right heart outline curves
    this.highlightStarTex = createCosmicHighlightStarTexture();
    this.heroSparks = heroCurves.map(() => {
      const mat = new THREE.SpriteMaterial({
        map: this.highlightStarTex,
        color: '#fff4d6',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.52);
      this.heartGroup.add(sprite);
      return sprite;
    });

    // Luminous particle aura around the heart
    const { positions, seeds, sizes } = createHeartAuraAttributes(1450, [1.2, 1.17, 1.24]);
    const auraGeo = new THREE.BufferGeometry();
    auraGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    auraGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    auraGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.glowTex = createGlowSpriteTexture();
    this.auraMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uImpulse: { value: 0 },
        uAuraReveal: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uMap: { value: this.glowTex }
      },
      vertexShader: `
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uImpulse;
        uniform float uAuraReveal;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vWarmth;
        void main() {
          vec3 pos = position;
          float normY = clamp((pos.y + 1.35) / 2.75, 0.0, 1.0);
          float revealed = smoothstep(normY - 0.06, normY + 0.08, uAuraReveal * 1.12);

          float wave = sin(uTime * 1.8 + aSeed * 6.2831);
          float expand = 1.0 + wave * 0.025 + uImpulse * 0.22 * (0.4 + 0.6 * fract(aSeed));
          pos *= expand;
          pos.y += sin(uTime * 1.1 + aSeed * 10.0) * 0.035;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (28.0 + uImpulse * 16.0) * uPixelRatio / max(1.0, -mvPosition.z);
          vAlpha = (0.35 + 0.45 * (0.5 + 0.5 * sin(uTime * 2.4 + aSeed * 12.0))) * revealed;
          vWarmth = fract(aSeed * 3.7);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vWarmth;
        void main() {
          if (vAlpha <= 0.01) discard;
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 rose = vec3(1.0, 0.42, 0.62);
          vec3 gold = vec3(1.0, 0.84, 0.66);
          vec3 col = mix(rose, gold, vWarmth);
          gl_FragColor = vec4(col, tex.a * vAlpha);
        }
      `
    });

    this.auraPoints = new THREE.Points(auraGeo, this.auraMaterial);
    this.heartGroup.add(this.auraPoints);
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
      new THREE.Color('#fbcfe8'),
      new THREE.Color('#ddd6fe')
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

    this.twinkleStarTex = createTwinkleStarTexture();
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
      new THREE.Color('#fde68a'),
      new THREE.Color('#ffe4e6')
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
    this.heroStarAnchor = new THREE.Vector3(1.82, 1.42, -0.75);
    this.heroStarGroup = new THREE.Group();
    this.heroStarGroup.position.copy(this.heroStarAnchor);
    this.scene.add(this.heroStarGroup);

    this.heroStarCoreMat = new THREE.SpriteMaterial({
      map: this.highlightStarTex,
      color: '#fff7dc',
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.heroStarCore = new THREE.Sprite(this.heroStarCoreMat);
    this.heroStarCore.scale.setScalar(1.28);
    this.heroStarGroup.add(this.heroStarCore);

    this.heroStarHaloMat = new THREE.SpriteMaterial({
      map: this.highlightStarTex,
      color: '#fda4af',
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      rotation: Math.PI / 4
    });
    this.heroStarHalo = new THREE.Sprite(this.heroStarHaloMat);
    this.heroStarHalo.scale.setScalar(0.86);
    this.heroStarGroup.add(this.heroStarHalo);
  }

  _initBurstSystem() {
    this.miniHeartTex = createMiniHeartTexture();
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

      // Arrange in a balanced 2-ring orbital constellation around the heart
      const isInner = index < 6;
      const ringIndex = isInner ? index : index - 6;
      const ringCount = isInner ? 6 : total - 6;
      const baseAngle = (ringIndex / ringCount) * Math.PI * 2 + (isInner ? 0.25 : 0.0);
      const radius = isInner ? 2.15 : 2.9;
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

      // Async load local portrait into CanvasTexture
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
      0.34, // strength
      0.55, // radius
      0.84 // threshold
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
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 10.5;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.85;
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

    // Cancel reset tween if user starts interacting
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
          // Clamp comfortably within visible space
          nextPos.x = THREE.MathUtils.clamp(nextPos.x, -4.2, 4.2);
          nextPos.y = THREE.MathUtils.clamp(nextPos.y, -3.2, 3.2);
          nextPos.z = THREE.MathUtils.clamp(nextPos.z, -3.5, 2.5);

          if (this.dragTarget === 'heart') {
            this.dragVelocity.copy(nextPos).sub(this.prevDragPos);
            this.prevDragPos.copy(nextPos);
            this.heartGroup.position.copy(nextPos);
          } else {
            // Card drag: store offset relative to current orbit anchor
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

    // Hover feedback when not dragging
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
    this.canvas.style.cursor = this.isHoveringHeart || this.hoveredCard !== null
      ? (this.mode === 'drag' ? 'grab' : 'pointer')
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

  triggerHeartCelebration(originPoint = null) {
    this.clickImpulse = 1.0;
    const burstOrigin = originPoint
      ? originPoint.clone()
      : this.heartGroup.position.clone();
    this.triggerBurst(burstOrigin, 110);

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
      endHeart: new THREE.Vector3(0, 0, 0),
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
      // Narrow mobile portrait
      return new THREE.Vector3(0, 0.2, 6.9);
    } else if (aspect < 0.9) {
      // Large mobile / narrow tablet portrait
      return new THREE.Vector3(0, 0.2, 6.1);
    } else if (aspect < 1.25) {
      // Tablet landscape / square
      return new THREE.Vector3(0, 0.22, 5.4);
    }
    // Desktop wide
    return new THREE.Vector3(0, 0.22, 4.95);
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

    // On initial load or orientation switch, ensure heart isn't cropped
    if (!this.hasInitializedViewport) {
      this.hasInitializedViewport = true;
      this.camera.position.copy(this._getResponsiveCameraPos());
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);

    if (this.auraMaterial) {
      this.auraMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.starfieldMaterial) {
      this.starfieldMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.highlightStarsMaterial) {
      this.highlightStarsMaterial.uniforms.uPixelRatio.value = dpr;
    }
    if (this.heroStarGroup) {
      this.heroStarAnchor = aspect < 0.75
        ? new THREE.Vector3(1.18, 1.56, -0.75)
        : new THREE.Vector3(1.82, 1.42, -0.75);
      this.heroStarGroup.position.copy(this.heroStarAnchor);
    }
  }

  _updateIntro(dt, elapsed) {
    if (this.introCompleted) return;

    this.introProgress = Math.min(1, this.introProgress + dt / this.introDuration);
    const p = this.introProgress;
    // Smooth easeInOutSine
    const eased = 0.5 - 0.5 * Math.cos(p * Math.PI);

    const sketchDraw = THREE.MathUtils.clamp(eased / 0.80, 0, 1);
    const sketchFade = 1.0 - THREE.MathUtils.smoothstep(eased, 0.78, 1.0);
    const veilDraw = THREE.MathUtils.smoothstep(eased, 0.06, 0.84);
    const solidDraw = THREE.MathUtils.smoothstep(eased, 0.16, 0.96);
    const auraReveal = THREE.MathUtils.smoothstep(eased, 0.20, 0.98);

    this.heartDrawUniforms.uIntroDraw.value = solidDraw;
    this.heartDrawUniforms.uIntroTime.value = elapsed;

    this.veilMaterial.uniforms.uVeilDraw.value = veilDraw;
    this.veilMaterial.uniforms.uTime.value = elapsed;

    this.sketchMaterial.uniforms.uDrawProgress.value = sketchDraw;
    this.sketchMaterial.uniforms.uFadeOut.value = sketchFade;

    this.auraMaterial.uniforms.uAuraReveal.value = auraReveal;

    // Advance racing starlight comet sparks along left & right hero silhouette curves
    for (let i = 0; i < this.heroSparks.length; i++) {
      const pts = this.heroCurves[i];
      const spark = this.heroSparks[i];
      const fIdx = sketchDraw * (pts.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const frac = fIdx - i0;

      spark.position.lerpVectors(pts[i0], pts[i1], frac).multiplyScalar(this.heartMesh.scale.x);
      const sparkPulse = 0.42 + 0.16 * Math.sin(elapsed * 16 + i);
      const sparkScale = sparkPulse * sketchFade;
      spark.scale.setScalar(Math.max(0.001, sparkScale));
      spark.material.opacity = sketchFade;
      spark.material.rotation = elapsed * 2.4 * (i === 0 ? 1 : -1);
    }

    // Celebratory sparkle flash when the two strokes converge at the top cleft
    if (!this.introCleftBurstFired && sketchDraw >= 0.985) {
      this.introCleftBurstFired = true;
      this.clickImpulse = 0.48;
      const cleftWorld = new THREE.Vector3(0, 0.95, 0).applyMatrix4(this.heartGroup.matrixWorld);
      this.triggerBurst(cleftWorld, 65);
    }

    if (this.introProgress >= 1.0) {
      this.introCompleted = true;
      this.heartDrawUniforms.uIntroDraw.value = 1.0;
      this.veilMaterial.uniforms.uVeilDraw.value = 1.0;
      this.auraMaterial.uniforms.uAuraReveal.value = 1.0;
      this.heartMaterial.side = THREE.FrontSide;
      this.sketchLines.visible = false;
      for (const spark of this.heroSparks) {
        spark.visible = false;
      }
    }
  }

  _updateHeart(dt, elapsed) {
    // Organic double-lub-dub heartbeat (ramps in smoothly once heart completes drawing)
    const beatWeight = this.introCompleted
      ? 1.0
      : THREE.MathUtils.smoothstep(this.introProgress, 0.72, 1.0);
    const cycle = (elapsed * 1.12) % 1.0;
    const beat1 = Math.exp(-Math.pow((cycle - 0.14) * 14.0, 2));
    const beat2 = Math.exp(-Math.pow((cycle - 0.30) * 16.0, 2)) * 0.65;
    const lubDub = (beat1 + beat2) * beatWeight;

    this.clickImpulse = Math.max(0, this.clickImpulse - dt * 1.45);

    const hoverBoost = this.isHoveringHeart ? 0.045 : 0;
    const dragBoost = this.dragTarget === 'heart' ? 0.06 : 0;
    const targetScale = 1.0 + lubDub * 0.042 + this.clickImpulse * 0.14 + hoverBoost + dragBoost;

    const currentScale = this.heartMesh.scale.x;
    const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, Math.min(1, dt * 14));
    this.heartMesh.scale.setScalar(nextScale);
    this.veilMesh.scale.setScalar(nextScale * 1.006);
    if (this.sketchLines.visible) {
      this.sketchLines.scale.setScalar(nextScale);
    }

    // Subtle emissive & inner light pulse
    this.heartMaterial.emissiveIntensity =
      0.38 + lubDub * 0.25 + this.clickImpulse * 0.8 + (this.isHoveringHeart ? 0.16 : 0);
    this.veilMaterial.uniforms.uOpacity.value =
      0.038 + lubDub * 0.035 + this.clickImpulse * 0.14;
    this.innerLight.intensity =
      (2.4 + 0.9 * this.introProgress) + lubDub * 1.6 + this.clickImpulse * 5.0;
    this.innerLight.position.copy(this.heartGroup.position);
    this.bloomPass.strength = 0.34 + this.clickImpulse * 0.28 + (1.0 - this.introProgress) * 0.14;

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
      // Gentle floating sway
      const targetRotY = Math.sin(elapsed * 0.55) * 0.14;
      const targetRotZ = Math.sin(elapsed * 0.4) * 0.04;
      this.heartGroup.rotation.x = THREE.MathUtils.lerp(this.heartGroup.rotation.x, 0, dt * 5);
      this.heartGroup.rotation.y = THREE.MathUtils.lerp(this.heartGroup.rotation.y, targetRotY, dt * 3);
      this.heartGroup.rotation.z = THREE.MathUtils.lerp(this.heartGroup.rotation.z, targetRotZ, dt * 4);
    }

    this.auraMaterial.uniforms.uTime.value = elapsed;
    this.auraMaterial.uniforms.uImpulse.value = this.clickImpulse + lubDub * 0.22;
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
      p.vel.y += dt * 0.35; // gently float up
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
    const responsiveOrbitScale = aspect < 0.72 ? 0.76 : aspect < 1.1 ? 0.88 : 1.0;
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

      // Face camera smoothly while maintaining subtle perspective tilt
      item.group.lookAt(this.camera.position);

      const isHovered = this.hoveredCard === item.index;
      item.hoverLerp = THREE.MathUtils.lerp(item.hoverLerp, isHovered ? 1 : 0, Math.min(1, dt * 10));
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
    const t = 1 - Math.pow(1 - this.resetTween.progress, 3); // easeOutCubic

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
      this.heroStarCore.scale.setScalar(1.18 + shimmer * 0.34);
      this.heroStarCoreMat.opacity = 0.82 + shimmer * 0.18;
      this.heroStarHalo.scale.setScalar(0.74 + shimmer * 0.24);
      this.heroStarHaloMat.rotation = elapsed * 0.22 + Math.PI / 4;
      this.heroStarHaloMat.opacity = 0.42 + shimmer * 0.26;
    }
  }

  _animate() {
    if (this.isDisposed) return;
    this.rafId = requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this._updateIntro(dt, elapsed);
    this._updateResetTween(dt);
    this._updateHeart(dt, elapsed);
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
