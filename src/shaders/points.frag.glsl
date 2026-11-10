varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float falloff = pow(1.0 - r2, vSoft);
  gl_FragColor = vec4(vColor, falloff * vAlpha);
}
