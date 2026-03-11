import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEarth } from "./earth.js";
import { createAtmosphere, createStarField } from "./atmosphere.js";
import { createFlyLines } from "./flylines.js";
import { createChinaMap } from "./chinaMap.js";
import { createInteraction, VIEW_GLOBE } from "./interaction.js";
import "./style.css";

// ============================================
// Scene Setup
// ============================================
const container = document.getElementById("canvas-container");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingBarFill = document.querySelector(".loading-bar-fill");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 2, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

// ============================================
// Loading Manager
// ============================================
const loadingManager = new THREE.LoadingManager();
let loadedItems = 0;
let totalItems = 0;

loadingManager.onStart = (_url, loaded, total) => {
  totalItems = total;
};

loadingManager.onProgress = (_url, loaded, total) => {
  loadedItems = loaded;
  totalItems = total;
  const progress = (loaded / total) * 100;
  loadingBarFill.style.width = `${progress}%`;
};

loadingManager.onLoad = () => {
  loadingBarFill.style.width = "100%";
  setTimeout(() => {
    loadingOverlay.classList.add("hidden");
  }, 500);
};

// ============================================
// Lights
// ============================================
const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x334466, 0.5);
scene.add(ambientLight);

// ============================================
// Create Objects
// ============================================
const earth = createEarth(scene, loadingManager);
const atmosphere = createAtmosphere(scene);
const starField = createStarField(scene, loadingManager);
const flyLines = createFlyLines(earth.earthGroup);
const chinaMap = createChinaMap(scene);

// ============================================
// Controls
// ============================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 25;
controls.autoRotate = false; // We handle rotation in earth.js
controls.rotateSpeed = 0.5;

// ============================================
// Interaction (click china to drill down)
// ============================================
const interaction = createInteraction({
  camera,
  renderer,
  controls,
  scene,
  earth,
  atmosphere,
  flyLines,
  chinaMap,
});

// ============================================
// Number counter animation
// ============================================
function animateCounters() {
  const counters = document.querySelectorAll(".card-value[data-target]");
  counters.forEach((counter) => {
    const target = parseInt(counter.dataset.target, 10);
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * eased);
      counter.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  });
}

// Start counters after loading
loadingManager.onLoad = () => {
  loadingBarFill.style.width = "100%";
  setTimeout(() => {
    loadingOverlay.classList.add("hidden");
    animateCounters();
  }, 500);
};

// ============================================
// Dashboard Clock
// ============================================
function updateClock() {
  const now = new Date();
  const str = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  document.getElementById("dashboard-time").textContent = str;
}
updateClock();
setInterval(updateClock, 1000);

// ============================================
// Resize
// ============================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================
// Animation Loop
// ============================================
const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();

  controls.update();
  interaction.update(delta);

  if (interaction.currentView === VIEW_GLOBE) {
    earth.update(delta);
    flyLines.update(delta);
  }

  atmosphere.update(camera);
  chinaMap.update(delta);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
