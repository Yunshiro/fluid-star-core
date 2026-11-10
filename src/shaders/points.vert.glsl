attribute float aSeed;
#ifdef ANALYTIC
attribute vec4 aText;
#else
attribute vec2 aUv;
uniform sampler2D uPosition;
uniform sampler2D uText;
#endif

uniform float uMorph;
uniform float uTime;
uniform float uPointScale;
uniform float uPixelRatio;
uniform float uTextScale;
uniform float uMotion;
uniform float uFocus;
uniform vec3 uPointer;
uniform float uPointerForce;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  float morph = clamp(uMorph, 0.0, 2.0);
  float toNebula = smoothstep(0.15, 0.95, morph);
  float toLogo = smoothstep(1.05, 1.75, morph);
  float seed = aSeed;
  float assigned;

#ifdef ANALYTIC
  vec3 base = position;
  assigned = aText.w;
  float t = uTime * uMotion;
  vec3 n = base * mix(1.15, 0.42, toNebula);
  vec3 flow = vec3(
    sin(n.y * 1.6 + t) + sin(n.z * 0.7),
    cos(n.z * 1.3 + t * 0.8) + cos(n.x * 0.6),
    sin(n.x * 1.1 + n.y * 0.4 - t * 0.7)
  );
  vec3 shell = normalize(base + vec3(0.0001));
  flow -= shell * dot(flow, shell);
  vec3 metal = base + flow * 0.16 * (1.0 - toNebula) * uMotion;
  float nebRadius = mix(0.12, 1.72, fract(seed * 5.17 + base.x * 0.13));
  vec3 nebula = normalize(base + vec3(seed - 0.5, 0.15, base.y * 0.2)) * nebRadius;
  nebula.x *= 1.16;
  nebula.y *= 0.82;
  nebula += flow * 0.48 * uMotion;
  vec3 pos = mix(metal, nebula, toNebula);
  pos = mix(pos, aText.xyz, toLogo);
  vec3 away = pos - uPointer;
  float inf = exp(-dot(away, away) * 1.2) * uPointerForce * (1.0 - toLogo * 0.65);
  pos += normalize(away + vec3(0.0001)) * inf * 0.55;
#else
  vec3 pos = texture2D(uPosition, aUv).xyz;
  assigned = texture2D(uText, aUv).w;
#endif

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float nebulaMix = smoothstep(0.2, 1.0, morph) * (1.0 - smoothstep(1.05, 1.65, morph));
  float size = mix(2.35, 8.2, nebulaMix);
  float logoSize = (assigned > 0.5 ? 2.55 : 2.05) * max(uTextScale, 0.45);
  size = mix(size, logoSize, toLogo);
  float depth = max(0.35, -mv.z);
  gl_PointSize = clamp(size * uPointScale * uPixelRatio * (uFocus / depth), 2.2, 16.0);

  vec3 viewDir = normalize(cameraPosition - pos);
  vec3 pn = normalize(pos + vec3(0.0001));
  float fres = pow(1.0 - max(dot(pn, viewDir), 0.0), 1.5);
  float band = sin(dot(pn, vec3(2.1, 3.4, 1.2)) * 2.4 + seed * 6.28318 + uTime * 0.35) * 0.5 + 0.5;
  float limb = smoothstep(0.08, 0.78, fres);
  vec3 metalCol = mix(vec3(1.0, 0.72, 0.4), vec3(0.95, 0.42, 0.38), band);
  metalCol = mix(metalCol, vec3(0.35, 0.82, 0.98), fres * 0.85);
  metalCol *= 0.045 + limb * 0.62;

  float g = smoothstep(-2.2, 2.4, pos.y + pos.x * 0.35);
  vec3 neb = mix(vec3(0.12, 0.22, 0.82), vec3(0.72, 0.16, 0.5), g);
  neb = mix(neb, vec3(0.82, 0.55, 0.32), smoothstep(1.6, 4.2, length(pos.xy)));
  neb *= 0.28 + 0.18 * fres;
  float nebEdge = 1.0 - smoothstep(1.05, 2.05, length(pos));
  float nebPresence = smoothstep(0.28, 0.92, morph) * (1.0 - smoothstep(1.12, 1.72, morph));
  neb *= mix(1.0, 0.25 + 0.75 * nebEdge, nebPresence);

  vec3 logoCol = mix(vec3(0.2, 0.16, 0.12), vec3(0.98, 0.8, 0.58), assigned);
  float twinkle = 0.86 + 0.14 * sin(uTime * (1.2 + seed * 2.2) + seed * 18.0);
  logoCol *= mix(1.0, twinkle, uMotion * (0.2 + toLogo * 0.45));

  float shellFade = 1.0 - smoothstep(1.4, 1.85, length(pos));
  float shellMix = mix(shellFade, 1.0, smoothstep(0.18, 0.75, morph));
  metalCol *= shellMix;
  vColor = mix(metalCol, neb, smoothstep(0.12, 0.92, morph));
  vColor = mix(vColor, logoCol, toLogo);
  float metalAlpha = mix(0.015, 0.72, limb) * shellMix;
  vAlpha = mix(metalAlpha, 0.22, smoothstep(0.12, 0.92, morph));
  vAlpha = mix(vAlpha, assigned > 0.5 ? 0.88 : 0.02, toLogo);
  vSoft = mix(mix(1.75, 0.42, nebulaMix), assigned > 0.5 ? 2.4 : 0.7, toLogo);
}
