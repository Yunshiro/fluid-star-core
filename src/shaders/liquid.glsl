float coreNoise(vec3 p) {
  float a = snoise(p * 1.15 + uTime * 0.23);
  float b = snoise(p * 2.35 - uTime * 0.16);
  return (a * 0.72 + b * 0.28) * uDistort * DISTORT_MUL * (1.0 + uDissolve * 0.45);
}

vec3 coreDeform(vec3 p) {
  vec3 nrm = normalize(p + vec3(0.0001));
  return p + nrm * coreNoise(p);
}

vec3 coreNormal(vec3 p) {
  float e = 0.055;
  vec3 n = normalize(p + vec3(0.0001));
  vec3 t = cross(n, vec3(0.0, 1.0, 0.0));
  if (dot(t, t) < 0.00001) t = cross(n, vec3(1.0, 0.0, 0.0));
  t = normalize(t);
  vec3 b = normalize(cross(n, t));
  vec3 p0 = coreDeform(p);
  vec3 p1 = coreDeform(p + t * e);
  vec3 p2 = coreDeform(p + b * e);
  vec3 dn = normalize(cross(p1 - p0, p2 - p0));
  if (dot(dn, n) < 0.0) dn = -dn;
  return dn;
}
