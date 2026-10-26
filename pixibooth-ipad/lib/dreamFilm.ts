// Dream Film: dreamy analog softness, creamy skin, highlight bloom, fine grain
// and milky faded edges. One WebGL pipeline renders it for the live camera
// preview and for captured photos/strips, so both use identical math.
//
// Pipeline (all sigmas are px at 1024 px on the shorter side, scaled to the
// output size):
//   1 grade (global film grade, then skin / cheek / lip color masks)  →
//   2 soft focus  →  3 bloom (soft-knee threshold, blurred at ¼ res, screen)  →
//   4 grain (stable per seed)  →  5 edge fade

export const DREAM_FILM = {
  name: "Dream Film",

  // COLOR GRADING
  exposureEV: 0.14,
  contrast: 0.9,
  saturation: 0.95,
  gamma: 1.02,
  blackLift: 0.03,

  // NOSTALGIC WARMTH (temperature: +red −blue; tint: −green = rosy)
  temperatureShift: 0.045,
  tintShift: 0.02,

  // WARM FILM COLOR
  redGain: 1.045,
  greenGain: 1.01,
  blueGain: 0.965,

  // PASTEL TONAL CHARACTER
  highlightCompression: 0.1,
  highlightWarmth: 0.045,
  shadowBlueTint: 0.008,

  // CREAMY PEACH-PINK SKIN (applied through the skin color mask below)
  skinTones: {
    enabled: true,
    luminanceLift: 0.06,
    saturationSoftness: 0.035,
    hueShiftDegrees: 4.0, // toward pink
    peachBoost: 0.12,
    pinkBoost: 0.1,
    redOrangeBalance: 0.06,
  },

  // ROSY CHEEKS AND LIPS (applied through the cheek and lip color masks)
  blushAndLips: {
    enabled: true,
    cheekPinkBoost: 0.2,
    cheekPeachBoost: 0.12,
    cheekLuminanceLift: 0.03,
    lipRedBoost: 0.2,
    lipPinkBoost: 0.12,
    lipSaturationBoost: 0.14,
    lipLuminanceLift: 0.025,
  },

  // COLOR MASKS (no face detection: hue windows + saturation/brightness gates).
  // Hues in degrees; full effect within ±width, fading out over another width.
  masks: {
    skinHue: 24,
    skinHueWidth: 16,
    skinMinSaturation: 0.08,
    skinMaxSaturation: 0.62,
    cheekHue: 10,
    cheekHueWidth: 7,
    cheekMinSaturation: 0.2,
    lipHue: 354,
    lipHueWidth: 12,
    lipMinSaturation: 0.22,
  },

  // SOFT OPTICAL DIFFUSION
  softFocus: { enabled: true, gaussianSigma: 1.7, blurMix: 0.18 },

  // DREAMY HIGHLIGHT BLOOM
  bloom: { enabled: true, threshold: 0.74, softKnee: 0.1, blurSigma: 12, opacity: 0.15, blendMode: "screen" },

  // ANALOG FILM GRAIN
  grain: { enabled: true, luminanceStdDev: 0.011, chromaStdDev: 0.0035, monochromeMix: 0.88 },

  // SOFT FADED PHOTOGRAPHIC EDGES (≈70% lighter than the first version)
  edgeFade: { enabled: true, color: "#FFF8F4", widthFraction: 0.05, maxOpacity: 0.25, falloffPower: 1.55 },

  // OTHER
  vignette: 0,
  sharpening: 0,
  skinSmoothing: 0,
};

export type DreamFilmPreset = typeof DREAM_FILM;

/** Sigmas in the preset are defined at this shorter-side size. */
const REFERENCE_SHORT_SIDE = 1024;
/** Bloom is extracted and blurred at 1/BLOOM_DOWNSCALE resolution (it is very soft anyway). */
const BLOOM_DOWNSCALE = 4;

