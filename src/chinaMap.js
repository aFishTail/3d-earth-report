import * as THREE from 'three';
import { provinces, CHINA_CENTER } from './chinaGeo.js';

// Province color palette
const PROVINCE_COLORS = [
  '#1a5276', '#1b4f72', '#154360', '#1a3c5e', '#17394d',
  '#1c4966', '#163d55', '#1e5f8a', '#125270', '#1a4b6e',
  '#164a6a', '#1d567a', '#1b5e85', '#134965', '#1a4060',
  '#16435a', '#1e6b8f', '#174e6f', '#1a5575', '#155570',
  '#1c4860', '#1b5068', '#13536b', '#1e5a7e', '#164d65',
  '#1a4258', '#175d80', '#1b4565', '#1e5875', '#144a62',
  '#1c5570', '#195972',
];

const HOVER_COLOR = '#00d4ff';
const BORDER_COLOR = '#00a5cc';

/**
 * Project [lng, lat] to flat XZ plane coordinates for map display
 */
function projectToFlat(lng, lat, scale = 0.18) {
  const x = (lng - CHINA_CENTER[0]) * scale;
  const z = -(lat - CHINA_CENTER[1]) * scale;
  return [x, z];
}

/**
 * Create a 3D extruded shape from polygon coordinates
 */
function createProvinceShape(coords) {
  const shape = new THREE.Shape();
  const projected = coords.map(([lng, lat]) => projectToFlat(lng, lat));

  shape.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < projected.length; i++) {
    shape.lineTo(projected[i][0], projected[i][1]);
  }
  shape.lineTo(projected[0][0], projected[0][1]);

  return shape;
}

/**
 * Create border line for a province
 */
function createProvinceBorder(coords) {
  const points = coords.map(([lng, lat]) => {
    const [x, z] = projectToFlat(lng, lat);
    return new THREE.Vector3(x, 0.22, z);
  });
  // Close the loop
  points.push(points[0].clone());

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: BORDER_COLOR,
    transparent: true,
    opacity: 0.6,
  });
  return new THREE.Line(geometry, material);
}

/**
 * Create a text label sprite for a province
 */
function createLabel(name, center) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.font = 'bold 28px Microsoft YaHei, PingFang SC, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  const [x, z] = projectToFlat(center[0], center[1]);
  sprite.position.set(x, 0.55, z);
  sprite.scale.set(1.8, 0.45, 1);

  return sprite;
}

/**
 * Create the full 3D China map group
 */
export function createChinaMap(scene) {
  const chinaGroup = new THREE.Group();
  chinaGroup.visible = false;

  const provinceMeshes = [];
  const provinceData = [];

  provinces.forEach((prov, index) => {
    const shape = createProvinceShape(prov.coords);

    const extrudeSettings = {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Rotate so extrusion goes along Y axis
    geometry.rotateX(-Math.PI / 2);

    const color = PROVINCE_COLORS[index % PROVINCE_COLORS.length];
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.9,
      shininess: 30,
      emissive: new THREE.Color(color).multiplyScalar(0.15),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      type: 'province',
      name: prov.name,
      index,
      baseColor: color,
      data: prov.data,
    };

    // Border
    const border = createProvinceBorder(prov.coords);

    // Label
    const label = createLabel(prov.name, prov.center);

    chinaGroup.add(mesh);
    chinaGroup.add(border);
    chinaGroup.add(label);

    provinceMeshes.push(mesh);
    provinceData.push(prov);
  });

  // Add ambient-style base glow plane
  const planeGeo = new THREE.PlaneGeometry(20, 16);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x0a1628,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const basePlane = new THREE.Mesh(planeGeo, planeMat);
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -0.01;
  chinaGroup.add(basePlane);

  scene.add(chinaGroup);

  // Tooltip element
  const tooltip = document.getElementById('province-tooltip');

  let hoveredMesh = null;

  return {
    chinaGroup,
    provinceMeshes,

    show() {
      chinaGroup.visible = true;
      // Animate entrance
      chinaGroup.scale.set(0.01, 0.01, 0.01);
      chinaGroup.userData.animateIn = true;
      chinaGroup.userData.animProgress = 0;
    },

    hide() {
      chinaGroup.userData.animateOut = true;
      chinaGroup.userData.animProgress = 0;
    },

    /**
     * Handle hover highlighting
     */
    handleHover(intersects) {
      // Reset previous hover
      if (hoveredMesh) {
        hoveredMesh.material.color.set(hoveredMesh.userData.baseColor);
        hoveredMesh.material.emissive.set(
          new THREE.Color(hoveredMesh.userData.baseColor).multiplyScalar(0.15)
        );
        hoveredMesh.position.y = 0;
        hoveredMesh = null;
      }

      if (tooltip) tooltip.style.display = 'none';

      const hit = intersects.find(
        (i) => i.object.userData && i.object.userData.type === 'province'
      );

      if (hit) {
        hoveredMesh = hit.object;
        hoveredMesh.material.color.set(HOVER_COLOR);
        hoveredMesh.material.emissive.set(new THREE.Color(HOVER_COLOR).multiplyScalar(0.3));
        hoveredMesh.position.y = 0.15;

        if (tooltip) {
          const d = hoveredMesh.userData.data;
          tooltip.innerHTML = `
            <div class="tooltip-name">${hoveredMesh.userData.name}</div>
            <div class="tooltip-row">用户量: <span>${d.value.toLocaleString()}</span></div>
            <div class="tooltip-row">节点数: <span>${d.nodes}</span></div>
          `;
          tooltip.style.display = 'block';
        }
      }
    },

    /**
     * Update tooltip position to follow mouse cursor
     */
    updateTooltipPosition(mouseX, mouseY) {
      if (tooltip && tooltip.style.display === 'block') {
        tooltip.style.left = `${mouseX + 15}px`;
        tooltip.style.top = `${mouseY + 15}px`;
      }
    },

    update(delta) {
      if (!chinaGroup.visible) return;

      // Entrance animation
      if (chinaGroup.userData.animateIn) {
        chinaGroup.userData.animProgress += delta * 2.5;
        const t = Math.min(chinaGroup.userData.animProgress, 1);
        // Ease out elastic-like
        const eased = 1 - Math.pow(1 - t, 3);
        chinaGroup.scale.setScalar(eased);
        if (t >= 1) {
          chinaGroup.userData.animateIn = false;
          chinaGroup.scale.setScalar(1);
        }
      }

      // Exit animation
      if (chinaGroup.userData.animateOut) {
        chinaGroup.userData.animProgress += delta * 3;
        const t = Math.min(chinaGroup.userData.animProgress, 1);
        const eased = 1 - t;
        chinaGroup.scale.setScalar(eased);
        if (t >= 1) {
          chinaGroup.userData.animateOut = false;
          chinaGroup.visible = false;
          chinaGroup.scale.setScalar(1);
        }
      }
    },
  };
}
