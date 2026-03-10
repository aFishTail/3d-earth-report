import * as THREE from "three";

/**
 * Create the atmospheric glow effect using a Fresnel shader
 */
export function createAtmosphere(scene) {
  const atmosphereGeometry = new THREE.SphereGeometry(5.4, 64, 64);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x4facfe) },
      viewVector: { value: new THREE.Vector3() },
      intensity: { value: 0.7 },
    },
    vertexShader: `
      uniform vec3 viewVector;

      varying float vIntensity;

      void main() {
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vNormel = normalize(normalMatrix * viewVector);
        vIntensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;

      varying float vIntensity;

      void main() {
        vec3 glow = glowColor * vIntensity * intensity;
        gl_FragColor = vec4(glow, vIntensity * 0.8);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  // Match earth group tilt
  atmosphereMesh.rotation.x = THREE.MathUtils.degToRad(15);

  scene.add(atmosphereMesh);

  return {
    atmosphereMesh,
    atmosphereMaterial,
    update(camera) {
      atmosphereMaterial.uniforms.viewVector.value = camera.position.clone();
    },
  };
}

/**
 * Create star field background
 */
export function createStarField(scene, loadingManager) {
  const loader = new THREE.TextureLoader(loadingManager);
  const starTexture = loader.load("/images/2k_stars_milky_way.jpg");
  starTexture.colorSpace = THREE.SRGBColorSpace;

  const starGeometry = new THREE.SphereGeometry(100, 64, 64);
  const starMaterial = new THREE.MeshBasicMaterial({
    map: starTexture,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const starMesh = new THREE.Mesh(starGeometry, starMaterial);
  scene.add(starMesh);

  // Additional particle stars for depth
  const particleCount = 2000;
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 50 + Math.random() * 40;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    sizes[i] = Math.random() * 1.5 + 0.5;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  particleGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  return { starMesh, particles };
}
