/* Lernkarten – PWA, alles lokal im Browser. */
(function () {
"use strict";

const $ = (id) => document.getElementById(id);
const LS = {
  custom: "lk.customDecks.v1",
  state: (id) => "lk.state." + id,
  last: "lk.lastDeck"
};

/* ============================================================
   Speicher
   ============================================================ */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { toast("Speicher voll – Fortschritt konnte nicht gesichert werden."); }
}

let customDecks = load(LS.custom, []);
function allDecks() { return (window.BUILTIN_DECKS || []).concat(customDecks); }
function deckById(id) { return allDecks().find((d) => d.id === id); }

/* results: { "<kartenindex>": "yes" | "no" } – letzte Bewertung je Karte */
function deckState(id) { return load(LS.state(id), { results: {} }); }
function saveDeckState(id, st) { save(LS.state(id), st); }

/* ============================================================
   Textvergleich für den Schreib-Modus
   ============================================================ */
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function variantHit(variant, normInput, tokens) {
  const parts = normalize(variant).split(" ").filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => {
    if (p.length <= 3) return tokens.indexOf(p) !== -1;           // sehr kurz: exakt
    if (p.length === 4) return tokens.some((t) => t.indexOf(p) === 0); // Wortanfang
    if (normInput.indexOf(p) !== -1) return true;                 // Teilwort-Treffer
    if (p.length >= 8) return normInput.indexOf(p.slice(0, p.length - 2)) !== -1; // Beugung
    return false;
  });
}
function grade(card, input) {
  const groups = card.k && card.k.length ? card.k : autoKeywords(card.a);
  const normInput = normalize(input);
  const tokens = normInput.split(" ").filter(Boolean);
  const answerWords = (card.a.match(/[A-Za-zÄÖÜäöüß0-9]+/g) || []);
  const detail = groups.map((g) => ({
    label: readableLabel(g[0], answerWords),
    hit: g.some((v) => variantHit(v, normInput, tokens))
  }));
  const hits = detail.filter((d) => d.hit).length;
  return { detail: detail, hits: hits, total: groups.length,
           ratio: groups.length ? hits / groups.length : 0 };
}

/* Zeigt statt des Wortstamms das passende Wort aus der Musterantwort
   ("ander" -> "anderer"), sonst den Stamm mit Großbuchstaben. */
function readableLabel(stem, answerWords) {
  const s = normalize(stem);
  if (!s || s.indexOf(" ") !== -1) return stem;
  for (let i = 0; i < answerWords.length; i++) {
    if (normalize(answerWords[i]).indexOf(s) === 0) return answerWords[i];
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

const STOPWORDS = ("der die das den dem des ein eine einer eines einem einen und oder aber " +
  "ist sind war waren wird werden wurde worden sein seine seiner ihres ihre ihrer ihren " +
  "sich selbst nicht kein keine auch noch nur schon sehr mehr als wie wenn dass weil " +
  "durch fur für von vom zum zur mit ohne bei beim auf aus uber über unter zwischen " +
  "man sie er es wir ihr sowie bzw etwa dabei damit dazu daran darin dessen deren " +
  "einer eines diese dieser dieses zb z b sowie oft meist immer alle alles").split(" ");
function autoKeywords(answer) {
  const seen = {}, out = [];
  normalize(answer).split(" ").forEach((w) => {
    if (w.length < 5 || STOPWORDS.indexOf(w) !== -1) return;
    const stem = w.slice(0, Math.max(5, w.length - 2));
    if (seen[stem]) return;
    seen[stem] = 1;
    out.push([w]);
  });
  return out.slice(0, 4);
}

/* ============================================================
   CSV
   ============================================================ */
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", q = false;
  const delim = guessDelimiter(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') { q = true; }
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") { field += c; }
  }
  row.push(field); rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()))
             .filter((r) => r.length >= 2 && (r[0] || r[1]));
}
function guessDelimiter(text) {
  const line = text.split("\n")[0] || "";
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  const t = (line.match(/\t/g) || []).length;
  if (s > c && s >= t) return ";";
  if (t > c && t > s) return "\t";
  return ",";
}
function looksLikeHeader(row) {
  const a = normalize(row[0]), b = normalize(row[1]);
  const words = ["frage", "antwort", "question", "answer", "vorderseite", "ruckseite",
                 "term", "definition", "begriff", "front", "back"];
  return words.indexOf(a) !== -1 && words.indexOf(b) !== -1;
}
function cardsFromCSV(text) {
  let rows = parseCSV(text);
  if (rows.length && looksLikeHeader(rows[0])) rows = rows.slice(1);
  return rows.filter((r) => r[0] && r[1])
             .map((r) => ({ q: r[0], a: r[1], k: autoKeywords(r[1]) }));
}

