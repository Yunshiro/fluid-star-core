varying vec3 vDir;
uniform float uMorph;
uniform float uTime;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y * 0.5 + 0.5;
  vec3 col = mix(vec3(0.003, 0.0026, 0.006), vec3(0.012, 0.009, 0.02), smoothstep(0.0, 1.0, h));
  float facing = pow(max(dot(dir, normalize(vec3(0.0, 0.08, 1.0))), 0.0), 5.0);
  float metal = 1.0 - smoothstep(0.15, 1.05, uMorph);
  float neb = smoothstep(0.35, 1.0, uMorph) * (1.0 - smoothstep(1.15, 1.85, uMorph));
  col += vec3(0.11, 0.045, 0.018) * facing * (0.35 + metal);
  col += vec3(0.05, 0.02, 0.09) * neb * (0.35 + facing);
  float stars = hash13(floor(dir * 190.0 + vec3(uTime * 0.01, 0.0, 0.0)));
  float spark = smoothstep(0.992, 1.0, stars);
  col += spark * vec3(0.85, 0.78, 0.66) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
