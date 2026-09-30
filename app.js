"use strict";

const DEFAULT_PLAN = {phases:[
  {id:"beschikking", name:"Beschikking en dossier", steps:[
    {id:"beschikking", name:"Beschikking ontvangen van de rechtbank", hint:"Datum van de beschikking vastgelegd; hier start de termijn voor de boedelbeschrijving"},
    {id:"beschikking-check", name:"Beschikking gecontroleerd", hint:"Juiste gegevens, omvang van het bewind, eventueel mentorschap of curatele"},
    {id:"ccbr", name:"Inschrijving in het curatele- en bewindregister gecontroleerd"},
    {id:"onview", name:"Dossier aangemaakt in OnView", hint:"Cliëntgegevens, beschikking en contactpersonen ingevoerd"},
    {id:"intake-gepland", name:"Intakegesprek gepland", hint:"Cliënt en eventueel netwerk of verwijzer geïnformeerd"}
  ]},
  {id:"intake", name:"Intake met cliënt", steps:[
    {id:"intake", name:"Intakegesprek gevoerd", hint:"Thuisbezoek of op kantoor"},
    {id:"overeenkomst", name:"Cliëntovereenkomst en huisregels getekend"},
    {id:"machtigingen", name:"Machtigingen geregeld", hint:"Onder meer DigiD-machtiging en volmachten"},
    {id:"documenten", name:"Documenten verzameld", hint:"ID, loonstroken, huurcontract, polissen, brieven van schuldeisers, bankafschriften"},
    {id:"passen", name:"Oude bankpassen en toegang internetbankieren ingeleverd of geblokkeerd"}
  ]},
  {id:"rekeningen", name:"Rekeningen", steps:[
    {id:"banken", name:"Bewind gemeld bij alle banken", hint:"Bestaande rekeningen onder bewind geplaatst"},
    {id:"beheerrekening", name:"Beheerrekening geopend"},
    {id:"leefgeldrekening", name:"Leefgeldrekening geopend en pas bij cliënt"},
    {id:"saldi", name:"Saldi per datum van de beschikking opgevraagd", hint:"Nodig voor de boedelbeschrijving"}
  ]},
  {id:"inkomsten", name:"Inkomsten omleggen", steps:[
    {id:"inkomsten-aangeschreven", name:"Inkomstenbronnen aangeschreven", hint:"Werkgever, UWV, SVB of gemeente"},
    {id:"inkomsten-ontvangen", name:"Eerste inkomsten ontvangen op de beheerrekening"},
    {id:"toeslagen", name:"Toeslagen gecontroleerd en omgezet", hint:"Zorgtoeslag, huurtoeslag, kindgebonden budget"},
    {id:"belastingdienst", name:"Belastingdienst geregeld", hint:"Machtiging, openstaande aangiften en voorlopige aanslag"}
  ]},
  {id:"vastelasten", name:"Vaste lasten en post", steps:[
    {id:"post", name:"Post omgeleid naar kantoor"},
    {id:"verhuurder", name:"Verhuurder of hypotheekverstrekker aangeschreven"},
    {id:"zorgverzekeraar", name:"Zorgverzekeraar aangeschreven"},
    {id:"nutsvoorzieningen", name:"Energie, water, internet en telefoon aangeschreven"},
    {id:"gemeente", name:"Gemeentelijke belastingen en waterschap aangeschreven", hint:"Kwijtschelding aangevraagd waar dat kan"},
    {id:"verzekeringen", name:"Overige verzekeringen en abonnementen gecontroleerd"}
  ]},
  {id:"schulden", name:"Schulden en boedel", steps:[
    {id:"schuldeisers", name:"Schuldeisers aangeschreven", hint:"Bewind gemeld, opgave van vordering gevraagd"},
    {id:"schuldenoverzicht", name:"Schuldenoverzicht compleet"},
    {id:"beslagvrije-voet", name:"Beslagvrije voet gecontroleerd", hint:"Alleen bij beslag"},
    {id:"boedel-opgesteld", name:"Boedelbeschrijving opgesteld"},
    {id:"boedel", name:"Boedelbeschrijving ingediend bij de rechtbank", hint:"Binnen drie maanden na de beschikking", deadlineDays:90},
    {id:"plan-van-aanpak", name:"Plan van aanpak opgesteld", hint:"Doelen voor de cliënt, zoals stabilisatie of schuldhulpverlening"}
  ]},
  {id:"budgetplan", name:"Budgetplan", steps:[
    {id:"concept", name:"Conceptbudgetplan opgesteld"},
    {id:"besproken", name:"Budgetplan besproken en getekend door cliënt"},
    {id:"reserveringen", name:"Reserveringen ingericht", hint:"Bijvoorbeeld eindafrekening energie en jaarlijkse kosten"},
    {id:"betalingen", name:"Vaste lasten ingericht in OnView"},
    {id:"leefgeld", name:"Leefgeld afgesproken en ingepland"},
    {id:"shv", name:"Aangemeld voor schuldhulpverlening", hint:"Alleen als dat past bij het plan van aanpak"},
    {id:"eerste-maand", name:"Eerste maand gedraaid en gecontroleerd"},
    {id:"draait", name:"Budgetplan draait, dossier naar regulier beheer"}
  ]}
]};

const STATES = ["open","bezig","klaar","nvt"];
const CYCLE = ["open","bezig","klaar"];
const LABEL = {open:"Open", bezig:"Bezig", klaar:"Klaar", nvt:"N.v.t."};
const isDone = st => st === "klaar" || st === "nvt";

let plan = clone(DEFAULT_PLAN);
let dossiers = [];
let dbState = "loading"; // loading | ready | none
let sb = null, channel = null;
let me = {email: "", naam: ""};
let team = []; // namen uit de teamlijst, voor 'Wie pakt dit op?'
let actLog = [], actLogState = "idle"; // logboek van toewijzingen: idle | loading | ready | error
const ui = {q:"", bw:"", archived:false, sheet:null, deferred:false, confirmDelete:false, planDraft:null, fold:{}, actTab:"open", actWho:"", wWho:"", recentDone:{}};
const chains = new Map(), inflight = new Map();

const $ = s => document.querySelector(s);
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function uid(p){ return p + Math.random().toString(36).slice(2, 9); }