/* ============================================================
   Sitzung
   ============================================================ */
const S = { deck: null, mode: "swipe", queue: [], pos: 0, flipped: false,
            round: {}, history: [], checked: false };

function startSession(deck, mode, opts) {
  const st = deckState(deck.id);
  let idx = deck.cards.map((_, i) => i);
  if (opts.onlyAgain) {
    const again = idx.filter((i) => st.results[i] === "no");
    if (!again.length) { toast("Keine „Nochmal\"-Karten in diesem Deck."); return false; }
    idx = again;
  }
  if (opts.shuffle) shuffle(idx);
  S.deck = deck; S.mode = mode; S.queue = idx; S.pos = 0;
  S.round = {}; S.history = [];
  show("study");
  renderCard();
  return true;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
}
function currentCard() { return S.deck.cards[S.queue[S.pos]]; }

function renderCard() {
  if (S.pos >= S.queue.length) return finishRound();
  const c = currentCard();
  $("card-q").textContent = c.q;
  $("card-a").textContent = c.a;
  setFlipped(false);
  resetCardPosition();
  S.checked = false;

  const write = S.mode === "write";
  $("screen-study").classList.toggle("write-mode", write);
  $("write-panel").hidden = !write;
  $("card").style.cursor = write ? "default" : "pointer";
  document.querySelector(".flip-hint").style.display = write ? "none" : "";
  if (write) {
    $("write-input").value = "";
    $("write-feedback").hidden = true;
    $("btn-check").hidden = false;
    $("actions").hidden = true;
  } else {
    $("actions").hidden = false;
  }
  $("btn-undo").disabled = S.history.length === 0;

  const total = S.queue.length;
  $("counter").textContent = (S.pos + 1) + " / " + total;
  $("progress-fill").style.width = (S.pos / total * 100) + "%";
}
function setFlipped(v) { S.flipped = v; $("card").classList.toggle("flipped", v); }

function rate(known) {
  const cardIdx = S.queue[S.pos];
  S.history.push({ pos: S.pos, cardIdx: cardIdx, prev: S.round[cardIdx] });
  S.round[cardIdx] = known;
  const st = deckState(S.deck.id);
  st.results[cardIdx] = known ? "yes" : "no";
  saveDeckState(S.deck.id, st);
  S.pos++;
  renderCard();
}
function undo() {
  const h = S.history.pop();
  if (!h) return;
  S.pos = h.pos;
  if (h.prev === undefined) delete S.round[h.cardIdx]; else S.round[h.cardIdx] = h.prev;
  const st = deckState(S.deck.id);
  delete st.results[h.cardIdx];
  saveDeckState(S.deck.id, st);
  renderCard();
}

function finishRound() {
  const vals = Object.keys(S.round).map((k) => S.round[k]);
  const yes = vals.filter(Boolean).length;
  const pct = vals.length ? Math.round(yes / vals.length * 100) : 0;
  $("ring-pct").textContent = pct + "%";
  $("ring").style.background =
    "conic-gradient(var(--yes) " + (pct * 3.6) + "deg,#2f3646 " + (pct * 3.6) + "deg)";
  $("result-head").textContent = pct === 100 ? "Alles gewusst" : "Runde beendet";
  $("result-sub").textContent = yes + " von " + vals.length + " gewusst";

  const st = deckState(S.deck.id);
  const againAll = S.deck.cards.filter((_, i) => st.results[i] === "no").length;
  const btn = $("btn-again");
  if (againAll > 0) {
    btn.hidden = false;
    btn.textContent = "Nur die " + againAll + " „Nochmal\"-Karten";
  } else { btn.hidden = true; }
  show("result");
}

/* ============================================================
   Schreib-Modus
   ============================================================ */
