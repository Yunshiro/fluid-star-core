uniform float uDt;
uniform sampler2D uBase;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  float dt = clamp(uDt, 0.0, 0.033);
  pos.xyz += vel * dt;
  if (dot(pos.xyz, pos.xyz) > 196.0) {
    pos.xyz = texture2D(uBase, uv).xyz;
  }
  gl_FragColor = pos;
}
