import * as THREE from "three";
import { CHINA_BBOX } from "./chinaGeo.js";

/**
 * View states
 */
export const VIEW_GLOBE = "globe";
export const VIEW_CHINA = "china";

/**
 * Convert a 3D hit point on the earth sphere back to lat/lng
 */
function vector3ToLatLng(localPoint, radius) {
  const lat =
    90 -
    Math.acos(Math.max(-1, Math.min(1, localPoint.y / radius))) *
      (180 / Math.PI);
  const lng = Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI) - 180;
  // Normalize lng to [-180, 180]
  const normalizedLng = ((lng + 540) % 360) - 180;
  return { lat, lng: normalizedLng };
}

/**
 * Check if lat/lng falls within China's bounding box
 */
function isInChina(lat, lng) {
  return (
    lat >= CHINA_BBOX.minLat &&
    lat <= CHINA_BBOX.maxLat &&
    lng >= CHINA_BBOX.minLng &&
    lng <= CHINA_BBOX.maxLng
  );
}

/**
 * Smooth camera animation using lerp
 */
class CameraAnimation {
  constructor() {
    this.active = false;
    this.startPos = new THREE.Vector3();
    this.endPos = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.endTarget = new THREE.Vector3();
    this.progress = 0;
    this.duration = 1.5;
    this.onComplete = null;
  }

  start(camera, controls, targetPos, targetLookAt, duration, onComplete) {
    this.active = true;
    this.startPos.copy(camera.position);
    this.endPos.copy(targetPos);
    this.startTarget.copy(controls.target);
    this.endTarget.copy(targetLookAt);
    this.progress = 0;
    this.duration = duration || 1.5;
    this.onComplete = onComplete || null;
  }

  update(delta, camera, controls) {
    if (!this.active) return false;

    this.progress += delta / this.duration;
    const t = Math.min(this.progress, 1);
    // Ease in-out cubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(this.startPos, this.endPos, eased);
    controls.target.lerpVectors(this.startTarget, this.endTarget, eased);
    controls.update();

    if (t >= 1) {
      this.active = false;
      if (this.onComplete) this.onComplete();
      return false;
    }
    return true;
  }
}

/**
 * Interaction manager: handles click-to-drill-down and view switching
 */
