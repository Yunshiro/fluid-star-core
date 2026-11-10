varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uChroma;
uniform float uGrain;
uniform float uVignette;
uniform float uDof;
uniform float uBloomTap;
uniform float uAspect;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  centered.x *= uAspect;
  float dist = length(centered);
  vec3 col = texture2D(tDiffuse, uv).rgb;

  if (uDof > 0.0001) {
    float coc = smoothstep(0.18, 0.95, dist) * uDof;
    if (coc > 0.02) {
      vec3 blur = col * 0.28;
      for (int i = 0; i < 6; i++) {
        float a = 6.2831853 * (float(i) / 6.0);
        vec2 off = vec2(cos(a) / uAspect, sin(a)) * coc * 0.011;
        blur += texture2D(tDiffuse, uv + off).rgb;
      }
      col = blur / 6.28;
    }
  }

  if (uBloomTap > 0.0001) {
    vec2 px = vec2(1.0 / max(uAspect, 0.5), 1.0) * 0.0045;
    vec3 glow = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb;
    glow += texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb;
    glow += texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb;
    glow += texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb;
    float luma = dot(glow, vec3(0.299, 0.587, 0.114));
    col += glow * smoothstep(0.55, 1.35, luma) * uBloomTap;
  }

  vec2 dir = uv - 0.5;
  float edge = dot(dir, dir);
  float amt = uChroma * (0.25 + edge * 10.0);
  float r = texture2D(tDiffuse, uv + dir * amt).r;
  float b = texture2D(tDiffuse, uv - dir * amt).b;
  col.r = mix(col.r, r, 0.82);
  col.b = mix(col.b, b, 0.82);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(0.028, 0.012, 0.0) * luma;
  col += vec3(0.0, 0.002, 0.018) * (1.0 - luma);
  col = pow(max(col, vec3(0.0)), vec3(0.98));

  float n = ign(gl_FragCoord.xy + vec2(fract(uTime * 7.13) * 113.0, fract(uTime * 3.71) * 97.0));
  col += (n - 0.5) * uGrain;

  vec2 vigUv = uv - 0.5;
  vigUv.x *= uAspect;
  float vig = smoothstep(1.05, 0.22, length(vigUv));
  col *= mix(1.0, vig, uVignette);

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
