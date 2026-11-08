/* Lofi kitchen: a small generative lofi loop and soft UI sounds, all made with Web Audio */
(() => {
  const A = { ctx: null, master: null, music: null, sfx: null, musicOn: true, sfxOn: true, playing: false, timer: null, nextBar: 0, bar: 0 };
  window.mpAudio = A;
  const BPM = 72, BEAT = 60 / BPM, BAR = BEAT * 4;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Fmaj7 – Em7 – Dm7 – Cmaj7, voiced low and warm
  const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
  const BASS = [41, 40, 38, 36];
  const PENTA = [72, 74, 76, 79, 81, 84];

  const init = () => {
    if (A.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    A.ctx = ctx;
    A.master = ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(ctx.destination);
    // music bus: gentle "tape" lowpass with a slow wobble
    const tape = ctx.createBiquadFilter(); tape.type = 'lowpass'; tape.frequency.value = 2100; tape.Q.value = 0.4;
    const wob = ctx.createOscillator(); wob.frequency.value = 0.15;
    const wobAmt = ctx.createGain(); wobAmt.gain.value = 260;
    wob.connect(wobAmt).connect(tape.frequency); wob.start();
    A.music = ctx.createGain(); A.music.gain.value = 0;
    A.music.connect(tape).connect(A.master);
    A.sfx = ctx.createGain(); A.sfx.gain.value = 0.55; A.sfx.connect(A.master);
    // vinyl crackle loop
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.012 + (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.5 : 0);
    const crackle = ctx.createBufferSource(); crackle.buffer = buf; crackle.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const cg = ctx.createGain(); cg.gain.value = 0.5;
    crackle.connect(hp).connect(cg).connect(A.music); crackle.start();
    A.noise = (() => { const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), x = n.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; return n; })();
    return true;
  };

  const keys = (t, midi, dur, vel) => {
    const ctx = A.ctx;
    [0, 12].forEach((oct, j) => {
      const o = ctx.createOscillator(); o.type = j ? 'sine' : 'triangle';
      o.frequency.value = hz(midi + oct); o.detune.value = (Math.random() - 0.5) * 10;
      const g = ctx.createGain(); const v = vel * (j ? 0.18 : 0.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03);
      g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(A.music); o.start(t); o.stop(t + dur + 0.05);
    });
  };
  const bass = (t, midi, dur) => {
    const o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(midi - 12);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(A.music); o.start(t); o.stop(t + dur + 0.05);
  };
  const kick = (t) => {
    const o = A.ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(A.music); o.start(t); o.stop(t + 0.4);
  };
  const noiseHit = (t, type, freq, dur, vol) => {
    const s = A.ctx.createBufferSource(); s.buffer = A.noise;
    const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    const g = A.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(A.music); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  const scheduleBar = (t, n) => {
    const i = n % 4;
    CHORDS[i].forEach((m, k) => keys(t + k * 0.025 + 0.01, m, BAR * 0.95, 0.16));
    bass(t, BASS[i], BEAT * 1.6); bass(t + BEAT * 2.5, BASS[i], BEAT * 1.2);
    kick(t); kick(t + BEAT * 2.5); if (Math.random() < 0.5) kick(t + BEAT * 1.75);
    noiseHit(t + BEAT, 'bandpass', 1700, 0.2, 0.22); noiseHit(t + BEAT * 3, 'bandpass', 1700, 0.2, 0.22);
    for (let h = 0; h < 8; h++) { const swing = h % 2 ? BEAT * 0.08 : 0; noiseHit(t + h * BEAT / 2 + swing, 'highpass', 7000, 0.05, h % 2 ? 0.05 : 0.08); }
    for (let b = 0; b < 4; b++) if (Math.random() < 0.3) keys(t + b * BEAT + BEAT * 0.5, PENTA[Math.floor(Math.random() * PENTA.length)], BEAT * 1.8, 0.09);
  };
  const tick = () => {
    while (A.nextBar < A.ctx.currentTime + 0.4) { scheduleBar(A.nextBar, A.bar++); A.nextBar += BAR; }
  };

  A.startMusic = () => {
    if (!A.musicOn || !init()) return;
    A.ctx.resume();
    A.playing = true;
    if (!A.timer) { A.nextBar = A.ctx.currentTime + 0.1; A.timer = setInterval(tick, 50); tick(); }
    const g = A.music.gain; g.cancelScheduledValues(A.ctx.currentTime); g.setTargetAtTime(0.42, A.ctx.currentTime, 0.9);
    if (A.onchange) A.onchange();
  };
  A.stopMusic = () => {
    A.playing = false;
    if (A.ctx) {
      const g = A.music.gain; g.cancelScheduledValues(A.ctx.currentTime); g.setTargetAtTime(0, A.ctx.currentTime, 0.5);
      clearTimeout(A.stopT);
      A.stopT = setTimeout(() => { if (!A.playing && A.timer) { clearInterval(A.timer); A.timer = null; } }, 3000);
    }
    if (A.onchange) A.onchange();
  };

  // Soft UI sounds
  const tone = (f, t, dur, vol, type) => {
    const o = A.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = f;
    const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(A.sfx); o.start(t); o.stop(t + dur + 0.05);
  };
  const whoosh = (t, up) => {
    const s = A.ctx.createBufferSource(); s.buffer = A.noise;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 400 : 2200, t); f.frequency.exponentialRampToValueAtTime(up ? 2200 : 400, t + 0.45);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(f).connect(g).connect(A.sfx); s.start(t); s.stop(t + 0.55);
  };
  A.sfxPlay = (name) => {
    if (!A.sfxOn || !init()) return;
    A.ctx.resume();
    const t = A.ctx.currentTime + 0.01;
    if (name === 'tap') tone(hz(79), t, 0.18, 0.12);
    else if (name === 'tick') { tone(hz(88), t, 0.08, 0.08); tone(hz(93), t + 0.05, 0.12, 0.06); }
    else if (name === 'open') { whoosh(t, true); tone(hz(72), t + 0.08, 0.5, 0.1); tone(hz(76), t + 0.16, 0.5, 0.09); tone(hz(79), t + 0.24, 0.7, 0.08); }
    else if (name === 'close') { whoosh(t, false); tone(hz(76), t, 0.3, 0.07); tone(hz(72), t + 0.08, 0.4, 0.06); }
    else if (name === 'swap') { whoosh(t, true); tone(hz(74), t + 0.12, 0.35, 0.09, 'triangle'); tone(hz(81), t + 0.22, 0.45, 0.08, 'triangle'); }
    else if (name === 'win') { [72, 76, 79, 84].forEach((m, i) => tone(hz(m), t + i * 0.08, 0.55, 0.09, 'triangle')); }
    else if (name === 'enter') { whoosh(t, true); [60, 64, 67, 71, 74].forEach((m, i) => tone(hz(m + 12), t + 0.1 + i * 0.07, 0.9, 0.07, 'triangle')); }
  };
})();