export type DreamFilmRenderOptions = {
  /** Source crop in source pixels (top-left origin). Defaults to the whole source. */
  crop?: { sx: number; sy: number; sw: number; sh: number };
  outWidth: number;
  outHeight: number;
  mirror?: boolean;
  /** Grain seed: constant per photo (and for the live preview) so grain never flickers. */
  seed?: number;
  preset?: DreamFilmPreset;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ── CPU mirror of the grade shader (fallback when WebGL is unavailable) ──────

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hueWindow(h: number, center: number, width: number) {
  let d = Math.abs(h - center);
  d = Math.min(d, 1 - d);
  return 1 - smooth(width, 2 * width, d);
}
function rgb2hsv([r, g, b]: number[]): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h / 6, mx > 0 ? d / mx : 0, mx];
}
function hsv2rgb(h: number, s: number, v: number): number[] {
  return [0, 2 / 3, 1 / 3].map((o) => {
    const p = Math.abs(((h + 1 + o) % 1) * 6 - 3);
    return v * (1 + (clamp01(p - 1) - 1) * s);
  });
}

/** Stage 1 for one pixel (0–1 RGB), identical in intent to GRADE_FRAG. */
export function gradePixel(rgb: number[], P: DreamFilmPreset = DREAM_FILM): number[] {
  const ex = Math.pow(2, P.exposureEV);
  let c = rgb.map((v) => (v * ex - 0.5) * P.contrast + 0.5);
  let lum = luma(c);
  const gains = [
    P.redGain * (1 + P.temperatureShift),
    P.greenGain * (1 - P.tintShift),
    P.blueGain * (1 - P.temperatureShift),
  ];
  c = c.map((v, k) => {
    v = lum + (v - lum) * P.saturation;
    v = Math.pow(Math.max(0, v), 1 / P.gamma);
    v = (P.blackLift + v * (1 - P.blackLift)) * gains[k];
    return v * (1 - P.highlightCompression * smooth(0.5, 1, v));
  });
  lum = luma(c);
  const hw = P.highlightWarmth * smooth(0.45, 1, lum);
  const sb = P.shadowBlueTint * (1 - smooth(0, 0.5, lum));
  c = [c[0] + hw - 0.4 * sb, c[1] + 0.5 * hw, c[2] - 0.25 * hw + sb].map(clamp01);

  return faceColor(c, P.skinTones, P.blushAndLips, P.masks);
}


export type SkinTones = DreamFilmPreset["skinTones"];
export type BlushAndLips = DreamFilmPreset["blushAndLips"];
export type ColorMasks = DreamFilmPreset["masks"];

/**
 * Skin / cheek / lip color step on one pixel (0–1 RGB), using hue + saturation
 * masks (no face detection). Shared by the Dream Film CPU path and Dreamy.
 */
