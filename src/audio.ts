let context: AudioContext | null = null;
let master: GainNode | null = null;
let playing = false;

function createContext(): AudioContext | null {
  const scoped = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? scoped.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function buildGraph(audio: AudioContext): GainNode {
  const output = audio.createGain();
  output.gain.value = 0;
  output.connect(audio.destination);

  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  filter.Q.value = 0.55;
  filter.connect(output);

  const low = audio.createOscillator();
  low.type = 'sine';
  low.frequency.value = 73.42;
  const lowGain = audio.createGain();
  lowGain.gain.value = 0.2;
  low.connect(lowGain);
  lowGain.connect(filter);

  const mid = audio.createOscillator();
  mid.type = 'sine';
  mid.frequency.value = 110;
  const midGain = audio.createGain();
  midGain.gain.value = 0.07;
  mid.connect(midGain);
  midGain.connect(filter);

  const noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015;
    data[i] = last;
  }
  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 740;
  band.Q.value = 0.35;
  const noiseGain = audio.createGain();
  noiseGain.gain.value = 0.045;
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(filter);

  const lfo = audio.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 160;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  low.start();
  mid.start();
  noise.start();
  lfo.start();
  return output;
}

export async function toggleAmbient(): Promise<boolean> {
  if (!context) {
    context = createContext();
    if (!context) return false;
    master = buildGraph(context);
  }
  if (!master || !context) return false;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  playing = !playing;
  const now = context.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(playing ? 0.2 : 0, now + 0.7);
  return playing;
}

export function ambientPlaying(): boolean {
  return playing;
}
