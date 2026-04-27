import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#moon-canvas');
const siteName = document.querySelector('#site-name');
const siteType = document.querySelector('#site-type');
const siteDescription = document.querySelector('#site-description');
const altitudeReadout = document.querySelector('#altitude-readout');
const lodReadout = document.querySelector('#lod-readout');
const zoomSlider = document.querySelector('#zoom-slider');
const focusButton = document.querySelector('#focus-site');
const buttonRow = document.querySelector('#site-buttons');

const MOON_RADIUS = 60;
const MIN_ALTITUDE = 0.55;
const MAX_ALTITUDE = 170;
const NORMAL_UP = new THREE.Vector3(0, 1, 0);

const landingSites = [
  {
    name: 'Tranquility Base',
    type: 'Apollo 11 landing site',
    lat: 0.674,
    lon: 23.473,
    description:
      'Mare plain with subtle basalt ripples, small regolith craters, and low relief near the Eagle landing site.',
  },
  {
    name: 'Fra Mauro Highlands',
    type: 'Apollo 14 highland terrain',
    lat: -3.645,
    lon: -17.471,
    description:
      'Rougher ejecta blanket terrain with rolling elevation, angular rocks, and close-up surface relief.',
  },
  {
    name: 'Hadley Rille',
    type: 'Apollo 15 rille edge',
    lat: 26.132,
    lon: 3.634,
    description:
      'A dramatic mountain and rille setting with sharper relief and boulder fields at low altitude.',
  },
  {
    name: 'Taurus-Littrow',
    type: 'Apollo 17 valley',
    lat: 20.191,
    lon: 30.772,
    description:
      'Valley floor between high massifs, tuned for stronger procedural displacement while zoomed in.',
  },
];

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x03040b, 0.0015);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.03, 1200);

const moonGroup = new THREE.Group();
scene.add(moonGroup);

const sun = new THREE.DirectionalLight(0xffffff, 3.4);
sun.position.set(-120, 80, 180);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x4b5877, 0.22));

const orbitalTexture = makeMoonTexture(1536);
const moonMaterial = new THREE.MeshStandardMaterial({
  map: orbitalTexture,
  roughness: 0.96,
  metalness: 0,
  color: 0xd8d4cb,
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 192, 96), moonMaterial);
moonGroup.add(moon);

const starField = createStarField();
scene.add(starField);

const terrainRoot = new THREE.Group();
moonGroup.add(terrainRoot);
const siteMarkers = new THREE.Group();
moonGroup.add(siteMarkers);
const astronautMarker = createAstronautMarker();
terrainRoot.add(astronautMarker);

const terrainTiles = [];
const rockPool = [];
let selectedSiteIndex = 0;
let altitude = 72;
let targetAltitude = altitude;
let targetPoint = siteToVector(landingSites[selectedSiteIndex], MOON_RADIUS);
let cameraNormal = targetPoint.clone().normalize();
let currentLod = 'orbital';
let terrainOrigin = null;
let detailStamp = 0;

const pointer = {
  down: false,
  x: 0,
  y: 0,
};

initTerrain();
initRocks();
initScaleFigure();
initSiteUi();
selectSite(0);
updateTerrain(true);
animate();

window.addEventListener('resize', onResize);
canvas.addEventListener('wheel', onWheel, { passive: false });
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', () => {
  pointer.down = false;
});
zoomSlider.addEventListener('input', () => {
  targetAltitude = Number(zoomSlider.value);
});
focusButton.addEventListener('click', () => {
  targetAltitude = 2.2;
  zoomSlider.value = targetAltitude;
});

function initSiteUi() {
  landingSites.forEach((site, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-button';
    button.innerHTML = `<strong>${site.name}</strong><span>${site.type}</span>`;
    button.addEventListener('click', () => selectSite(index));
    buttonRow.append(button);
  });
}

