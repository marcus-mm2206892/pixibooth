// Dream Film: dreamy analog softness, creamy skin, highlight bloom, fine grain
// and milky faded edges. One WebGL pipeline renders it for the live camera
// preview and for captured photos/strips, so both use identical math.
//
// Pipeline (all sigmas are px at 1280 px image width, scaled to the output size):
//   1 grade  →  2 optical diffusion (σ2 gaussian, screen 10%)  →  3 bloom
//   (soft-knee threshold on the graded image, blurred at ¼ res, warm-white tint,
//   screen 18%)  →  4 grain (stable per seed)  →  5 faint edge haze

export const DREAM_FILM = {
  name: "Dream Film",

  // COLOR GRADING
  exposureEV: 0.1,
  contrast: 0.92,
  saturation: 0.92,
  gamma: 1.0,
  blackLift: 0.025,

  // WARM FILM COLOR
  redGain: 1.025,
  greenGain: 1.0,
  blueGain: 0.975,

  // PASTEL TONAL CHARACTER
  highlightCompression: 0.08,
  highlightWarmth: 0.035,
  shadowBlueTint: 0.015,

  // LIP & BLUSH COLOR (added on top of the original spec): the global
  // desaturation, lifted blacks, bloom and haze wash out lips. This restores
  // only red-pink hues (lips/cheeks), never the orange hue of skin.
  lipColor: {
    enabled: true,
    hueCenter: 354, // degrees: red-pink (skin sits around 15–35°, outside the window)
    hueWidth: 12, // ± degrees of full effect, fading out over the same width again
    minSaturation: 0.22, // only already-colored pixels (lips), not pale skin
    saturationBoost: 0.35,
    depth: 0.04, // slight darkening so lips read as color, not glow
  },

  // SOFT OPTICAL DIFFUSION: a lightly blurred copy screened over the untouched image.
  softFocus: { enabled: true, gaussianSigma: 2, opacity: 0.1, blendMode: "screen" },

  // HIGHLIGHT BLOOM: only bright skin/whites glow (early-2000s flash scatter);
  // hair, shadows and features stay below the threshold.
  bloom: {
    enabled: true,
    threshold: 0.78,
    softKnee: 0.12,
    blurSigma: 16,
    opacity: 0.18,
    tint: "#FFF3E4",
    blendMode: "screen",
  },

  // ANALOG FILM GRAIN
  grain: { enabled: true, luminanceStdDev: 0.012, chromaStdDev: 0.004, monochromeMix: 0.85 },

  // SOFT FADED PHOTOGRAPHIC EDGES: barely-there haze (was 0.68 opacity, ~82% less);
  // the strongest edge wins rather than stacking, so corners stay clear.
  edgeFade: { enabled: true, color: "#FFFBF7", widthFraction: 0.1, maxOpacity: 0.12, falloffPower: 2 },

  // OTHER
  vignette: 0,
  sharpening: 0,
  skinSmoothing: 0,
};

export type DreamFilmPreset = typeof DREAM_FILM;

/** Sigmas in the preset are defined at this image width. */
const REFERENCE_WIDTH = 1280;
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
uniform vec3 u_gains;
uniform float u_hiCompress, u_hiWarmth, u_shadowBlue;
uniform vec4 u_lip;       // hueCenter (0-1), hueWidth (0-1), minSaturation, saturationBoost
uniform float u_lipDepth;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

void main() {
  float x = u_mirror > 0.5 ? 1.0 - v_uv.x : v_uv.x;
  vec2 uv = u_crop.xy + vec2(x, v_uv.y) * u_crop.zw;
  vec3 c = texture2D(u_src, uv).rgb;

  c *= u_exposure;                                  // +EV
  c = (c - 0.5) * u_contrast + 0.5;                 // contrast around mid-grey
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, u_saturation);              // saturation
  c = pow(max(c, 0.0), vec3(1.0 / u_gamma));        // gamma
  c = u_blackLift + c * (1.0 - u_blackLift);        // lifted blacks
  c *= u_gains;                                     // gentle warmth

  c *= 1.0 - u_hiCompress * smoothstep(0.5, 1.0, c);              // soft shoulder
  lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += u_hiWarmth * smoothstep(0.5, 1.0, lum) * vec3(1.0, 0.45, -0.2);    // peach highlights
  c += u_shadowBlue * (1.0 - smoothstep(0.0, 0.5, lum)) * vec3(-0.4, 0.0, 1.0); // cool shadows

  // Lip & blush color: boost saturation of red-pink hues only.
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float dh = abs(hsv.x - u_lip.x);
  dh = min(dh, 1.0 - dh);
  float hueW = 1.0 - smoothstep(u_lip.y, 2.0 * u_lip.y, dh);
  float lipW = hueW * smoothstep(u_lip.z, u_lip.z + 0.15, hsv.y);
  float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l2), c, 1.0 + u_lip.w * lipW) * (1.0 - u_lipDepth * lipW);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Separable gaussian; result = mix(base, blur, u_mix), or screen(base, blur) at u_mix when u_screen is set. */