export function faceColor(c: number[], sk: SkinTones, bl: BlushAndLips, m: ColorMasks): number[] {
  let lum = luma(c);
  const hsv = rgb2hsv(c);
  const lipW = bl.enabled ? hueWindow(hsv[0], m.lipHue / 360, m.lipHueWidth / 360) * smooth(m.lipMinSaturation, m.lipMinSaturation + 0.15, hsv[1]) : 0;
  const cheekW = bl.enabled
    ? hueWindow(hsv[0], m.cheekHue / 360, m.cheekHueWidth / 360) *
      smooth(m.cheekMinSaturation, m.cheekMinSaturation + 0.12, hsv[1]) *
      smooth(0.3, 0.5, hsv[2]) *
      (1 - lipW)
    : 0;
  let skinW = sk.enabled
    ? hueWindow(hsv[0], m.skinHue / 360, m.skinHueWidth / 360) *
      smooth(m.skinMinSaturation, m.skinMinSaturation + 0.08, hsv[1]) *
      (1 - smooth(m.skinMaxSaturation, m.skinMaxSaturation + 0.15, hsv[1])) *
      smooth(0.18, 0.35, hsv[2])
    : 0;
  skinW = Math.max(skinW, sk.enabled ? cheekW : 0);

  if (skinW > 0) {
    c = hsv2rgb((hsv[0] - (sk.hueShiftDegrees / 360) * skinW + 1) % 1, hsv[1], hsv[2]);
    lum = luma(c);
    c = c.map((v) => lum + (v - lum) * (1 - sk.saturationSoftness * skinW));
    const peach = [0.1, 0.035, -0.05];
    const pink = [0.07, -0.03, 0.03];
    c = c.map((v, k) => v + skinW * (sk.peachBoost * peach[k] + sk.pinkBoost * pink[k]));
    c[1] -= skinW * sk.redOrangeBalance * 0.25 * c[1];
    const lift = skinW * sk.luminanceLift * (1 - smooth(0.75, 1, lum));
    c = c.map((v) => v + lift);
  }
  if (cheekW > 0) {
    const pink = [0.09, -0.03, 0.03];
    const peach = [0.08, 0.03, -0.04];
    c = c.map((v, k) => v + cheekW * (bl.cheekPinkBoost * pink[k] + bl.cheekPeachBoost * peach[k] + bl.cheekLuminanceLift));
  }
  if (lipW > 0) {
    lum = luma(c);
    const red = [0.12, -0.04, -0.03];
    const pink = [0.06, -0.03, 0.05];
    c = c.map((v) => lum + (v - lum) * (1 + bl.lipSaturationBoost * lipW));
    c = c.map((v, k) => v + lipW * (bl.lipRedBoost * red[k] + bl.lipPinkBoost * pink[k] + bl.lipLuminanceLift));
  }
  return c.map(clamp01);
}

// ── shaders ──────────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
`;

/** Stage 1: crop/mirror the source, then film color grading. */
const GRADE_FRAG = `${PRECISION}
uniform sampler2D u_src;
uniform vec4 u_crop;      // x0, y0 (bottom-origin uv), w, h in uv
uniform float u_mirror;
uniform float u_exposure, u_contrast, u_saturation, u_gamma, u_blackLift;
uniform vec2 u_tempTint;  // temperatureShift, tintShift
uniform vec3 u_gains;
uniform float u_hiCompress, u_hiWarmth, u_shadowBlue;
uniform vec4 u_skinA;     // luminanceLift, saturationSoftness, hueShift (0-1 turn), peachBoost
uniform vec2 u_skinB;     // pinkBoost, redOrangeBalance
uniform vec3 u_cheek;     // pinkBoost, peachBoost, luminanceLift
uniform vec4 u_lip;       // redBoost, pinkBoost, saturationBoost, luminanceLift
uniform vec4 u_maskSkin;  // hue, width (0-1 turn), minSat, maxSat
uniform vec3 u_maskCheek; // hue, width, minSat
uniform vec3 u_maskLip;   // hue, width, minSat

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hueWindow(float h, float center, float width) {
  float d = abs(h - center);
  d = min(d, 1.0 - d);
  return 1.0 - smoothstep(width, 2.0 * width, d);
}

