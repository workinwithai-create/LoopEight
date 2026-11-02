const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const recipes = [
  { id:"sparse", name:"Sparse intro", blurb:"Intro is kit only. Verse full. Hook denser." },
  { id:"build", name:"Build", blurb:"Hats open gradually. Bass walks more." },
  { id:"hook-hit", name:"Hook hit", blurb:"Crash and denser piano on hook." },
  { id:"space", name:"Space", blurb:"Drop kit on bars 5-6 of verse for air." }
];
const state = {
  bpm: 98,
  key: "A minor",
  bars: 8,
  chords: ["Am","F","C","G"],
  recipe: recipes[0],
  playing: false,
  step: 0,
  nextStepTime: 0,
  activeSources: []
};
let ctx, master, compressor, buffers = {}, rawBuffers = {};
let timerId = null;
let playheadRaf = null;

function midiFromChord(sym) {
  const map = { Am:[45,48,52,57], F:[41,45,48,53], C:[48,52,55,60], G:[43,47,50,55], Em:[40,43,47,52], Dm:[38,41,45,50], Bm:[35,38,42,47] };
  return map[sym] || [45,48,52,57];
}
function bassMidi(sym) {
  const map = { Am:33, F:41, C:36, G:31, Em:28, Dm:26, Bm:23 };
  return map[sym] || 33;
}

async function loadSamples() {
  const files = [
    ["kick", `${CDN}/drums/kick.mp3`],
    ["snare", `${CDN}/drums/snare.mp3`],
    ["hat", `${CDN}/drums/hihat.mp3`],
    ["crash", `${CDN}/drums/crash.mp3`],
    ["pC3", `${CDN}/piano/C3.mp3`],
    ["pC4", `${CDN}/piano/C4.mp3`],
    ["pA3", `${CDN}/piano/A3.mp3`],
    ["bE1", `${CDN}/bass/E1.mp3`],
    ["bA1", `${CDN}/bass/A1.mp3`],
    ["gE2", `${CDN}/guitar/E2.mp3`],
    ["gA2", `${CDN}/guitar/A2.mp3`]
  ];
  const status = document.getElementById("status");
  let loaded = 0;
  const missing = [];
  for (const [k, url] of files) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("fetch fail");
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
      console.warn(k, e);
    }
    loaded++;
    status.textContent = `Loading ${loaded}/${files.length}${missing.length ? " · missing: " + missing.join(", ") : ""}`;
  }
  if (missing.length) {
    status.textContent = "Missing instruments: " + missing.join(", ") + " — cannot play";
    return false;
  }
  status.textContent = "Chairs seated · live FluidR3";
  return true;
}

