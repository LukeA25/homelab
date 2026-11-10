// Approved halo settings from the design preview. These affect rendering only.
export const haloSettings = Object.freeze({
  speed: 1.50, bumps: 1.10, density: 12, sensitivity: 1.20,
  swell: .50, layers: 4, stroke: 2.00, fill: .23, weave: 7, stripHeight: 1.00,
});
const gray = [124, 124, 124], sage = [70, 146, 123], violet = [130, 105, 185];
export const voiceFrameRate = 30;
const turn = Math.PI * 2, frameInterval = 1000 / voiceFrameRate, transitionMs = 500;
const clamp = value => Math.max(0, Math.min(1, value));
const blend = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (color, alpha) => `rgba(${color.join(',')},${alpha})`;
function follow(current, target, dt, attack, release) {
  const next = current + (target - current) * (1 - Math.exp(-dt / (target > current ? attack : release)));
  return next < .001 ? 0 : next;
}
function palette(input, output) {
  const sum = input + output, hue = sum ? output / sum : .5;
  const strength = clamp(sum * 2), spread = 4 * hue * (1 - hue) * .45;
  return [blend(gray, blend(sage, violet, clamp(hue - spread)), strength),
    blend(gray, blend(sage, violet, clamp(hue + spread)), strength)];
}
function gradient(ctx, width, colors, alpha) {
  const g = ctx.createLinearGradient(width * .25, 0, width * .75, 0);
  g.addColorStop(0, rgba(colors[0], alpha)); g.addColorStop(1, rgba(colors[1], alpha));
  return g;
}