function checkWritten() {
  const c = currentCard();
  const input = $("write-input").value.trim();
  const r = grade(c, input);
  const fb = $("write-feedback");
  const cls = r.ratio >= 0.7 ? "good" : r.ratio >= 0.4 ? "mid" : "bad";
  const chips = r.detail.map((d) =>
    '<span class="chip ' + (d.hit ? "hit" : "miss") + '">' +
    (d.hit ? "✓ " : "· ") + escapeHTML(d.label) + "</span>").join("");
  fb.innerHTML =
    '<p class="fb-score ' + cls + '">' + r.hits + " von " + r.total + " Kernbegriffen getroffen</p>" +
    '<div class="chips">' + chips + "</div>" +
    '<p class="fb-answer"><b>Musterantwort</b>' + escapeHTML(c.a) + "</p>";
  fb.hidden = false;
  $("btn-check").hidden = true;
  $("actions").hidden = false;
  setFlipped(false);
  S.checked = true;
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   Wischen
   ============================================================ */
const card = $("card");
let drag = null;
function resetCardPosition() {
  card.style.transition = "";
  /* Inline-Transform immer entfernen – ob die Karte gedreht ist,
     regelt allein die Klasse .flipped. Sonst blockiert ein hier
     gesetztes rotateY(180deg) das Zurückdrehen. */
  card.style.transform = "";
  $("stamp-yes").style.opacity = 0;
  $("stamp-no").style.opacity = 0;
}
/* Auslöse-Schwellen: entweder weit genug gezogen ODER schnell genug
   geschnippt. Der Flick-Zweig sorgt dafür, dass kurze zackige Bewegungen
   nicht ins Leere laufen. */
const SWIPE_DIST = 64;      // px, ruhiges Ziehen
const FLICK_SPEED = 0.3;    // px/ms – ein echter Finger-Flick liegt bei 1–3
const FLICK_DIST = 22;      // px, Mindestweg beim Schnippen

card.addEventListener("pointerdown", (e) => {
  if (S.mode === "write" && !S.checked) return;
  if (drag) return;                       // zweiter Finger wird ignoriert
  const now = e.timeStamp || Date.now();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0,
           t: now, lastX: e.clientX, lastT: now, vx: 0 };
  card.style.transition = "none";
  try { card.setPointerCapture(e.pointerId); } catch (err) {}
});
card.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const now = e.timeStamp || Date.now();
  const dt = now - drag.lastT;
  if (dt > 0) {
    const v = (e.clientX - drag.lastX) / dt;
    drag.vx = drag.vx * 0.4 + v * 0.6;    // leicht geglättet gegen Zittern
    drag.lastX = e.clientX; drag.lastT = now;
  }
  drag.dx = e.clientX - drag.x;
  drag.dy = e.clientY - drag.y;
  const rot = drag.dx / 22;
  card.style.transform =
    "translateX(" + drag.dx + "px) rotate(" + rot + "deg)" + (S.flipped ? " rotateY(180deg)" : "");
  $("stamp-yes").style.opacity = Math.max(0, Math.min(1, drag.dx / 55));
  $("stamp-no").style.opacity = Math.max(0, Math.min(1, -drag.dx / 55));
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag; drag = null;
  const stale = ((e && e.timeStamp) || Date.now()) - d.lastT > 120;
  const vx = stale ? 0 : d.vx;            // liegengebliebener Finger zählt nicht als Flick
  window.__lastGesture = { dx: Math.round(d.dx), vx: +vx.toFixed(3), stale: stale };
  const weit = Math.abs(d.dx) > SWIPE_DIST;
  const flick = Math.abs(vx) > FLICK_SPEED && Math.abs(d.dx) > FLICK_DIST &&
                (vx > 0) === (d.dx > 0);
  if (weit || flick) { flyOut(d.dx > 0); return; }

  card.style.transition = "transform .18s cubic-bezier(.2,.8,.3,1)";
  resetCardPosition2();
  const bewegt = Math.abs(d.dx) > 10 || Math.abs(d.dy) > 10;
  if (!bewegt && ((e && e.timeStamp) || Date.now()) - d.t < 500 && S.mode === "swipe") {
    setFlipped(!S.flipped);
  }
}
/* wie resetCardPosition, aber ohne die Transition zu überschreiben */
function resetCardPosition2() {
  card.style.transform = "";
  $("stamp-yes").style.opacity = 0;
  $("stamp-no").style.opacity = 0;
}
card.addEventListener("pointerup", endDrag);
card.addEventListener("pointercancel", endDrag);

function flyOut(known) {
  const dir = known ? 1 : -1;
  card.style.transition = "transform .17s ease-out, opacity .17s ease-out";
  card.style.transform = "translateX(" + (dir * window.innerWidth) + "px) rotate(" + (dir * 18) + "deg)";
  card.style.opacity = "0";
  setTimeout(() => {
    card.style.transition = "none";
    card.style.opacity = "1";
    rate(known);
    requestAnimationFrame(() => { card.style.transition = ""; });
  }, 150);
}

/* ============================================================
   Screens
   ============================================================ */
function show(name) {
  ["decks", "mode", "study", "result"].forEach((n) => {
    $("screen-" + n).hidden = n !== name;
  });
  if (name === "decks") renderDecks();
}

