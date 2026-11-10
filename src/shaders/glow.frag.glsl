varying vec3 vNormal;
varying vec3 vWorld;
uniform float uIntensity;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.5);
  vec3 color = vec3(1.0, 0.74, 0.46) * fres * uIntensity;
  gl_FragColor = vec4(color, fres);
}
