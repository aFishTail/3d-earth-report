import * as THREE from "three";

/**
 * Convert latitude/longitude (degrees) to 3D position on sphere
 */
function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Create a bezier curve arc between two points on the sphere
 */
function createArc(start, end, radius) {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const distance = start.distanceTo(end);
  // Lift the midpoint proportionally to distance
  const liftHeight = radius * 0.2 + distance * 0.35;
  mid.normalize().multiplyScalar(radius + liftHeight);

  // Two control points for smoother curve
  const ctrl1 = new THREE.Vector3().lerpVectors(start, mid, 0.5);
  ctrl1.normalize().multiplyScalar(radius + liftHeight * 0.6);

  const ctrl2 = new THREE.Vector3().lerpVectors(end, mid, 0.5);
  ctrl2.normalize().multiplyScalar(radius + liftHeight * 0.6);

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
}

/**
 * Shader material for a single fly line with animated glow trail
 */
function createFlyLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uTrailLength: { value: 0.25 },
      uOpacity: { value: 0.9 },
    },
    vertexShader: `
      attribute float aProgress;
      varying float vProgress;

      void main() {
        vProgress = aProgress;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uTrailLength;
      uniform float uOpacity;

      varying float vProgress;

      void main() {
        float head = fract(uTime);
        float dist = vProgress - head;

        // Wrap around
        if (dist < -0.5) dist += 1.0;
        if (dist > 0.5) dist -= 1.0;

        // Trail: only show behind the head
        float trail = 1.0 - smoothstep(0.0, uTrailLength, -dist);
        float fadeFront = smoothstep(-0.01, 0.0, dist); // don't show ahead

        float alpha = trail * (1.0 - fadeFront) * uOpacity;

        // Brighter at head
        float headGlow = smoothstep(uTrailLength * 0.8, 0.0, -dist);
        vec3 finalColor = uColor + vec3(0.3) * headGlow;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Create a glowing point sprite that moves along the curve
 */
function createGlowSprite(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.2, color);
  gradient.addColorStop(
    0.5,
    color.replace(")", ", 0.3)").replace("rgb", "rgba"),
  );
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.4, 0.4, 1);
  return sprite;
}

/**
 * Single fly line with animation
 */
class FlyLine {
  constructor(fromLatLng, toLatLng, color, earthRadius, delay) {
    this.delay = delay;
    this.speed = 0.3 + Math.random() * 0.15;

    const startPos = latLngToVector3(fromLatLng[0], fromLatLng[1], earthRadius);
    const endPos = latLngToVector3(toLatLng[0], toLatLng[1], earthRadius);

    this.curve = createArc(startPos, endPos, earthRadius);

    // Line geometry
    const pointCount = 120;
    const points = this.curve.getPoints(pointCount);
    const positions = [];
    const progresses = [];

    for (let i = 0; i <= pointCount; i++) {
      positions.push(points[i].x, points[i].y, points[i].z);
      progresses.push(i / pointCount);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "aProgress",
      new THREE.Float32BufferAttribute(progresses, 1),
    );

    this.material = createFlyLineMaterial(color);
    this.line = new THREE.Line(geometry, this.material);

    // Glow sprite
    const cssColor = `rgb(${(new THREE.Color(color).r * 255) | 0}, ${(new THREE.Color(color).g * 255) | 0}, ${(new THREE.Color(color).b * 255) | 0})`;
    this.sprite = createGlowSprite(cssColor);

    // Start/end point markers
    this.startMarker = this._createMarker(startPos, color, 0.12);
    this.endMarker = this._createMarker(endPos, color, 0.12);

    this.group = new THREE.Group();
    this.group.add(this.line);
    this.group.add(this.sprite);
    this.group.add(this.startMarker);
    this.group.add(this.endMarker);

    this.elapsed = -delay;
  }

  _createMarker(position, color, size) {
    const geo = new THREE.SphereGeometry(size, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    return mesh;
  }

  update(delta) {
    this.elapsed += delta;
    if (this.elapsed < 0) return;

    const t = (this.elapsed * this.speed) % 1.0;
    this.material.uniforms.uTime.value = t;

    // Move the glow sprite
    const pos = this.curve.getPointAt(t);
    this.sprite.position.copy(pos);

    // Pulse markers
    const pulse = 1 + Math.sin(this.elapsed * 4) * 0.2;
    this.startMarker.scale.setScalar(pulse);
    this.endMarker.scale.setScalar(pulse);
  }
}

/**
 * Manage all fly lines
 */
export function createFlyLines(earthGroup, earthRadius = 5) {
  const routes = [
    // from [lat, lng], to [lat, lng], color
    // { from: [39.9, 116.4], to: [40.7, -74.0], color: '#00d4ff' },    // Beijing → New York
    // { from: [39.9, 116.4], to: [51.5, -0.1], color: '#00d4ff' },     // Beijing → London
    // { from: [39.9, 116.4], to: [-33.9, 151.2], color: '#00e5a0' },   // Beijing → Sydney
    // { from: [35.7, 139.7], to: [48.9, 2.3], color: '#ff6b35' },      // Tokyo → Paris
    // { from: [35.7, 139.7], to: [37.8, -122.4], color: '#ff6b35' },   // Tokyo → San Francisco
    // { from: [1.3, 103.8], to: [55.8, 37.6], color: '#a855f7' },      // Singapore → Moscow
    // { from: [22.3, 114.2], to: [52.5, 13.4], color: '#00e5a0' },     // Hong Kong → Berlin
    // { from: [31.2, 121.5], to: [-23.5, -46.6], color: '#ffaa00' },   // Shanghai → São Paulo
    // { from: [28.6, 77.2], to: [34.1, -118.2], color: '#a855f7' },    // Delhi → Los Angeles
    // { from: [25.0, 55.3], to: [35.7, 139.7], color: '#ffaa00' },     // Dubai → Tokyo
    { from: [32.06, 118.8], to: [35.69, 51.39], color: "#ff4da6" }, // Nanjing → Tehran
    { from: [39.9, 116.4], to: [25.03, 121.57], color: "#00ffcc" }, // Beijing → Taipei
    { from: [38.91, -77.04], to: [35.69, 51.39], color: "#ffdd57" }, // Washington → Tehran
  ];

  const flyLineGroup = new THREE.Group();
  const flyLines = [];

  routes.forEach((route, i) => {
    const fl = new FlyLine(
      route.from,
      route.to,
      route.color,
      earthRadius,
      i * 0.6, // Stagger start times
    );
    flyLines.push(fl);
    flyLineGroup.add(fl.group);
  });

  // Match earth group's tilt
  flyLineGroup.rotation.x = earthGroup.rotation.x;
  earthGroup.parent.add(flyLineGroup);

  return {
    flyLineGroup,
    update(delta) {
      // Rotate alongside earth
      flyLineGroup.rotation.y = earthGroup.children[0].rotation.y;
      flyLines.forEach((fl) => fl.update(delta));
    },
  };
}
