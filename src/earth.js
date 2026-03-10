import * as THREE from "three";

/**
 * Create the Earth group (earth sphere + cloud layer)
 */
export function createEarth(scene, loadingManager) {
  const loader = new THREE.TextureLoader(loadingManager);
  const earthGroup = new THREE.Group();

  // --- Earth sphere ---
  const earthGeometry = new THREE.SphereGeometry(5, 64, 64);

  const dayTexture = loader.load("/images/2k_earth_daymap.jpg");
  const nightTexture = loader.load("/images/2k_earth_nightmap.jpg");
  const cloudsTexture = loader.load("/images/2k_earth_clouds.jpg");

  // Improve texture quality
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;

  // Custom shader material for day/night transition
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      sunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        float dotNL = dot(normal, sunDirection);

        // Smooth transition between day and night
        float dayMix = smoothstep(-0.1, 0.3, dotNL);

        vec4 dayColor = texture2D(dayMap, vUv);
        vec4 nightColor = texture2D(nightMap, vUv);

        // Darken night side slightly, brighten city lights
        nightColor.rgb *= 1.4;

        // Day side lighting
        float diffuse = max(dotNL, 0.0);
        float ambient = 0.08;
        vec3 dayLit = dayColor.rgb * (diffuse * 0.9 + ambient);

        vec3 finalColor = mix(nightColor.rgb, dayLit, dayMix);

        // Subtle specular highlight on oceans (blue areas)
        vec3 viewDir = normalize(cameraPosition - vPosition);
        vec3 halfDir = normalize(sunDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 80.0);
        finalColor += vec3(0.4, 0.5, 0.6) * spec * dayMix * 0.3;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  earthGroup.add(earthMesh);

  // --- Cloud layer ---
  const cloudGeometry = new THREE.SphereGeometry(5.05, 64, 64);
  const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
  earthGroup.add(cloudMesh);

  // Tilt earth axis slightly
  earthGroup.rotation.x = THREE.MathUtils.degToRad(15);

  scene.add(earthGroup);

  return {
    earthGroup,
    earthMesh,
    cloudMesh,
    earthMaterial,
    update(delta) {
      // Slow earth rotation
      earthMesh.rotation.y += 0.05 * delta;
      // Clouds rotate independently (slightly faster)
      cloudMesh.rotation.y += 0.07 * delta;
    },
  };
}