function playLiveBuf(name, when, rate = 1, gain = 0.4, duration = 0.2) {
  const b = buffers[name];
  if (!b || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.setValueAtTime(gain, when + Math.max(0, duration - 0.02));
  g.gain.linearRampToValueAtTime(0, when + duration);
  src.connect(g);
  g.connect(master);
  src.start(when);
  src.stop(when + duration + 0.05);
  state.activeSources.push(src);
  src.onended = () => {
    const i = state.activeSources.indexOf(src);
    if (i > -1) state.activeSources.splice(i, 1);
  };
  return src;
}

function rateFromMidi(midi, base) { return Math.pow(2, (midi - base) / 12); }

function scheduleStep(step, when) {
  const bar = Math.floor(step / 16);
  const stepInBar = step % 16;
  const chordIdx = bar % 4;
  const chord = state.chords[chordIdx];
  const notes = midiFromChord(chord);
  const bMidi = bassMidi(chord);
  const isIntro = bar < 4 && state.bars > 8;
  const isHook = bar >= 12 && state.bars > 8;
  const rec = state.recipe.id;

  if (stepInBar === 0) playLiveBuf("kick", when, 1, isIntro ? 0.4 : 0.65, 0.3);
  if (stepInBar === 8 && !isIntro) playLiveBuf("snare", when, 1, 0.45, 0.25);
  if (stepInBar % 2 === 0) playLiveBuf("hat", when, rec === "build" && bar > 4 ? 0.95 : 1, isIntro ? 0.04 : 0.07, 0.15);
  if (isHook && stepInBar === 0 && bar === 12) playLiveBuf("crash", when, 1, 0.3, 0.8);

  if (stepInBar === 0) {
    playLiveBuf("pC4", when, rateFromMidi(notes[2] || 60, 60), isHook ? 0.35 : 0.25, 0.9);
    playLiveBuf("pA3", when, rateFromMidi(notes[1] || 57, 57), 0.18, 0.9);
    playLiveBuf("gA2", when, rateFromMidi(notes[0] || 45, 45), isIntro ? 0.12 : 0.2, 0.6);
    playLiveBuf("bA1", when, rateFromMidi(bMidi, 33), isIntro ? 0.25 : 0.45, 0.5);
  }
}

function scheduler() {
  while (state.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(state.step, state.nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    state.nextStepTime += stepDur;
    state.step = (state.step + 1) % (state.bars * 16);
  }
}

function start() {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  state.playing = true;
  state.nextStepTime = ctx.currentTime + 0.1;
  state.step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  state.activeSources.forEach(s => { try { s.stop(); } catch(e){} });
  state.activeSources = [];
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  paintBars();
}

function updatePlayhead() {
  if (!state.playing || !ctx) return;
  const stepDur = 60 / state.bpm / 4;
  const totalElapsed = (state.step * stepDur) + (ctx.currentTime - state.nextStepTime + SCHEDULE_AHEAD);
  const currentStep = Math.floor(totalElapsed / stepDur) % (state.bars * 16);
  const currentBar = Math.floor(currentStep / 16);
  document.querySelectorAll(".bar").forEach((el, i) => {
    el.classList.toggle("active", i === currentBar);
  });
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

async function initAudio() {
  if (ctx) return true;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.7;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  document.getElementById("tap-overlay").classList.add("hidden");
  document.getElementById("status").textContent = "Loading samples…";
  return await loadSamples();
}

function saveState() {
  localStorage.setItem("loopeight", JSON.stringify({
    bpm: state.bpm, key: state.key, bars: state.bars, chords: state.chords, recipe: state.recipe.id
  }));
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("loopeight") || "{}");
    if (s.bpm) state.bpm = s.bpm;
    if (s.key) state.key = s.key;
    if (s.bars) state.bars = s.bars;
    if (s.chords) state.chords = s.chords;
    if (s.recipe) state.recipe = recipes.find(r => r.id === s.recipe) || recipes[0];
  } catch(e) {}
}

function paint() {
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("key").value = state.key;
  document.getElementById("bars").value = state.bars;
  ["c1","c2","c3","c4"].forEach((id,i) => document.getElementById(id).value = state.chords[i]);
  const el = document.getElementById("recipes");
  el.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe.id === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r; saveState(); paint(); };
    el.appendChild(b);
  });
  paintBars();
  document.getElementById("punch").textContent = punch();
}
function paintBars() {
  const el = document.getElementById("bars");
  el.innerHTML = "";
  const total = state.bars;
  for (let i = 0; i < total; i++) {
    const d = document.createElement("div");
    const zone = total > 8 ? (i < 4 ? "intro" : i < 12 ? "verse" : "hook") : "verse";
    d.className = "bar " + zone;
    const chord = state.chords[i % 4];
    d.innerHTML = `<div class="n">${i+1}</div><div class="c">${chord}</div>`;
    el.appendChild(d);
  }
}
function punch() {
  return `LoopEight punch list\n${state.bpm} BPM · ${state.key} · ${state.recipe.name}\n\nThe problem: stuck in the 8-bar loop. No form, no finish.\nThe move: ${state.recipe.blurb}\n\nChords: ${state.chords.join(" – ")}\n\nLive chairs only. Drop the WAV on bar 1 of your session. Distinct from LiftTwo, PreEight, TagFour.\n`;
}

