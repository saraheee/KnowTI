import { useState, useEffect, useRef, useCallback } from "react";

/*
 * ══════════════════════════════════════════════════════════════
 *  CONTENT PIPELINE — Local Setup Instructions
 * ══════════════════════════════════════════════════════════════
 *
 *  1. Install Node.js from https://nodejs.org
 *
 *  2. run in the console `npm install` && `npm run dev`
 *
 *  3. Open  http://localhost:5173  (or the respective link you get from running the commands) in your browser.
 *
 *  4. Enter your Anthropic API key at the welcome screen.
 *       You can get an API key at: https://console.anthropic.com
 *
 *  Alternatively: Copy the code of this class to Claude.ai to run the application without an API-key (but with daily usage limits)
 * ══════════════════════════════════════════════════════════════
 */

// Runtime API key — set from the welcome screen (step 0).
// Empty = Claude.ai artifact mode (auth is handled by the platform).
let _apiKey = "";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  blue:"#2563eb", blueLight:"#eff6ff", blueBorder:"#bfdbfe",
  green:"#16a34a", greenLight:"#f0fdf4", greenBorder:"#bbf7d0",
  amber:"#b45309", amberLight:"#fffbeb", amberBorder:"#fde68a",
  red:"#dc2626",   redLight:"#fef2f2",
  purple:"#7c3aed",
  border:"#e5e7eb", surface:"#f8fafc", text:"#111827", muted:"#6b7280", hint:"#9ca3af",
};

const btnS = (x={}) => ({
  border:"none", borderRadius:9, fontFamily:"inherit", fontSize:13,
  fontWeight:700, cursor:"pointer", padding:"10px 20px", transition:"all 0.15s", ...x,
});
const fldS = (x={}) => ({
  fontFamily:"inherit", border:`1px solid ${T.border}`, borderRadius:7,
  padding:"7px 10px", fontSize:13, color:T.text, boxSizing:"border-box", ...x,
});

// ── Download helper ───────────────────────────────────────────────────────────
function downloadFile(content, filename, mime="text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "component";
}

function escCSV(v) {
  return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}
function buildQuestionsCSV(qs) {
  const hdr = ["#","Timestamp","Question","Option A","Option B","Option C","Option D","Correct Answer(s)","Citation"];
  const rows = qs.map((q, i) => {
    const ans = q.answers || [];
    return [
      i + 1, q.timestamp || "", q.question || "",
      ans[0]?.text||"", ans[1]?.text||"", ans[2]?.text||"", ans[3]?.text||"",
      ans.filter(a=>a.correct).map(a=>a.text).join("; "),
      q.citation || ""
    ].map(escCSV).join(",");
  });
  return [hdr.map(escCSV).join(","), ...rows].join("\n");
}
function buildTopicsCSV(ts) {
  const hdr = ["#","Topic","Subtopic"].map(escCSV).join(",");
  const rows = [];
  ts.forEach((t, i) => (t.subtopics||[]).forEach(s => rows.push([i+1, t.title, s].map(escCSV).join(","))));
  return [hdr, ...rows].join("\n");
}

// ── Shared components ─────────────────────────────────────────────────────────
// Shared pipeline options — topics count, optional questions count + checkbox
function PipelineOptions({ skipQ, setSkipQ, numQ, setNumQ, numT, setNumT, hideQuestions=false }) {
  const numStyle = {
    width:56, textAlign:"center", border:"1px solid #e5e7eb", borderRadius:7,
    padding:"5px 0", fontSize:14, fontFamily:"inherit", fontWeight:600, color:"#111827",
    background:"#fff", outline:"none", boxSizing:"border-box",
  };
  return (
    <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e5e7eb"}}>
      {/* Number inputs row */}
      <div style={{display:"flex",gap:20,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:"#6b7280",fontWeight:600,whiteSpace:"nowrap"}}>Topics</span>
          <input type="number" min={1} max={20} value={numT}
            onChange={e=>setNumT(Math.max(1,Math.min(20,+e.target.value||5)))}
            style={numStyle}/>
        </div>
        {!hideQuestions&&(
          <div style={{display:"flex",alignItems:"center",gap:8,
            opacity:skipQ?0.35:1,transition:"opacity 0.2s",pointerEvents:skipQ?"none":"auto"}}>
            <span style={{fontSize:12,color:"#6b7280",fontWeight:600,whiteSpace:"nowrap"}}>Questions</span>
            <input type="number" min={1} max={50} value={numQ} disabled={skipQ}
              onChange={e=>setNumQ(Math.max(1,Math.min(50,+e.target.value||5)))}
              style={{...numStyle,cursor:skipQ?"not-allowed":"text"}}/>
          </div>
        )}
      </div>
      {/* Checkbox */}
      <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",userSelect:"none"}}>
        <input type="checkbox" checked={!skipQ} onChange={e=>setSkipQ(!e.target.checked)}
          style={{width:15,height:15,cursor:"pointer",accentColor:"#2563eb",flexShrink:0}}/>
        <span style={{fontSize:13,color:"#111827",fontWeight:500}}>
          Generate also multiple choice questions on the content
        </span>
      </label>
    </div>
  );
}

function Tag({ text, bg="#eff6ff", fg="#2563eb" }) {
  return (
    <span style={{ background:bg, color:fg, borderRadius:6, padding:"3px 10px",
      fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>{text}</span>
  );
}

function SectionHead({ title, sub, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.text, margin:0, letterSpacing:"-0.02em" }}>{title}</h1>
        <p style={{ color:T.muted, fontSize:13, margin:"5px 0 0", lineHeight:1.5 }}>{sub}</p>
      </div>
      {action && <div style={{ flexShrink:0, marginLeft:16 }}>{action}</div>}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", marginTop:24 }}>
      <button onClick={onBack} style={btnS({ border:`1px solid ${T.border}`, background:"#fff", color:T.text })}>
        ← Back
      </button>
      <button onClick={onNext} style={btnS({ background:T.blue, color:"#fff", fontSize:14, padding:"11px 30px" })}>
        {nextLabel}
      </button>
    </div>
  );
}

// ── API ───────────────────────────────────────────────────────────────────────
async function callClaude(content, maxTokens=4000, system=null) {
  const headers = { "Content-Type": "application/json" };
  if (_apiKey) {
    headers["x-api-key"]    = _apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const body = {
    model:"claude-sonnet-4-6", max_tokens:maxTokens,
    messages:[{role:"user",content}],
  };
  if (system) body.system = system;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers, body:JSON.stringify(body),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || "API error");
  return d.content?.[0]?.text ?? "";
}

const JSON_SYSTEM = "You are a helpful assistant. Respond with ONLY valid JSON — no prose, no markdown code blocks, no explanation. Your entire response must be directly parseable by JSON.parse().";

function tryParseJSON(raw) {
  if (!raw) return null;
  const strip = raw.replace(/^```(?:json)?\n?/m,"").replace(/\n?```\s*$/m,"").trim();
  for (const t of [strip, raw.trim()]) {
    try { return JSON.parse(t); } catch {}
    const arr = t.match(/\[[\s\S]*\]/s);
    if (arr) try { return JSON.parse(arr[0]); } catch {}
  }
  return null;
}

// ── Live preview ──────────────────────────────────────────────────────────────
function buildSrcdoc(code, frameId=0) {
  // Detect the exported component name (may not be "App")
  const expFnM  = code.match(/export\s+default\s+function\s+(\w+)/);
  const expClsM = code.match(/export\s+default\s+class\s+(\w+)/);
  const expVarM = code.match(/export\s+default\s+(\w+)\s*;/);
  const compName = (expFnM || expClsM || expVarM)?.[1] || "App";

  const clean = code
    // Remove all React imports
    .replace(/import\s+[\s\S]*?from\s+['"]react['"][^;]*;?\n?/g, "")
    // Remove any other remaining import statements
    .replace(/^import\s+.*$/gm, "")
    // Strip export default from function/class declarations (any name)
    .replace(/export\s+default\s+function\s+(\w+)/g, "function $1")
    .replace(/export\s+default\s+class\s+(\w+)/g, "class $1")
    // Strip bare export default <name>;
    .replace(/export\s+default\s+\w+\s*;?\n?/g, "")
    // Strip named exports
    .replace(/export\s+\{[^}]*\}\s*;?\n?/g, "")
    .trim();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;overflow:hidden}#root{width:100%;height:100vh;display:flex;align-items:stretch}</style>
</head>
<body>
  <div id="root"></div>
  <script>
    var _fid=${frameId};
    window.onerror=function(msg,src,line,col,err){
      var detail=err&&err.message?err.message:msg;
      window.parent.postMessage({type:'iframe-error',msg:detail,fid:_fid},'*');
      document.getElementById('root').innerHTML=
        '<div style="padding:28px;font-family:monospace;font-size:13px;color:#dc2626;line-height:1.8">'+
        '<b>\u26a0 Error (auto-fixing\u2026)</b><br>'+detail+'</div>';
      return true;
    };
  <\/script>
  <script crossorigin="anonymous" src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
  <script crossorigin="anonymous" src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
  <script crossorigin="anonymous" src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"><\/script>
  <script type="text/babel">
    const {useState,useEffect,useRef,useCallback,useMemo,useReducer,useContext,createContext,memo,forwardRef,Fragment,cloneElement,Children}=React;
    var _fid2=${frameId};
    class ErrorBoundary extends React.Component{
      constructor(p){super(p);this.state={err:null};}
      static getDerivedStateFromError(e){return{err:e};}
      componentDidCatch(e,info){
        window.parent.postMessage({type:'iframe-error',msg:e.message||String(e),fid:_fid2},'*');
      }
      render(){
        if(this.state.err)return React.createElement('div',
          {style:{padding:28,fontFamily:'monospace',fontSize:13,color:'#dc2626',lineHeight:1.8}},
          '\u26a0 Error (auto-fixing\u2026): '+this.state.err.message);
        return this.props.children;
      }
    }
    try{
      ${clean}
      if(typeof ${compName}==='undefined')throw new Error('Component "${compName}" is not defined — check export.');
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(ErrorBoundary,null,React.createElement(${compName}))
      );
    }catch(e){
      window.parent.postMessage({type:'iframe-error',msg:e.message||String(e),fid:_fid2},'*');
      document.getElementById('root').innerHTML=
        '<div style="padding:28px;font-family:monospace;font-size:13px;color:#dc2626;line-height:1.8">'+
        '<b>\u26a0 Error (auto-fixing\u2026)</b><br>'+(e.message||String(e))+'</div>';
    }
  <\/script>
