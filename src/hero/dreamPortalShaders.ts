/**
 * The dream-portal shader — turns the already-generated dream image into a
 * real forward-travel vortex, driven by one uProgress uniform (0..1). No
 * new image is ever generated or sampled; this only distorts the existing
 * texture. Every effect (swirl, radial pull, chromatic aberration, radial
 * motion blur, light streaks, vignette, center bloom) is windowed by
 * smoothstep ranges on uProgress so the six requested phases (release,
 * formation, pull, acceleration, crossing, arrival) emerge from one
 * continuous pass rather than being hand-keyframed.
 */
export const PORTAL_VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const PORTAL_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uProgress;
uniform float uTime;
uniform vec3 uAccent;
uniform vec2 uImageFit;

vec2 coverUv(vec2 uv, vec2 fit) {
  return (uv - 0.5) * fit + 0.5;
}

void main() {
  vec2 uv = coverUv(vUv, uImageFit);
  vec2 centered = uv - 0.5;
  float r = length(centered);
  float theta = atan(centered.y, centered.x);
  float p = clamp(uProgress, 0.0, 1.0);

  // PHASE 2 (formation) -> PHASE 3 (pull): a spiral rotation that grows
  // through the middle of the sequence, strongest near the center.
  float swirl = smoothstep(0.06, 0.55, p) * 3.4 * (1.0 - smoothstep(0.85, 1.0, p) * 0.5);
  theta += swirl * (1.0 - r) * (0.7 + 0.3 * sin(uTime * 0.5));

  // PHASE 3 -> PHASE 4: radial pull toward the focal point — everything
  // samples from progressively closer to center, reading as forward travel
  // into the image rather than the image simply scaling up.
  float pull = mix(1.0, 0.05, smoothstep(0.12, 0.88, p));
  float rr = r * pull;
  vec2 distorted = vec2(cos(theta), sin(theta)) * rr + 0.5;

  // Cheap radial motion blur: several samples marching toward center,
  // heavier as speed increases through phases 3-4.
  float blurAmount = smoothstep(0.18, 0.9, p) * 0.06;
  float aberration = smoothstep(0.3, 0.85, p) * 0.028;
  vec3 color = vec3(0.0);
  float totalWeight = 0.0;
  const int SAMPLES = 8;
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    vec2 sampleUv = mix(distorted, vec2(0.5), t * blurAmount);
    float w = 1.0 - t * 0.45;
    vec2 dir = sampleUv - 0.5;
    float dl = length(dir);
    vec2 dirN = dl > 0.0001 ? dir / dl : vec2(0.0);
    vec2 uvR = clamp(sampleUv + dirN * aberration, 0.0, 1.0);
    vec2 uvB = clamp(sampleUv - dirN * aberration, 0.0, 1.0);
    vec2 uvG = clamp(sampleUv, 0.0, 1.0);
    float rC = texture2D(uTexture, uvR).r;
    float gC = texture2D(uTexture, uvG).g;
    float bC = texture2D(uTexture, uvB).b;
    color += vec3(rC, gC, bC) * w;
    totalWeight += w;
  }
  color /= max(totalWeight, 0.0001);

  // PHASE 2-4: light streaks radiating from the focal point, tinted by
  // this dream's own accent color rather than a fixed hue.
  float streakField = pow(max(0.0, 1.0 - r * 1.35), 3.0);
  float streakPattern = 0.5 + 0.5 * sin(theta * 9.0 + uTime * 2.6 + p * 18.0);
  float streak = streakField * streakPattern * smoothstep(0.22, 0.7, p) * (1.0 - smoothstep(0.9, 1.0, p));
  color += uAccent * streak * 0.55;

  // Vignette deepens as the tunnel forms, framing the travel.
  float vignette = smoothstep(0.95, 0.15, r);
  color *= mix(1.0, vignette, smoothstep(0.08, 0.55, p) * 0.55);

  // PHASE 5 (crossing): a luminous bloom at the center, almost white,
  // tinted by the accent — the threshold moment.
  float bloom = smoothstep(0.8, 0.97, p) * pow(max(0.0, 1.0 - r * 2.4), 2.2);
  vec3 bloomColor = mix(uAccent, vec3(1.0), 0.65);
  color = mix(color, bloomColor, clamp(bloom * 1.5, 0.0, 1.0));

  // PHASE 6 (arrival): a quick overall brighten right at the very end,
  // which the DOM layer underneath fades into as the canvas itself fades.
  color += smoothstep(0.92, 1.0, p) * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;