function renderDecks() {
  const ul = $("deck-list");
  ul.innerHTML = "";
  const decks = allDecks();
  decks.forEach((d) => {
    const st = deckState(d.id);
    const known = d.cards.filter((_, i) => st.results[i] === "yes").length;
    const again = d.cards.filter((_, i) => st.results[i] === "no").length;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "deck";
    b.innerHTML =
      '<span class="deck-title">' + escapeHTML(d.name) + "</span>" +
      '<span class="deck-meta"><span>' + d.cards.length + " Karten</span>" +
      (known ? "<span>" + known + " gewusst</span>" : "") +
      (again ? '<span>' + again + " nochmal</span>" : "") + "</span>" +
      '<span class="deck-bar"><i style="width:' +
        (d.cards.length ? known / d.cards.length * 100 : 0) + '%"></i></span>';
    b.addEventListener("click", () => openDeck(d));
    li.appendChild(b);
    if (d.custom) {
      const del = document.createElement("button");
      del.className = "deck-del";
      del.textContent = "Dieses importierte Deck löschen";
      del.addEventListener("click", () => {
        customDecks = customDecks.filter((x) => x.id !== d.id);
        save(LS.custom, customDecks);
        try { localStorage.removeItem(LS.state(d.id)); } catch (e) {}
        renderDecks();
      });
      li.appendChild(del);
    }
    ul.appendChild(li);
  });
  const cards = decks.reduce((n, d) => n + d.cards.length, 0);
  $("streak-line").textContent = decks.length + " Decks · " + cards + " Karten · offline verfügbar";
}

let pendingDeck = null;
function openDeck(d) {
  pendingDeck = d;
  const st = deckState(d.id);
  const again = d.cards.filter((_, i) => st.results[i] === "no").length;
  const known = d.cards.filter((_, i) => st.results[i] === "yes").length;
  $("mode-deck-name").textContent = d.name;
  $("mode-deck-meta").textContent =
    d.cards.length + " Karten · " + known + " gewusst · " + again + " nochmal";
  $("again-count").textContent = again;
  $("opt-onlyagain").checked = false;
  $("opt-onlyagain").disabled = again === 0;
  save(LS.last, d.id);
  show("mode");
}

/* ============================================================
   Ereignisse
   ============================================================ */
document.querySelectorAll("[data-back]").forEach((el) =>
  el.addEventListener("click", () => show(el.getAttribute("data-back"))));

document.querySelectorAll(".mode-card").forEach((el) =>
  el.addEventListener("click", () => {
    startSession(pendingDeck, el.getAttribute("data-mode"), {
      onlyAgain: $("opt-onlyagain").checked,
      shuffle: $("opt-shuffle").checked
    });
  }));

$("btn-yes").addEventListener("click", () => (S.mode === "swipe" ? flyOut(true) : rate(true)));
$("btn-no").addEventListener("click", () => (S.mode === "swipe" ? flyOut(false) : rate(false)));
$("btn-undo").addEventListener("click", undo);
$("btn-check").addEventListener("click", checkWritten);
$("btn-shuffle").addEventListener("click", () => {
  const rest = S.queue.slice(S.pos);
  shuffle(rest);
  S.queue = S.queue.slice(0, S.pos).concat(rest);
  S.history = [];
  renderCard();
  toast("Neu gemischt");
});
$("btn-restart").addEventListener("click", () =>
  startSession(S.deck, S.mode, { onlyAgain: false, shuffle: $("opt-shuffle").checked }));
$("btn-again").addEventListener("click", () =>
  startSession(S.deck, S.mode, { onlyAgain: true, shuffle: true }));
$("btn-reset").addEventListener("click", () => {
  saveDeckState(pendingDeck.id, { results: {} });
  openDeck(pendingDeck);
  toast("Fortschritt zurückgesetzt");
});

$("csv-input").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    let cards;
    try { cards = cardsFromCSV(String(rd.result)); }
    catch (err) { toast("CSV konnte nicht gelesen werden."); return; }
    if (!cards.length) { toast("Keine Karten gefunden – zwei Spalten nötig."); return; }
    const deck = {
      id: "custom-" + Date.now(),
      name: file.name.replace(/\.csv$/i, ""),
      custom: true,
      cards: cards
    };
    customDecks.push(deck);
    save(LS.custom, customDecks);
    renderDecks();
    toast(cards.length + " Karten importiert");
  };
  rd.readAsText(file, "utf-8");
  e.target.value = "";
});

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* Doppeltipp-Zoom auf iOS unterdrücken */
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

/* Debug-/Test-Hook (harmlos, wird von der App selbst nicht benutzt) */
window.LK = { grade: grade, cardsFromCSV: cardsFromCSV, decks: allDecks };

/* Start */
show("decks");

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").catch(() => {}));
}
})();