function selectSite(index) {
  selectedSiteIndex = index;
  const site = landingSites[index];
  siteName.textContent = site.name;
  siteType.textContent = site.type;
  siteDescription.textContent = site.description;
  targetPoint = siteToVector(site, MOON_RADIUS);
  cameraNormal = targetPoint.clone().normalize();
  terrainOrigin = null;
  updateSiteButtons();
  buildMarkers();
  updateTerrain(true);
}

function updateSiteButtons() {
  [...buttonRow.children].forEach((button, index) => {
    button.classList.toggle('is-active', index === selectedSiteIndex);
  });
}

function buildMarkers() {
  siteMarkers.clear();
  landingSites.forEach((site, index) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(index === selectedSiteIndex ? 0.95 : 0.62, 18, 10),
      new THREE.MeshBasicMaterial({
        color: index === selectedSiteIndex ? 0x8fd5ff : 0xf9f4cc,
        transparent: true,
        opacity: index === selectedSiteIndex ? 1 : 0.76,
      }),
    );
    marker.position.copy(siteToVector(site, MOON_RADIUS + 0.65));
    siteMarkers.add(marker);
  });
}

function initTerrain() {
  const rings = [
    { size: 10, segments: 96, distance: 0, material: terrainMaterial(0.92) },
    { size: 22, segments: 86, distance: 11, material: terrainMaterial(0.78) },
    { size: 46, segments: 72, distance: 32, material: terrainMaterial(0.5) },
  ];

  rings.forEach((config, index) => {
    const geometry = new THREE.PlaneGeometry(config.size, config.size, config.segments, config.segments);
    geometry.rotateX(-Math.PI / 2);
    const tile = new THREE.Mesh(geometry, config.material);
    tile.userData = { ...config, index };
    tile.position.z = config.distance;
    tile.visible = false;
    tile.receiveShadow = true;
    terrainTiles.push(tile);
    terrainRoot.add(tile);
  });
}

function terrainMaterial(detailMix) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().lerpColors(new THREE.Color(0x77746d), new THREE.Color(0xc8c3b8), detailMix),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    flatShading: false,
  });
}

function createAstronautMarker() {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.82, metalness: 0.02 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1b2435, roughness: 0.42, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.46, 5, 10), suit);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), suit);
  const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), visor);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );

  body.position.y = 0.38;
  head.position.y = 0.78;
  visorMesh.position.set(0, 0.78, 0.13);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  group.add(shadow, body, head, visorMesh);
  group.scale.setScalar(0.55);
  group.visible = false;
  return group;
}

function initRocks() {
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a877f,
    roughness: 0.98,
    metalness: 0,
  });

  for (let i = 0; i < 180; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMaterial.clone());
    rock.visible = false;
    rockPool.push(rock);
    terrainRoot.add(rock);
  }
}

function createAstronautMarker() {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: 0xf2eee1,
    roughness: 0.86,
    metalness: 0,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x0b0d12,
    roughness: 0.35,
    metalness: 0.2,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 6, 12), suit);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), suit);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), visor);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 0.36 }),
  );

  body.position.y = 0.48;
  helmet.position.y = 0.88;
  face.position.set(0, 0.9, 0.12);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.4, 0.5, 1);

  group.add(body, helmet, face, shadow);
  group.scale.setScalar(0.52);
  group.visible = false;
  return group;
}