/* ---------- dates ---------- */
function parseDay(s){ if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? new Date(+m[1], m[2]-1, +m[3]) : new Date(s); }
function today(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function fmtDate(v){ const d = v instanceof Date ? v : new Date(v); if (isNaN(d)) return ""; const o = {day:"numeric", month:"short"}; if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric"; return d.toLocaleDateString("nl-NL", o); }
function relDate(iso){ if (!iso) return ""; const d = new Date(iso); d.setHours(0,0,0,0); const n = Math.round((today() - d) / 864e5); if (n <= 0) return "vandaag"; if (n === 1) return "gisteren"; if (n < 7) return n + " dagen geleden"; return fmtDate(iso); }

/* ---------- plan & progress ---------- */
function steps(){ return plan.phases.flatMap(p => p.steps); }
function info(d, id){ return (d.status && d.status[id]) || {}; }
function stateOf(d, id){ const s = info(d, id).s; return STATES.includes(s) ? s : "open"; }
function progress(d){ const all = steps().filter(s => stateOf(d, s.id) !== "nvt"); const done = all.filter(s => stateOf(d, s.id) === "klaar").length; const busy = all.filter(s => stateOf(d, s.id) === "bezig").length; return {done, busy, total: all.length, pct: all.length ? Math.round(done / all.length * 100) : 0}; }
function currentPhase(d){ for (let i = 0; i < plan.phases.length; i++){ if (plan.phases[i].steps.some(s => !isDone(stateOf(d, s.id)))) return i; } return -1; }
function curStep(d){ return steps().find(s => !isDone(stateOf(d, s.id))) || null; }
function nextOpen(d){ return steps().find(s => stateOf(d, s.id) === "open") || null; }
function deadlinesOf(d){
  const base = parseDay(d.beschikking); if (!base || isNaN(base)) return [];
  return steps().filter(s => s.deadlineDays > 0 && !isDone(stateOf(d, s.id))).map(s => {
    const due = new Date(base); due.setDate(due.getDate() + Number(s.deadlineDays));
    return {step: s, due, days: Math.round((due - today()) / 864e5)};
  });
}
function deadlineChip(dl, long){
  const w = long ? dl.step.name : dl.step.name.split(" ")[0];
  const cls = dl.days < 0 ? "late" : dl.days <= 30 ? "soon" : "";
  const txt = dl.days < 0 ? `${-dl.days} d te laat` : dl.days === 0 ? "vandaag" : dl.days <= 30 ? `nog ${dl.days} d` : `vóór ${fmtDate(dl.due)}`;
  return `<span class="chip ${cls}" title="Termijn ${esc(dl.step.name)}: ${fmtDate(dl.due)}">${esc(w)} · ${txt}</span>`;
}
function validPlan(p){ return p && Array.isArray(p.phases) && p.phases.every(ph => ph && typeof ph.name === "string" && Array.isArray(ph.steps) && ph.steps.every(s => s && s.id && typeof s.name === "string")); }

/* ---------- rows ---------- */
function fromRow(r){
  return {id: r.id, dossiernummer: r.dossiernummer || "", naam: r.naam || "", bewindvoerder: r.bewindvoerder || "", assistent: r.assistent || "",
    beschikking: r.beschikking || "", notitie: r.notitie || "", archived: !!r.archived, example: !!r.example,
    status: r.status && typeof r.status === "object" ? clone(r.status) : {}, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by || ""};
}
function upsertLocal(d){ const i = dossiers.findIndex(x => x.id === d.id); if (i >= 0) dossiers[i] = d; else dossiers.push(d); }

/* ---------- filtering ---------- */
function visible(){
  const q = ui.q.trim().toLowerCase();
  return dossiers.filter(d => (ui.archived || !d.archived)
    && (!ui.bw || d.bewindvoerder === ui.bw || d.assistent === ui.bw || openActions(d).some(s => info(d, s.id).w === ui.bw))
    && (!q || [d.naam, d.dossiernummer, d.bewindvoerder, d.assistent].some(v => String(v || "").toLowerCase().includes(q))));
}
function sortKey(d){ const dl = deadlinesOf(d); return dl.length ? Math.min(...dl.map(x => x.days)) : 1e6; }
function sorted(list){ return list.slice().sort((a, b) => (sortKey(a) - sortKey(b)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))); }
function columns(){
  const list = visible();
  const cols = plan.phases.map((ph, i) => ({name: ph.name, eyebrow: "Fase " + (i + 1), items: sorted(list.filter(d => currentPhase(d) === i))}));
  cols.push({name: "Budgetplan draait", eyebrow: "Afgerond", finish: true, items: sorted(list.filter(d => currentPhase(d) === -1))});
  return cols;
}
function meetingOrder(){ return columns().flatMap(c => c.items).filter(d => !d.archived).map(d => d.id); }

/* ---------- pieces ---------- */
// Eén balkje per fase: klaar en n.v.t. tellen allebei als afgerond (groen), daarna bezig.
function phaseBar(d){
  return `<div class="pbar" aria-hidden="true">${plan.phases.filter(p => p.steps.length).map(ph => {
    const w = f => (ph.steps.filter(s => f(stateOf(d, s.id))).length / ph.steps.length * 100).toFixed(1) + "%";
    return `<span class="pseg"><i class="k" style="width:${w(isDone)}"></i><i class="b" style="width:${w(st => st === "bezig")}"></i></span>`;
  }).join("")}</div>`;
}
function routeHtml(d, opts = {}){
  const cur = curStep(d), isStatic = opts.static;
  const ph = plan.phases.filter(p => p.steps.length).map(p => {
    const done = p.steps.filter(s => isDone(stateOf(d, s.id))).length;
    const stations = p.steps.map(s => {
      const st = stateOf(d, s.id), c = cur && cur.id === s.id && !opts.static ? " cur" : "";
      const t = esc(`${s.name} — ${LABEL[st]}`);
      return isStatic
        ? `<span class="st s-${st}${c}" title="${t}"><span class="dot"></span></span>`
        : `<button type="button" class="st s-${st}${c}" data-cycle="${esc(s.id)}" title="${t} (klik om te wijzigen)" aria-label="${t}. Klik om status te wijzigen"><span class="dot"></span></button>`;
    }).join("");
    return `<div class="rp" style="--n:${p.steps.length}"><div class="rtrack">${stations}</div><div class="rlabel"><span>${esc(p.name)}</span><span class="mono">${done}/${p.steps.length}</span></div></div>`;
  }).join("");
  const all = currentPhase(d) === -1 && steps().length > 0;
  return `<div class="route${opts.big ? " big" : ""}">${ph}<div class="rfin${all && !opts.static ? " on" : ""}"><div class="rtrack"><span class="flag">Draait</span></div><div class="rlabel"><span>Budgetplan</span></div></div></div>`;
}
// Stappen die aan iemand zijn toegewezen en nog niet klaar of n.v.t. zijn.
function openActions(d){ return steps().filter(s => info(d, s.id).w && !isDone(stateOf(d, s.id))); }
function whoSelect(d, s){
  const w = info(d, s.id).w || "";
  const names = [...new Set([...team, w].filter(Boolean))];
  return `<select class="select who" data-who="${esc(s.id)}" aria-label="Wie pakt ${esc(s.name)} op?"><option value="">Wie pakt dit op?</option>${names.map(n => `<option value="${esc(n)}"${n === w ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
}
// Ingeklapt als de gebruiker dat koos; anders standaard dicht zodra de fase helemaal klaar is.
function isFolded(d, p){
  const k = d.id + ":" + p.id;
  return k in ui.fold ? ui.fold[k] : p.steps.every(s => isDone(stateOf(d, s.id)));
}
function peopleHtml(d){
  const p = [];
  if (d.bewindvoerder) p.push("BW " + esc(d.bewindvoerder));
  if (d.assistent) p.push("ABW " + esc(d.assistent));
  return p.join(" · ");
}
function cardHtml(d){
  const pr = progress(d);
  // Geen aftellen op het kaartje; alleen een verlopen termijn valt op. Details staan in het dossier.
  const chips = deadlinesOf(d).filter(x => x.days < 0).map(x => `<span class="chip late" title="Termijn ${esc(x.step.name)}: ${fmtDate(x.due)}">${esc(x.step.name.split(" ")[0])} · termijn verlopen</span>`).join("") + (d.archived ? `<span class="chip">Gearchiveerd</span>` : "");
  const people = [d.bewindvoerder, d.assistent].filter(Boolean).join(" / ");
  const meta = [d.dossiernummer, people].filter(Boolean).map(esc).join(" · ");
  return `<button type="button" class="card${d.archived ? " archived" : ""}" data-open="${esc(d.id)}">
    <div class="card-top"><h3>${esc(d.naam || "Naamloos dossier")}</h3><span class="pct">${pr.pct}%</span></div>
    ${meta ? `<div class="card-meta">${meta}</div>` : ""}
    ${phaseBar(d)}
    <div class="chips">${chips}</div>
  </button>`;
}

/* ---------- render: main ---------- */
// Dashboard-widget: tabel met acties. Status klikken wisselt open/bezig, het vinkje zet de stap op klaar.
// Net afgevinkte acties blijven doorgestreept staan tot de pagina ververst, zodat een vinkje terug te draaien is.
function widgetRows(who){
  return dossiers.filter(d => !d.archived).flatMap(d => steps().filter(s => {
    const i = info(d, s.id), st = stateOf(d, s.id);
    if (!i.w || (who && i.w !== who)) return false;
    return !isDone(st) || (st === "klaar" && (d.id + ":" + s.id) in ui.recentDone);
  }).map(s => ({d, s, i: info(d, s.id), st: stateOf(d, s.id)})))
    .sort((a, b) => String(a.i.wd || "").localeCompare(String(b.i.wd || "")));
}
function renderSummary(){
  const el = $("#summary");
  if (dbState !== "ready"){ el.innerHTML = ""; return; }
  const names = [...new Set([...team, ...dossiers.flatMap(d => openActions(d).map(s => info(d, s.id).w))].filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  if (ui.wWho && !names.includes(ui.wWho)) ui.wWho = "";
  const who = ui.wWho, rows = widgetRows(who), open = rows.filter(r => r.st !== "klaar").length;
  const title = who === me.naam ? "Mijn acties" : who ? "Acties van " + esc(who) : "Acties van het team";
  const empty = who === me.naam ? "Je hebt geen openstaande acties." : who ? esc(who) + " heeft geen openstaande acties." : "Er staan geen acties open. Kies in een dossier bij een stap wie hem oppakt.";
  // Per overleg: acties gekoppeld op dezelfde dag horen bij hetzelfde overleg.
  const groups = new Map();
  rows.forEach(r => { const k = r.i.wd ? dayKey(r.i.wd) : "zz"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const rowHtml = r => {
    const done = r.st === "klaar", label = esc(r.s.name) + " bij " + esc(r.d.naam || "dossier");
    return `<div class="at-row${done ? " done" : ""}" role="row">
      <span class="at-chk" role="cell"><input type="checkbox" data-check="${esc(r.d.id)}" data-step="${esc(r.s.id)}"${done ? " checked" : ""} aria-label="${label} klaar"></span>
      <span class="at-who" role="cell">${esc(r.i.w)}</span>
      <span class="at-act" role="cell"><button type="button" class="at-link" data-open="${esc(r.d.id)}">${esc(r.s.name)}</button></span>
      <span class="at-cli" role="cell"><button type="button" class="at-link" data-open="${esc(r.d.id)}">${esc(r.d.naam || "Naamloos dossier")}</button></span>
      <span class="at-st" role="cell">${done ? `<span class="chip ok">Klaar</span>` : `<button type="button" class="chip at-toggle${r.st === "bezig" ? " soon" : ""}" data-toggle="${esc(r.d.id)}" data-step="${esc(r.s.id)}" title="Klik om te wisselen tussen Open en Bezig" aria-label="${label}: ${LABEL[r.st]}. Klik om te wisselen">${LABEL[r.st]}</button>`}</span>
    </div>`;
  };
  const body = [...groups.keys()].sort().map(k => {
    const items = groups.get(k).sort((a, b) => a.i.w.localeCompare(b.i.w, "nl") || String(a.i.wd).localeCompare(String(b.i.wd)));
    const n = items.filter(r => r.st !== "klaar").length;
    const label = k === "zz" ? "Zonder datum" : "Overleg " + new Date(items[0].i.wd).toLocaleDateString("nl-NL", {weekday: "long", day: "numeric", month: "long", year: "numeric"});
    return `<div class="at-group" role="row"><span role="cell">${label} <span class="count">${n} open</span></span></div>` + items.map(rowHtml).join("");
  }).join("");
  el.innerHTML = `<div class="dash"><div class="widget">
    <div class="widget-head"><h2>${title} <span class="count">${open}</span></h2><div class="widget-tools"><label class="wlabel" for="w-who">Wie</label><select class="select" id="w-who"><option value="">Iedereen</option>${names.map(n => `<option value="${esc(n)}"${n === who ? " selected" : ""}>${n === me.naam ? esc(n) + " (ik)" : esc(n)}</option>`).join("")}</select><button class="btn" type="button" id="btn-log">Logboek</button></div></div>
    ${rows.length ? `<div class="atable" role="table" aria-label="${title}"><div class="at-row at-head" role="row"><span role="columnheader"><span class="sr">Klaar</span></span><span role="columnheader">Wie</span><span role="columnheader">Actie</span><span role="columnheader">Cliënt</span><span role="columnheader">Status</span></div>${body}</div>` : `<p class="muted">${empty}</p>`}
  </div>${teamHtml(who)}</div>`;
}
// Teamstand: per medewerker hoeveel acties openstaan en sinds wanneer de oudste ligt. Klik = filter de tabel.
function teamHtml(who){
  const all = dossiers.filter(d => !d.archived).flatMap(d => openActions(d).map(s => ({w: info(d, s.id).w, st: stateOf(d, s.id), wd: info(d, s.id).wd})));
  const names = [...new Set([...team, ...all.map(a => a.w)].filter(Boolean))].sort((a, b) => (b === me.naam) - (a === me.naam) || a.localeCompare(b, "nl"));
  const rows = names.map(n => {
    const it = all.filter(a => a.w === n), busy = it.filter(a => a.st === "bezig").length;
    const oldest = it.map(a => a.wd).filter(Boolean).sort()[0];
    return `<li><button type="button" class="tm${n === who ? " on" : ""}" data-teamwho="${esc(n)}" aria-pressed="${n === who}"><span class="tm-n">${esc(n)}${n === me.naam ? " (ik)" : ""}</span><span class="tm-c">${it.length ? it.length + (it.length === 1 ? " actie" : " acties") + (busy ? " · " + busy + " bezig" : "") : "geen acties"}</span><span class="tm-o">${oldest ? "oudste " + fmtDate(oldest) : ""}</span></button></li>`;
  }).join("");
  return `<div class="widget team"><div class="widget-head"><h2>Teamstand</h2>${who ? `<button class="linkbtn" type="button" data-teamwho="">Iedereen tonen</button>` : ""}</div><ul class="tm-list">${rows}</ul><p class="muted tm-hint">Klik op een naam om de acties van die persoon te tonen.</p></div>`;
}
function loadWho(){ try { return localStorage.getItem("intakeroute.wie"); } catch (e){ return null; } }
function saveWho(v){ try { localStorage.setItem("intakeroute.wie", v); } catch (e){} }
function renderFilters(){
  const names = [...new Set(dossiers.flatMap(d => [d.bewindvoerder, d.assistent, ...openActions(d).map(s => info(d, s.id).w)]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  if (ui.bw && !names.includes(ui.bw)) ui.bw = "";
  const sel = $("#f-bw");
  const want = `<option value="">Alle medewerkers</option>` + names.map(n => `<option value="${esc(n)}"${n === ui.bw ? " selected" : ""}>${esc(n)}</option>`).join("");
  if (sel.innerHTML !== want) sel.innerHTML = want;
}
function renderBoard(){
  const b = $("#board");
  if (dbState === "loading"){ b.style.display = "block"; b.innerHTML = `<div class="panel"><p>Dossiers laden…</p></div>`; return; }
  if (dbState === "none"){
    b.style.display = "block";
    b.innerHTML = `<div class="panel"><h2>Dossiers niet geladen</h2><p>De dossiers konden niet worden opgehaald. Controleer je internetverbinding en probeer het opnieuw.</p><div class="actions"><button class="btn primary" type="button" data-retry>Opnieuw proberen</button></div></div>`;
    return;
  }
  if (!dossiers.length){
    b.style.display = "block";
    b.innerHTML = `<div class="panel"><h2>Nog geen dossiers</h2><p>Maak per cliënt een dossier aan. Elk dossier volgt dezelfde route van ${plan.phases.length} fasen en ${steps().length} stappen. Je werkt de stappen bij op de metrolijn of in de lijst, en in de vergadermodus loop je alle dossiers één voor één door.</p><div class="routebox">${routeHtml({status:{}}, {static:true})}</div><div class="actions"><button class="btn primary" type="button" data-newdossier>Eerste dossier aanmaken</button><button class="btn" type="button" data-example>Voorbeelddossier toevoegen</button></div></div>`;
    return;
  }
  b.style.display = "";
  b.innerHTML = columns().map(c => `<section class="lane${c.finish ? " finish" : ""}" aria-label="${esc(c.name)}">
    <div class="lane-head"><div class="lane-top"><span class="eyebrow">${esc(c.eyebrow)}</span><span class="count">${c.items.length}</span></div><h2>${esc(c.name)}</h2></div>
    <div class="lane-cards">${c.items.length ? c.items.map(cardHtml).join("") : `<div class="lane-empty">Geen dossiers</div>`}</div>
  </section>`).join("");
}
function renderAll(){
  renderSummary(); renderFilters(); renderBoard();
  if (ui.sheet && ["dossier", "meeting", "actions"].includes(ui.sheet.mode)) renderSheet();
  $("#btn-new").disabled = dbState !== "ready";
  $("#btn-plan").disabled = dbState !== "ready";
  $("#btn-meeting").disabled = dbState !== "ready" || !dossiers.some(d => !d.archived);
}

/* ---------- render: sheet ---------- */
function fieldFocused(){ const a = document.activeElement; return a && $("#sheet").contains(a) && a.matches("input,textarea,select"); }
function openSheet(s){ ui.sheet = s; ui.confirmDelete = false; $("#overlay").hidden = false; document.body.style.overflow = "hidden"; $("#sheet").scrollTop = 0; renderSheet(true); const f = $("#sheet [data-autofocus]") || $("#sheet [data-close]"); f && f.focus(); }
function closeSheet(){ ui.sheet = null; ui.planDraft = null; $("#overlay").hidden = true; document.body.style.overflow = ""; $("#sheet").innerHTML = ""; }
function sheetDossier(){
  const s = ui.sheet; if (!s) return null;
  if (s.mode === "meeting"){ const id = s.ids[s.idx]; return dossiers.find(d => d.id === id) || null; }
  return dossiers.find(d => d.id === s.id) || null;
}
function renderSheet(force){
  const s = ui.sheet, el = $("#sheet"); if (!s) return;
  if (!force && fieldFocused()){ ui.deferred = true; return; }
  const top = el.scrollTop;
  el.classList.toggle("meeting", s.mode === "meeting");
  if (s.mode === "new") el.innerHTML = newHtml();
  else if (s.mode === "plan") el.innerHTML = planHtml();
  else if (s.mode === "pw") el.innerHTML = pwHtml();
  else if (s.mode === "actions") el.innerHTML = actionsHtml();
  else {
    if (s.mode === "meeting"){ s.ids = s.ids.filter(id => dossiers.some(d => d.id === id)); if (!s.ids.length){ closeSheet(); return; } s.idx = Math.min(s.idx, s.ids.length - 1); }
    const d = sheetDossier(); if (!d){ closeSheet(); toast("Dit dossier is verwijderd."); return; }
    el.innerHTML = dossierHtml(d, s.mode === "meeting");
  }
  el.scrollTop = top;
}
function dossierHtml(d, meeting){
  const pr = progress(d), dl = deadlinesOf(d);
  const nav = meeting ? `<div class="meet-nav"><button class="btn" type="button" data-nav="-1"${ui.sheet.idx === 0 ? " disabled" : ""}>← Vorige</button><span class="mono">${ui.sheet.idx + 1} / ${ui.sheet.ids.length}</span><button class="btn" type="button" data-nav="1"${ui.sheet.idx >= ui.sheet.ids.length - 1 ? " disabled" : ""}>Volgende →</button></div>` : "";
  const head = `<div class="sheet-head">
      <div class="head-left">
        <div class="eyebrow">${meeting ? "Vergadermodus · " : ""}<span class="mono">${esc(d.dossiernummer || "Geen dossiernummer")}</span></div>
        <h2 id="sheet-title">${esc(d.naam || "Naamloos dossier")}</h2>
        <div class="people">${peopleHtml(d) || "Nog geen medewerkers gekoppeld"}${d.beschikking ? ` · beschikking ${fmtDate(parseDay(d.beschikking))}` : ""}</div>
      </div>
      <div class="head-right">${ui.sheet.back ? `<button class="btn" type="button" data-backacts>← Acties</button>` : ""}${nav}<div class="bigpct">${pr.pct}<small>%</small></div><button class="btn ghost" type="button" data-close>Sluiten</button></div>
    </div>`;
  const route = `<div class="routebox">${routeHtml(d, {big: true})}<div class="rb-foot"><span>${pr.done} van ${pr.total} stappen klaar${pr.busy ? ` · ${pr.busy} bezig` : ""} · klik op een station om de status te wijzigen</span><span>${dl.map(x => deadlineChip(x, true)).join(" ")}</span></div></div>`;

  const busy = steps().filter(s => stateOf(d, s.id) === "bezig");
  const nx = nextOpen(d);
  const agenda = `<div class="agenda">
      <div class="ag"><span class="eyebrow">Loopt of wacht op reactie</span>${busy.length ? `<ul>${busy.map(s => `<li><b>${esc(s.name)}</b>${info(d, s.id).n ? `<span>${esc(info(d, s.id).n)}</span>` : info(d, s.id).d ? `<span>Gestart ${fmtDate(info(d, s.id).d)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="none">Niets in behandeling.</p>`}</div>
      <div class="ag"><span class="eyebrow">Volgende stap</span>${nx ? `<ul><li><b>${esc(nx.name)}</b>${nx.hint ? `<span>${esc(nx.hint)}</span>` : ""}</li></ul>` : `<p class="none">Geen open stappen meer.</p>`}</div>
      <div class="ag"><span class="eyebrow">Afgesproken acties</span>${openActions(d).length ? `<ul>${openActions(d).map(s => { const i = info(d, s.id); return `<li><b>${esc(i.w)}: ${esc(s.name)}</b><span>${LABEL[stateOf(d, s.id)]}${i.wd ? ` · afgesproken ${fmtDate(i.wd)}` : ""}</span></li>`; }).join("")}</ul>` : `<p class="none">Nog niemand toegewezen. Kies bij een stap wie hem oppakt.</p>`}</div>
      <div class="ag"><span class="eyebrow">Notitie bij dossier</span>${d.notitie ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(d.notitie)}</p>` : `<p class="none">Geen notitie.</p>`}</div>
    </div>`;

  const phases = plan.phases.filter(p => p.steps.length);
  const anyOpen = phases.some(p => !isFolded(d, p));
  const list = `<div class="fold-all"><button class="linkbtn" type="button" data-foldall="${anyOpen ? "1" : "0"}">${anyOpen ? "Alle fasen inklappen" : "Alle fasen uitklappen"}</button></div>` + phases.map(p => {
    const done = p.steps.filter(s => isDone(stateOf(d, s.id))).length, folded = isFolded(d, p);
    return `<section class="phase${folded ? " folded" : ""}"><h3 class="phase-h"><button type="button" class="phase-t" data-fold="${esc(p.id)}" aria-expanded="${!folded}"><span class="chev" aria-hidden="true"></span><span class="phase-n">${esc(p.name)}</span><span class="mono muted">${done === p.steps.length ? "Afgerond · " : ""}${done}/${p.steps.length}</span></button></h3><ol class="steps"${folded ? " hidden" : ""}>${p.steps.map(s => {
      const st = stateOf(d, s.id), inf = info(d, s.id);
      const meta = [];
      if (st !== "open" && inf.d) meta.push(`${st === "klaar" ? "Klaar" : st === "nvt" ? "N.v.t. sinds" : "Gestart"} ${fmtDate(inf.d)}${inf.by ? ` · ${esc(inf.by)}` : ""}`);
      if (inf.w && inf.wd) meta.push(`Bij ${esc(inf.w)} sinds ${fmtDate(inf.wd)}`);
      deadlinesOf(d).filter(x => x.step.id === s.id).forEach(x => meta.push(deadlineChip(x)));
      return `<li class="step s-${st}">
        <div><div class="step-name">${esc(s.name)}</div>${s.hint ? `<div class="hint">${esc(s.hint)}</div>` : ""}<div class="meta">${meta.join(" ")}</div></div>
        <div class="seg" role="group" aria-label="Status ${esc(s.name)}">${STATES.map(v => `<button type="button" data-set="${esc(s.id)}" data-val="${v}" aria-pressed="${st === v}">${LABEL[v]}</button>`).join("")}</div>
        <div class="step-foot">${whoSelect(d, s)}<input class="input note" id="note-${esc(s.id)}" data-note="${esc(s.id)}" value="${esc(inf.n)}" placeholder="Notitie, bijv. aangeschreven, wacht op reactie" aria-label="Notitie bij ${esc(s.name)}"></div>
      </li>`;
    }).join("")}</ol></section>`;
  }).join("");

  const fields = `<div class="fields">
      ${fieldHtml("dossiernummer", "Dossiernummer (OnView)", d.dossiernummer)}
      ${fieldHtml("naam", "Cliënt", d.naam)}
      ${fieldHtml("bewindvoerder", "Bewindvoerder", d.bewindvoerder, "list-people")}
      ${fieldHtml("assistent", "Assistent-bewindvoerder", d.assistent, "list-people")}
      ${fieldHtml("beschikking", "Datum beschikking", d.beschikking, null, "date")}
      <div class="field wide"><label for="fd-notitie">Notitie bij dossier</label><textarea class="input" id="fd-notitie" data-field="notitie">${esc(d.notitie)}</textarea></div>
    </div>${peopleDatalist()}`;
  const danger = ui.confirmDelete
    ? `<div class="danger-zone"><p>Dossier <b>${esc(d.naam || "")}</b> definitief verwijderen voor het hele team? Dit kan niet ongedaan worden gemaakt.</p><button class="btn" type="button" data-delete-cancel>Annuleren</button><button class="btn danger solid" type="button" data-delete-confirm>Definitief verwijderen</button></div>`
    : `<div class="danger-zone"><p>${d.archived ? "Dit dossier is gearchiveerd en staat niet meer op het bord." : "Archiveer een dossier als het uit de intakefase is of niet doorgaat."}</p><button class="btn" type="button" data-archive>${d.archived ? "Terugzetten op het bord" : "Archiveren"}</button><button class="btn danger" type="button" data-delete>Verwijderen</button></div>`;

  if (meeting){
    return `<div class="sheet-inner">${head}${route}${agenda}<details class="more"><summary>Alle stappen</summary><div style="display:grid;gap:20px">${list}</div></details><details class="more"><summary>Dossiergegevens</summary>${fields}</details></div>`;
  }
  return `<div class="sheet-inner">${head}${route}${agenda}<div style="display:grid;gap:20px">${list}</div><section style="display:grid;gap:12px"><h3 class="section-h">Dossiergegevens</h3>${fields}</section>${danger}</div>`;
}
function fieldHtml(key, label, val, list, type){
  return `<div class="field"><label for="fd-${key}">${label}</label><input class="input" id="fd-${key}" data-field="${key}" type="${type || "text"}" value="${esc(val)}"${list ? ` list="${list}"` : ""}></div>`;
}
function peopleDatalist(){
  const names = [...new Set(dossiers.flatMap(d => [d.bewindvoerder, d.assistent]).filter(Boolean))];
  return `<datalist id="list-people">${names.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
}
function newHtml(){
  return `<div class="sheet-inner"><div class="sheet-head"><div class="head-left"><div class="eyebrow">Intake</div><h2 id="sheet-title">Nieuw dossier</h2></div><div class="head-right"><button class="btn ghost" type="button" data-close>Annuleren</button></div></div>
    <form id="new-form" class="panel" autocomplete="off">
      <p>Gebruik het dossiernummer uit OnView en een korte naam, zoals initialen en achternaam. Zet hier geen BSN, rekeningnummers of andere gevoelige gegevens; die horen in OnView.</p>
      <div class="fields">
        <div class="field"><label for="nd-dnr">Dossiernummer (OnView)</label><input class="input" id="nd-dnr" data-autofocus></div>
        <div class="field"><label for="nd-naam">Cliënt</label><input class="input" id="nd-naam" required placeholder="Bijv. J. de Vries"></div>
        <div class="field"><label for="nd-bw">Bewindvoerder</label><input class="input" id="nd-bw" list="list-people"></div>
        <div class="field"><label for="nd-abw">Assistent-bewindvoerder</label><input class="input" id="nd-abw" list="list-people"></div>
        <div class="field"><label for="nd-date">Datum beschikking</label><input class="input" id="nd-date" type="date"></div>
        <div class="field wide"><label for="nd-notitie">Notitie</label><textarea class="input" id="nd-notitie" placeholder="Bijv. bijzonderheden uit het aanmeldgesprek"></textarea></div>
      </div>${peopleDatalist()}
      <p class="muted" style="font-size:13px">Met een beschikkingsdatum staat de stap ‘Beschikking ontvangen’ meteen op klaar en telt de termijn voor de boedelbeschrijving mee.</p>
      <div class="actions"><button class="btn primary" type="submit" id="nd-submit">Dossier aanmaken</button></div>
    </form></div>`;
}
async function loadActLog(){
  actLogState = "loading";
  const {data, error} = await sb.from("acties_log").select("*").order("created_at", {ascending: false}).limit(2000);
  if (error){ actLogState = "error"; console.error(error); } else { actLog = data; actLogState = "ready"; }
  if (ui.sheet && ui.sheet.mode === "actions") renderSheet(true);
}
function stepName(id){ const s = steps().find(x => x.id === id); return s ? s.name : "Stap die niet meer in het stappenplan staat"; }
function dayLabel(iso){ const t = new Date(iso).toLocaleDateString("nl-NL", {weekday: "long", day: "numeric", month: "long", year: "numeric"}); return t.charAt(0).toUpperCase() + t.slice(1); }
function dayKey(iso){ const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dossierLine(d){ return esc(d.naam || "Naamloos dossier") + (d.dossiernummer ? " · " + esc(d.dossiernummer) : ""); }
// Hoe staat een eerder afgesproken actie er nu voor?
function nowChip(d, stepId, w){
  const st = stateOf(d, stepId), cur = info(d, stepId).w || "";
  if (isDone(st)) return `<span class="chip ok">${st === "nvt" ? "N.v.t." : "Klaar"}</span>`;
  if (cur !== w) return `<span class="chip">${cur ? "Nu bij " + esc(cur) : "Niet meer toegewezen"}</span>`;
  return `<span class="chip${st === "bezig" ? " soon" : ""}">${LABEL[st]}</span>`;
}
// Openstaande acties, oudste koppeling eerst.
function actionRows(who){
  return dossiers.filter(d => !d.archived).flatMap(d => openActions(d).map(s => ({d, s, i: info(d, s.id), st: stateOf(d, s.id)})))
    .filter(r => !who || r.i.w === who)
    .sort((a, b) => String(a.i.wd || "").localeCompare(String(b.i.wd || "")));
}
function actRow(r, withWho){
  return `<li class="act-row"><button type="button" class="act" data-open="${esc(r.d.id)}"><span class="act-main"><b>${withWho ? esc(r.i.w) + ": " : ""}${esc(r.s.name)}</b><span>${dossierLine(r.d)}</span></span><span class="act-side"><span class="chip${r.st === "bezig" ? " soon" : ""}">${LABEL[r.st]}</span>${r.i.wd ? `<span>afgesproken ${fmtDate(r.i.wd)}</span>` : ""}</span></button><button type="button" class="btn act-done" data-done="${esc(r.d.id)}" data-step="${esc(r.s.id)}" aria-label="${esc(r.s.name)} bij ${esc(r.d.naam || "dossier")} op klaar zetten">Klaar</button></li>`;
}
function openListHtml(){
  const rows = dossiers.filter(d => !d.archived).flatMap(d => openActions(d).map(s => ({d, s, i: info(d, s.id), st: stateOf(d, s.id)})))
    .filter(r => !ui.actWho || r.i.w === ui.actWho);
  const by = new Map();
  rows.forEach(r => { if (!by.has(r.i.w)) by.set(r.i.w, []); by.get(r.i.w).push(r); });
  const groups = [...by.keys()].sort((a, b) => a.localeCompare(b, "nl")).map(w => {
    const items = by.get(w).sort((a, b) => String(a.i.wd || "").localeCompare(String(b.i.wd || "")));
    return `<section class="act-group"><h3 class="section-h">${esc(w)} <span class="count">${items.length}</span></h3><ul class="act-list">${items.map(r => actRow(r, false)).join("")}</ul></section>`;
  }).join("");
  return groups || `<div class="panel"><p>${ui.actWho ? "Geen openstaande acties voor " + esc(ui.actWho) + "." : "Er staan geen acties open. Kies in een dossier bij een stap wie hem oppakt."}</p></div>`;
}
function logListHtml(){
  if (actLogState === "error") return `<div class="panel"><p>Het logboek kon niet worden geladen.</p><div class="actions"><button class="btn" type="button" data-actreload>Opnieuw proberen</button></div></div>`;
  if (actLogState !== "ready") return `<div class="panel"><p>Logboek laden…</p></div>`;
  const rows = actLog.filter(r => dossiers.some(d => d.id === r.dossier_id) && (!ui.actWho || r.medewerker === ui.actWho || r.vorige === ui.actWho));
  if (!rows.length) return `<div class="panel"><p>${ui.actWho ? "Nog niets afgesproken met " + esc(ui.actWho) + "." : "Nog geen afspraken vastgelegd. Zodra iemand bij een stap wordt gekozen, komt dat hier te staan."}</p></div>`;
  const days = new Map();
  rows.forEach(r => { const k = dayKey(r.created_at); if (!days.has(k)) days.set(k, []); days.get(k).push(r); });
  return [...days.values()].map(items => {
    const made = items.filter(r => r.medewerker).length;
    return `<section class="act-group"><h3 class="section-h">${dayLabel(items[0].created_at)} <span class="count">${made} ${made === 1 ? "afspraak" : "afspraken"}</span></h3><ul class="act-list">${items.map(r => {
      const d = dossiers.find(x => x.id === r.dossier_id);
      const who = r.medewerker ? `<b>${esc(r.medewerker)}: ${esc(stepName(r.stap))}</b>` : `<b class="muted">Toewijzing weggehaald: ${esc(stepName(r.stap))}</b>`;
      const sub = dossierLine(d) + (r.vorige ? ` · was ${esc(r.vorige)}` : "") + (r.gewijzigd_door ? ` · door ${esc(r.gewijzigd_door)}` : "");
      return `<li><button type="button" class="act${r.medewerker ? "" : " gone"}" data-open="${esc(d.id)}"><span class="act-main">${who}<span>${sub}</span></span><span class="act-side">${r.medewerker ? `<span>nu:</span>${nowChip(d, r.stap, r.medewerker)}` : ""}</span></button></li>`;
    }).join("")}</ul></section>`;
  }).join("");
}
function actionsHtml(){
  const names = [...new Set([...team, ...dossiers.flatMap(d => openActions(d).map(s => info(d, s.id).w)), ...actLog.map(r => r.medewerker)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  if (ui.actWho && !names.includes(ui.actWho)) ui.actWho = "";
  const log = ui.actTab === "log";
  return `<div class="sheet-inner"><div class="sheet-head"><div class="head-left"><div class="eyebrow">Alle dossiers</div><h2 id="sheet-title">${ui.actWho ? (ui.actWho === me.naam ? "Mijn acties" : "Acties van " + esc(ui.actWho)) : "Afgesproken acties"}</h2><p class="muted">${log ? "Per datum wat er is afgesproken, en hoe het er nu voor staat." : "Stappen die aan iemand zijn toegewezen en nog niet klaar zijn."} Klik op een regel om het dossier te openen.</p></div><div class="head-right"><button class="btn ghost" type="button" data-close>Sluiten</button></div></div>
    <div class="act-bar"><div class="seg tabs" role="group" aria-label="Weergave"><button type="button" data-acttab="open" aria-pressed="${!log}">Openstaand</button><button type="button" data-acttab="log" aria-pressed="${log}">Logboek</button></div><select class="select" id="act-who" aria-label="Filter op medewerker"><option value="">Iedereen</option>${names.map(n => `<option value="${esc(n)}"${n === ui.actWho ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    ${log ? logListHtml() : openListHtml()}</div>`;
}
function pwHtml(){
  return `<div class="sheet-inner"><div class="sheet-head"><div class="head-left"><div class="eyebrow">${esc(me.email)}</div><h2 id="sheet-title">Wachtwoord wijzigen</h2></div><div class="head-right"><button class="btn ghost" type="button" data-close>Annuleren</button></div></div>
    <form id="pw-form" class="panel" autocomplete="off">
      <p>Kies een wachtwoord van minstens 10 tekens dat je nergens anders gebruikt.</p>
      <div class="fields">
        <div class="field"><label for="pw-1">Nieuw wachtwoord</label><input class="input" id="pw-1" type="password" autocomplete="new-password" minlength="10" required data-autofocus></div>
        <div class="field"><label for="pw-2">Nogmaals</label><input class="input" id="pw-2" type="password" autocomplete="new-password" minlength="10" required></div>
      </div>
      <p class="form-error" id="pw-err" hidden></p>
      <div class="actions"><button class="btn primary" type="submit" id="pw-submit">Wachtwoord opslaan</button></div>
    </form></div>`;
}
function planHtml(){
  const p = ui.planDraft;
  return `<div class="sheet-inner"><div class="sheet-head"><div class="head-left"><div class="eyebrow">Geldt voor alle dossiers</div><h2 id="sheet-title">Stappenplan</h2><p class="muted">Pas fasen en stappen aan jullie werkwijze aan. Wat al is afgevinkt blijft bewaard; een verwijderde stap telt niet meer mee in de voortgang. Een termijn rekent vanaf de datum van de beschikking.</p></div><div class="head-right"><button class="btn ghost" type="button" data-close>Sluiten</button></div></div>
    ${p.phases.map((ph, pi) => `<section class="ed-phase">
      <div class="ed-row"><span class="eyebrow">Fase ${pi + 1}</span><input class="input" id="ph-${esc(ph.id)}" data-pf="phase" data-p="${pi}" value="${esc(ph.name)}" aria-label="Naam fase ${pi + 1}">
        <div class="ed-btns"><button class="icon-btn" type="button" data-act="pup" data-p="${pi}" aria-label="Fase omhoog"${pi === 0 ? " disabled" : ""}>↑</button><button class="icon-btn" type="button" data-act="pdown" data-p="${pi}" aria-label="Fase omlaag"${pi === p.phases.length - 1 ? " disabled" : ""}>↓</button><button class="icon-btn" type="button" data-act="pdel" data-p="${pi}" aria-label="Fase verwijderen">✕</button></div></div>
      <ol class="ed-steps">${ph.steps.map((s, si) => `<li class="ed-step">
        <input class="input" id="sn-${esc(s.id)}" data-pf="name" data-p="${pi}" data-s="${si}" value="${esc(s.name)}" placeholder="Naam van de stap" aria-label="Naam stap">
        <input class="input" id="sh-${esc(s.id)}" data-pf="hint" data-p="${pi}" data-s="${si}" value="${esc(s.hint)}" placeholder="Toelichting (optioneel)" aria-label="Toelichting stap">
        <label class="ed-days">Termijn <input class="input" id="sd-${esc(s.id)}" type="number" min="0" data-pf="days" data-p="${pi}" data-s="${si}" value="${s.deadlineDays || ""}" placeholder="–"> dagen</label>
        <div class="ed-btns"><button class="icon-btn" type="button" data-act="sup" data-p="${pi}" data-s="${si}" aria-label="Stap omhoog"${si === 0 ? " disabled" : ""}>↑</button><button class="icon-btn" type="button" data-act="sdown" data-p="${pi}" data-s="${si}" aria-label="Stap omlaag"${si === ph.steps.length - 1 ? " disabled" : ""}>↓</button><button class="icon-btn" type="button" data-act="sdel" data-p="${pi}" data-s="${si}" aria-label="Stap verwijderen">✕</button></div>
      </li>`).join("")}</ol>
      <div><button class="btn sm" type="button" data-act="sadd" data-p="${pi}">+ Stap toevoegen</button></div>
    </section>`).join("")}
    <div><button class="btn" type="button" data-act="padd">+ Fase toevoegen</button></div>
    <div class="foot"><button class="btn ghost" type="button" data-act="reset">Standaardroute terugzetten</button><button class="btn primary" type="button" data-act="save">Opslaan voor het hele team</button></div>
  </div>`;
}

/* ---------- writes ---------- */
function track(id, fn){
  inflight.set(id, (inflight.get(id) || 0) + 1);
  const prev = chains.get(id) || Promise.resolve();
  const next = prev
    .then(fn)
    .then(res => { if (res && res.error) throw res.error; })
    .catch(writeError)
    .finally(() => {
      const n = (inflight.get(id) || 1) - 1;
      if (n > 0) inflight.set(id, n); else { inflight.delete(id); refetchOne(id); }
    });
  chains.set(id, next);
  return next;
}
async function refetchOne(id){
  const {data, error} = await sb.from("dossiers").select("*").eq("id", id).maybeSingle();
  if (error || inflight.has(id)) return;
  if (data) upsertLocal(fromRow(data)); else dossiers = dossiers.filter(d => d.id !== id);
  renderAll();
}
function writeError(e){
  const msg = String((e && e.message) || "");
  if (/JWT|jwt|session/i.test(msg)) toast("Je sessie is verlopen. Log opnieuw in.");
  else if (e && (e.code === "42501" || /row-level security|permission/i.test(msg))) toast("Opslaan lukt niet: je account heeft geen toegang tot deze gegevens.");
  else if (/fetch|network/i.test(msg)) toast("Geen verbinding. Je wijziging is niet opgeslagen; probeer het opnieuw.");
  else toast("Opslaan mislukt. Probeer het opnieuw.");
  console.error(e);
}
function touchLocal(d){ d.updatedAt = new Date().toISOString(); d.updatedBy = me.naam; }
function setStep(id, stepId, val){
  const d = dossiers.find(x => x.id === id); if (!d) return;
  const old = info(d, stepId);
  d.status[stepId] = Object.assign({}, old, val === "open" ? {s: "open", d: null, by: null} : {s: val, d: new Date().toISOString(), by: me.naam});
  touchLocal(d); renderAll();
  track(id, () => sb.rpc("set_step", {p_dossier: id, p_step: stepId, p_patch: {s: val}}));
}
function setNote(id, stepId, n){
  const d = dossiers.find(x => x.id === id); if (!d) return;
  d.status[stepId] = Object.assign({}, info(d, stepId), {n});
  touchLocal(d); renderAll();
  track(id, () => sb.rpc("set_step", {p_dossier: id, p_step: stepId, p_patch: {n}}));
}
function setWho(id, stepId, w){
  const d = dossiers.find(x => x.id === id); if (!d) return;
  d.status[stepId] = Object.assign({}, info(d, stepId), w ? {w, wd: new Date().toISOString()} : {w: null, wd: null});
  touchLocal(d); renderAll(); if (ui.sheet) renderSheet(true);
  track(id, () => sb.rpc("set_step", {p_dossier: id, p_step: stepId, p_patch: {w}}));
}
function setField(id, field, v){
  const d = dossiers.find(x => x.id === id); if (!d) return;
  d[field] = v; touchLocal(d); renderAll();
  const val = field === "beschikking" ? (v || null) : v;
  track(id, () => sb.from("dossiers").update({[field]: val}).eq("id", id));
}
async function createDossier(data){
  const row = Object.assign({dossiernummer: "", naam: "", bewindvoerder: "", assistent: "", beschikking: null, notitie: "", archived: false, example: false, status: {}}, data);
  if (!row.beschikking) row.beschikking = null;
  const {data: res, error} = await sb.from("dossiers").insert(row).select().single();
  if (error){ writeError(error); return null; }
  upsertLocal(fromRow(res)); renderAll();
  return res.id;
}

/* ---------- toast ---------- */
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4200); }

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("button, [data-open]"); if (!t) { if (e.target === $("#overlay")) closeSheet(); return; }
  if (t.disabled) return;
  const ds = t.dataset, d = sheetDossier();
  if (t.id === "btn-logout"){ await sb.auth.signOut(); return; }
  if (t.id === "btn-pw"){ openSheet({mode: "pw"}); return; }
  if ("retry" in ds){ dbState = "loading"; renderAll(); loadAll(); return; }
  if (ds.open){ const back = !!(ui.sheet && ui.sheet.mode === "actions"); openSheet({mode: "dossier", id: ds.open, back}); return; }
  if ("teamwho" in ds){ ui.wWho = ds.teamwho; saveWho(ds.teamwho); renderSummary(); return; }
  if (ds.toggle){ const dd = dossiers.find(x => x.id === ds.toggle); if (dd) setStep(dd.id, ds.step, stateOf(dd, ds.step) === "bezig" ? "open" : "bezig"); return; }
  if (ds.done){ const dd = dossiers.find(x => x.id === ds.done); if (dd && stateOf(dd, ds.step) !== "klaar"){ setStep(dd.id, ds.step, "klaar"); toast("Op klaar gezet: " + stepName(ds.step)); } return; }
  if ("backacts" in ds){ openSheet({mode: "actions"}); loadActLog(); return; }
  if (ds.acttab){ ui.actTab = ds.acttab; renderSheet(true); if (ds.acttab === "log") loadActLog(); return; }
  if ("actreload" in ds){ loadActLog(); renderSheet(true); return; }
  if ("close" in ds){ closeSheet(); return; }
  if (ds.fold && d){ const p = plan.phases.find(x => x.id === ds.fold); if (p){ ui.fold[d.id + ":" + p.id] = !isFolded(d, p); renderSheet(true); } return; }
  if (ds.foldall && d){ plan.phases.forEach(p => ui.fold[d.id + ":" + p.id] = ds.foldall === "1"); renderSheet(true); return; }
  if (t.id === "btn-new" || "newdossier" in ds){ openSheet({mode: "new"}); return; }
  if (t.id === "btn-log"){ ui.actTab = "log"; ui.actWho = ui.wWho; openSheet({mode: "actions"}); loadActLog(); return; }
  if (t.id === "btn-plan"){ ui.planDraft = clone(plan); openSheet({mode: "plan"}); return; }
  if (t.id === "btn-meeting"){ const ids = meetingOrder(); if (ids.length) openSheet({mode: "meeting", ids, idx: 0}); return; }
  if ("example" in ds){
    const ex = {dossiernummer: "VOORBEELD", naam: "Voorbeeldcliënt (mag weg)", bewindvoerder: "Bewindvoerder A", assistent: "Assistent B", example: true, notitie: "Voorbeelddossier om het bord te laten zien. Verwijder het onderaan dit dossier.", status: {}};
    const b = new Date(); b.setDate(b.getDate() - 70); ex.beschikking = b.toISOString().slice(0, 10);
    const all = steps(), iso = new Date().toISOString();
    all.slice(0, 16).forEach(s => ex.status[s.id] = {s: "klaar", d: iso, by: me.naam});
    if (all[16]) ex.status[all[16].id] = {s: "nvt", d: iso, by: me.naam};
    all.slice(17, 20).forEach(s => ex.status[s.id] = {s: "bezig", d: iso, by: me.naam, n: "Aangeschreven, wacht op reactie"});
    if (await createDossier(ex)) toast("Voorbeelddossier toegevoegd.");
    return;
  }
  if (ds.cycle && d){ const cur = stateOf(d, ds.cycle); setStep(d.id, ds.cycle, CYCLE[(Math.max(0, CYCLE.indexOf(cur)) + 1) % 3]); return; }
  if (ds.set && d){ if (stateOf(d, ds.set) !== ds.val) setStep(d.id, ds.set, ds.val); return; }
  if (ds.nav && ui.sheet && ui.sheet.mode === "meeting"){ navMeeting(+ds.nav); return; }
  if ("archive" in ds && d){ const to = !d.archived; setField(d.id, "archived", to); toast(to ? "Dossier gearchiveerd." : "Dossier staat weer op het bord."); return; }
  if ("delete" in ds){ ui.confirmDelete = true; renderSheet(true); return; }
  if ("deleteCancel" in ds){ ui.confirmDelete = false; renderSheet(true); return; }
  if ("deleteConfirm" in ds && d){
    const id = d.id;
    await (chains.get(id) || Promise.resolve());
    const {error} = await sb.from("dossiers").delete().eq("id", id);
    if (error){ writeError(error); return; }
    dossiers = dossiers.filter(x => x.id !== id); closeSheet(); renderAll(); toast("Dossier verwijderd.");
    return;
  }
  if (ds.act) planAction(ds.act, +ds.p, +ds.s);
});
function navMeeting(dir){
  const s = ui.sheet; const n = s.idx + dir; if (n < 0 || n >= s.ids.length) return;
  s.idx = n; $("#sheet").scrollTop = 0; renderSheet(true);
}
document.addEventListener("change", e => {
  const t = e.target, d = sheetDossier();
  if (t.id === "f-bw"){ ui.bw = t.value; renderBoard(); return; }
  if (t.id === "f-arch"){ ui.archived = t.checked; renderBoard(); return; }
  if (t.id === "act-who"){ ui.actWho = t.value; renderSheet(true); return; }
  if (t.id === "w-who"){ ui.wWho = t.value; saveWho(t.value); renderSummary(); return; }
  if (t.dataset.check){
    const dd = dossiers.find(x => x.id === t.dataset.check), step = t.dataset.step, k = t.dataset.check + ":" + step;
    if (!dd) return;
    if (t.checked){ if (stateOf(dd, step) !== "klaar"){ ui.recentDone[k] = stateOf(dd, step); setStep(dd.id, step, "klaar"); } }
    else { const prev = ui.recentDone[k] && ui.recentDone[k] !== "klaar" ? ui.recentDone[k] : "open"; delete ui.recentDone[k]; setStep(dd.id, step, prev); }
    return;
  }
  if (!d) return;
  if (t.dataset.field){ const v = t.value.trim(); if ((d[t.dataset.field] || "") !== v) setField(d.id, t.dataset.field, v); }
  else if (t.dataset.note){ const v = t.value.trim(); if ((info(d, t.dataset.note).n || "") !== v) setNote(d.id, t.dataset.note, v); }
  else if (t.dataset.who){ const v = t.value; if ((info(d, t.dataset.who).w || "") !== v) setWho(d.id, t.dataset.who, v); }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "f-q"){ ui.q = t.value; renderBoard(); return; }
  if (t.dataset.pf && ui.planDraft){
    const ph = ui.planDraft.phases[+t.dataset.p];
    if (t.dataset.pf === "phase") ph.name = t.value;
    else { const s = ph.steps[+t.dataset.s]; if (t.dataset.pf === "days"){ const n = parseInt(t.value, 10); if (n > 0) s.deadlineDays = n; else delete s.deadlineDays; } else s[t.dataset.pf] = t.value; }
  }
});
document.addEventListener("submit", async e => {
  const f = e.target;
  if (f.id === "login-form"){ e.preventDefault(); login(); return; }
  if (f.id === "pw-form"){
    e.preventDefault();
    const a = $("#pw-1").value, b = $("#pw-2").value, err = $("#pw-err");
    if (a.length < 10){ err.textContent = "Het wachtwoord moet minstens 10 tekens hebben."; err.hidden = false; return; }
    if (a !== b){ err.textContent = "De twee wachtwoorden zijn niet gelijk."; err.hidden = false; return; }
    $("#pw-submit").disabled = true;
    const {error} = await sb.auth.updateUser({password: a});
    if (error){ err.textContent = "Wijzigen lukte niet: " + error.message; err.hidden = false; $("#pw-submit").disabled = false; return; }
    closeSheet(); toast("Je wachtwoord is gewijzigd.");
    return;
  }
  if (f.id !== "new-form") return;
  e.preventDefault();
  const v = id => $(id).value.trim();
  const naam = v("#nd-naam"); if (!naam){ $("#nd-naam").focus(); return; }
  const data = {dossiernummer: v("#nd-dnr"), naam, bewindvoerder: v("#nd-bw"), assistent: v("#nd-abw"), beschikking: $("#nd-date").value || null, notitie: v("#nd-notitie"), status: {}};
  if (data.beschikking && steps().some(s => s.id === "beschikking")) data.status.beschikking = {s: "klaar", d: new Date().toISOString(), by: me.naam};
  $("#nd-submit").disabled = true;
  const id = await createDossier(data);
  if (id){ toast("Dossier aangemaakt."); openSheet({mode: "dossier", id}); } else if ($("#nd-submit")) $("#nd-submit").disabled = false;
});
$("#sheet").addEventListener("focusout", () => setTimeout(() => { if (ui.deferred && !fieldFocused()){ ui.deferred = false; renderSheet(); } }, 0));
document.addEventListener("keydown", e => {
  if ($("#overlay").hidden) return;
  if (e.key === "Escape"){ closeSheet(); return; }
  if (ui.sheet && ui.sheet.mode === "meeting" && !fieldFocused() && !e.target.closest("summary")){
    if (e.key === "ArrowRight") navMeeting(1);
    if (e.key === "ArrowLeft") navMeeting(-1);
  }
});

/* ---------- plan editor ---------- */
async function planAction(act, pi, si){
  const p = ui.planDraft; if (!p) return;
  const mv = (arr, i, j) => { if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (act === "pup") mv(p.phases, pi, pi - 1);
  else if (act === "pdown") mv(p.phases, pi, pi + 1);
  else if (act === "pdel") p.phases.splice(pi, 1);
  else if (act === "padd") p.phases.push({id: uid("f"), name: "Nieuwe fase", steps: [{id: uid("s"), name: ""}]});
  else if (act === "sup") mv(p.phases[pi].steps, si, si - 1);
  else if (act === "sdown") mv(p.phases[pi].steps, si, si + 1);
  else if (act === "sdel") p.phases[pi].steps.splice(si, 1);
  else if (act === "sadd") p.phases[pi].steps.push({id: uid("s"), name: ""});
  else if (act === "reset"){ ui.planDraft = clone(DEFAULT_PLAN); toast("Standaardroute teruggezet. Klik op Opslaan om hem voor iedereen te gebruiken."); }
  else if (act === "save"){
    const out = {phases: p.phases.map(ph => ({id: ph.id, name: ph.name.trim() || "Naamloze fase", steps: ph.steps.filter(s => s.name.trim()).map(s => { const o = {id: s.id, name: s.name.trim()}; if (s.hint && s.hint.trim()) o.hint = s.hint.trim(); if (s.deadlineDays > 0) o.deadlineDays = s.deadlineDays; return o; })})).filter(ph => ph.steps.length)};
    if (!out.phases.length){ toast("Het stappenplan heeft minstens één stap nodig."); return; }
    const {error} = await sb.from("instellingen").upsert({sleutel: "stappenplan", waarde: out});
    if (error){ writeError(error); return; }
    plan = out; closeSheet(); toast("Stappenplan opgeslagen voor het hele team."); renderAll();
    return;
  }
  renderSheet(true);
}

/* ---------- data loading & realtime ---------- */
async function loadAll(){
  try {
    const [pl, ds, tl] = await Promise.all([
      sb.from("instellingen").select("waarde").eq("sleutel", "stappenplan").maybeSingle(),
      sb.from("dossiers").select("*").order("created_at"),
      sb.from("teamleden").select("naam").order("naam")
    ]);
    team = (tl.data || []).map(r => r.naam).filter(Boolean);
    if (ds.error) throw ds.error;
    plan = pl.data && validPlan(pl.data.waarde) ? clone(pl.data.waarde) : clone(DEFAULT_PLAN);
    const fresh = ds.data.map(fromRow);
    // keep local optimistic state for dossiers with writes in flight
    dossiers = fresh.map(r => inflight.has(r.id) ? (dossiers.find(x => x.id === r.id) || r) : r);
    dbState = "ready";
  } catch (e){
    console.error(e);
    if (dbState !== "ready") dbState = "none";
  }
  renderAll();
}
function subscribe(){
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("intakeroute")
    .on("postgres_changes", {event: "*", schema: "public", table: "dossiers"}, p => {
      if (p.eventType === "DELETE"){
        const id = p.old && p.old.id; if (!id) return;
        dossiers = dossiers.filter(d => d.id !== id); renderAll(); return;
      }
      if (!p.new || inflight.has(p.new.id)) return;
      upsertLocal(fromRow(p.new)); renderAll();
    })
    .on("postgres_changes", {event: "*", schema: "public", table: "instellingen"}, p => {
      if (p.new && p.new.sleutel === "stappenplan" && validPlan(p.new.waarde)){ plan = clone(p.new.waarde); renderAll(); }
    })
    .subscribe();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me.email && sb) loadAll(); });

/* ---------- auth ---------- */
function showAuth(mode, extra){
  $("#app").hidden = true; $("#auth").hidden = false; closeSheet();
  const card = $("#auth-card");
  if (mode === "setup"){
    card.innerHTML = `<h1>Intakeroute</h1><p>Deze pagina is nog niet gekoppeld aan de database. Vul <code>config.js</code> in met de URL en de publishable key van het Supabase-project (zie README).</p>`;
  } else if (mode === "noaccess"){
    card.innerHTML = `<h1>Intakeroute</h1><p>Je bent ingelogd als <b>${esc(extra)}</b>, maar dit account staat niet op de teamlijst. Vraag de beheerder om je toe te voegen.</p><div class="actions"><button class="btn" type="button" id="btn-logout">Uitloggen</button></div>`;
  } else {
    card.innerHTML = `<form id="login-form" class="auth-form">
      <div><h1>Intakeroute</h1><p class="muted">Log in met het account dat je van de beheerder hebt gekregen.</p></div>
      <div class="field"><label for="li-email">E-mailadres</label><input class="input" id="li-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="li-pw">Wachtwoord</label><input class="input" id="li-pw" type="password" autocomplete="current-password" required></div>
      <p class="form-error" id="li-err" hidden></p>
      <button class="btn primary" type="submit" id="li-submit">Inloggen</button>
    </form>`;
    const em = $("#li-email"); em && em.focus();
  }
}
async function login(){
  const email = $("#li-email").value.trim(), password = $("#li-pw").value, err = $("#li-err"), btn = $("#li-submit");
  err.hidden = true; btn.disabled = true;
  const {data, error} = await sb.auth.signInWithPassword({email, password});
  btn.disabled = false;
  if (error){ err.textContent = /fetch|network/i.test(error.message) ? "Geen verbinding met de server. Probeer het opnieuw." : "E-mailadres of wachtwoord klopt niet."; err.hidden = false; return; }
  await enter(data.session);
}
async function enter(session){
  const email = String(session.user.email || "").toLowerCase();
  const {data, error} = await sb.from("teamleden").select("naam").eq("email", email).maybeSingle();
  if (error || !data){ showAuth("noaccess", email); return; }
  me = {email, naam: data.naam || email};
  const savedWho = loadWho(); ui.wWho = savedWho !== null ? savedWho : me.naam;
  $("#auth").hidden = true; $("#app").hidden = false;
  $("#me-name").textContent = me.naam;
  dbState = "loading"; renderAll();
  await loadAll();
  subscribe();
}
async function boot(){
  renderAll();
  const cfg = window.INTAKEROUTE_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseKey || /JOUW/.test(cfg.supabaseUrl + cfg.supabaseKey)){ showAuth("setup"); return; }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true}});
  sb.auth.onAuthStateChange(ev => {
    if (ev === "SIGNED_OUT"){ if (channel){ sb.removeChannel(channel); channel = null; } me = {email: "", naam: ""}; dossiers = []; dbState = "loading"; showAuth("login"); }
  });
  const {data: {session}} = await sb.auth.getSession();
  if (session) await enter(session); else showAuth("login");
}
boot();
