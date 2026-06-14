/* ============================================================================
 * collision_viz.js — 3D collision vector-equation visualization modal
 * ----------------------------------------------------------------------------
 * Renders a popup window with an interactive Three.js scene that illustrates a
 * single source point's collision with one or more wave surfaces. It draws the
 * incoming velocity vector (v), each wave's outward normal (n) and impulse
 * (Δv), the summed impulse (ΣΔv) and the resulting velocity vector (v'),
 * together with on-screen value labels and an explanatory legend.
 *
 * Depends on the global THREE object already loaded by the host page.
 * Public API: CollisionViz.open(collisionData, sourceLabel)
 * ==========================================================================*/
(function (global) {
    'use strict';

    // Color palette for the different vector roles.
    const COLORS = {
        velBefore: 0x38bdf8, // light blue — velocity before collision
        velAfter:  0x22c55e, // green       — velocity after collision
        normal:    0xf59e0b, // amber       — wave normal n
        dv:        0xef4444, // red         — per-wave impulse Δv
        sumDv:     0xa855f7, // purple      — summed impulse ΣΔv
        source:    0xff3b3b, // source point
        grid:      0x334155,
        axis:      0x64748b
    };

    // Internal renderer state, recreated each time the modal is opened.
    let overlay = null;
    let scene = null, camera = null, renderer = null;
    let animationId = null;
    let labelSprites = [];          // {sprite, world:THREE.Vector3}
    let labelLayer = null;          // DOM layer holding HTML labels
    let canvasWrap = null;          // DOM element wrapping the WebGL canvas
    let rotX = 0.5, rotY = 0.7;     // orbit angles
    let camDist = 6;                // orbit distance
    let isDragging = false, lastX = 0, lastY = 0;
    let sceneGroup = null;          // rotated group containing all 3D content
    let vectorGroups = {};          // role -> THREE.Group holding that role's arrows
    let roleVisible = {};           // role -> bool (toggled via legend swatch clicks)

    function v3(o) { return new THREE.Vector3(o.x, o.y, o.z); }

    function fmt(n) { return (n >= 0 ? '+' : '') + n.toFixed(2); }
    function fmtVec(o) { return `(${fmt(o.x)}, ${fmt(o.y)}, ${fmt(o.z)})`; }

    // ---- Arrow helper: a colored shaft + cone head between two points ----
    function makeArrow(from, to, color, headSize) {
        const group = new THREE.Group();
        const dir = new THREE.Vector3().subVectors(to, from);
        const len = dir.length();
        if (len < 1e-6) return group;
        dir.normalize();

        const hSize = headSize || Math.min(0.18, len * 0.28);
        const shaftLen = Math.max(0.0001, len - hSize);

        // Shaft as a thin cylinder so it has visible thickness from all angles.
        const shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, shaftLen, 12);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const shaft = new THREE.Mesh(shaftGeo, mat);
        // Cylinder is centered & along +Y by default; move pivot to its base.
        shaft.position.y = shaftLen / 2;

        const headGeo = new THREE.ConeGeometry(0.05, hSize, 14);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = shaftLen + hSize / 2;

        const holder = new THREE.Group();
        holder.add(shaft);
        holder.add(head);

        // Orient +Y to dir, then translate to `from`.
        const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), dir
        );
        holder.quaternion.copy(quat);
        holder.position.copy(from);
        group.add(holder);
        return group;
    }

    // ---- A dashed line (used for vector-sum construction guides) ----
    function makeDashedLine(from, to, color) {
        const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
        const mat = new THREE.LineDashedMaterial({
            color: color, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.7
        });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        return line;
    }

    // ---- HTML label anchored to a 3D world position (projected each frame) ----
    // `role` ties the label to a vector group so it hides/shows with that group.
    function addLabel(text, worldPos, color, role) {
        const el = document.createElement('div');
        el.className = 'cviz-label';
        el.innerHTML = text;
        el.style.color = '#' + (color >>> 0).toString(16).padStart(6, '0');
        labelLayer.appendChild(el);
        labelSprites.push({ el: el, world: worldPos.clone(), role: role || null });
    }

    // ---- Get (creating if needed) the THREE.Group for a vector role ----
    function roleGroup(role) {
        if (!vectorGroups[role]) {
            const g = new THREE.Group();
            g.visible = (roleVisible[role] !== false);
            vectorGroups[role] = g;
            sceneGroup.add(g);
        }
        return vectorGroups[role];
    }

    // ---- Build the full 3D scene from collision data ----
    function buildScene(data) {
        sceneGroup = new THREE.Group();
        scene.add(sceneGroup);

        // Reference grid + light axes for spatial orientation.
        const grid = new THREE.GridHelper(6, 12, COLORS.grid, COLORS.grid);
        grid.material.opacity = 0.25;
        grid.material.transparent = true;
        sceneGroup.add(grid);

        const axes = new THREE.AxesHelper(1.4);
        sceneGroup.add(axes);

        const origin = new THREE.Vector3(0, 0, 0);

        // Source point at origin.
        const srcGeo = new THREE.SphereGeometry(0.07, 20, 20);
        const srcMat = new THREE.MeshBasicMaterial({ color: COLORS.source });
        const src = new THREE.Mesh(srcGeo, srcMat);
        sceneGroup.add(src);
        addLabel('Forráspont', origin, 0xffffff);

        // Velocity BEFORE collision (drawn from origin).
        const vBefore = v3(data.velBefore);
        if (vBefore.length() > 1e-4) {
            roleGroup('velBefore').add(makeArrow(origin, vBefore, COLORS.velBefore));
            addLabel(`v = ${fmtVec(data.velBefore)}<br>|v| = ${data.oldSpeed.toFixed(2)}`,
                vBefore, COLORS.velBefore, 'velBefore');
        }

        // Each contributing wave: outward normal n and impulse Δv.
        const waves = data.waves || [];
        waves.forEach((w, i) => {
            const n = v3(w.n);
            // Normal drawn at unit length from origin.
            roleGroup('normal').add(makeArrow(origin, n, COLORS.normal));
            addLabel(`n${waves.length > 1 ? (i + 1) : ''} = ${fmtVec(w.n)}<br>v·n = ${w.vr.toFixed(2)}`,
                n.clone().multiplyScalar(1.05), COLORS.normal, 'normal');

            // Per-wave impulse Δv = dv * n.
            const dvVec = v3(w.dvVec);
            if (dvVec.length() > 1e-4) {
                roleGroup('dv').add(makeArrow(origin, dvVec, COLORS.dv));
                addLabel(`Δv${waves.length > 1 ? (i + 1) : ''} = ${w.dv.toFixed(2)}·n`,
                    dvVec.clone().multiplyScalar(0.6), COLORS.dv, 'dv');
            }
        });

        // Summed impulse ΣΔv (only meaningful / distinct when >1 wave).
        const sumDv = v3(data.totalDv);
        if (sumDv.length() > 1e-4 && waves.length > 1) {
            roleGroup('sumDv').add(makeArrow(origin, sumDv, COLORS.sumDv));
            addLabel(`ΣΔv = ${fmtVec(data.totalDv)}<br>|Δv| = ${data.totalDvMag.toFixed(2)}`,
                sumDv.clone().multiplyScalar(1.1), COLORS.sumDv, 'sumDv');
        }

        // Resulting velocity v' = v + ΣΔv, shown with a dashed construction guide.
        const vAfter = v3(data.velAfter);
        if (vAfter.length() > 1e-4) {
            roleGroup('velAfter').add(makeArrow(origin, vAfter, COLORS.velAfter));
            addLabel(`v' = ${fmtVec(data.velAfter)}<br>|v'| = ${data.newSpeed.toFixed(2)}`,
                vAfter.clone().multiplyScalar(1.05), COLORS.velAfter, 'velAfter');
            // Construction guide: from tip of v to tip of v' (represents +ΣΔv).
            // Grouped with sumDv since it represents the +ΣΔv construction.
            if (vBefore.length() > 1e-4 && sumDv.length() > 1e-4) {
                roleGroup('sumDv').add(makeDashedLine(vBefore, vAfter, COLORS.sumDv));
            }
        }

        // Frame the camera distance to fit the largest vector.
        let maxR = 1.5;
        [vBefore, sumDv, vAfter].forEach(v => { maxR = Math.max(maxR, v.length()); });
        waves.forEach(w => { maxR = Math.max(maxR, v3(w.dvVec).length()); });
        camDist = Math.max(4, maxR * 2.6);
    }

    // ---- Per-frame projection of HTML labels onto the canvas ----
    function updateLabels() {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        labelSprites.forEach(item => {
            // Hide labels whose vector role has been toggled off via the legend.
            if (item.role && roleVisible[item.role] === false) {
                item.el.style.display = 'none';
                return;
            }
            const p = item.world.clone();
            // Apply the same rotation the sceneGroup uses.
            p.applyEuler(sceneGroup.rotation);
            p.project(camera);
            const x = (p.x * 0.5 + 0.5) * w;
            const y = (-p.y * 0.5 + 0.5) * h;
            const visible = p.z < 1;
            item.el.style.display = visible ? 'block' : 'none';
            item.el.style.left = x + 'px';
            item.el.style.top = y + 'px';
        });
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        if (sceneGroup) sceneGroup.rotation.set(rotX, rotY, 0);
        // Orbit camera position from spherical angles.
        camera.position.set(0, 0, camDist);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        updateLabels();
    }

    // ---- Mouse drag to orbit ----
    function onDown(e) { isDragging = true; lastX = e.clientX; lastY = e.clientY; }
    function onMove(e) {
        if (!isDragging) return;
        rotY += (e.clientX - lastX) * 0.01;
        rotX += (e.clientY - lastY) * 0.01;
        rotX = Math.max(-1.4, Math.min(1.4, rotX));
        lastX = e.clientX; lastY = e.clientY;
    }
    function onUp() { isDragging = false; }
    function onWheel(e) {
        e.preventDefault();
        camDist *= (e.deltaY > 0 ? 1.1 : 0.9);
        camDist = Math.max(2.5, Math.min(20, camDist));
    }

    // ---- Build the equation summary HTML for the side panel ----
    function buildEquationHtml(data, label) {
        const waves = data.waves || [];
        let html = `<h3>${label} — ütközési számítás</h3>`;
        html += `<div class="cviz-eq-block">`;
        if (waves.length > 1) {
            html += `<div class="cviz-eq-row"><b>${waves.length} hullám</b> éri el egyszerre a forráspontot.</div>`;
        }
        waves.forEach((w, i) => {
            const idx = waves.length > 1 ? (i + 1) : '';
            html += `<div class="cviz-eq-row">`
                + `<span class="cviz-c-normal">n${idx}</span> = ${fmtVec(w.n)}<br>`
                + `v·n${idx} = ${w.vr.toFixed(2)}<br>`
                + `<span class="cviz-c-dv">Δv${idx}</span> = (1 − (${w.vr.toFixed(2)}))·n = ${w.dv.toFixed(2)}·n`
                + `</div>`;
        });
        html += `<div class="cviz-eq-row cviz-sum">`
            + `<span class="cviz-c-sumdv">ΣΔv</span> = ${fmtVec(data.totalDv)},  |Δv| = ${data.totalDvMag.toFixed(2)}<br>`
            + `<span class="cviz-c-vbefore">|v|</span>: ${data.oldSpeed.toFixed(2)} `
            + `&rarr; <span class="cviz-c-vafter">${data.newSpeed.toFixed(2)}</span>`
            + `</div>`;
        html += `</div>`;

        // Legend mapping colors to vector roles. Each item is a clickable toggle.
        html += `<div class="cviz-legend-title">Vektorok (kattints a ki/be kapcsoláshoz):</div>`;
        html += `<div class="cviz-legend">`
            + legendItem(COLORS.velBefore, 'v — sebesség ütközés előtt', 'velBefore')
            + legendItem(COLORS.normal,    'n — hullám normálvektora (kifelé)', 'normal')
            + legendItem(COLORS.dv,        'Δv — egy hullám lökése', 'dv')
            + (waves.length > 1 ? legendItem(COLORS.sumDv, 'ΣΔv — összesített lökés', 'sumDv') : '')
            + legendItem(COLORS.velAfter,  "v' — sebesség ütközés után", 'velAfter')
            + `</div>`;

        html += `<p class="cviz-hint">Húzd az egérrel a nézet forgatásához, görgővel zoomolj.</p>`;
        return html;
    }

    function legendItem(color, text, role) {
        const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
        return `<div class="cviz-legend-item" data-role="${role}" title="Kattints a ki/be kapcsoláshoz">`
            + `<span class="cviz-swatch" style="background:${hex}"></span>`
            + `<span class="cviz-legend-text">${text}</span></div>`;
    }

    // ---- Toggle a vector role's visibility (group meshes + labels + legend UI) ----
    function toggleRole(role) {
        const next = !(roleVisible[role] !== false); // current effective value -> invert
        roleVisible[role] = next;
        if (vectorGroups[role]) vectorGroups[role].visible = next;
        // Reflect state on the legend item.
        if (overlay) {
            const item = overlay.querySelector(`.cviz-legend-item[data-role="${role}"]`);
            if (item) item.classList.toggle('cviz-off', !next);
        }
    }

    // ---- Public: open the modal with the given collision data ----
    function open(data, label) {
        if (!data || !data.waves) return;
        if (typeof THREE === 'undefined') {
            console.warn('CollisionViz: THREE is not loaded.');
            return;
        }
        close(); // ensure only one modal at a time

        ensureStyles();

        // All vector roles start visible (same as before).
        roleVisible = { velBefore: true, normal: true, dv: true, sumDv: true, velAfter: true };
        vectorGroups = {};

        overlay = document.createElement('div');
        overlay.className = 'cviz-overlay';

        const modal = document.createElement('div');
        modal.className = 'cviz-modal';
        overlay.appendChild(modal);

        const header = document.createElement('div');
        header.className = 'cviz-header';
        header.innerHTML = `<span>Ütközés szemléltetése — ${label}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'cviz-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', close);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const body = document.createElement('div');
        body.className = 'cviz-body';
        modal.appendChild(body);

        // Left: 3D canvas + label overlay layer.
        canvasWrap = document.createElement('div');
        canvasWrap.className = 'cviz-canvas-wrap';
        body.appendChild(canvasWrap);

        labelLayer = document.createElement('div');
        labelLayer.className = 'cviz-label-layer';
        canvasWrap.appendChild(labelLayer);

        // Right: equation + legend panel.
        const side = document.createElement('div');
        side.className = 'cviz-side';
        side.innerHTML = buildEquationHtml(data, label);
        body.appendChild(side);

        // Clicking a legend item toggles its vector group on/off.
        side.addEventListener('click', function (e) {
            const item = e.target.closest('.cviz-legend-item');
            if (!item) return;
            const role = item.getAttribute('data-role');
            if (role) toggleRole(role);
        });

        document.body.appendChild(overlay);

        // Close on backdrop click or Escape.
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', onKeyDown);

        initRenderer(data);
    }

    function onKeyDown(e) { if (e.key === 'Escape') close(); }

    function initRenderer(data) {
        const w = canvasWrap.clientWidth;
        const h = canvasWrap.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1220);

        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        camera.position.set(0, 0, camDist);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(w, h);
        canvasWrap.insertBefore(renderer.domElement, labelLayer);

        labelSprites = [];
        buildScene(data);

        // Reset orbit defaults each open.
        rotX = 0.5; rotY = 0.7;

        renderer.domElement.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', onResize);

        animate();
    }

    function onResize() {
        if (!renderer || !canvasWrap) return;
        const w = canvasWrap.clientWidth;
        const h = canvasWrap.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function close() {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', onKeyDown);
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null; camera = null; sceneGroup = null; labelSprites = [];
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; labelLayer = null; canvasWrap = null;
    }

    // ---- Inject CSS once ----
    let stylesInjected = false;
    function ensureStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const css = `
.cviz-overlay{position:fixed;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(3px);
  z-index:10000;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;}
.cviz-modal{width:min(1100px,92vw);height:min(720px,88vh);background:#0f172a;border:1px solid #1e293b;
  border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden;}
.cviz-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
  background:#111c33;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:16px;font-weight:600;}
.cviz-close{background:transparent;border:none;color:#94a3b8;font-size:26px;line-height:1;cursor:pointer;
  width:34px;height:34px;border-radius:8px;transition:all .15s;}
.cviz-close:hover{background:#1e293b;color:#f8fafc;}
.cviz-body{flex:1;display:flex;min-height:0;}
.cviz-canvas-wrap{position:relative;flex:1 1 64%;min-width:0;background:#0b1220;}
.cviz-canvas-wrap canvas{display:block;width:100%;height:100%;}
.cviz-label-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.cviz-label{position:absolute;transform:translate(-50%,-130%);white-space:nowrap;font-size:11px;
  font-family:'Consolas','Courier New',monospace;background:rgba(2,6,23,.7);padding:2px 6px;
  border-radius:5px;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000;}
.cviz-side{flex:1 1 36%;max-width:380px;padding:18px;color:#cbd5e1;overflow-y:auto;
  background:#0f172a;border-left:1px solid #1e293b;}
.cviz-side h3{margin:0 0 12px;color:#f1f5f9;font-size:15px;}
.cviz-eq-block{font-family:'Consolas','Courier New',monospace;font-size:12.5px;line-height:1.6;
  background:#0b1220;border:1px solid #1e293b;border-radius:8px;padding:12px;font-variant-numeric:tabular-nums;}
.cviz-eq-row{padding:5px 0;border-bottom:1px dashed #1e293b;}
.cviz-eq-row:last-child{border-bottom:none;}
.cviz-sum{margin-top:4px;color:#f8fafc;}
.cviz-c-normal{color:#f59e0b;font-weight:700;}
.cviz-c-dv{color:#ef4444;font-weight:700;}
.cviz-c-sumdv{color:#a855f7;font-weight:700;}
.cviz-c-vbefore{color:#38bdf8;font-weight:700;}
.cviz-c-vafter{color:#22c55e;font-weight:700;}
.cviz-legend-title{margin-top:16px;margin-bottom:8px;font-size:11.5px;color:#94a3b8;}
.cviz-legend{display:flex;flex-direction:column;gap:4px;}
.cviz-legend-item{display:flex;align-items:center;gap:9px;font-size:12.5px;cursor:pointer;
  padding:4px 6px;border-radius:6px;user-select:none;transition:background .12s,opacity .12s;}
.cviz-legend-item:hover{background:#1e293b;}
.cviz-swatch{width:16px;height:16px;border-radius:4px;flex:0 0 auto;
  border:1.5px solid transparent;transition:box-shadow .12s;}
.cviz-legend-item:hover .cviz-swatch{box-shadow:0 0 0 2px rgba(255,255,255,.15);}
.cviz-legend-item.cviz-off{opacity:.4;}
.cviz-legend-item.cviz-off .cviz-legend-text{text-decoration:line-through;}
.cviz-legend-item.cviz-off .cviz-swatch{background:transparent !important;border-color:#64748b;}
.cviz-hint{margin-top:16px;font-size:11.5px;color:#64748b;font-style:italic;}
`;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    global.CollisionViz = { open: open, close: close };
})(window);