// events
document.getElementById("tap-overlay").onclick = async () => { await initAudio(); };
document.body.addEventListener("click", async (e) => { if (!ctx) await initAudio(); }, { once: true });

document.getElementById("bpm").onchange = e => { state.bpm = Math.max(60, Math.min(180, +e.target.value)); saveState(); };
document.getElementById("key").onchange = e => { state.key = e.target.value; saveState(); };
document.getElementById("bars").onchange = e => { state.bars = +e.target.value; saveState(); paint(); };
["c1","c2","c3","c4"].forEach((id,i) => {
  document.getElementById(id).onchange = e => { state.chords[i] = e.target.value || "Am"; saveState(); paint(); };
});

document.getElementById("playA").onclick = async () => {
  if (!(await initAudio())) return;
  state.bars = 8;
  document.getElementById("bars").value = 8;
  paint();
  stop();
  start();
};
document.getElementById("playB").onclick = async () => {
  if (!(await initAudio())) return;
  state.bars = 16;
  document.getElementById("bars").value = 16;
  paint();
  stop();
  start();
};
document.getElementById("stop").onclick = stop;

async function exportWAV() {
  if (!(await initAudio())) return;
  const sampleRate = 48000;
  const exactSamples = Math.round(state.bars * 4 * 60 / state.bpm * sampleRate);
  const tailSamples = Math.round(2 * sampleRate);
  const totalSamples = exactSamples + tailSamples;
  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);
  const offMaster = offline.createGain();
  offMaster.gain.value = 0.7;
  const offComp = offline.createDynamicsCompressor();
  offComp.threshold.value = -12;
  offComp.ratio.value = 8;
  offMaster.connect(offComp);
  offComp.connect(offline.destination);

  const offBuffers = {};
  for (const [k, ab] of Object.entries(rawBuffers)) {
    offBuffers[k] = await offline.decodeAudioData(ab.slice(0));
  }

  function playOff(name, when, rate, gain, duration) {
    const b = offBuffers[name];
    if (!b) return;
    const src = offline.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = offline.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.setValueAtTime(gain, when + Math.max(0, duration - 0.02));
    g.gain.linearRampToValueAtTime(0, when + duration);
    src.connect(g);
    g.connect(offMaster);
    src.start(when);
    src.stop(when + duration + 0.05);
  }

  const stepDur = 60 / state.bpm / 4;
  for (let step = 0; step < state.bars * 16; step++) {
    const when = step * stepDur;
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const chordIdx = bar % 4;
    const chord = state.chords[chordIdx];
    const notes = midiFromChord(chord);
    const bMidi = bassMidi(chord);
    const isIntro = bar < 4 && state.bars > 8;
    const isHook = bar >= 12 && state.bars > 8;
    const rec = state.recipe.id;

    if (stepInBar === 0) playOff("kick", when, 1, isIntro ? 0.4 : 0.65, 0.3);
    if (stepInBar === 8 && !isIntro) playOff("snare", when, 1, 0.45, 0.25);
    if (stepInBar % 2 === 0) playOff("hat", when, rec === "build" && bar > 4 ? 0.95 : 1, isIntro ? 0.04 : 0.07, 0.15);
    if (isHook && stepInBar === 0 && bar === 12) playOff("crash", when, 1, 0.3, 0.8);

    if (stepInBar === 0) {
      playOff("pC4", when, rateFromMidi(notes[2] || 60, 60), isHook ? 0.35 : 0.25, 0.9);
      playOff("pA3", when, rateFromMidi(notes[1] || 57, 57), 0.18, 0.9);
      playOff("gA2", when, rateFromMidi(notes[0] || 45, 45), isIntro ? 0.12 : 0.2, 0.6);
      playOff("bA1", when, rateFromMidi(bMidi, 33), isIntro ? 0.25 : 0.45, 0.5);
    }
  }

  const rendered = await offline.startRendering();
  const channelData = [];
  for (let ch = 0; ch < 2; ch++) {
    const full = rendered.getChannelData(ch);
    const main = full.subarray(0, exactSamples);
    const tail = full.subarray(exactSamples);
    for (let i = 0; i < Math.min(tail.length, main.length); i++) {
      main[i] += tail[i];
    }
    channelData.push(main);
  }
  let peak = 0;
  for (const ch of channelData) {
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  }
  const target = Math.pow(10, -1 / 20);
  const scale = peak > target ? target / peak : 1;
  for (const ch of channelData) {
    for (let i = 0; i < ch.length; i++) ch[i] *= scale;
  }

  const wav = encodeWAV(channelData, sampleRate, 24);
  const blob = new Blob([wav], { type: "audio/wav" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `loopeight-${state.recipe.id}-${state.bpm}bpm-${state.key.replace(/\s+/g,"")}.wav`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function encodeWAV(channels, sampleRate, bitDepth) {
  const numChannels = channels.length;
  const samples = channels[0].length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples * blockAlign);
  const view = new DataView(buffer);
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * blockAlign, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, samples * blockAlign, true);
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const val = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
        offset += 3;
      }
    }
  }
  return buffer;
}