function updateTerrain(force = false) {
  const detailLod = getLod(altitude);
  const shouldShowTerrain = altitude < 19;
  currentLod = detailLod.label;
  lodReadout.textContent = currentLod;

  if (!shouldShowTerrain) {
    terrainTiles.forEach((tile) => {
      tile.visible = false;
    });
    rockPool.forEach((rock) => {
      rock.visible = false;
    });
    astronautMarker.visible = false;
    moon.visible = true;
    return;
  }

  moon.visible = altitude > 2.8;
  const site = landingSites[selectedSiteIndex];
  const surfaceNormal = targetPoint.clone().normalize();
  const basis = makeSurfaceBasis(surfaceNormal);
  const terrainCenter = targetPoint.clone().addScaledVector(surfaceNormal, 0.08);
  const originKey = `${selectedSiteIndex}:${detailLod.label}`;
  const astronautHeight = localHeight(-1.15, 2.15, site, detailLod.amplitude, detailStamp);
  astronautMarker.visible = altitude < 6;
  astronautMarker.position.set(-1.15, astronautHeight + 0.95, 2.15);

  if (!force && terrainOrigin === originKey) {
    orientTerrain(terrainCenter, surfaceNormal, basis);
    return;
  }

  terrainOrigin = originKey;
  detailStamp += 1;

  terrainTiles.forEach((tile) => {
    tile.visible = true;
    tile.geometry.dispose();
    const divisor = detailLod.tileDivisor + tile.userData.index * 0.35;
    const segments = Math.max(24, Math.round(tile.userData.segments / divisor));
    const geometry = new THREE.PlaneGeometry(tile.userData.size, tile.userData.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    applyTerrainDisplacement(geometry, site, tile.userData.size, detailLod.amplitude, detailStamp + tile.userData.index);
    tile.geometry = geometry;
    tile.position.z = tile.userData.distance;
  });

  orientTerrain(terrainCenter, surfaceNormal, basis);
  scatterRocks(site, detailLod);
}

function orientTerrain(terrainCenter, surfaceNormal, basis) {
  const matrix = new THREE.Matrix4().makeBasis(basis.tangent, surfaceNormal, basis.bitangent);
  terrainRoot.quaternion.setFromRotationMatrix(matrix);
  terrainRoot.position.copy(terrainCenter);
}

function applyTerrainDisplacement(geometry, site, size, amplitude, seed) {
  const position = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const distance = Math.hypot(x, z);
    const edgeFalloff = THREE.MathUtils.smoothstep(size * 0.52 - distance, -1.5, size * 0.18);
    const mare = site.name === 'Tranquility Base' ? 0.62 : 1;
    const height =
      fbm(x * 0.13 + seed, z * 0.13 - seed, 5) * amplitude * 0.58 * mare +
      fbm(x * 0.9 - seed, z * 0.9 + seed, 4) * amplitude * 0.1 +
      craterField(x, z, site, seed) * amplitude;
    const micro = fbm(x * 4.5 + 100, z * 4.5 - 60, 3) * 0.018;
    const y = (height + micro) * (1 - edgeFalloff);

    position.setY(i, y);

    const shade = THREE.MathUtils.clamp(0.52 + y * 0.58 + fbm(x * 2.1, z * 2.1, 2) * 0.18, 0.24, 0.92);
    color.setHSL(0.105, 0.1, shade);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  position.needsUpdate = true;
}

function craterField(x, z, site, seed) {
  let value = 0;
  const siteBias = site.name.length * 11.3;

  for (let i = 0; i < 18; i += 1) {
    const cx = (hash(seed + i * 19.91 + siteBias) - 0.5) * 42;
    const cz = (hash(seed + i * 29.47 - siteBias) - 0.5) * 42;
    const radius = 0.6 + hash(seed + i * 7.23) * 3.2;
    const d = Math.hypot(x - cx, z - cz);
    const bowl = -Math.exp(-(d * d) / (radius * radius * 0.85)) * 0.34;
    const rim = Math.exp(-((d - radius) * (d - radius)) / (radius * 0.22)) * 0.2;
    value += bowl + rim;
  }

  return value;
}

function scatterRocks(site, lod) {
  const count = altitude < 3.5 ? 170 : altitude < 8 ? 95 : 36;
  const spread = altitude < 4 ? 8.5 : 17;
  const seed = selectedSiteIndex * 123.45 + lod.amplitude * 19;

  rockPool.forEach((rock, index) => {
    if (index >= count) {
      rock.visible = false;
      return;
    }

    const angle = hash(seed + index * 3.1) * Math.PI * 2;
    const radius = Math.sqrt(hash(seed + index * 8.7)) * spread;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = localHeight(x, z, site, lod.amplitude, seed);
    const scale = 0.025 + hash(seed + index * 4.6) * (altitude < 3.5 ? 0.22 : 0.44);
    const local = new THREE.Vector3(x, height + 0.05, z);

    rock.visible = true;
    rock.position.copy(local);
    rock.scale.set(scale * (1.2 + hash(index) * 2.2), scale * (0.45 + hash(index + 2) * 1.2), scale);
    rock.rotation.set(hash(index + 9) * Math.PI, hash(index + 13) * Math.PI, hash(index + 17) * Math.PI);
    rock.material.color.setHSL(0.1, 0.08, 0.34 + hash(index + seed) * 0.22);
  });

  terrainRoot.position.copy(terrainCenter);
}

function localHeight(x, z, site, amplitude, seed) {
  return (
    fbm(x * 0.13 + seed, z * 0.13 - seed, 5) * amplitude * (site.name === 'Tranquility Base' ? 0.62 : 1) +
    craterField(x, z, site, seed) * amplitude
  );
}

function getLod(currentAltitude) {
  if (currentAltitude < 2.2) {
    return { label: 'surface micro LOD', amplitude: 1.15, tileDivisor: 0.66 };
  }
  if (currentAltitude < 5.5) {
    return { label: 'close terrain LOD', amplitude: 0.82, tileDivisor: 0.9 };
  }
  if (currentAltitude < 12) {
    return { label: 'approach LOD', amplitude: 0.54, tileDivisor: 1.35 };
  }
  return { label: 'orbital texture LOD', amplitude: 0.24, tileDivisor: 2.1 };
}

function animate() {
  requestAnimationFrame(animate);
  altitude += (targetAltitude - altitude) * 0.075;
  zoomSlider.value = altitude.toFixed(2);
  altitudeReadout.textContent = `${altitude.toFixed(1)} km`;

  updateCamera();
  updateTerrain();
  moonGroup.rotation.y += altitude > 35 ? 0.0009 : 0.00015;
  siteMarkers.visible = altitude > 8;
  renderer.render(scene, camera);
}

function updateCamera() {
  const selected = landingSites[selectedSiteIndex];
  const normal = siteToVector(selected, 1).normalize();
  cameraNormal.lerp(normal, 0.05).normalize();
  const surface = cameraNormal.clone().multiplyScalar(MOON_RADIUS);
  const basis = makeSurfaceBasis(cameraNormal);
  const lowAltitudeTilt = THREE.MathUtils.smoothstep(10 - altitude, 0, 10);
  const lateral = basis.bitangent.clone().multiplyScalar(lowAltitudeTilt * 2.7);
  const eye = surface
    .clone()
    .addScaledVector(cameraNormal, altitude)
    .addScaledVector(basis.tangent, lowAltitudeTilt * -3.8)
    .add(lateral);
  const lookAt = surface
    .clone()
    .addScaledVector(cameraNormal, altitude < 2.2 ? -0.2 : 0)
    .addScaledVector(basis.tangent, lowAltitudeTilt * 5.5);

  camera.position.copy(eye);
  camera.lookAt(lookAt);
  camera.near = altitude < 3 ? 0.015 : 0.05;
  camera.far = altitude > 80 ? 1200 : 260;
  camera.updateProjectionMatrix();
}

function onWheel(event) {
  event.preventDefault();
  targetAltitude = THREE.MathUtils.clamp(targetAltitude + event.deltaY * 0.035, MIN_ALTITUDE, MAX_ALTITUDE);
  zoomSlider.value = targetAltitude;
}

function onPointerDown(event) {
  pointer.down = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}

function onPointerMove(event) {
  if (!pointer.down || altitude < 16) {
    return;
  }

  const dx = event.clientX - pointer.x;
  moonGroup.rotation.y += dx * 0.003;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function siteToVector(site, radius) {
  const lat = THREE.MathUtils.degToRad(site.lat);
  const lon = THREE.MathUtils.degToRad(site.lon);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.sin(lon),
  );
}

function makeSurfaceBasis(normal) {
  const tangent = new THREE.Vector3().crossVectors(NORMAL_UP, normal);
  if (tangent.lengthSq() < 0.001) {
    tangent.set(1, 0, 0);
  }
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { tangent, bitangent };
}

function makeMoonTexture(size) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size / 2;
  const context = textureCanvas.getContext('2d');
  const image = context.createImageData(textureCanvas.width, textureCanvas.height);

  for (let y = 0; y < textureCanvas.height; y += 1) {
    for (let x = 0; x < textureCanvas.width; x += 1) {
      const nx = x / textureCanvas.width;
      const ny = y / textureCanvas.height;
      const maria =
        Math.max(0, 0.5 - Math.hypot(nx - 0.61, ny - 0.46)) * 1.8 +
        Math.max(0, 0.42 - Math.hypot(nx - 0.45, ny - 0.52)) * 1.2 +
        Math.max(0, 0.25 - Math.hypot(nx - 0.7, ny - 0.62)) * 1.6;
      const grain = fbm(nx * 19, ny * 10, 5) * 0.25 + fbm(nx * 80, ny * 40, 3) * 0.08;
      const shade = THREE.MathUtils.clamp(178 + grain * 70 - maria * 90, 72, 224);
      const index = (y * textureCanvas.width + x) * 4;
      image.data[index] = shade * 1.04;
      image.data[index + 1] = shade * 1.01;
      image.data[index + 2] = shade * 0.94;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  addTextureCraters(context, textureCanvas.width, textureCanvas.height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function addTextureCraters(context, width, height) {
  context.save();
  context.globalCompositeOperation = 'multiply';

  for (let i = 0; i < 540; i += 1) {
    const x = hash(i * 4.17) * width;
    const y = hash(i * 7.41) * height;
    const radius = 1.5 + Math.pow(hash(i * 2.31), 2.8) * 24;
    const gradient = context.createRadialGradient(x, y, radius * 0.18, x, y, radius);
    gradient.addColorStop(0, 'rgba(80, 80, 80, 0.4)');
    gradient.addColorStop(0.7, 'rgba(150, 150, 150, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function createAstronautMarker() {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.78 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1d2638, roughness: 0.35, metalness: 0.2 });
  const backpackMaterial = new THREE.MeshStandardMaterial({ color: 0xbab5aa, roughness: 0.88 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.48, 5, 12), suit);
  body.position.y = 0.5;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), suit);
  helmet.position.y = 0.94;
  const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), visor);
  visorMesh.position.set(0, 0.96, 0.125);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.12), backpackMaterial);
  backpack.position.set(0, 0.53, -0.15);
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.33, 4, 8), suit);
  leftLeg.position.set(-0.07, 0.17, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.07;

  group.add(body, helmet, visorMesh, backpack, leftLeg, rightLeg);
  group.scale.setScalar(0.72);
  group.visible = false;
  return group;
}

function createStarField() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];

  for (let i = 0; i < 1400; i += 1) {
    const radius = 440 + hash(i * 7) * 320;
    const theta = hash(i * 17) * Math.PI * 2;
    const phi = Math.acos(2 * hash(i * 23) - 1);
    vertices.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
    );
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
    }),
  );
}

function fbm(x, y, octaves) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.02;
  }

  return value / total - 0.5;
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, fx), THREE.MathUtils.lerp(c, d, fx), fy);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function hash2(x, y) {
  return hash(x * 127.1 + y * 311.7);
}

function hash(n) {
  return fract(Math.sin(n * 12.9898) * 43758.5453123);
}

function fract(n) {
  return n - Math.floor(n);
}