export function createInteraction({
  camera,
  renderer,
  controls,
  scene,
  earth, // { earthGroup, earthMesh, cloudMesh, ... }
  atmosphere, // { atmosphereMesh, ... }
  flyLines, // { flyLineGroup, ... }
  chinaMap, // { chinaGroup, provinceMeshes, show(), hide(), ... }
}) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const cameraAnim = new CameraAnimation();
  let currentView = VIEW_GLOBE;
  let transitioning = false;
  let rawMouseX = 0;
  let rawMouseY = 0;

  // Saved globe camera state for returning
  const savedGlobeCamera = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
  };

  // China map view camera
  const chinaCameraPos = new THREE.Vector3(0, 14, 6);
  const chinaCameraTarget = new THREE.Vector3(0, 0, 0);

  const backBtn = document.getElementById("back-to-globe");

  // ---- Event Handlers ----

  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    rawMouseX = event.clientX;
    rawMouseY = event.clientY;

    if (currentView === VIEW_CHINA && !transitioning) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(chinaMap.provinceMeshes);
      chinaMap.handleHover(intersects);
      chinaMap.updateTooltipPosition(rawMouseX, rawMouseY);
    }
  }

  function onClick(event) {
    if (transitioning) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (currentView === VIEW_GLOBE) {
      handleGlobeClick();
    }
  }

  function handleGlobeClick() {
    raycaster.setFromCamera(mouse, camera);

    // Intersect the earth mesh (first child of earthGroup)
    const earthMesh = earth.earthMesh;
    const intersects = raycaster.intersectObject(earthMesh);

    if (intersects.length === 0) return;

    // Convert hit point to earth mesh's local space (not group, because mesh has its own rotation.y)
    const hitPoint = intersects[0].point.clone();
    const localPoint = earth.earthMesh.worldToLocal(hitPoint);
    const { lat, lng } = vector3ToLatLng(localPoint, 5);

    console.log(
      "Click lat/lng:",
      lat.toFixed(2),
      lng.toFixed(2),
      "isChina:",
      isInChina(lat, lng),
    );

    if (isInChina(lat, lng)) {
      transitionToChina();
    }
  }

  function transitionToChina() {
    transitioning = true;

    // Save current camera state
    savedGlobeCamera.position.copy(camera.position);
    savedGlobeCamera.target.copy(controls.target);

    // Animate camera to china view
    cameraAnim.start(
      camera,
      controls,
      chinaCameraPos,
      chinaCameraTarget,
      1.5,
      () => {
        // After camera arrives: hide globe, show china map
        earth.earthGroup.visible = false;
        atmosphere.atmosphereMesh.visible = false;
        flyLines.flyLineGroup.visible = false;

        // Add extra light for china map
        if (!scene.getObjectByName("chinaLight")) {
          const mapLight = new THREE.DirectionalLight(0xffffff, 1.5);
          mapLight.position.set(5, 10, 5);
          mapLight.name = "chinaLight";
          scene.add(mapLight);
          const mapAmbient = new THREE.AmbientLight(0x334466, 1.0);
          mapAmbient.name = "chinaAmbient";
          scene.add(mapAmbient);
        }

        chinaMap.show();
        currentView = VIEW_CHINA;
        transitioning = false;

        controls.minDistance = 5;
        controls.maxDistance = 25;
        controls.enableRotate = true;
        controls.maxPolarAngle = Math.PI / 2.2;

        if (backBtn) backBtn.classList.add("visible");
      },
    );
  }

  function transitionToGlobe() {
    if (transitioning || currentView !== VIEW_CHINA) return;
    transitioning = true;

    if (backBtn) backBtn.classList.remove("visible");

    chinaMap.hide();

    // Short delay for china map exit animation, then switch
    setTimeout(() => {
      // Remove extra lights
      const chinaLight = scene.getObjectByName("chinaLight");
      const chinaAmbient = scene.getObjectByName("chinaAmbient");
      if (chinaLight) scene.remove(chinaLight);
      if (chinaAmbient) scene.remove(chinaAmbient);

      earth.earthGroup.visible = true;
      atmosphere.atmosphereMesh.visible = true;
      flyLines.flyLineGroup.visible = true;

      controls.minDistance = 8;
      controls.maxDistance = 25;
      controls.maxPolarAngle = Math.PI;

      cameraAnim.start(
        camera,
        controls,
        savedGlobeCamera.position,
        savedGlobeCamera.target,
        1.5,
        () => {
          currentView = VIEW_GLOBE;
          transitioning = false;
        },
      );
    }, 400);
  }

  // ---- Bind events ----
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  renderer.domElement.addEventListener("click", onClick);

  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      transitionToGlobe();
    });
  }

  // Cursor style
  renderer.domElement.addEventListener("mousemove", () => {
    if (currentView === VIEW_GLOBE) {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(earth.earthMesh);
      if (hits.length > 0) {
        const hp = hits[0].point.clone();
        const lp = earth.earthMesh.worldToLocal(hp);
        const { lat, lng } = vector3ToLatLng(lp, 5);
        renderer.domElement.style.cursor = isInChina(lat, lng)
          ? "pointer"
          : "default";
      } else {
        renderer.domElement.style.cursor = "default";
      }
    } else if (currentView === VIEW_CHINA) {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(chinaMap.provinceMeshes);
      renderer.domElement.style.cursor =
        hits.length > 0 ? "pointer" : "default";
    }
  });

  return {
    get currentView() {
      return currentView;
    },
    get isTransitioning() {
      return transitioning;
    },
    transitionToGlobe,

    update(delta) {
      cameraAnim.update(delta, camera, controls);
    },
  };
}
