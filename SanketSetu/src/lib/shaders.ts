/**
 * Custom GLSL Shaders (src/lib/shaders.ts)
 * -----------------------------------------------------------------------------
 * 1. Spiral Card Vertex & Fragment Shader:
 *    - Cylindrical helix curvature bend (uBend)
 *    - Velocity-driven skew/stretch distortion (uVelocity)
 *    - Signed Distance Field (SDF) rounded corners (uRadius)
 *    - Screen-space vertical mask (vScreenY) so cards fade to alpha = 0 before
 *      reaching the top (nav/header/toggle) or bottom (detail dock/HUD) edges
 *    - Theme-aware distance fog (uFogColor synced to --bg)
 * 2. Diagonal Streak Backdrop Shader for Scene 3
 */

export const spiralCardVertexShader = /* glsl */ `
  uniform float uBend;
  uniform float uVelocity;
  uniform float uHover;
  uniform float uSelected;
  varying vec2 vUv;
  varying float vDepth;
  varying float vScreenY;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Subtle cylindrical bend along the helix curvature (flattens when uBend -> 0 in list or detail mode)
    float bendAmount = uBend * (1.0 - uSelected * 0.85);
    pos.z -= (pos.x * pos.x) * bendAmount;

    // Velocity-driven skew & vertical stretch
    float vel = clamp(uVelocity, -1.0, 1.0);
    pos.y += pos.x * vel * 0.10 * (1.0 - uSelected);
    pos.y *= 1.0 + abs(vel) * 0.05 * (1.0 - uSelected);

    // Subtle forward pop on hover
    pos.z += uHover * 0.10;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;
    vec4 clipPos = projectionMatrix * mvPosition;
    vScreenY = clipPos.y / max(clipPos.w, 0.0001);
    gl_Position = clipPos;
  }
`;

export const spiralCardFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uVelocity;
  uniform float uHover;
  uniform float uDim;
  uniform float uSelected;
  uniform vec2 uPlaneSize;
  uniform float uRadius;
  uniform vec3 uFogColor;
  varying vec2 vUv;
  varying float vDepth;
  varying float vScreenY;

  // Signed Distance Field for a 2D rounded box
  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    // Convert UV (0..1) to centered coordinates in plane aspect space
    vec2 centered = (vUv - 0.5) * uPlaneSize;
    vec2 halfSize = uPlaneSize * 0.5;
    float dist = sdRoundedBox(centered, halfSize, uRadius);

    // Anti-aliased SDF rounded corner mask
    float alphaMask = 1.0 - smoothstep(-0.015, 0.005, dist);
    if (alphaMask < 0.01) discard;

    // Screen-space vertical mask: fade to alpha = 0 before top (header + toggle)
    // and bottom (detail dock + HUD) so no card ever renders under UI chrome
    float topSafeFade = 1.0 - smoothstep(0.24, 0.35, vScreenY);
    float bottomSafeFade = smoothstep(-0.54, -0.40, vScreenY);
    float verticalMask = topSafeFade * bottomSafeFade;
    if (verticalMask < 0.01) discard;

    // Subtle zoom on hover
    vec2 sampleUv = (vUv - 0.5) * (1.0 - uHover * 0.035) + 0.5;

    // Gentle velocity-driven chromatic aberration offset
    float chromaShift = clamp(abs(uVelocity) * 0.008 + uHover * 0.002, 0.0, 0.012);
    vec2 shiftVec = vec2(chromaShift, chromaShift * 0.25);

    float r = texture2D(uTexture, clamp(sampleUv + shiftVec, 0.0, 1.0)).r;
    float g = texture2D(uTexture, clamp(sampleUv, 0.0, 1.0)).g;
    float b = texture2D(uTexture, clamp(sampleUv - shiftVec, 0.0, 1.0)).b;
    vec3 color = vec3(r, g, b);

    // Crisp outer border & hover/selected highlight ring
    float borderEdge = smoothstep(-0.042, -0.012, dist) * (1.0 - smoothstep(-0.012, 0.005, dist));
    vec3 activeRingColor = vec3(0.776, 1.0, 0.239); // #C6FF3D
    vec3 baseRingColor = mix(vec3(0.08), activeRingColor, max(uHover, uSelected));
    color = mix(color, baseRingColor, borderEdge * (0.28 + max(uHover, uSelected) * 0.62));

    // Dim non-active cards slightly when another card is focused
    color = mix(color, uFogColor, uDim * 0.32);

    // Theme-matched distance fog blend toward --bg (uFogColor)
    float fogFactor = smoothstep(5.0, 11.5, vDepth);
    color = mix(color, uFogColor, fogFactor * 0.78);

    float finalAlpha = alphaMask * verticalMask * uOpacity * (1.0 - fogFactor * 0.65);
    if (finalAlpha < 0.01) discard;

    gl_FragColor = vec4(color, finalAlpha);
  }
`;

export const streakBackdropVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const streakBackdropFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Faint diagonal streaks in dark room
    float diag = (vUv.x + vUv.y * 1.35) * 28.0;
    float streak = sin(diag - uTime * 0.6) * 0.5 + 0.5;
    streak = pow(streak, 6.0) * 0.08;

    float vignette = 1.0 - smoothstep(0.15, 0.75, distance(vUv, vec2(0.5)));
    vec3 col = vec3(0.72, 1.0, 0.17) * streak * vignette;

    gl_FragColor = vec4(col, streak * vignette * uOpacity);
  }
`;