</body>
</html>`;
}

// ── Loading & auto-fix placeholder docs ───────────────────────────────────────
const LOADING_DOC = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif}.dots{display:flex;gap:10px;margin-bottom:18px}.dot{width:12px;height:12px;border-radius:50%;background:#2563eb;animation:b 1.2s infinite ease-in-out}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes b{0%,80%,100%{transform:scale(0.4);opacity:.4}40%{transform:scale(1);opacity:1}}</style></head><body><div style="text-align:center"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><p style="color:#6b7280;font-size:14px;font-weight:500">Applying edit\u2026</p></div></body></html>`;

const AUTOFIX_DOC = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif}.dots{display:flex;gap:10px;margin-bottom:18px}.dot{width:12px;height:12px;border-radius:50%;background:#d97706;animation:b 1.2s infinite ease-in-out}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes b{0%,80%,100%{transform:scale(0.4);opacity:.4}40%{transform:scale(1);opacity:1}}</style></head><body><div style="text-align:center"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><p style="color:#92400e;font-size:14px;font-weight:500">Auto-fixing error\u2026</p></div></body></html>`;


// ── Vision API call (images / video frames) ───────────────────────────────────
async function callClaudeVision(images, textPrompt, maxTokens=4000, system=null) {
  const content = [
    ...images.map(({ base64, mimeType }) => ({
      type:"image", source:{ type:"base64", media_type:mimeType, data:base64 },
    })),
    { type:"text", text:textPrompt },
  ];
  const headers = { "Content-Type": "application/json" };
  if (_apiKey) {
    headers["x-api-key"]    = _apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const body = { model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages:[{role:"user",content}] };
  if (system) body.system = system;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers, body:JSON.stringify(body),
  });
  const d = await res.json();
  return d.content?.[0]?.text ?? "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Capture N frames from an already-loaded <video> DOM element (avoids CSP blob restrictions)
async function captureFramesFromEl(videoEl, count=8) {
  const dur = videoEl.duration;
  if (!dur || !isFinite(dur) || videoEl.readyState < 2)
    throw new Error("Video is still loading — please wait for the preview to appear fully, then try again.");

  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");
  const frames = [];
  const MAX    = 768;

  for (let i = 0; i < count; i++) {
    videoEl.currentTime = dur * (0.05 + 0.90 * i / Math.max(count - 1, 1));
    // Wait for seek, with 3 s safety timeout per frame
    await Promise.race([
      new Promise(r => videoEl.addEventListener("seeked", r, { once:true })),
      new Promise(r => setTimeout(r, 3000)),
    ]);

    let w = Math.max(videoEl.videoWidth, 1), h = Math.max(videoEl.videoHeight, 1);
    if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
    if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(videoEl, 0, 0, w, h);

    try {
      const url = canvas.toDataURL("image/jpeg", 0.75);
      if (url && url.length > 50) frames.push(url.split(",")[1]);
    } catch { /* skip tainted frame silently */ }
  }

  if (!frames.length)
    throw new Error("Could not capture frames — canvas access may be blocked. Try the text transcript option instead.");
  return frames;
}

// ── Prompt builders (vision) ──────────────────────────────────────────────────
function pVideoAnalysis(frameCount) {
  return `These are ${frameCount} frames sampled at equal intervals from a video. Analyse what is being taught or presented. Based on all visible text, slides, diagrams, whiteboard content, and visual information across all frames, write a detailed, coherent written transcript of the video content. Include all text and key concepts shown, in the order they appear. Write continuous flowing prose suitable as a source transcript for educational topic extraction.`;
}

function pImageTopics(n=5) {
  return `Analyse this image and extract the main educational topics and subtopics it covers. Look for all visible text, diagrams, charts, tables, labels, and any educational content. Identify the key concepts.

Return ONLY a valid JSON array, no other text:
[{"id":1,"title":"Topic Title","subtopics":["subtopic one","subtopic two","subtopic three"]}]`;
}


function p0(tr, n=10) {
  return `Create ${n} meaningful multiple-choice questions with 4 possible answers each from the following transcript.

<TRANSCRIPT>
${tr}
</TRANSCRIPT>

The correct answers for each question should come from the same timestamp. Please also indicate the timestamp for each question and distribute them evenly, sort them by timestamp, and select the most important topics from the text. 1-4 of the answer options should be correct for each question. The questions should be clear and the correct answers should be directly derived from the text. Do not mention "according to the transcript". If statements are not generally valid, replace or adapt them. For validation, please cite the exact answer from the transcript you are referring to.

Return ONLY a valid JSON array, no other text:
[{"id":1,"timestamp":"00:14","question":"...","answers":[{"text":"...","correct":true},{"text":"...","correct":false},{"text":"...","correct":false},{"text":"...","correct":false}],"citation":"..."}]`;
}

function p1(qs, n=10) {
  const txt = qs.map((q,i) =>
    `Q${i+1} [${q.timestamp||""}]: ${q.question}\n` +
    q.answers.map((a,j)=>`  ${String.fromCharCode(65+j)}. ${a.text}${a.correct?" \u2713":""}`).join("\n")
  ).join("\n\n");
  return `<QUESTIONS>\n${txt}\n</QUESTIONS>

Which ${n} main topics are covered in these <QUESTIONS>? Please specify the main topics of the questions and the correct answer options. Specify a topic and subtopics separately for each question. Please do not specify "correct statements" separately, but derive the topics from them and designate them as subtopics. Ensure that all correct statements are covered in these subtopics.

Return ONLY a valid JSON array, no other text:
[{"id":1,"title":"Topic Title","subtopics":["subtopic one","subtopic two","subtopic three"]}]`;
}

// Direct topic extraction from transcript (used when questions step is skipped)
function p1direct(tr, n=10) {
  return `Extract ${n} main learning topics from the following transcript. For each topic, provide a clear title and 3–5 subtopics describing its key concepts.

<TRANSCRIPT>
${tr}
</TRANSCRIPT>

Return ONLY a valid JSON array, no other text:
[{"id":1,"title":"Topic Title","subtopics":["subtopic one","subtopic two","subtopic three"]}]`;
}

function p2(topics, tr) {
  const kw = topics.map(t=>
    `${t.title}:\n${t.subtopics.map(s=>`  - ${s}`).join("\n")}`
  ).join("\n\n");
  return `<KEYWORDS>\n${kw}\n</KEYWORDS>\n\n<TRANSCRIPT>\n${tr}\n</TRANSCRIPT>

Create a JSON file from the <KEYWORDS> in the following format. Use an icon that is meaningful for the title and use the end time of the interval in which the topic is discussed in the transcript.

Return ONLY a valid JSON array, no other text:
[{"id":1,"minute":"01:45,674","title":"Topic Title","icon":"\uD83E\uDDEC"}]`;
}

function p3(topics) {
  const sections = topics.map((t,i)=>
    `Topic ${i+1}: ${t.title}\nObjectives: ${t.subtopics.join(", ")}`
  ).join("\n\n");

  return `Generate exactly 5 React component ideas for each educational concept below, ranked strictly by DIDACTIC VALUE — how effectively they help a learner understand and remember the concept.

${sections}

Three idea types — use whichever type best serves learning for each idea:

"animated" (type: "animated", needsAnimation: true)
  Use ONLY when motion is intrinsic to the concept (e.g. blood flow, cell growth, nerve impulse, pendulum, digestion process, DNA replication, water cycle, tectonic shift).
  The animation itself must be the teaching — not decoration.
  MUST include speed slider (0.5×–3×), play/pause toggle, and reset button.
  Ask: would a static diagram teach this equally well? If yes, do NOT use animation.

"interactive" (type: "interactive", needsAnimation: false)
  Click, hover, toggle to reveal labels, compare two states, explore layered diagrams, zoom into parts.
  Best for structural/anatomical/static concepts.
  Information revealed on demand — minimal always-visible text.

"dragdrop" (type: "dragdrop", needsAnimation: false)
  User drags elements to correct positions, builds a sequence, labels diagram parts, or matches concepts.
  Provides active recall and immediate corrective feedback.
  Include: clear drop targets, visual drag feedback, correct/incorrect colour response, explanation on drop, reset button.

Composition per topic: 1–2 animated (ONLY if the concept genuinely involves motion), 1–2 dragdrop, rest interactive.
If the content does not naturally involve motion, replace animated slots with interactive or dragdrop.

Each description: 1–2 sentences — what the user sees on load, the key interaction or animation, and WHY it aids understanding.

Return ONLY a valid JSON array, no other text:
[{"topicId":1,"topicTitle":"Name","ideas":[{"id":1,"icon":"🔄","title":"Title","description":"What it shows and the key didactic interaction.","needsAnimation":true,"type":"animated"},{"id":2,"icon":"🤏","title":"...","description":"...","needsAnimation":false,"type":"dragdrop"},{"id":3,"icon":"🎨","title":"...","description":"...","needsAnimation":false,"type":"interactive"},{"id":4,"icon":"🔍","title":"...","description":"...","needsAnimation":false,"type":"interactive"},{"id":5,"icon":"🌊","title":"...","description":"...","needsAnimation":true,"type":"animated"}]}]`;
}

function pImpl(topic, ideaObj, customText) {
  const desc = customText?.trim() || `${ideaObj?.title||""}: ${ideaObj?.description||""}`;
  const ideaType = ideaObj?.type || (ideaObj?.needsAnimation ? "animated" : "interactive");

  const animGuide =
    ideaType === "animated"
      ? `ANIMATION — motion is central to teaching this concept. Implement smooth, purposeful animation that visualises the process step by step.
  Required controls (compact toolbar, never dominant):
  • Speed slider labelled "Speed" — range 0.5× to 3×, adjusts animation timing multiplier in real time
  • Play/Pause toggle button — shows ▶ when paused, ⏸ when playing
  • Reset button — stops animation and returns to initial state
  Didactic priority: the animation must make the process immediately obvious. Label key moments.`

    : ideaType === "dragdrop"
      ? `DRAG & DROP — the learner builds understanding through active placement and immediate feedback.
  Required elements:
  • Clearly labelled draggable items (left panel or pool)
  • Clearly marked drop targets with visual affordance (dashed border or placeholder label)
  • On drag-over: highlight valid targets
  • On correct drop: green highlight + brief explanation of WHY it belongs there
  • On incorrect drop: red highlight + a helpful hint, item snaps back
  • Reset button to clear all placements and try again
  Didactic priority: the feedback on each drop is the teaching moment — make explanations informative, not just "correct/incorrect".`

    : `INTERACTIVE — reveal information through structured exploration, not animation.
  Required elements:
  • Hover over components/regions to reveal labels and brief explanations
  • Click to toggle between two contrasting states (e.g. "with" vs "without", "active" vs "resting")
  • Side-by-side comparison or layered diagram that reveals detail on demand
  • Minimal always-visible text — information appears only when requested
  Didactic priority: each interaction should deepen understanding of a specific learning objective.`

  return `Implement the following educational React component as a complete, self-contained .jsx file.

Topic: ${topic?.title||""}
Learning Objectives:
${(topic?.subtopics||[]).map(s=>`  \u2022 ${s}`).join("\n")}

Component to implement: ${desc}

${ideaType === 'animated' ? 'Animation' : ideaType === 'dragdrop' ? 'Drag & drop' : 'Interaction'} guidance: ${animGuide}

Implementation requirements:
\u2022 White (#ffffff) background; width 100%, height 100vh
\u2022 Information-on-demand: labels and details appear on hover/click, not always visible
\u2022 Color-coded regions and clear visual contrast between states
\u2022 Toggle between two contrasting states to show why the concept matters
\u2022 Minimal always-visible text; rich information revealed through interaction
\u2022 Clean modern design, generous whitespace
\u2022 ONLY import from "react" (useState, useEffect, useRef, useCallback, useMemo)
\u2022 Use inline styles; use <style> tag for @keyframes ONLY if animation is genuinely needed
\u2022 The root component MUST be named and exported exactly as: export default function App() { ... }
\u2022 NEVER use a different function name for the default export

Return ONLY the complete JSX code starting with the import statement. No markdown, no explanation.`;
}


const STEPS = ["Transcript","Questions","Topics","Ideas","Component"];

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  // Auto-skip the API-key screen when running inside Claude.ai artifacts
  const [step,        setStep]       = useState(()=> typeof window.sendPrompt==="function" ? 1 : 0);
  const [apiKeyInput, setApiKeyInput]= useState("");
  const [skipQ,        setSkipQ]      = useState(true);
  const [numQuestions, setNumQuestions]= useState(5);   // how many Q to generate
  const [numTopics,    setNumTopics]   = useState(5);   // how many topics to extract    // skip questions step (off by default)
  const [transcript,  setTranscript] = useState("");
  const [questions,   setQuestions]  = useState([]);
  const [topics,      setTopics]     = useState([]);
  const [topicJSON,   setTopicJSON]  = useState([]);
  const [ideas,       setIdeas]      = useState([]);
  const [open,        setOpen]       = useState({0:true});
  const [selIdea,     setSelIdea]    = useState({});
  const [customIdea,  setCustomIdea] = useState({});
  const [editKey,     setEditKey]    = useState(null);
  const [editDraft,   setEditDraft]  = useState({});
  const [implCode,    setImplCode]   = useState("");
  const [implLabel,   setImplLabel]  = useState("");
  const [tab,         setTab]        = useState("preview");
  const [iframeKey,   setIframeKey]  = useState(0);
  const [loading,     setLoading]    = useState(false);
  const [loadMsg,     setLoadMsg]    = useState("");
  const [error,       setError]      = useState(null);
  const [copied,      setCopied]     = useState(false);
  const [implementations, setImplementations] = useState({}); // {bi: {label,code,ideaTitle}}
  const [activeImpl,  setActiveImpl]  = useState(null);       // currently viewed bi
  const [editPrompt,  setEditPrompt]  = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editHistories,setEditHistories]=useState({});         // {bi: [prevCode, ...]}
  const [autoFixing,  setAutoFixing]  = useState(false);     // auto-debug in progress
  const activeImplRef   = useRef(null);
  const implCodeRef     = useRef("");
  const isAutoFixingRef = useRef(false);
  const iframeKeyRef    = useRef(0);
  const [inputMode,   setInputMode]  = useState("transcript"); // "transcript"|"video"|"image"
  const [videoFile,   setVideoFile]  = useState(null);
  const [imageFile,   setImageFile]  = useState(null);
  const [vidPrevUrl,  setVidPrevUrl] = useState(null);
  const [vidStatus,   setVidStatus]  = useState("idle");   // "idle"|"loading"|"ready"|"error"
  const [vidShots,    setVidShots]   = useState([]);        // fallback: screenshot File[]
  const [shotPrevs,   setShotPrevs]  = useState([]);        // preview URLs for screenshots
  const [vidDrag,     setVidDrag]    = useState(false);     // drag-over state for video zone
  const [imgDrag,     setImgDrag]    = useState(false);     // drag-over state for image zone
  const [imgPrevUrl,  setImgPrevUrl] = useState(null);
  const fileRef     = useRef();
  const videoInpRef = useRef();
  const videoElRef  = useRef(null);  // ref to the preview <video> DOM element
  const imageInpRef = useRef();
  const newQRef     = useRef();

  const handleApiKey = () => {
    const k = apiKeyInput.trim();
    if (!k) return;
    _apiKey = k;
    setStep(1);
  };

  // ── Runner ──────────────────────────────────────────────────────────────────
  const run = async (fn) => {
    setError(null);
    try { await fn(); }
    catch(e) { setError(e.message || "Something went wrong \u2014 please try again."); }
    finally   { setLoading(false); }
  };

  // ── Sync refs for postMessage handler ─────────────────────────────────────────
  useEffect(() => { activeImplRef.current   = activeImpl; }, [activeImpl]);
  useEffect(() => { implCodeRef.current     = implCode;   }, [implCode]);
  useEffect(() => { iframeKeyRef.current    = iframeKey;  }, [iframeKey]);

  // ── Auto-fix broken iframe component ────────────────────────────────────────
  const autoFixImpl = useCallback(async (brokenCode, errorMsg) => {
    if (isAutoFixingRef.current) return;
    isAutoFixingRef.current = true;
    setAutoFixing(true);
    try {
      const bi = activeImplRef.current;
      const raw = await callClaude(
        `This React component has an error: "${errorMsg}"\n\nDebug it, fix all issues, and return ONLY the complete corrected JSX code starting with the import statement (no markdown, no explanation):\n\n${brokenCode}`,
        7000
      );
      const code = raw.replace(/^```(?:jsx?|tsx?|javascript)?\n?/m,"").replace(/\n?```\s*$/m,"").trim();
      if (bi !== null) {
        setImplementations(prev=>({...prev,[bi]:{...prev[bi],code}}));
      }
      setImplCode(code);
      setIframeKey(k=>k+1);
    } catch(e) {
      setError("Auto-fix failed — please edit the component manually.");
    } finally {
      isAutoFixingRef.current = false;
      setAutoFixing(false);
    }
  }, []);

  useEffect(() => {
    const handle = (e) => {
      if (e.data?.type !== 'iframe-error') return;
      // Ignore errors from stale iframes (e.g. a previous component that was replaced)
      if (e.data?.fid !== iframeKeyRef.current) return;
      const code = implCodeRef.current;
      if (!code || isAutoFixingRef.current) return;
      autoFixImpl(code, e.data.msg || 'Unknown script error');
    };
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [autoFixImpl]);

  // ── Pipeline ────────────────────────────────────────────────────────────────
  const genQuestions = () => {
    if (!transcript.trim()) return setError("Please enter or upload a transcript first.");
    setLoading(true); setLoadMsg(`Analyzing transcript and generating ${numQuestions} questions\u2026`);
    run(async () => {
      const raw    = await callClaude(p0(transcript, numQuestions), Math.max(4000, numQuestions * 150), JSON_SYSTEM);
      const parsed = tryParseJSON(raw);
      if (!Array.isArray(parsed)||!parsed.length) throw new Error("Couldn\u2019t parse questions \u2014 try again.");
      setQuestions(parsed); setStep(2);
    });
  };

  const genTranscriptFromScreenshots = () => {
    if (!vidShots.length) return setError("Please upload some video screenshots first.");
    setLoading(true); setLoadMsg(`Analysing ${vidShots.length} screenshot(s) with Claude…`);
    run(async () => {
      const images = await Promise.all(
        vidShots.map(async f => ({ base64: await fileToBase64(f), mimeType: f.type||"image/jpeg" }))
      );
      const raw = await callClaudeVision(images, pVideoAnalysis(images.length), 4000);
      if (!raw.trim()) throw new Error("Couldn't analyse screenshots — try again.");
      setTranscript(raw.trim());
    });
  };

  const genTranscriptFromVideo = () => {
    if (!videoFile) return setError("Please upload a video file first.");
    const videoEl = videoElRef.current;
    if (!videoEl || !videoEl.videoWidth) {
      return setError("Video preview is still loading — please wait until it appears, then try again.");
    }
    setLoading(true); setLoadMsg("Capturing frames from video…");
    run(async () => {
      const frames = await captureFramesFromEl(videoEl, 8);
      setLoadMsg(`Analysing ${frames.length} frames with Claude…`);
      const raw = await callClaudeVision(
        frames.map(b64=>({ base64:b64, mimeType:"image/jpeg" })),
        pVideoAnalysis(frames.length), 4000
      );
      if (!raw.trim()) throw new Error("Claude returned no content — try again or use a text transcript.");
      setTranscript(raw.trim());
    });
  };

  const genTopicsFromImage = () => {
    if (!imageFile) return setError("Please upload an image first.");
    setLoading(true); setLoadMsg("Analysing image and extracting topics…");
    run(async () => {
      const base64   = await fileToBase64(imageFile);
      const mimeType = imageFile.type || "image/jpeg";
      const raw = await callClaudeVision(
        [{ base64, mimeType }], pImageTopics(numTopics), Math.max(3000, numTopics * 200), JSON_SYSTEM
      );
      const parsed = tryParseJSON(raw);
      if (!Array.isArray(parsed)||!parsed.length) throw new Error("Couldn't extract topics from image — try again.");
      setTopics(parsed); setStep(3);
    });
  };

  const genTopicsDirect = () => {
    if (!transcript.trim()) return setError("Please enter or upload a transcript first.");
    setLoading(true); setLoadMsg(`Extracting ${numTopics} topics directly from transcript\u2026`);
    run(async () => {
      const raw    = await callClaude(p1direct(transcript, numTopics), Math.max(4000, numTopics * 250), JSON_SYSTEM);
      const parsed = tryParseJSON(raw);
      if (!Array.isArray(parsed)||!parsed.length) throw new Error("Couldn\u2019t parse topics \u2014 try again.");
      setTopics(parsed); setStep(3);
    });
  };

  const genTopics = () => {
    setLoading(true); setLoadMsg(`Extracting ${numTopics} topics from your questions\u2026`);
    run(async () => {
      const raw    = await callClaude(p1(questions, numTopics), Math.max(4000, numTopics * 250), JSON_SYSTEM);
      const parsed = tryParseJSON(raw);
      if (!Array.isArray(parsed)||!parsed.length) throw new Error("Couldn\u2019t parse topics \u2014 try again.");
      setTopics(parsed); setStep(3);
    });
  };

  const genIdeas = () => {
    setLoading(true); setLoadMsg("Building JSON + 5 ideas per topic (two parallel calls)\u2026");
    run(async () => {
      const [jR, iR] = await Promise.all([
        callClaude(p2(topics, transcript), 2000, JSON_SYSTEM),
        callClaude(p3(topics), 10000, JSON_SYSTEM),
      ]);
      const pJ = tryParseJSON(jR), pI = tryParseJSON(iR);
      if (pJ) setTopicJSON(pJ);
      if (!Array.isArray(pI)||!pI.length) throw new Error("Couldn\u2019t parse ideas \u2014 try again.");
      setIdeas(pI); setOpen({0:true}); setStep(4);
    });
  };

  const implement = (bi) => {
    const topic  = topics[bi];
    const block  = ideas[bi];
    const ideaId = selIdea[bi];
    const custom = customIdea[bi];
    if (!ideaId && !custom?.trim()) return setError("Select an idea or enter a custom one first.");
    const ideaObj = block?.ideas?.find(i=>i.id===ideaId) || null;
    setLoading(true); setLoadMsg("Generating your React component\u2026 this may take a moment.");
    run(async () => {
      const raw  = await callClaude(pImpl(topic, ideaObj, custom), 7000);
      const code = raw.replace(/^```(?:jsx?|tsx?|javascript)?\n?/m,"").replace(/\n?```\s*$/m,"").trim();
      const label = topic?.title||"";
      const ideaTitle = ideaObj?.title || custom?.trim() || "";
      setImplCode(code); setImplLabel(label);
      setImplementations(prev=>({...prev,[bi]:{label,code,ideaTitle}}));
      setEditHistories(prev=>({...prev,[bi]:[]}));
      setActiveImpl(bi);
      setTab("preview"); setIframeKey(k=>k+1); setStep(5);
    });
  };

  // ── Question helpers ────────────────────────────────────────────────────────
  const setQ  = (qi,f,v) =>
    setQuestions(qs=>qs.map((q,i)=>i===qi?{...q,[f]:v}:q));
  const setA  = (qi,ai,f,v) =>
    setQuestions(qs=>qs.map((q,i)=>i===qi
      ?{...q,answers:q.answers.map((a,j)=>j===ai?{...a,[f]:v}:a)}:q));
  const delA  = (qi,ai) =>
    setQuestions(qs=>qs.map((q,i)=>i===qi
      ?{...q,answers:q.answers.filter((_,j)=>j!==ai)}:q));
  const addA  = (qi) =>
    setQuestions(qs=>qs.map((q,i)=>i===qi
      ?{...q,answers:[...q.answers,{text:"New option",correct:false}]}:q));
  const addQ  = () => {
    setQuestions(qs=>[...qs,{
      id: Date.now(), timestamp:"00:00", question:"New question?",
      answers:[
        {text:"Option A",correct:true},{text:"Option B",correct:false},
        {text:"Option C",correct:false},{text:"Option D",correct:false},
      ], citation:"",
    }]);
    // scroll new question into view after render
    setTimeout(()=>newQRef.current?.scrollIntoView({behavior:"smooth",block:"end"}), 80);
  };

  // ── Topic helpers ───────────────────────────────────────────────────────────
  const setTF  = (ti,f,v) => setTopics(ts=>ts.map((t,i)=>i===ti?{...t,[f]:v}:t));
  const setSub = (ti,si,v) => setTopics(ts=>ts.map((t,i)=>i===ti
    ?{...t,subtopics:t.subtopics.map((s,j)=>j===si?v:s)}:t));
  const addSub = (ti) => setTopics(ts=>ts.map((t,i)=>i===ti
    ?{...t,subtopics:[...t.subtopics,"New subtopic"]}:t));
  const delSub = (ti,si) => setTopics(ts=>ts.map((t,i)=>i===ti
    ?{...t,subtopics:t.subtopics.filter((_,j)=>j!==si)}:t));

  // ── Idea helpers ────────────────────────────────────────────────────────────
  const updateIdea = (bi,ideaId,changes) =>
    setIdeas(prev=>prev.map((block,i)=>i!==bi?block:{
      ...block, ideas:block.ideas.map(idea=>idea.id===ideaId?{...idea,...changes}:idea),
    }));

  // ── Clipboard / download ────────────────────────────────────────────────────
  // ── Prompt-based component edit ────────────────────────────────────────────
  const applyEdit = async () => {
    if (!editPrompt.trim() || activeImpl===null) return;
    const impl = implementations[activeImpl];
    if (!impl) return;
    setEditLoading(true); setError(null);
    try {
      const raw = await callClaude(
        `Here is a React component:\n\n${impl.code}\n\nApply this change and return ONLY the complete updated JSX code (no markdown, no explanation):\n${editPrompt}`,
        7000
      );
      const code = raw.replace(/^```(?:jsx?|tsx?|javascript)?\n?/m,"").replace(/\n?```\s*$/m,"").trim();
      setEditHistories(prev=>({...prev,[activeImpl]:[...(prev[activeImpl]||[]),impl.code]}));
      setImplementations(prev=>({...prev,[activeImpl]:{...impl,code}}));
      setImplCode(code);
      setIframeKey(k=>k+1);
      setEditPrompt("");
    } catch(e) { setError("Edit failed — please try again."); }
    setEditLoading(false);
  };

  const undoEdit = () => {
    if (activeImpl===null) return;
    const hist = editHistories[activeImpl]||[];
    if (!hist.length) return;
    const prev = hist[hist.length-1];
    setEditHistories(h=>({...h,[activeImpl]:hist.slice(0,-1)}));
    setImplementations(p=>({...p,[activeImpl]:{...p[activeImpl],code:prev}}));
    setImplCode(prev);
    setIframeKey(k=>k+1);
  };

  const switchImpl = (bi) => {
    const impl = implementations[bi];
    if (!impl) return;
    setActiveImpl(bi);
    setImplCode(impl.code);
    setImplLabel(impl.label);
    setTab("preview");
    setIframeKey(k=>k+1);
  };

  // ── Download all as ZIP ──────────────────────────────────────────────────────
  const downloadAll = async () => {
    const loadJSZip = () => new Promise((res,rej)=>{
      if (window.JSZip){res(window.JSZip);return;}
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload=()=>res(window.JSZip); s.onerror=rej;
      document.head.appendChild(s);
    });
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      if (questions.length>0) zip.file("questions.csv", buildQuestionsCSV(questions));
      if (topics.length>0)    zip.file("topics.csv",    buildTopicsCSV(topics));
      if (topicJSON.length>0) zip.file("topics.json",   JSON.stringify(topicJSON,null,2));
      Object.values(implementations).forEach(impl=>{
        if (impl.code) zip.file(`${slugify(impl.label)}.jsx`, impl.code);
      });
      const blob = await zip.generateAsync({type:"blob"});
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"),{href:url,download:"components.zip"});
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e){ setError("Couldn't create ZIP — try downloading files individually."); }
  };

  const copyCode = () =>
    navigator.clipboard.writeText(implCode)
      .then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2400);})
      .catch(()=>{});

  const dlCode = () =>
    downloadFile(implCode, slugify(implLabel)+".jsx");

  const dlJSON = () =>
    downloadFile(JSON.stringify(topicJSON,null,2), "topics.json", "application/json");


  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:T.surface,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>

      {step>0&&(
      <>{/* ── Progress header ─────────────────────────────────────────────── */}
      <div style={{
        background:"#fff",
        borderBottom:`1px solid ${T.border}`,
        position:"sticky",
        top:0,
        zIndex:50,
        display:"flex",
        justifyContent:"center",
        padding:"0 24px",
      }}>
        <div style={{
          width:"96vw",
          minWidth:1800,
          display:"flex",
          alignItems:"stretch",
          minHeight:62,
        }}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,paddingRight:20}}>
            <div style={{width:28,height:28,background:T.blue,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:"#fff",fontSize:14}}>✦</span>
            </div>
            <span style={{fontSize:14,fontWeight:800,color:T.text}}>Content Pipeline</span>
          </div>

          {/* Centre: pipeline steps only */}
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 0 10px"}}>

            {/* ── Pipeline steps ── */}
            <div style={{display:"flex",alignItems:"flex-start"}}>

              {/* Helper: step bubble */}
              {[
                [1,"Transcript"],
                ...(skipQ?[]:[[ 2,"Questions"]]),
                [3,"Topics"],
                [4,"Ideas"],
                [5,"Component"],
              ].map(([n,label],idx,arr)=>{
                const done   = step > n;
                const active = step === n;
                return (
                  <div key={n} style={{display:"flex",alignItems:"flex-start"}}>
                    {/* Bubble + label */}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div onClick={()=>done&&setStep(n)} style={{
                        width:26,height:26,borderRadius:"50%",fontSize:11,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        background:done||active?T.blue:"#e2e8f0",
                        color:done||active?"#fff":T.hint,
                        cursor:done?"pointer":"default",
                        transition:"all 0.2s",
                        boxShadow:active?"0 0 0 3px #bfdbfe":"none",
                      }}>
                        {done?"✓":idx+1}
                      </div>
                      <span style={{fontSize:9,fontWeight:active?700:400,
                        color:active?T.blue:done?T.muted:T.hint,whiteSpace:"nowrap"}}>
                        {label}
                      </span>
                    </div>
                    {/* Connector (not after last) */}
                    {idx < arr.length-1 && (
                      <div style={{width:40,height:2,margin:"12px 4px 0",flexShrink:0,
                        background:done?T.blue:"#e2e8f0",transition:"background 0.3s"}}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt badge */}
          <div style={{display:"flex",alignItems:"center",flexShrink:0,paddingLeft:20}}>
            <span style={{fontSize:11,color:T.hint,background:"#f1f5f9",borderRadius:6,padding:"4px 10px",whiteSpace:"nowrap"}}>
              {["","0-prompt","1-prompt","2+3-prompt","3-prompt","impl"][step]||""}
            </span>
          </div>
        </div>
      </div>

      </>
      )}

      <div style={{width:"96vw",minWidth:1800,margin:"0 auto",padding:"28px clamp(16px, 4vw, 48px) 80px"}}>

        {/* Error */}
        {error&&(
          <div style={{background:T.redLight,border:"1px solid #fca5a5",borderRadius:10,padding:"11px 16px",marginBottom:20,color:"#991b1b",fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>⚠ {error}</span>
            <button onClick={()=>setError(null)} style={{background:"none",border:"none",color:"#991b1b",cursor:"pointer",fontSize:20,lineHeight:1,padding:0}}>×</button>
          </div>
        )}

        {/* ══ STEP 1 — Input ═══════════════════════════════════════════════ */}
        {/* ══ STEP 0 — API Key welcome ════════════════════════════════════════ */}
        {step===0&&(
          <div style={{minHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:18,
              padding:"48px 52px",maxWidth:460,width:"100%",textAlign:"center",
              boxShadow:"0 8px 32px rgba(0,0,0,0.08)"}}>
              <div style={{width:52,height:52,background:T.blue,borderRadius:13,
                display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 22px"}}>
                <span style={{color:"#fff",fontSize:26}}>✦</span>
              </div>
              <h1 style={{fontSize:26,fontWeight:800,color:T.text,marginBottom:8,letterSpacing:"-0.02em"}}>
                Content Pipeline
              </h1>
              <p style={{color:T.muted,fontSize:14,marginBottom:28,lineHeight:1.65}}>
                Enter your Anthropic API key to get started.<br/>
                It is used directly in this browser session and never stored.
              </p>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e=>setApiKeyInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleApiKey()}
                placeholder="sk-ant-api03-…"
                autoFocus
                style={fldS({width:"100%",marginBottom:14,fontSize:14,padding:"12px 16px",
                  textAlign:"center",letterSpacing:"0.04em",boxSizing:"border-box"})}
              />
              <button onClick={handleApiKey} disabled={!apiKeyInput.trim()}
                style={btnS({width:"100%",background:apiKeyInput.trim()?T.blue:"#bfdbfe",
                  color:"#fff",fontSize:15,padding:"13px",
                  cursor:apiKeyInput.trim()?"pointer":"not-allowed"})}>
                Start →
              </button>
              <p style={{fontSize:11,color:T.hint,marginTop:18,lineHeight:1.7}}>
                Get a key at{" "}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                  style={{color:T.blue,textDecoration:"none"}}>
                  console.anthropic.com
                </a>
                <br/>
                <span style={{opacity:0.8}}>Running inside Claude.ai? The screen above is skipped automatically.</span>
              </p>
            </div>
          </div>
        )}

        {step===1&&(
          <div>
            <SectionHead title="Choose your input source"
              sub="Provide a text transcript, upload a video to analyse its visual content, or upload an image to extract topics directly."/>

            <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:24}}>

              {/* ── Mode tabs ── */}
              <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:10,padding:4,marginBottom:22}}>
                {[["transcript","📝","Text"],["video","🎬","Video"],["image","🖼️","Image"]].map(([mode,icon,label])=>(
                  <button key={mode} onClick={()=>setInputMode(mode)}
                    style={{flex:1,padding:"9px 8px",background:inputMode===mode?"#fff":"transparent",
                      border:"none",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                      fontWeight:inputMode===mode?700:500,fontSize:13,
                      color:inputMode===mode?T.text:T.muted,
                      boxShadow:inputMode===mode?"0 1px 4px rgba(0,0,0,0.10)":undefined,
                      display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                      transition:"all 0.15s"}}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* ── Transcript mode ── */}
              {inputMode==="transcript"&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <button onClick={()=>fileRef.current?.click()}
                      style={btnS({background:"#fff",border:`1px solid ${T.border}`,color:T.text})}>
                      📁 Upload text file
                    </button>
                    <input ref={fileRef} type="file"
                      accept=".txt,.md,.srt,.vtt,.ass,.ssa,.sbv,.sub,.ttml,.dfxp,.stl,.csv"
                      onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setTranscript(ev.target.result);r.readAsText(f);}}
                      style={{display:"none"}}/>
                    {transcript.trim()&&<span style={{fontSize:12,color:T.muted}}>{transcript.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>}
                  </div>
                  <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
                    placeholder="Paste your text or transcript here…"
                    style={fldS({width:"100%",height:240,resize:"vertical",lineHeight:1.7,fontSize:14})}/>
                  <PipelineOptions skipQ={skipQ} setSkipQ={setSkipQ} numQ={numQuestions} setNumQ={setNumQuestions} numT={numTopics} setNumT={setNumTopics}/>
                  <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}>
                    <button onClick={skipQ?genTopicsDirect:genQuestions} disabled={!transcript.trim()}
                      style={btnS({background:transcript.trim()?T.blue:"#bfdbfe",color:"#fff",fontSize:14,padding:"12px 32px",cursor:transcript.trim()?"pointer":"not-allowed"})}>
                      {skipQ?"Extract Topics →":"Generate Questions →"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Video mode ── */}
              {inputMode==="video"&&(
                <div>
                  <input ref={videoInpRef} type="file" accept="video/*" style={{display:"none"}}
                    onChange={e=>{const f=e.target.files[0];if(!f)return;setVideoFile(f);setVidStatus("loading");setVidPrevUrl(p=>{if(p)URL.revokeObjectURL(p);return URL.createObjectURL(f);});setTranscript("");}}/>

                  {/* Drag & drop zone — only shown when no video is loaded */}
                  {!vidPrevUrl&&(
                    <div
                      onDrop={e=>{e.preventDefault();setVidDrag(false);const f=e.dataTransfer.files[0];if(!f||!f.type.startsWith("video/"))return;setVideoFile(f);setVidStatus("loading");setVidPrevUrl(p=>{if(p)URL.revokeObjectURL(p);return URL.createObjectURL(f);});setTranscript("");}}
                      onDragOver={e=>{e.preventDefault();setVidDrag(true);}}
                      onDragEnter={e=>{e.preventDefault();setVidDrag(true);}}
                      onDragLeave={()=>setVidDrag(false)}
                      onClick={()=>videoInpRef.current?.click()}
                      style={{height:240,border:`2px dashed ${vidDrag?T.blue:T.border}`,borderRadius:10,
                        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,
                        background:vidDrag?T.blueLight:"#fafafa",cursor:"pointer",transition:"all 0.2s",marginBottom:12}}>
                      <span style={{fontSize:38}}>🎬</span>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:600,color:vidDrag?T.blue:T.text}}>
                          Drop video here or click to browse
                        </div>
                        <div style={{fontSize:12,color:T.muted,marginTop:4}}>MP4, MOV, WebM…</div>
                      </div>
                    </div>
                  )}

                  {/* Video preview — compact filename + remove bar on top, tall player */}
                  {vidPrevUrl&&(
                    <div style={{marginBottom:12}}>
                      {/* Filename + remove row */}
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
                        background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px"}}>
                        <span style={{fontSize:13,color:T.text,fontWeight:500,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          🎬 {videoFile?.name}
                        </span>
                        <button
                          onClick={()=>{
                            setVidPrevUrl(p=>{if(p)URL.revokeObjectURL(p);return null;});
                            setVideoFile(null); setVidStatus("idle"); setTranscript("");
                          }}
                          style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,
                            color:T.muted,fontSize:12,padding:"3px 10px",cursor:"pointer",
                            fontFamily:"inherit",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>
                          × Remove
                        </button>
                      </div>
                      {/* Tall video player with status badge */}
                      <div style={{position:"relative"}}>
                        <video ref={videoElRef} src={vidPrevUrl} controls muted playsInline
                          onLoadStart={()=>setVidStatus("loading")}
                          onLoadedMetadata={()=>setVidStatus("loading")}
                          onCanPlay={()=>setVidStatus("ready")}
                          onError={()=>setVidStatus("error")}
                          style={{width:"100%",maxHeight:540,borderRadius:8,background:"#111",display:"block"}}/>
                        <div style={{position:"absolute",top:8,right:8,
                          background:vidStatus==="ready"?"rgba(22,163,74,0.9)":vidStatus==="error"?"rgba(220,38,38,0.9)":"rgba(0,0,0,0.6)",
                          color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,
                          display:"flex",alignItems:"center",gap:5,transition:"background 0.3s"}}>
                          {vidStatus==="loading"&&<><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",animation:"spin 0.7s linear infinite"}}/>Loading…</>}
                          {vidStatus==="ready"&&<>✓ Ready</>}
                          {vidStatus==="error"&&<>⚠ Cannot load</>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error fallback: screenshots */}
                  {vidStatus==="error"&&(
                    <div style={{background:T.amberLight,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                      <p style={{fontSize:12,color:"#92400e",fontWeight:600,margin:"0 0 6px"}}>⚠ Video cannot be decoded — upload screenshots instead:</p>
                      <label style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer",
                        background:T.blue,color:"#fff",borderRadius:7,padding:"7px 14px",fontSize:12,fontWeight:700}}>
                        📷 Upload screenshots from video
                        <input type="file" accept="image/*" multiple style={{display:"none"}}
                          onChange={e=>{const files=Array.from(e.target.files);setVidShots(files);setShotPrevs(files.map(f=>URL.createObjectURL(f)));}}/>
                      </label>
                    </div>
                  )}

                  {/* Screenshot thumbnails */}
                  {shotPrevs.length>0&&(
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                      {shotPrevs.map((url,i)=>(
                        <img key={i} src={url} alt={`Frame ${i+1}`}
                          style={{height:64,borderRadius:6,objectFit:"cover",border:`1px solid ${T.border}`}}/>
                      ))}
                    </div>
                  )}

                  {/* Transcript after extraction */}
                  {transcript.trim()&&(
                    <div style={{marginBottom:4}}>
                      <label style={{fontSize:12,color:T.muted,display:"block",marginBottom:6,fontWeight:600}}>
                        Extracted transcript — review and edit if needed:
                      </label>
                      <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
                        style={fldS({width:"100%",height:140,resize:"vertical",lineHeight:1.65,fontSize:13})}/>
                    </div>
                  )}

                  {/* Questions checkbox */}
                  <PipelineOptions skipQ={skipQ} setSkipQ={setSkipQ} numQ={numQuestions} setNumQ={setNumQuestions} numT={numTopics} setNumT={setNumTopics}/>

                  {/* Generate button — always visible, grayed until content is ready */}
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14,flexWrap:"wrap"}}>
                    {transcript.trim()?(
                      <button onClick={skipQ?genTopicsDirect:genQuestions}
                        style={btnS({background:T.blue,color:"#fff",fontSize:14,padding:"11px 26px"})}>
                        {skipQ?"Extract Topics →":"Generate Questions →"}
                      </button>
                    ):vidShots.length>0?(
                      <button onClick={genTranscriptFromScreenshots}
                        style={btnS({background:T.blue,color:"#fff",fontSize:14,padding:"11px 26px"})}>
                        Analyse {vidShots.length} screenshot{vidShots.length!==1?"s":""} →
                      </button>
                    ):(
                      <button onClick={vidStatus==="ready"?genTranscriptFromVideo:undefined} disabled={vidStatus!=="ready"}
                        style={btnS({background:vidStatus==="ready"?T.blue:"#bfdbfe",color:"#fff",fontSize:14,padding:"11px 26px",cursor:vidStatus==="ready"?"pointer":"not-allowed"})}>
                        Extract from Video →
                      </button>
                    )}
                  </div>

                </div>
              )}

              {/* ── Image mode ── */}
              {inputMode==="image"&&(
                <div>
                  <input ref={imageInpRef} type="file" accept="image/*" style={{display:"none"}}
                    onChange={e=>{const f=e.target.files[0];if(!f)return;setImageFile(f);setImgPrevUrl(URL.createObjectURL(f));}}/>

                  {!imgPrevUrl?(
                    /* Drag & drop zone — only shown when no image loaded */
                    <div
                      onDrop={e=>{e.preventDefault();setImgDrag(false);const f=e.dataTransfer.files[0];if(!f||!f.type.startsWith("image/"))return;setImageFile(f);setImgPrevUrl(URL.createObjectURL(f));}}
                      onDragOver={e=>{e.preventDefault();setImgDrag(true);}}
                      onDragEnter={e=>{e.preventDefault();setImgDrag(true);}}
                      onDragLeave={()=>setImgDrag(false)}
                      onClick={()=>imageInpRef.current?.click()}
                      style={{height:240,border:`2px dashed ${imgDrag?T.blue:T.border}`,borderRadius:10,
                        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,
                        background:imgDrag?T.blueLight:"#fafafa",cursor:"pointer",transition:"all 0.2s",marginBottom:12}}>
                      <span style={{fontSize:38}}>🖼️</span>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:600,color:imgDrag?T.blue:T.text}}>Drop image here or click to browse</div>
                        <div style={{fontSize:12,color:T.muted,marginTop:4}}>JPG, PNG, WebP, GIF…</div>
                      </div>
                    </div>
                  ):(
                    /* Image loaded: thin filename bar + preview */
                    <div style={{marginBottom:12}}>
                      {/* Filename + remove row */}
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
                        background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px"}}>
                        <span style={{fontSize:13,color:T.text,fontWeight:500,flex:1,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          🖼️ {imageFile?.name}
                        </span>
                        <button
                          onClick={()=>{setImageFile(null);setImgPrevUrl(null);}}
                          style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,
                            color:T.muted,fontSize:12,padding:"3px 10px",cursor:"pointer",
                            fontFamily:"inherit",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>
                          × Remove
                        </button>
                      </div>
                      {/* Image preview */}
                      <div style={{background:"#f0f0f0",borderRadius:8,overflow:"hidden",
                        display:"flex",alignItems:"center",justifyContent:"center",minHeight:160}}>
                        <img src={imgPrevUrl} alt="preview"
                          style={{maxWidth:"100%",maxHeight:400,objectFit:"contain",display:"block"}}/>
                      </div>
                    </div>
                  )}

                  {/* Questions checkbox */}
                  <PipelineOptions skipQ={skipQ} setSkipQ={setSkipQ} numQ={numQuestions} setNumQ={setNumQuestions} numT={numTopics} setNumT={setNumTopics} hideQuestions/>

                  <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}>
                    <button onClick={genTopicsFromImage} disabled={!imageFile}
                      style={btnS({background:imageFile?T.blue:"#bfdbfe",color:"#fff",fontSize:14,padding:"12px 28px",cursor:imageFile?"pointer":"not-allowed"})}>
                      Extract Topics from Image →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ STEP 2 — Questions ════════════════════════════════════════════ */}
        {step===2&&(
          <div>
            <SectionHead
              title="Review & edit questions"
              sub={`${questions.length} question${questions.length!==1?"s":""} generated \u2014 edit text, toggle answers, add/remove rows.`}
              action={
                <button onClick={addQ}
                  style={btnS({border:`1px solid ${T.blue}`,color:T.blue,background:"#fff"})}>
                  + Add question
                </button>
              }
            />
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {questions.map((q,qi)=>(
                <div key={q.id ?? qi}
                  ref={qi===questions.length-1?newQRef:null}
                  style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20}}>

                  {/* Question row */}
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                    <Tag text={`Q${qi+1}`}/>
                    <input value={q.timestamp||""} onChange={e=>setQ(qi,"timestamp",e.target.value)}
                      style={fldS({width:72,textAlign:"center",fontFamily:"monospace",fontSize:12,color:T.muted})}/>
                    <input value={q.question} onChange={e=>setQ(qi,"question",e.target.value)}
                      style={fldS({flex:1,fontWeight:600,fontSize:14})}/>
                    <button onClick={()=>setQuestions(qs=>qs.filter((_,i)=>i!==qi))}
                      style={{background:"none",border:"none",color:T.hint,cursor:"pointer",fontSize:20,lineHeight:1,flexShrink:0}}>×</button>
                  </div>

                  {/* Answer rows */}
                  <div style={{display:"flex",flexDirection:"column",gap:8,paddingLeft:36}}>
                    {(q.answers||[]).map((a,ai)=>(
                      <div key={ai} style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{width:18,textAlign:"center",fontSize:12,color:T.hint,flexShrink:0}}>
                          {String.fromCharCode(65+ai)}
                        </span>
                        <input value={a.text} onChange={e=>setA(qi,ai,"text",e.target.value)}
                          style={fldS({flex:1,border:`1.5px solid ${a.correct?"#86efac":T.border}`,
                            background:a.correct?T.greenLight:"#fff"})}/>
                        <button onClick={()=>setA(qi,ai,"correct",!a.correct)}
                          style={btnS({padding:"6px 12px",minWidth:84,
                            border:`1.5px solid ${a.correct?T.green:T.border}`,
                            background:a.correct?T.greenLight:"#fff",
                            color:a.correct?T.green:T.hint})}>
                          {a.correct?"\u2713 Correct":"\u2717 Wrong"}
                        </button>
                        {/* Remove individual answer */}
                        <button onClick={()=>delA(qi,ai)}
                          title="Remove this answer"
                          style={{background:"none",border:"none",color:T.hint,cursor:"pointer",
                            fontSize:18,lineHeight:1,flexShrink:0,padding:"0 2px"}}>
                          ×
                        </button>
                      </div>
                    ))}
                    {/* Add answer */}
                    <button onClick={()=>addA(qi)}
                      style={{background:"none",border:"none",color:T.blue,cursor:"pointer",
                        fontSize:12,textAlign:"left",padding:"4px 0",fontWeight:600,
                        paddingLeft:24}}>
                      + add answer
                    </button>
                  </div>

                  {q.citation&&(
                    <p style={{fontSize:11,color:T.hint,fontStyle:"italic",margin:"10px 0 0 36px"}}>
                      📖 &ldquo;{q.citation}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
            <NavRow onBack={()=>setStep(1)} onNext={genTopics} nextLabel="Extract Topics →"/>
          </div>
        )}

        {/* ══ STEP 3 — Topics ══════════════════════════════════════════════ */}
        {step===3&&(
          <div>
            <SectionHead title="Review & edit topics"
              sub="Edit topic titles and subtopics — these become the keywords for JSON and ideas."
              action={
                <button onClick={()=>setTopics(ts=>[...ts,{id:Date.now(),title:"New Topic",subtopics:["Subtopic 1"]}])}
                  style={btnS({border:`1px solid ${T.blue}`,color:T.blue,background:"#fff"})}>
                  + Add Topic
                </button>
              }
            />
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {topics.map((t,ti)=>(
                <div key={t.id??ti} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
                    <Tag text={String(ti+1)} bg="#dbeafe" fg={T.blue}/>
                    <input value={t.title} onChange={e=>setTF(ti,"title",e.target.value)}
                      style={fldS({flex:1,fontWeight:700,fontSize:15})}/>
                    <button onClick={()=>setTopics(ts=>ts.filter((_,i)=>i!==ti))}
                      style={{background:"none",border:"none",color:T.hint,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,paddingLeft:30}}>
                    {(t.subtopics||[]).map((s,si)=>(
                      <div key={si} style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{color:T.hint,fontSize:16,flexShrink:0}}>•</span>
                        <input value={s} onChange={e=>setSub(ti,si,e.target.value)} style={fldS({flex:1})}/>
                        <button onClick={()=>delSub(ti,si)}
                          style={{background:"none",border:"none",color:T.hint,cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
                      </div>
                    ))}
                    <button onClick={()=>addSub(ti)}
                      style={{background:"none",border:"none",color:T.blue,cursor:"pointer",
                        fontSize:12,textAlign:"left",padding:"3px 0",fontWeight:600}}>
                      + add subtopic
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <NavRow
              onBack={()=>setStep(skipQ?1:2)}
              onNext={genIdeas}
              nextLabel="Generate JSON & Ideas →"
            />
          </div>
        )}

        {/* ══ STEP 4 — Ideas ═══════════════════════════════════════════════ */}
        {step===4&&(
          <div>
            <SectionHead title="Select an idea to implement"
              sub="Click a card to select it. Click Edit to modify icon, title or description."/>

            {/* ── Previously generated components ── */}
            {Object.keys(implementations).length>0&&(
              <div style={{marginBottom:18,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:12}}>
                  📦 Generated components
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {Object.entries(implementations).map(([biStr,impl])=>(
                    <div key={biStr} style={{border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 12px",
                      display:"flex",flexDirection:"column",gap:6,minWidth:160,flex:"0 1 auto",background:"#fafafa"}}>
                      <div style={{fontSize:11,color:T.muted,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        📄 {slugify(impl.label)}.jsx
                      </div>
                      <div style={{fontSize:12,color:T.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {impl.label}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{switchImpl(Number(biStr));setStep(5);}}
                          style={btnS({background:T.blue,color:"#fff",padding:"5px 10px",fontSize:11,flex:1})}>
                          View/Edit →
                        </button>
                        <button onClick={()=>downloadFile(impl.code,`${slugify(impl.label)}.jsx`)}
                          style={btnS({background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"5px 8px",fontSize:11})}>
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* JSON collapsible with download */}
            {topicJSON.length>0&&(
              <div style={{marginBottom:18,background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",padding:"0 18px"}}>
                  <button onClick={()=>setOpen(o=>({...o,json:!o["json"]}))}
                    style={{flex:1,padding:"12px 0",background:"none",border:"none",cursor:"pointer",
                      display:"flex",alignItems:"center",gap:8,fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{fontSize:13,fontWeight:700,color:T.text}}>
                      📄 Generated JSON — {topicJSON.length} entries
                    </span>
                    <span style={{color:T.hint,fontSize:16,marginLeft:4}}>{open["json"]?"▲":"▼"}</span>
                  </button>
                  {/* Download JSON button */}
                  <button onClick={dlJSON}
                    style={btnS({background:T.green,color:"#fff",padding:"6px 14px",fontSize:12})}>
                    ↓ Download .json
                  </button>
                </div>
                {open["json"]&&(
                  <pre style={{background:"#1e1e2e",color:"#a6e3a1",padding:"16px 20px",fontSize:12,
                    overflow:"auto",margin:0,lineHeight:1.65,maxHeight:260,
                    fontFamily:"monospace",borderTop:`1px solid ${T.border}`}}>
                    {JSON.stringify(topicJSON,null,2)}
                  </pre>
                )}
              </div>
            )}

            {/* Ideas */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {ideas.map((block,bi)=>{
                const isOpen = open[bi]!==false;
                const hasSel = selIdea[bi]||customIdea[bi]?.trim();
                const jEntry = topicJSON[bi];
                return (
                  <div key={bi} style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>

                    <button onClick={()=>setOpen(o=>({...o,[bi]:!isOpen}))}
                      style={{width:"100%",padding:"14px 18px",background:isOpen?T.blueLight:"#fff",
                        border:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",
                        alignItems:"center",borderBottom:isOpen?`1px solid ${T.blueBorder}`:"none",
                        transition:"background 0.2s",fontFamily:"inherit"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        {jEntry&&<span style={{fontSize:18,lineHeight:1}}>{jEntry.icon}</span>}
                        <Tag text={String(bi+1)}/>
                        <span style={{fontSize:14,fontWeight:700,color:T.text}}>{block.topicTitle}</span>
                        {jEntry&&<span style={{fontSize:11,color:T.muted}}>⏱ {jEntry.minute}</span>}
                        {hasSel&&<span style={{fontSize:10,background:T.greenLight,color:T.green,
                          border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"2px 8px",fontWeight:700}}>
                          selected
                        </span>}
                        {implementations[bi]&&<span style={{fontSize:10,background:"#f0fdf4",color:"#15803d",
                          border:"1px solid #bbf7d0",borderRadius:10,padding:"2px 8px",fontWeight:700}}>
                          ✓ implemented
                        </span>}
                      </div>
                      <span style={{color:T.hint,fontSize:18}}>{isOpen?"▲":"▼"}</span>
                    </button>

                    {isOpen&&(
                      <div style={{padding:20}}>
                        {/* 5 idea cards */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(215px,1fr))",gap:12,marginBottom:16}}>
                          {(block.ideas||[]).map((idea)=>{
                            const key=`${bi}-${idea.id}`;
                            const isEditing=editKey===key;
                            const isSel=selIdea[bi]===idea.id&&!isEditing;
                            return (
                              <div key={idea.id}
                                onClick={isEditing?undefined:()=>{setSelIdea(s=>({...s,[bi]:idea.id}));setCustomIdea(c=>({...c,[bi]:""}));}}
                                style={{border:`2px solid ${isSel?T.blue:T.border}`,borderRadius:11,
                                  padding:"13px 14px",cursor:isEditing?"default":"pointer",
                                  background:isSel?T.blueLight:"#fafafa",
                                  transition:"border-color 0.15s,background 0.15s"}}>

                                {isEditing?(
                                  <div onClick={e=>e.stopPropagation()}>
                                    <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                                      <input value={editDraft.icon||""} onChange={e=>setEditDraft(d=>({...d,icon:e.target.value}))}
                                        style={{width:38,textAlign:"center",border:`1px solid ${T.border}`,borderRadius:6,
                                          padding:"5px 3px",fontSize:18,boxSizing:"border-box"}} placeholder="💡"/>
                                      <input value={editDraft.title||""} onChange={e=>setEditDraft(d=>({...d,title:e.target.value}))}
                                        style={fldS({flex:1,fontWeight:700,fontSize:12})} placeholder="Title"/>
                                    </div>
                                    <textarea value={editDraft.description||""} onChange={e=>setEditDraft(d=>({...d,description:e.target.value}))}
                                      style={fldS({width:"100%",height:78,resize:"vertical",fontSize:12,lineHeight:1.5})}
                                      placeholder="Describe the component…"/>
                                    <div style={{display:"flex",gap:7,marginTop:9}}>
                                      <button onClick={()=>{updateIdea(bi,idea.id,editDraft);setEditKey(null);}}
                                        style={btnS({background:T.green,color:"#fff",padding:"6px 14px",fontSize:12})}>✓ Save</button>
                                      <button onClick={()=>setEditKey(null)}
                                        style={btnS({background:"#fff",border:`1px solid ${T.border}`,color:T.muted,padding:"6px 12px",fontSize:12})}>Cancel</button>
                                    </div>
                                  </div>
                                ):(
                                  <>
                                    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:7}}>
                                      <span style={{fontSize:22,lineHeight:1,flexShrink:0}}>{idea.icon||"💡"}</span>
                                      <span style={{fontSize:12,fontWeight:800,lineHeight:1.3,color:isSel?T.blue:T.text,flex:1}}>
                                        {idea.id}. {idea.title}
                                      </span>
                                      <button
                                        onClick={e=>{e.stopPropagation();setEditDraft({icon:idea.icon||"💡",title:idea.title,description:idea.description});setEditKey(key);}}
                                        style={{background:"rgba(0,0,0,0.04)",border:`1px solid ${T.border}`,
                                          cursor:"pointer",color:T.muted,fontSize:10,padding:"2px 7px",
                                          lineHeight:1.5,flexShrink:0,borderRadius:5,fontWeight:700,fontFamily:"inherit"}}>
                                        Edit
                                      </button>
                                    </div>
                                    <p style={{fontSize:12,color:T.muted,lineHeight:1.55,margin:0}}>{idea.description}</p>
                                    {(()=>{
                                      const t = idea.type||(idea.needsAnimation?"animated":"interactive");
                                      const cfg = t==="animated"
                                        ? {bg:"#fff7ed",fg:"#c2410c",border:"#fed7aa",label:"🎬 animated"}
                                        : t==="dragdrop"
                                        ? {bg:"#f0fdf4",fg:"#15803d",border:"#bbf7d0",label:"🤏 drag & drop"}
                                        : {bg:"#eff6ff",fg:T.blue,border:T.blueBorder,label:"🖱 interactive"};
                                      return (
                                        <span style={{marginTop:6,display:"inline-block",fontSize:10,fontWeight:700,
                                          background:cfg.bg,color:cfg.fg,
                                          border:`1px solid ${cfg.border}`,
                                          borderRadius:10,padding:"2px 8px"}}>
                                          {cfg.label}
                                        </span>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div style={{marginBottom:14}}>
                          <label style={{fontSize:12,color:T.muted,display:"block",marginBottom:5,fontWeight:600}}>
                            Or describe your own idea:
                          </label>
                          <input value={customIdea[bi]||""} onChange={e=>{setCustomIdea(c=>({...c,[bi]:e.target.value}));if(e.target.value)setSelIdea(s=>({...s,[bi]:null}));}}
                            placeholder="Describe a custom interactive component…"
                            style={fldS({width:"100%",border:`1.5px solid ${customIdea[bi]?.trim()?T.blue:T.border}`})}/>
                        </div>

                        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                          <button onClick={()=>implement(bi)} disabled={!hasSel}
                            style={btnS({background:hasSel?T.blue:"#e2e8f0",color:hasSel?"#fff":T.hint,cursor:hasSel?"pointer":"not-allowed"})}>
                            ⚡ Implement this →
                          </button>
                          {implementations[bi]&&(
                            <button onClick={()=>{switchImpl(bi);setStep(5);}}
                              style={btnS({background:T.greenLight,color:T.green,border:`1px solid ${T.greenBorder}`,padding:"10px 18px"})}>
                              ✓ View / Edit →
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{marginTop:22}}>
              <button onClick={()=>setStep(3)}
                style={btnS({border:`1px solid ${T.border}`,background:"#fff",color:T.text})}>
                ← Back to Topics
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 5 — Component ═══════════════════════════════════════════ */}
        {step===5&&(
          <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>

            {/* ── Left sidebar: file list + download all ── */}
            <div style={{width:230,flexShrink:0,position:"sticky",top:82}}>
              <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
                <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontSize:12,fontWeight:700,color:T.text}}>
                  Generated files
                </div>

                {/* questions.csv */}
                {questions.length>0&&(
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,color:T.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      📊 questions.csv
                    </span>
                    <button onClick={()=>downloadFile(buildQuestionsCSV(questions),"questions.csv","text/csv")}
                      style={btnS({background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"3px 8px",fontSize:11})}>
                      ↓
                    </button>
                  </div>
                )}

                {/* topics.csv */}
                {topics.length>0&&(
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,color:T.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      📊 topics.csv
                    </span>
                    <button onClick={()=>downloadFile(buildTopicsCSV(topics),"topics.csv","text/csv")}
                      style={btnS({background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"3px 8px",fontSize:11})}>
                      ↓
                    </button>
                  </div>
                )}

                {/* topics.json */}
                {topicJSON.length>0&&(
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,color:T.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      📄 topics.json
                    </span>
                    <button onClick={dlJSON}
                      style={btnS({background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"3px 8px",fontSize:11})}>
                      ↓
                    </button>
                  </div>
                )}

                {/* Component entries */}
                {Object.entries(implementations).map(([biStr,impl])=>{
                  const bi=Number(biStr);
                  const isActive=activeImpl===bi;
                  return (
                    <div key={bi} onClick={()=>switchImpl(bi)}
                      style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,cursor:"pointer",
                        background:isActive?T.blueLight:"#fff",transition:"background 0.15s",display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:isActive?T.blue:T.muted,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          📄 {slugify(impl.label)}.jsx
                        </div>
                        <div style={{fontSize:11,color:isActive?T.blue:T.text,fontWeight:500,marginTop:2,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {impl.label}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();downloadFile(impl.code,`${slugify(impl.label)}.jsx`);}}
                        style={btnS({background:"none",border:`1px solid ${T.border}`,color:T.muted,padding:"3px 8px",fontSize:11,flexShrink:0})}>
                        ↓
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Download all */}
              {(Object.keys(implementations).length>0||topicJSON.length>0)&&(
                <button onClick={downloadAll}
                  style={btnS({width:"100%",background:T.green,color:"#fff",padding:"10px",fontSize:12,marginBottom:8})}>
                  ⬇ Download all (.zip)
                </button>
              )}

              <button onClick={()=>setStep(4)}
                style={btnS({width:"100%",border:`1px solid ${T.border}`,background:"#fff",color:T.text,padding:"9px",fontSize:12})}>
                ← Back to Ideas
              </button>
            </div>

            {/* ── Right: viewer + editor ── */}
            <div style={{flex:1,minWidth:0}}>
              {activeImpl!==null&&implementations[activeImpl]?(()=>{
                const impl=implementations[activeImpl];
                return (
                  <>
                    {/* Header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:10,flexWrap:"wrap"}}>
                      <div>
                        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:0}}>{impl.label}</h1>
                        <p style={{color:T.muted,fontSize:12,margin:"3px 0 0"}}>{impl.ideaTitle}</p>
                      </div>
                      <button onClick={()=>setIframeKey(k=>k+1)}
                        style={btnS({border:`1px solid ${T.border}`,background:"#fff",color:T.muted,padding:"7px 12px",fontSize:12})}>
                        ↺ Reload
                      </button>
                    </div>

                    {/* Tabs */}
                    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
                      {[["preview","▶  Preview"],["code","{ }  Code"]].map(([id,label])=>(
                        <button key={id} onClick={()=>setTab(id)}
                          style={{padding:"9px 20px",background:"none",border:"none",
                            borderBottom:`2.5px solid ${tab===id?T.blue:"transparent"}`,
                            color:tab===id?T.blue:T.muted,fontSize:13,fontWeight:tab===id?700:400,
                            cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",marginBottom:"-1px"}}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Preview */}
                    {tab==="preview"&&(
                      <div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 12px 12px",overflow:"hidden"}}>
                        <iframe key={`${activeImpl}-${iframeKey}`} srcDoc={editLoading?LOADING_DOC:autoFixing?AUTOFIX_DOC:buildSrcdoc(impl.code,iframeKey)}
                          sandbox="allow-scripts allow-same-origin"
                          style={{width:"100%",height:"calc(100vh - 260px)",minHeight:500,border:"none",display:"block"}} title="Live preview"/>
                      </div>
                    )}

                    {/* Code */}
                    {tab==="code"&&(
                      <div style={{background:"#1e1e2e",borderRadius:"0 0 12px 12px",overflow:"hidden",
                        border:`1px solid ${T.border}`,borderTop:"none"}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",
                          background:"#181825",borderBottom:"1px solid #313244"}}>
                          {["#f38ba8","#f9e2af","#a6e3a1"].map((c,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}
                          <span style={{marginLeft:8,color:"#585b70",fontSize:11,fontFamily:"monospace"}}>{slugify(impl.label)}.jsx</span>
                          <span style={{marginLeft:"auto",color:"#585b70",fontSize:10}}>{impl.code.split("\n").length} lines</span>
                        </div>
                        <pre style={{color:"#cdd6f4",padding:"18px 22px",fontSize:12,lineHeight:1.8,
                          overflow:"auto",margin:0,maxHeight:"calc(100vh - 300px)",fontFamily:"'JetBrains Mono','Fira Code',monospace"}}>
                          <code>{impl.code}</code>
                        </pre>
                      </div>
                    )}

                    {/* ── Edit this component — pinned at bottom ── */}
                    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",marginTop:14}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:10}}>Edit this component</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <input
                          value={editPrompt}
                          onChange={e=>setEditPrompt(e.target.value)}
                          onKeyDown={e=>e.key==="Enter"&&!editLoading&&applyEdit()}
                          placeholder='Describe what to change — e.g. "make the background dark" or "add a click counter"'
                          style={fldS({flex:1,fontSize:13})}
                          disabled={editLoading}
                        />
                        <button onClick={applyEdit} disabled={!editPrompt.trim()||editLoading}
                          style={btnS({background:editPrompt.trim()&&!editLoading?T.blue:"#bfdbfe",color:"#fff",
                            padding:"9px 18px",fontSize:13,cursor:editPrompt.trim()&&!editLoading?"pointer":"not-allowed",whiteSpace:"nowrap"})}>
                          {editLoading?"Applying…":"Apply →"}
                        </button>
                        {(editHistories[activeImpl]?.length>0)&&(
                          <button onClick={undoEdit}
                            style={btnS({border:`1px solid ${T.border}`,background:"#fff",color:T.muted,padding:"9px 14px",fontSize:13,whiteSpace:"nowrap"})}>
                            ↩ Undo
                          </button>
                        )}
                      </div>
                      {autoFixing&&(
                        <div style={{marginTop:10,fontSize:12,color:"#92400e",display:"flex",alignItems:"center",gap:7}}>
                          <span style={{display:"inline-block",width:11,height:11,borderRadius:"50%",border:"2px solid #fde68a",borderTopColor:"#d97706",animation:"spin 0.7s linear infinite"}}/>
                          Auto-fixing error — please wait…
                        </div>
                      )}
                    </div>
                  </>
                );
              })():(
                <div style={{textAlign:"center",padding:"80px 0",color:T.muted}}>
                  <div style={{fontSize:32,marginBottom:12}}>📄</div>
                  <p>Select a component from the sidebar, or go back to Ideas to generate one.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Loading */}      {/* Loading */}
      {loading&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.38)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"#fff",borderRadius:18,padding:"36px 48px",textAlign:"center",
            maxWidth:400,width:"90%",boxShadow:"0 24px 60px rgba(0,0,0,0.22)"}}>
            <div style={{width:48,height:48,borderRadius:"50%",border:`5px solid ${T.blueLight}`,
              borderTopColor:T.blue,animation:"spin 0.75s linear infinite",margin:"0 auto 22px"}}/>
            <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:8}}>Working…</div>
            <div style={{fontSize:13,color:T.muted,lineHeight:1.6}}>{loadMsg}</div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}