void main() {
  float x = u_mirror > 0.5 ? 1.0 - v_uv.x : v_uv.x;
  vec2 uv = u_crop.xy + vec2(x, v_uv.y) * u_crop.zw;
  vec3 c = texture2D(u_src, uv).rgb;

  // Global film grade.
  c *= u_exposure;
  c = (c - 0.5) * u_contrast + 0.5;
  float lum = dot(c, LUMA);
  c = mix(vec3(lum), c, u_saturation);
  c = pow(max(c, 0.0), vec3(1.0 / u_gamma));
  c = u_blackLift + c * (1.0 - u_blackLift);
  c *= u_gains * vec3(1.0 + u_tempTint.x, 1.0 - u_tempTint.y, 1.0 - u_tempTint.x);
  c *= 1.0 - u_hiCompress * smoothstep(0.5, 1.0, c);
  lum = dot(c, LUMA);
  c += u_hiWarmth * smoothstep(0.45, 1.0, lum) * vec3(1.0, 0.5, -0.25);           // amber highlights
  c += u_shadowBlue * (1.0 - smoothstep(0.0, 0.5, lum)) * vec3(-0.4, 0.0, 1.0);
  c = clamp(c, 0.0, 1.0);

  // Color masks: lips (red-pink), cheeks (rosy skin), skin (peach/orange).
  vec3 hsv = rgb2hsv(c);
  float lipW = hueWindow(hsv.x, u_maskLip.x, u_maskLip.y) * smoothstep(u_maskLip.z, u_maskLip.z + 0.15, hsv.y);
  float cheekW = hueWindow(hsv.x, u_maskCheek.x, u_maskCheek.y) * smoothstep(u_maskCheek.z, u_maskCheek.z + 0.12, hsv.y)
    * smoothstep(0.3, 0.5, hsv.z) * (1.0 - lipW);
  float skinW = hueWindow(hsv.x, u_maskSkin.x, u_maskSkin.y)
    * smoothstep(u_maskSkin.z, u_maskSkin.z + 0.08, hsv.y) * (1.0 - smoothstep(u_maskSkin.w, u_maskSkin.w + 0.15, hsv.y))
    * smoothstep(0.18, 0.35, hsv.z);
  skinW = max(skinW, cheekW);

  // Skin: nudge hue toward pink, then creamy peach-pink and brighter, softer.
  hsv.x = fract(hsv.x - u_skinA.z * skinW);
  c = hsv2rgb(hsv);
  lum = dot(c, LUMA);
  c = mix(vec3(lum), c, 1.0 - u_skinA.y * skinW);
  c += skinW * (u_skinA.w * vec3(0.10, 0.035, -0.05) + u_skinB.x * vec3(0.07, -0.03, 0.03));
  c.g -= skinW * u_skinB.y * 0.25 * c.g;                                          // less orange, more red
  c += skinW * u_skinA.x * (1.0 - smoothstep(0.75, 1.0, lum));                     // lift, but don't blow out

  // Rosy cheeks.
  c += cheekW * (u_cheek.x * vec3(0.09, -0.03, 0.03) + u_cheek.y * vec3(0.08, 0.03, -0.04) + u_cheek.z);

  // Lips: redder, a touch pinker, more saturated, slightly lifted.
  lum = dot(c, LUMA);
  c = mix(vec3(lum), c, 1.0 + u_lip.z * lipW);
  c += lipW * (u_lip.x * vec3(0.12, -0.04, -0.03) + u_lip.y * vec3(0.06, -0.03, 0.05) + u_lip.w);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Separable gaussian; result = mix(base, blur, u_mix). */
const BLUR_FRAG = `${PRECISION}
uniform sampler2D u_tex;
uniform sampler2D u_base;
uniform vec2 u_step;      // one texel along the blur axis
uniform float u_sigma;
uniform float u_mix;

void main() {
  float s = max(u_sigma, 0.05);
  float radius = ceil(3.0 * s);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i <= 80; i++) {
    float x = float(i) - radius;
    if (x > radius) break;
    float w = exp(-0.5 * x * x / (s * s));
    acc += texture2D(u_tex, v_uv + u_step * x).rgb * w;
    wsum += w;
  }
  vec3 blur = acc / wsum;
  vec3 base = texture2D(u_base, v_uv).rgb;
  gl_FragColor = vec4(mix(base, blur, u_mix), 1.0);
}`;

/** Stage 3a: soft-knee highlight extraction. */
const BRIGHT_FRAG = `${PRECISION}
uniform sampler2D u_tex;
uniform float u_threshold, u_knee;

void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb;
  float br = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(br - u_threshold + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-5);
  float contribution = max(soft, br - u_threshold) / max(br, 1e-5);
  gl_FragColor = vec4(c * contribution, 1.0);
}`;

/** Stages 3b–5: screen-blend bloom, grain, faded edges. */
const FINAL_FRAG = `${PRECISION}
uniform sampler2D u_soft;
uniform sampler2D u_bloom;
uniform vec2 u_size;
uniform float u_seed;
uniform float u_bloomOpacity;
uniform float u_lumStd, u_chromaStd, u_mono;
uniform vec3 u_edgeColor;
uniform float u_edgeWidth, u_edgeOpacity, u_edgePower;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
// Approximately unit-variance gaussian from two hashes (Box-Muller).
float gauss(vec2 p) {
  float u1 = max(hash(p), 1e-4);
  float u2 = hash(p + 17.31);
  return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
}

void main() {
  vec3 c = texture2D(u_soft, v_uv).rgb;
  vec3 b = texture2D(u_bloom, v_uv).rgb;
  c = c + (b - c * b) * u_bloomOpacity;             // screen at opacity

  vec2 p = floor(v_uv * u_size) + u_seed * 7.13;
  float n = gauss(p);
  vec3 nc = vec3(gauss(p + 101.0), gauss(p + 211.0), gauss(p + 307.0));
  c += vec3(n) * u_lumStd * u_mono + nc * (u_lumStd * (1.0 - u_mono) + u_chromaStd);

  // Milky edges: fade from each axis combined, so corners stay round, never a hard rectangle.
  vec2 px = v_uv * u_size;
  float w = u_edgeWidth * min(u_size.x, u_size.y);
  float dx = min(px.x, u_size.x - px.x);
  float dy = min(px.y, u_size.y - px.y);
  float ax = pow(smoothstep(0.0, 1.0, 1.0 - clamp(dx / w, 0.0, 1.0)), u_edgePower);
  float ay = pow(smoothstep(0.0, 1.0, 1.0 - clamp(dy / w, 0.0, 1.0)), u_edgePower);
  float a = u_edgeOpacity * (1.0 - (1.0 - ax) * (1.0 - ay));
  c = mix(c, u_edgeColor, a);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// ── renderer ─────────────────────────────────────────────────────────────────

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Targets = { grade: Target; tmp: Target; soft: Target; bright: Target; tmpQ: Target; bloom: Target };
type Program = { prog: WebGLProgram; loc: (name: string) => WebGLUniformLocation | null };

/**
 * Renders Dream Film into its own canvas. Use one instance per output canvas
 * (the live preview owns a visible canvas; stills share a hidden one).
 */
export class DreamFilmRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs: { grade: Program; blur: Program; bright: Program; final: Program };
  private quad: WebGLBuffer;
  private srcTex: WebGLTexture;
  private targets = new Map<string, Targets>();
  lost = false;

  /** Returns null if WebGL is unavailable. */
  static create(canvas: HTMLCanvasElement = document.createElement("canvas")): DreamFilmRenderer | null {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    try {
      return new DreamFilmRenderer(canvas, gl);
    } catch (err) {
      console.error("Dream Film WebGL init failed", err);
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", () => (this.lost = true));
    this.programs = {
      grade: this.program(GRADE_FRAG),
      blur: this.program(BLUR_FRAG),
      bright: this.program(BRIGHT_FRAG),
      final: this.program(FINAL_FRAG),
    };
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.srcTex = this.texture();
  }

  private program(frag: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      prog,
      loc: (name) => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
        return cache.get(name)!;
      },
    };
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  /** Intermediate buffers per output size (a few sizes are reused: live, slots, thumbnails). */
  private targetsFor(w: number, h: number): Targets {
    const key = `${w}x${h}`;
    let t = this.targets.get(key);
    if (!t) {
      if (this.targets.size >= 6) {
        const [oldKey, old] = this.targets.entries().next().value!;
        Object.values(old).forEach((x) => {
          this.gl.deleteTexture(x.tex);
          this.gl.deleteFramebuffer(x.fbo);
        });
        this.targets.delete(oldKey);
      }
      const qw = Math.max(1, Math.round(w / BLOOM_DOWNSCALE));
      const qh = Math.max(1, Math.round(h / BLOOM_DOWNSCALE));
      t = {
        grade: this.target(w, h),
        tmp: this.target(w, h),
        soft: this.target(w, h),
        bright: this.target(qw, qh),
        tmpQ: this.target(qw, qh),
        bloom: this.target(qw, qh),
      };
      this.targets.set(key, t);
    }
    return t;
  }

  private pass(program: Program, out: Target | null, w: number, h: number, textures: WebGLTexture[], uniforms: () => void) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program.prog);
    textures.forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    });
    uniforms();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Renders `source` through Dream Film into `this.canvas` (resized to the output size). */
  render(source: TexImageSource & { width?: number; height?: number }, opts: DreamFilmRenderOptions): HTMLCanvasElement {
    const gl = this.gl;
    const P = opts.preset ?? DREAM_FILM;
    const W = Math.max(1, Math.round(opts.outWidth));
    const H = Math.max(1, Math.round(opts.outHeight));
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;

    const srcW = (source as HTMLVideoElement).videoWidth || (source as { width: number }).width;
    const srcH = (source as HTMLVideoElement).videoHeight || (source as { height: number }).height;
    const crop = opts.crop ?? { sx: 0, sy: 0, sw: srcW, sh: srcH };

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const t = this.targetsFor(W, H);
    const k = Math.min(W, H) / REFERENCE_SHORT_SIDE;
    const { grade, blur, bright, final } = this.programs;

    // 1. grade (+ crop/mirror)
    this.pass(grade, t.grade, W, H, [this.srcTex], () => {
      gl.uniform1i(grade.loc("u_src"), 0);
      gl.uniform4f(
        grade.loc("u_crop"),
        crop.sx / srcW,
        1 - (crop.sy + crop.sh) / srcH,
        crop.sw / srcW,
        crop.sh / srcH,
      );
      gl.uniform1f(grade.loc("u_mirror"), opts.mirror ? 1 : 0);
      gl.uniform1f(grade.loc("u_exposure"), Math.pow(2, P.exposureEV));
      gl.uniform1f(grade.loc("u_contrast"), P.contrast);
      gl.uniform1f(grade.loc("u_saturation"), P.saturation);
      gl.uniform1f(grade.loc("u_gamma"), P.gamma);
      gl.uniform1f(grade.loc("u_blackLift"), P.blackLift);
      gl.uniform3f(grade.loc("u_gains"), P.redGain, P.greenGain, P.blueGain);
      gl.uniform2f(grade.loc("u_tempTint"), P.temperatureShift, P.tintShift);
      gl.uniform1f(grade.loc("u_hiCompress"), P.highlightCompression);
      gl.uniform1f(grade.loc("u_hiWarmth"), P.highlightWarmth);
      gl.uniform1f(grade.loc("u_shadowBlue"), P.shadowBlueTint);
      const sk = P.skinTones;
      const on = (enabled: boolean, v: number) => (enabled ? v : 0);
      gl.uniform4f(
        grade.loc("u_skinA"),
        on(sk.enabled, sk.luminanceLift),
        on(sk.enabled, sk.saturationSoftness),
        on(sk.enabled, sk.hueShiftDegrees / 360),
        on(sk.enabled, sk.peachBoost),
      );
      gl.uniform2f(grade.loc("u_skinB"), on(sk.enabled, sk.pinkBoost), on(sk.enabled, sk.redOrangeBalance));
      const bl = P.blushAndLips;
      gl.uniform3f(
        grade.loc("u_cheek"),
        on(bl.enabled, bl.cheekPinkBoost),
        on(bl.enabled, bl.cheekPeachBoost),
        on(bl.enabled, bl.cheekLuminanceLift),
      );
      gl.uniform4f(
        grade.loc("u_lip"),
        on(bl.enabled, bl.lipRedBoost),
        on(bl.enabled, bl.lipPinkBoost),
        on(bl.enabled, bl.lipSaturationBoost),
        on(bl.enabled, bl.lipLuminanceLift),
      );
      const m = P.masks;
      gl.uniform4f(grade.loc("u_maskSkin"), m.skinHue / 360, m.skinHueWidth / 360, m.skinMinSaturation, m.skinMaxSaturation);
      gl.uniform3f(grade.loc("u_maskCheek"), m.cheekHue / 360, m.cheekHueWidth / 360, m.cheekMinSaturation);
      gl.uniform3f(grade.loc("u_maskLip"), m.lipHue / 360, m.lipHueWidth / 360, m.lipMinSaturation);
    });

    const blurPass = (from: Target, base: Target, out: Target, dir: [number, number], sigma: number, mix: number) =>
      this.pass(blur, out, out.w, out.h, [from.tex, base.tex], () => {
        gl.uniform1i(blur.loc("u_tex"), 0);
        gl.uniform1i(blur.loc("u_base"), 1);
        gl.uniform2f(blur.loc("u_step"), dir[0] / from.w, dir[1] / from.h);
        gl.uniform1f(blur.loc("u_sigma"), sigma);
        gl.uniform1f(blur.loc("u_mix"), mix);
      });

    // 2. soft focus: 85% graded + 15% gaussian
    const softSigma = P.softFocus.gaussianSigma * k;
    const softMix = P.softFocus.enabled ? P.softFocus.blurMix : 0;
    blurPass(t.grade, t.grade, t.tmp, [1, 0], softSigma, 1);
    blurPass(t.tmp, t.grade, t.soft, [0, 1], softSigma, softMix);

    // 3. bloom: soft-knee bright pass at ¼ res, gaussian blur
    this.pass(bright, t.bright, t.bright.w, t.bright.h, [t.soft.tex], () => {
      gl.uniform1i(bright.loc("u_tex"), 0);
      gl.uniform1f(bright.loc("u_threshold"), P.bloom.threshold);
      gl.uniform1f(bright.loc("u_knee"), P.bloom.softKnee);
    });
    const bloomSigma = (P.bloom.blurSigma * k) / BLOOM_DOWNSCALE;
    blurPass(t.bright, t.bright, t.tmpQ, [1, 0], bloomSigma, 1);
    blurPass(t.tmpQ, t.tmpQ, t.bloom, [0, 1], bloomSigma, 1);

    // 3b–5. screen bloom, grain, edge fade → canvas
    const edge = hexToRgb(P.edgeFade.color);
    this.pass(final, null, W, H, [t.soft.tex, t.bloom.tex], () => {
      gl.uniform1i(final.loc("u_soft"), 0);
      gl.uniform1i(final.loc("u_bloom"), 1);
      gl.uniform2f(final.loc("u_size"), W, H);
      gl.uniform1f(final.loc("u_seed"), (opts.seed ?? 1) % 997);
      gl.uniform1f(final.loc("u_bloomOpacity"), P.bloom.enabled ? P.bloom.opacity : 0);
      gl.uniform1f(final.loc("u_lumStd"), P.grain.enabled ? P.grain.luminanceStdDev : 0);
      gl.uniform1f(final.loc("u_chromaStd"), P.grain.enabled ? P.grain.chromaStdDev : 0);
      gl.uniform1f(final.loc("u_mono"), P.grain.monochromeMix);
      gl.uniform3f(final.loc("u_edgeColor"), edge[0], edge[1], edge[2]);
      gl.uniform1f(final.loc("u_edgeWidth"), P.edgeFade.widthFraction);
      gl.uniform1f(final.loc("u_edgeOpacity"), P.edgeFade.enabled ? P.edgeFade.maxOpacity : 0);
      gl.uniform1f(final.loc("u_edgePower"), P.edgeFade.falloffPower);
    });
    return this.canvas;
  }
}

let shared: DreamFilmRenderer | null | undefined;

/** Shared hidden renderer for stills (photos, strip slots, thumbnails). Null without WebGL. */
export function stillRenderer(): DreamFilmRenderer | null {
  if (shared === undefined || shared?.lost) shared = DreamFilmRenderer.create();
  return shared;
}
