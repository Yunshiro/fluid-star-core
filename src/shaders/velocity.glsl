// Samplers texturePosition and textureVelocity are prepended by GPUComputationRenderer.
uniform float uDt;
uniform float uTime;
uniform float uMorph;
uniform float uMotion;
uniform float uCurl;
uniform float uScroll;
uniform float uPointerForce;
uniform vec3 uPointer;
uniform sampler2D uBase;
uniform sampler2D uText;

vec3 snoiseVec(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(31.416, 47.853, 12.793)),
    snoise(p + vec3(19.123, 63.951, 27.631))
  );
}

vec3 curlNoise(vec3 p) {
  const float e = 0.12;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 x0 = snoiseVec(p - dx);
  vec3 x1 = snoiseVec(p + dx);
  vec3 y0 = snoiseVec(p - dy);
  vec3 y1 = snoiseVec(p + dy);
  vec3 z0 = snoiseVec(p - dz);
  vec3 z1 = snoiseVec(p + dz);
  float cx = (y1.z - y0.z) - (z1.y - z0.y);
  float cy = (z1.x - z0.x) - (x1.z - x0.z);
  float cz = (x1.y - x0.y) - (y1.x - y0.x);
  return vec3(cx, cy, cz) / (2.0 * e);
}

vec3 sineFlow(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.55 + t) + sin(p.z * 0.72 + t * 0.4),
    cos(p.z * 1.25 + t * 0.8) + cos(p.x * 0.62 - t * 0.3),
    sin(p.x * 1.05 + p.y * 0.4 - t * 0.7) + cos(p.z * 0.5 + t * 0.2)
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  vec4 base = texture2D(uBase, uv);
  vec4 text = texture2D(uText, uv);
  float dt = clamp(uDt, 0.0, 0.033);

  float morph = clamp(uMorph, 0.0, 2.0);
  float toNebula = smoothstep(0.15, 0.95, morph);
  float toLogo = smoothstep(1.05, 1.75, morph);

  vec3 metalTarget = base.xyz;
  float nebRadius = mix(0.12, 1.72, fract(base.w * 5.17 + base.x * 0.13));
  vec3 nebulaDir = normalize(base.xyz + vec3(base.w - 0.5, 0.15, base.y * 0.2));
  vec3 nebulaTarget = nebulaDir * nebRadius;
  nebulaTarget.x *= 1.16;
  nebulaTarget.y *= 0.82;
  vec3 target = mix(metalTarget, nebulaTarget, toNebula);
  target = mix(target, text.xyz, toLogo);

  float freq = mix(1.2, 0.4, toNebula);
  freq = mix(freq, 0.55, toLogo);
  vec3 sampleP = pos * freq + vec3(0.0, uTime * 0.07, uTime * 0.04);
  vec3 flow = uCurl > 0.5 ? curlNoise(sampleP) : sineFlow(sampleP, uTime);
  vec3 shell = normalize(base.xyz + vec3(0.0001));
  if (toNebula < 0.45) flow -= shell * dot(flow, shell);
  float fl = length(flow);
  flow = fl > 0.0001 ? flow / fl : vec3(0.0);

  float flowAmp = mix(0.72, 1.25, toNebula);
  flowAmp = mix(flowAmp, 0.045, toLogo);
  flowAmp *= uMotion;
  vel += flow * flowAmp * dt;

  float attract = mix(2.15, 1.45, toNebula);
  attract = mix(attract, text.w > 0.5 ? 9.4 : 2.4, toLogo);
  float damp = mix(1.2, 0.72, toNebula);
  damp = mix(damp, text.w > 0.5 ? 6.6 : 2.2, toLogo);

  vec3 offset = pos - uPointer;
  float influence = exp(-dot(offset, offset) * 1.2) * uPointerForce;
  influence *= mix(1.0, 0.32, toLogo);
  attract *= mix(1.0, 0.38, clamp(influence, 0.0, 1.0));
  vel += (target - pos) * attract * dt;

  vec3 radial = normalize(offset + vec3(0.0001));
  vec3 tangent = cross(offset, vec3(0.0, 0.0, 1.0));
  float tl = length(tangent);
  tangent = tl > 0.0001 ? tangent / tl : vec3(0.0, 1.0, 0.0);
  vel += (tangent * 1.25 + radial * 0.78) * influence * 7.5 * dt;
  vel.y += uScroll * 0.55 * dt * (1.0 - toLogo);

  vel *= exp(-damp * dt);
  float maxSpeed = mix(1.55, 2.15, toNebula);
  maxSpeed = mix(maxSpeed, text.w > 0.5 ? 0.42 : 1.1, toLogo);
  float sp = length(vel);
  if (sp > maxSpeed) vel *= maxSpeed / sp;

  gl_FragColor = vec4(vel, 1.0);
}