const BLUR_FRAG = `${PRECISION}
uniform sampler2D u_tex;
uniform sampler2D u_base;
uniform vec2 u_step;      // one texel along the blur axis
uniform float u_sigma;
uniform float u_mix;
uniform float u_screen;

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
  vec3 c = u_screen > 0.5 ? base + (blur - base * blur) * u_mix : mix(base, blur, u_mix);
  gl_FragColor = vec4(c, 1.0);
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
uniform vec3 u_bloomTint;
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
  vec3 b = texture2D(u_bloom, v_uv).rgb * u_bloomTint;
  c = c + (b - c * b) * u_bloomOpacity;             // screen at opacity

  vec2 p = floor(v_uv * u_size) + u_seed * 7.13;
  float n = gauss(p);
  vec3 nc = vec3(gauss(p + 101.0), gauss(p + 211.0), gauss(p + 307.0));
  c += vec3(n) * u_lumStd * u_mono + nc * (u_lumStd * (1.0 - u_mono) + u_chromaStd);

  // Faint edge haze: the stronger axis wins (no stacking), so corners stay clear.
  vec2 px = v_uv * u_size;
  float w = u_edgeWidth * min(u_size.x, u_size.y);
  float dx = min(px.x, u_size.x - px.x);
  float dy = min(px.y, u_size.y - px.y);
  float ax = pow(smoothstep(0.0, 1.0, 1.0 - clamp(dx / w, 0.0, 1.0)), u_edgePower);
  float ay = pow(smoothstep(0.0, 1.0, 1.0 - clamp(dy / w, 0.0, 1.0)), u_edgePower);
  float a = u_edgeOpacity * max(ax, ay);
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
    const k = W / REFERENCE_WIDTH;
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
      gl.uniform1f(grade.loc("u_hiCompress"), P.highlightCompression);
      gl.uniform1f(grade.loc("u_hiWarmth"), P.highlightWarmth);
      gl.uniform1f(grade.loc("u_shadowBlue"), P.shadowBlueTint);
      const lip = P.lipColor;
      gl.uniform4f(grade.loc("u_lip"), lip.hueCenter / 360, lip.hueWidth / 360, lip.minSaturation, lip.enabled ? lip.saturationBoost : 0);
      gl.uniform1f(grade.loc("u_lipDepth"), lip.enabled ? lip.depth : 0);
    });

    const blurPass = (
      from: Target,
      base: Target,
      out: Target,
      dir: [number, number],
      sigma: number,
      mix: number,
      screen = false,
    ) =>
      this.pass(blur, out, out.w, out.h, [from.tex, base.tex], () => {
        gl.uniform1i(blur.loc("u_tex"), 0);
        gl.uniform1i(blur.loc("u_base"), 1);
        gl.uniform2f(blur.loc("u_step"), dir[0] / from.w, dir[1] / from.h);
        gl.uniform1f(blur.loc("u_sigma"), sigma);
        gl.uniform1f(blur.loc("u_mix"), mix);
        gl.uniform1f(blur.loc("u_screen"), screen ? 1 : 0);
      });

    // 2. optical diffusion: blurred copy screened over the graded image
    const softSigma = P.softFocus.gaussianSigma * k;
    const softMix = P.softFocus.enabled ? P.softFocus.opacity : 0;
    blurPass(t.grade, t.grade, t.tmp, [1, 0], softSigma, 1);
    blurPass(t.tmp, t.grade, t.soft, [0, 1], softSigma, softMix, true);

    // 3. bloom: soft-knee bright pass of the graded image at ¼ res, gaussian blur
    this.pass(bright, t.bright, t.bright.w, t.bright.h, [t.grade.tex], () => {
      gl.uniform1i(bright.loc("u_tex"), 0);
      gl.uniform1f(bright.loc("u_threshold"), P.bloom.threshold);
      gl.uniform1f(bright.loc("u_knee"), P.bloom.softKnee);
    });
    const bloomSigma = (P.bloom.blurSigma * k) / BLOOM_DOWNSCALE;
    blurPass(t.bright, t.bright, t.tmpQ, [1, 0], bloomSigma, 1);
    blurPass(t.tmpQ, t.tmpQ, t.bloom, [0, 1], bloomSigma, 1);

    // 3b–5. screen bloom, grain, edge fade → canvas
    const edge = hexToRgb(P.edgeFade.color);
    const tint = hexToRgb(P.bloom.tint);
    this.pass(final, null, W, H, [t.soft.tex, t.bloom.tex], () => {
      gl.uniform1i(final.loc("u_soft"), 0);
      gl.uniform1i(final.loc("u_bloom"), 1);
      gl.uniform2f(final.loc("u_size"), W, H);
      gl.uniform1f(final.loc("u_seed"), (opts.seed ?? 1) % 997);
      gl.uniform1f(final.loc("u_bloomOpacity"), P.bloom.enabled ? P.bloom.opacity : 0);
      gl.uniform3f(final.loc("u_bloomTint"), tint[0], tint[1], tint[2]);
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
