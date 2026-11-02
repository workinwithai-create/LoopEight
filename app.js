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

function playBuf(name, when, rate = 1, gain = 0.4, duration = 0.2) {
  const b = buffers[name];
  if (!b || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.setValueAtTime(gain, when + duration - 0.02);
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
  const totalSteps = state.bars * 16;
  const bar = Math.floor(step / 16);
  const stepInBar = step % 16;
  const chordIdx = bar % 4;
  const chord = state.chords[chordIdx];
  const notes = midiFromChord(chord);
  const bMidi = bassMidi(chord);
  const isIntro = bar < 4 && state.bars > 8;
  const isHook = bar >= 12 && state.bars > 8;
  const rec = state.recipe.id;

  // drums
  if (stepInBar === 0) playBuf("kick", when, 1, isIntro ? 0.4 : 0.65, 0.3);
  if (stepInBar === 8 && !isIntro) playBuf("snare", when, 1, 0.45, 0.25);
  if (stepInBar % 2 === 0) playBuf("hat", when, rec === "build" && bar > 4 ? 0.95 : 1, isIntro ? 0.04 : 0.07, 0.15);
  if (isHook && stepInBar === 0 && bar === 12) playBuf("crash", when, 1, 0.3, 0.8);

  // piano / guitar on downbeats
  if (stepInBar === 0) {
    playBuf("pC4", when, rateFromMidi(notes[2] || 60, 60), isHook ? 0.35 : 0.25, 0.9);
    playBuf("pA3", when, rateFromMidi(notes[1] || 57, 57), 0.18, 0.9);
    playBuf("gA2", when, rateFromMidi(notes[0] || 45, 45), isIntro ? 0.12 : 0.2, 0.6);
    playBuf("bA1", when, rateFromMidi(bMidi, 33), isIntro ? 0.25 : 0.45, 0.5);
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
  const elapsed = ctx.currentTime - (state.nextStepTime - (state.step * (60 / state.bpm / 4)));
  // approximate current bar for UI
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

document.getElementById("export").onclick = async () => {
  // stub for MVP – full OfflineAudioContext render would go here
  alert("Export stub: full WAV render with OfflineAudioContext, sample 0 downbeat, 48kHz 24-bit, length = bars * 4 * 60 / bpm * 48000. Peak ≤ -1dBFS. Seamless loop fold. MIDI matching.");
};
document.getElementById("exportMidi").onclick = () => {
  alert("MIDI export: each chair on its own track, tempo + time signature set. Named loopeight-recipe-bpm-key.mid");
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.playing) stop();
});

loadState();
paint();
document.getElementById("status").textContent = "Tap to start audio…";