function exportMIDI() {
  const tempo = Math.round(60000000 / state.bpm);
  const ticksPerBeat = 480;
  const events = [];
  events.push({ delta: 0, status: 0xFF, meta: 0x51, data: [(tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] });
  events.push({ delta: 0, status: 0xFF, meta: 0x58, data: [4, 2, 24, 8] });

  const stepDurTicks = ticksPerBeat / 4;
  for (let step = 0; step < state.bars * 16; step++) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const chordIdx = bar % 4;
    const chord = state.chords[chordIdx];
    const notes = midiFromChord(chord);
    const bMidi = bassMidi(chord);
    const isIntro = bar < 4 && state.bars > 8;
    const isHook = bar >= 12 && state.bars > 8;

    const delta = step === 0 ? 0 : stepDurTicks;
    if (stepInBar === 0) {
      events.push({ delta, status: 0x90, note: 36, vel: 100 });
      events.push({ delta: 0, status: 0x80, note: 36, vel: 0 });
    }
    if (stepInBar === 0) {
      notes.forEach((n) => {
        events.push({ delta: 0, status: 0x90, note: n, vel: 80 });
      });
    }
  }

  const midi = buildSimpleMIDI(events, ticksPerBeat);
  const blob = new Blob([midi], { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `loopeight-${state.recipe.id}-${state.bpm}bpm-${state.key.replace(/\s+/g,"")}.mid`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildSimpleMIDI(events, tpq) {
  const header = [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x01, (tpq >> 8) & 0xFF, tpq & 0xFF];
  let track = [];
  events.forEach(e => {
    let d = e.delta;
    const vlq = [];
    do { vlq.push(d & 0x7F); d >>= 7; } while (d);
    for (let i = vlq.length - 1; i >= 0; i--) track.push(vlq[i] | (i > 0 ? 0x80 : 0));
    if (e.status === 0xFF) {
      track.push(0xFF, e.meta, e.data.length, ...e.data);
    } else {
      track.push(e.status, e.note, e.vel || 0);
    }
  });
  track.push(0x00, 0xFF, 0x2F, 0x00);
  const trackLen = track.length;
  const trackHeader = [0x4D, 0x54, 0x72, 0x6B, (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}

document.getElementById("export").onclick = exportWAV;
document.getElementById("exportMidi").onclick = exportMIDI;

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.playing) stop();
});

loadState();
paint();
document.getElementById("status").textContent = "Tap to start audio…";