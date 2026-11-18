// Sound for Solmar Bay: a WebAudio layer made entirely in code — no audio files.
// Everything is an oscillator shaped by a gain envelope. It starts only after the
// player's first input, and every call is safe when there is no audio device at all
// (a headless run, a muted tab): nothing here ever throws.
export function createSound() {
  // Mute lives in local storage, so it survives a reload: '1' is muted.
  const MUTE_KEY = 'solmar-bay-muted-v1';
  let muted = false;
  try {
    if (typeof localStorage !== 'undefined') muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  function applyMute() {
    if (!master) return;
    try {
      master.gain.value = muted ? 0 : 0.5;
    } catch {
      // No audio device: stay silent.
    }
  }
  let actx = null;
  let master = null;
  let engineGain = null;
  let engineOscA = null;
  let engineOscB = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenStep = 0;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;
  let noiseBuf = null;
  let started = false;

  // A short burst of white noise, generated once and reused for gunshots.
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(actx.sampleRate * 0.15);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // One tone: an oscillator that slides from `from` to `to` over `dur` seconds.
  function tone(type, from, to, dur, vol, when = 0) {
    if (!actx) return;
    try {
      const t0 = actx.currentTime + when;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // No audio device: stay silent, never break the game.
    }
  }

  // A 16-step bass line in A minor, with a soft lead note every fourth step.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 0, 65.41, 0];
  const LEAD = [220, 0, 0, 0, 261.63, 0, 0, 0, 329.63, 0, 0, 0, 293.66, 0, 0, 0];

  function startMusic() {
    if (musicTimer !== null) return;
    musicTimer = setInterval(() => {
      if (!actx || actx.state !== 'running') return;
      const bass = BASS[musicStep % 16];
      if (bass) tone('triangle', bass, bass, 0.22, 0.10);
      const lead = LEAD[musicStep % 16];
      if (lead) tone('sine', lead, lead, 0.3, 0.045);
      musicStep += 1;
    }, 240);
  }

  function startSiren() {
    if (sirenTimer !== null) return;
    sirenOsc = actx.createOscillator();
    sirenGain = actx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 660;
    sirenGain.gain.value = 0.035;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenTimer = setInterval(() => {
      if (!sirenOsc) return;
      sirenStep = 1 - sirenStep;
      sirenOsc.frequency.value = sirenStep === 0 ? 660 : 880;
    }, 380);
  }

  function stopSiren() {
    if (sirenTimer !== null) {
      clearInterval(sirenTimer);
      sirenTimer = null;
    }
    if (sirenOsc) {
      try {
        sirenOsc.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc = null;
      sirenGain = null;
    }
  }

  return {
    // Whether the sound is muted right now.
    isMuted() {
      return muted;
    },
    // Flip the mute and remember it across reloads. Every sound runs through
    // the master gain, so turning it to zero silences the whole game.
    toggleMuted() {
      muted = !muted;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // No storage: the mute still holds for this session.
      }
      applyMute();
      return muted;
    },
    // Call on the first input. Creates the audio graph and starts the engine
    // hum and the music loop. Safe to call every frame: it runs once.
    ensure() {
      if (started) return true;
      try {
        const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
        if (!AC) return false;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(actx.destination);
        // Engine hum: two detuned saws through a lowpass, quiet at rest.
        const filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineGain = actx.createGain();
        engineGain.gain.value = 0.0;
        engineOscA = actx.createOscillator();
        engineOscA.type = 'sawtooth';
        engineOscA.frequency.value = 55;
        engineOscB = actx.createOscillator();
        engineOscB.type = 'sawtooth';
        engineOscB.frequency.value = 55.7;
        engineOscA.connect(filter);
        engineOscB.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOscA.start();
        engineOscB.start();
        started = true;
        if (actx.state === 'suspended') actx.resume().catch(() => {});
        startMusic();
        return true;
      } catch {
        return false;
      }
    },
    // Try again to wake the audio after a user gesture.
    resume() {
      if (actx && actx.state === 'suspended') {
        actx.resume().catch(() => {});
      }
    },
    // Engine hum follows how fast the car is going: 0 on foot, 1 at top speed.
    setEngine(frac) {
      if (!actx || !engineGain) return;
      try {
        const target = 0.015 + Math.max(0, Math.min(1, frac)) * 0.085;
        engineGain.gain.setTargetAtTime(target, actx.currentTime, 0.08);
        const freq = 55 + Math.max(0, Math.min(1, frac)) * 55;
        engineOscA.frequency.setTargetAtTime(freq, actx.currentTime, 0.08);
        engineOscB.frequency.setTargetAtTime(freq * 1.013, actx.currentTime, 0.08);
      } catch {
        // Stay silent.
      }
    },
    // The two-tone siren while any wanted star is lit.
    setSiren(on) {
      if (!actx) return;
      try {
        if (on && sirenTimer === null) startSiren();
        else if (!on && sirenTimer !== null) stopSiren();
      } catch {
        // Stay silent.
      }
    },
    // A punch: a short square sweep down.
    punch() {
      tone('square', 170, 65, 0.12, 0.16);
    },
    // A gunshot: a noise burst with a low thump under it.
    shot() {
      if (!actx) return;
      try {
        const src = actx.createBufferSource();
        src.buffer = noiseBuffer();
        const gain = actx.createGain();
        gain.gain.setValueAtTime(0.22, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.14);
        const filter = actx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 900;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start();
      } catch {
        // Stay silent.
      }
      tone('sine', 95, 42, 0.16, 0.2);
    },
    // A heavy thud: a goon goes down, or metal hits metal.
    thud() {
      tone('sine', 75, 42, 0.16, 0.2);
    },
    // Two low notes: Deke's crew is coming.
    alert() {
      tone('square', 220, 220, 0.14, 0.1);
      tone('square', 196, 196, 0.16, 0.1, 0.16);
    },
    // Mission complete: four rising notes.
    jingle() {
      tone('sine', 523.25, 523.25, 0.22, 0.14);
      tone('sine', 659.25, 659.25, 0.22, 0.14, 0.11);
      tone('sine', 783.99, 783.99, 0.22, 0.14, 0.22);
      tone('sine', 1046.5, 1046.5, 0.34, 0.16, 0.33);
    },
  };
}