// All geometry buffers and spatial harmonics are allocated once, not each frame.
export function createVoiceRenderer() {
  const n = 160, cos = new Float32Array(n), sin = new Float32Array(n), cos2 = new Float32Array(n);
  const points = new Float32Array(n * 2), a = new Float32Array(4), b = new Float32Array(4);
  const freqs = [3, 6, 9, 12], amplitudes = [.024, .045, .030, .014], speeds = [.43, .76, -.39, 1.13];
  const bases = freqs.map(() => ({cos: new Float32Array(n), sin: new Float32Array(n)}));
  for (let i = 0; i < n; i++) {
    const angle = i * turn / n;
    cos[i] = Math.cos(angle); sin[i] = Math.sin(angle); cos2[i] = Math.cos(2 * angle);
    for (let j = 0; j < 4; j++) {
      bases[j].cos[i] = Math.cos(angle * freqs[j]); bases[j].sin[i] = Math.sin(angle * freqs[j]);
    }
  }
  const top = new Float32Array(97), bottom = new Float32Array(97), taper = new Float32Array(97);
  for (let i = 0; i <= 96; i++) taper[i] = Math.sin(Math.PI * i / 96) ** 1.3;
  function outline(ctx, size, radius, time, energy, scale, phase, reduced) {
    const detail = Math.min(1.25, Math.sqrt(energy) * 1.02 * haloSettings.bumps) * (reduced ? .18 : 1);
    for (let j = 0; j < 4; j++) {
      const angle = speeds[j] * time + .07 * Math.sin(time * .63 + j) + phase * .055 * (j % 2 ? -1 : 1);
      const drift = freqs[j] * angle + j * 1.37;
      const amp = amplitudes[j] * (.78 + .22 * Math.sin(time * (.73 + j * .217) + j * 2.1));
      a[j] = Math.cos(drift) * amp; b[j] = Math.sin(drift) * amp;
    }
    const broadSin = Math.sin(time * .57), broadCos = Math.cos(time * .81);
    for (let i = 0; i < n; i++) {
      let ripple = 0;
      for (let j = 0; j < 4; j++) ripple += bases[j].cos[i] * a[j] + bases[j].sin[i] * b[j];
      // The slower broad swell is also amplitude gated: exact circle at rest.
      const broad = .02 * (cos2[i] * broadSin + bases[0].sin[i] * broadCos);
      const r = radius * scale * (1 + detail * ripple + energy * broad * (reduced ? .18 : 1));
      points[i * 2] = size / 2 + cos[i] * r; points[i * 2 + 1] = size / 2 + sin[i] * r;
    }
    ctx.beginPath(); ctx.moveTo((points[0] + points[n * 2 - 2]) / 2, (points[1] + points[n * 2 - 1]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ctx.quadraticCurveTo(points[2 * i], points[2 * i + 1], (points[2 * i] + points[2 * j]) / 2, (points[2 * i + 1] + points[2 * j + 1]) / 2);
    }
    ctx.closePath();
  }
  return {
    halo(ctx, size, time, energy, colors, reduced = false, swellEnergy = energy) {
      const radius = size * .22 * (1 + haloSettings.swell * swellEnergy * (reduced ? .18 : 1));
      const mid = size / 2;
      if (!energy) {ctx.beginPath(); ctx.arc(mid, mid, radius, 0, turn);}
      else outline(ctx, size, radius, time, energy, 1, 0, reduced);
      const glow = ctx.createRadialGradient(mid, mid, 0, mid, mid, radius * 1.15);
      const color = blend(colors[0], colors[1], .5);
      glow.addColorStop(0, rgba(color, .025)); glow.addColorStop(.7, rgba(color, .07)); glow.addColorStop(1, rgba(color, .20));
      ctx.fillStyle = glow; ctx.fill();
      // The fill already traced the outer contour. Stroke the same path.
      ctx.strokeStyle = energy ? gradient(ctx, size, colors, .85) : rgba(gray, .7);
      ctx.lineWidth = haloSettings.stroke; ctx.stroke();
      if (!energy) return;
      ctx.strokeStyle = gradient(ctx, size, colors, .30);
      ctx.lineWidth = haloSettings.stroke * .55;
      for (let layer = haloSettings.layers - 1; layer > 0; layer--) {
        outline(ctx, size, radius, time, energy, 1 - layer * .042 * Math.sqrt(energy), layer * .9, reduced);
        ctx.stroke();
      }
    },
    ribbon(ctx, width, height, time, energy, colors, reduced = false) {
      const left = 6, span = width - 12, cy = height / 2;
      const detail = Math.min(1.25, Math.sqrt(energy) * 1.02 * haloSettings.bumps) * (reduced ? .18 : 1);
      for (let i = 0; i <= 96; i++) {
        const f = i / 96;
        const wave = phase => taper[i] * (1.2 + energy * 5 * (reduced ? .18 : 1) + detail * (3 + 3 * Math.sin(f * 4 * Math.PI - time * 3.8 + phase) ** 2 + 2 * Math.sin(f * 6 * Math.PI + time * 2.2 + phase) ** 2));
        top[i] = Math.min(cy - 2, wave(0) * haloSettings.stripHeight);
        bottom[i] = Math.min(cy - 2, wave(1.8) * haloSettings.stripHeight);
      }
      const boundary = () => {
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
          const x = left + span * i / 96, y = cy - top[i];
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        for (let i = 96; i >= 0; i--) ctx.lineTo(left + span * i / 96, cy + bottom[i]);
        ctx.closePath();
      };
      boundary(); ctx.fillStyle = gradient(ctx, width, colors, haloSettings.fill); ctx.fill();
      ctx.strokeStyle = gradient(ctx, width, colors, .80); ctx.lineWidth = haloSettings.stroke * .6; ctx.stroke();
      ctx.save(); ctx.clip(); ctx.beginPath();
      for (let strand = 0; strand < haloSettings.weave; strand++) {
        for (let i = 0; i <= 96; i++) {
          const f = i / 96, wave = Math.sin(f * Math.PI * (3 + strand * .43) - time * (strand % 2 ? -1.1 : 1.5) + strand * .95);
          const x = left + span * f, y = cy + wave * (wave < 0 ? top[i] : bottom[i]) * .91;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
      }
      ctx.strokeStyle = gradient(ctx, width, colors, .40); ctx.lineWidth = haloSettings.stroke * .48; ctx.stroke();
      ctx.restore();
    },
  };
}

export function createOrb(sphere, strip, {onFrame} = {}) {
  // A slightly longer audio window suppresses single-cycle level spikes.
  const renderer = createVoiceRenderer(), samples = new Float32Array(512);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let audioContext, input, output, inputLevel = 0, outputLevel = 0, inputTint = 0, outputTint = 0, swellEnergy = 0;
  let frame = 0, lastDraw = 0, nextDraw = 0, time = 0, dirty = true, visible = true;
  let compact = false, transitionUntil = 0;
  const views = [sphere, strip].map(canvas => ({canvas, ctx: canvas.getContext('2d'), width: 0, height: 0}));
  function resize() {
    for (const view of views) {
      view.width = view.canvas.clientWidth; view.height = view.canvas.clientHeight;
      if (!view.width || !view.height) continue;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      view.canvas.width = Math.round(view.width * dpr); view.canvas.height = Math.round(view.height * dpr);
      view.ctx?.setTransform(view.canvas.width / view.width, 0, 0, view.canvas.height / view.height, 0, 0);
    }
    refresh();
  }
  function analyser(stream) {
    const source = audioContext.createMediaStreamSource(stream), meter = audioContext.createAnalyser();
    meter.fftSize = samples.length; source.connect(meter); return {source, meter};
  }
  function level(signal) {
    if (!signal) return 0;
    signal.meter.getFloatTimeDomainData(samples);
    let sum = 0; for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    // Noise floor avoids reacting to near-silence; compression makes quiet syllables visible.
    return rms <= .004 ? 0 : clamp(((rms - .004) * 18 * haloSettings.sensitivity) ** .65);
  }
  function schedule() {if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);}
  function refresh() {dirty = true; schedule();}
  function draw(now) {
    frame = 0; if (!visible || document.hidden) return;
    // Allow small display timestamp variations without skipping a refresh cycle.
    if (!dirty && now + 1 < nextDraw) {schedule(); return;}
    const interval = reducedMotion.matches ? 100 : frameInterval;
    const elapsed = Math.min(.1, Math.max(0, (now - lastDraw) / 1000)); lastDraw = now;
    nextDraw = nextDraw > 0 && now - nextDraw < interval ? nextDraw + interval : now + interval;
    const before = inputLevel + outputLevel + inputTint + outputTint + swellEnergy, mic = level(input), speaker = level(output);
    // Keep syllables responsive; give the whole silhouette a little more inertia.
    inputLevel = follow(inputLevel, mic, elapsed, .075, .21); outputLevel = follow(outputLevel, speaker, elapsed, .075, .21);
    inputTint = follow(inputTint, mic > 0 ? 1 : 0, elapsed, .14, .46); outputTint = follow(outputTint, speaker > 0 ? 1 : 0, elapsed, .14, .46);
    const energy = Math.max(inputLevel, outputLevel), transitioning = now < transitionUntil;
    swellEnergy = follow(swellEnergy, energy, elapsed, .085, .16);
    const after = inputLevel + outputLevel + inputTint + outputTint + swellEnergy;
    if (!reducedMotion.matches) time += elapsed * (.45 + .55 * Math.sqrt(swellEnergy)) * haloSettings.speed;
    if (dirty || before || after || transitioning) {
      const began = onFrame ? performance.now() : 0, colors = palette(inputTint, outputTint);
      const drawView = (view, type) => {
        if (!view.ctx || !view.width || !view.height) return;
        view.ctx.clearRect(0, 0, view.width, view.height);
        if (type === 'halo') renderer.halo(view.ctx, view.width, time, energy, colors, reducedMotion.matches, swellEnergy);
        else renderer.ribbon(view.ctx, view.width, view.height, time, energy, colors, reducedMotion.matches);
      };
      if (!compact || transitioning) drawView(views[0], 'halo');
      if (compact || transitioning) drawView(views[1], 'ribbon');
      onFrame?.({duration: performance.now() - began, view: transitioning ? 'transition' : compact ? 'ribbon' : 'halo', energy, swellEnergy});
      dirty = false;
    }
    if (input || output || after || transitioning) schedule();
  }
  const observer = new ResizeObserver(resize); views.forEach(v => observer.observe(v.canvas));
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) refresh(); else {cancelAnimationFrame(frame); frame = 0;}
  });
  intersection.observe(sphere.parentElement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {cancelAnimationFrame(frame); frame = 0;} else refresh();
  });
  reducedMotion.addEventListener('change', refresh); resize();
  return {
    async start() {audioContext = new AudioContext(); await audioContext.resume();},
    input(stream) {input?.source.disconnect(); input = analyser(stream); schedule();},
    output(stream) {output?.source.disconnect(); output = analyser(stream); schedule();},
    setCompact(open) {if (compact === open) return; compact = open; transitionUntil = reducedMotion.matches ? 0 : performance.now() + transitionMs; refresh();},
    stop() {input?.source.disconnect(); output?.source.disconnect(); input = output = null; audioContext?.close(); audioContext = null; refresh();},
  };
}
