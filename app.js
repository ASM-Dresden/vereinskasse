'use strict';
/*
 * Vereinskasse – Kassenhelfer für Vereinsfeste
 * Alle Daten liegen lokal im Browser (localStorage). Beträge werden in Cent gespeichert.
 */

const SPEICHER_KEY = 'vereinskasse.v1';
const APP_VERSION = '1.0.0';
const FARBEN = { gruen: 'Grün', blau: 'Blau', orange: 'Orange', rot: 'Rot', lila: 'Lila', gelb: 'Gelb', grau: 'Grau' };
const GELD = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let zaehler = 0;
const uid = () => Date.now().toString(36) + (zaehler++).toString(36) + Math.random().toString(36).slice(2, 6);
const euro = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const zahlDE = c => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const betragCSV = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
const prozent = x => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const datumDE = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE') : '';
const uhrzeit = iso => iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
const dateiname = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

/** "1,50" / "1.50" / "1,50 €" -> 150 (Cent). Leer -> null, ungültig -> NaN */
function parseEuro(text) {
  if (text == null) return null;
  let s = String(text).replace(/[\s€]/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
/** Leer -> null, sonst ganze Zahl >= 0, ungültig -> NaN */
function parseMenge(text) {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/* ---------- Daten ---------- */
function standardDaten() {
  const g = { id: uid(), name: 'Getränke' };
  const s = { id: uid(), name: 'Speisen' };
  const p = (name, preis, k, farbe) => ({ id: uid(), name, preis, ekPreis: null, kategorieId: k.id, farbe, aktiv: true });
  return {
    version: 1,
    vereinsname: 'Kleingartenverein',
    kategorien: [g, s],
    produkte: [
      p('Bier', 150, g, 'gelb'), p('Glas Wein', 100, g, 'rot'), p('Glühwein', 150, g, 'rot'), p('Piccolo', 150, g, 'lila'),
      p('Wasser', 50, g, 'blau'), p('Cola', 150, g, 'grau'), p('Klopfer', 100, g, 'lila'),
      p('Bratwurst', 200, s, 'orange'), p('Wiener', 200, s, 'orange'), p('Salat', 150, s, 'gruen'), p('Eis', 50, s, 'blau'),
      p('Fischbrötchen', 250, s, 'blau'), p('Hot Dog', 200, s, 'orange'), p('Soljanka', 250, s, 'rot'), p('Gemüsespieß', 50, s, 'gruen'),
    ],
    feste: [],
    aktivesFestId: null,
  };
}

function migrieren(d) {
  d.version = d.version || 1;
  d.vereinsname = d.vereinsname ?? 'Kleingartenverein';
  d.kategorien = d.kategorien || [];
  d.produkte = d.produkte || [];
  d.feste = d.feste || [];
  for (const f of d.feste) {
    f.bestand = f.bestand || {};
    f.verkaeufe = f.verkaeufe || [];
    f.anfangsbestand = f.anfangsbestand ?? 0;
    f.endbestand = f.endbestand ?? null;
  }
  return d;
}

function laden() {
  const roh = localStorage.getItem(SPEICHER_KEY);
  if (!roh) return standardDaten();
  try {
    return migrieren(JSON.parse(roh));
  } catch (e) {
    console.error(e);
    // Defekte Daten nicht überschreiben, sondern beiseitelegen
    localStorage.setItem(SPEICHER_KEY + '.defekt.' + Date.now(), roh);
    alert('Die gespeicherten Daten konnten nicht gelesen werden. Sie wurden gesichert, die App startet mit Standarddaten. Bitte eine Sicherung unter „Daten" importieren.');
    return standardDaten();
  }
}

function speichern() {
  try {
    localStorage.setItem(SPEICHER_KEY, JSON.stringify(daten));
  } catch (e) {
    console.error(e);
    alert('Speichern fehlgeschlagen (Speicher voll?). Bitte sofort unter „Daten" eine Sicherung exportieren.');
  }
}

let daten = laden();
const ui = {
  ansicht: 'kasse',
  warenkorb: [],          // [{produktId, menge}]
  erhalten: 0,            // Cent
  auswertungFestId: null,
  vergleichIds: null,
  vergleichModus: 'menge',
  festDetailId: null,
  neuesFestOffen: false,
};

const produkt = id => daten.produkte.find(p => p.id === id);
const kategorie = id => daten.kategorien.find(k => k.id === id);
const fest = id => daten.feste.find(f => f.id === id);
const aktivesFest = () => { const f = fest(daten.aktivesFestId); return f && !f.abgeschlossen ? f : null; };
const gueltigeVerkaeufe = f => f.verkaeufe.filter(v => !v.storniert);
const festeNachDatum = () => [...daten.feste].sort((a, b) => (a.datum || '').localeCompare(b.datum || '') || (a.angelegt || '').localeCompare(b.angelegt || ''));

/* ---------- Auswertung ---------- */
function auswerten(f) {
  const vk = gueltigeVerkaeufe(f);
  const proProdukt = new Map();
  const reihenfolge = new Map(daten.produkte.map((p, i) => [p.id, i]));
  let umsatz = 0, artikel = 0;

  // Stunden relativ zur ersten Verkaufsstunde (Feste über Mitternacht bleiben zusammenhängend)
  const stunden = [];
  let startStunde = null;
  if (vk.length) { const t = new Date(vk[0].zeit); t.setMinutes(0, 0, 0); startStunde = t.getTime(); }

  for (const v of vk) {
    umsatz += v.summe;
    const idx = Math.floor((new Date(v.zeit).getTime() - startStunde) / 3600000);
    const st = stunden[idx] || (stunden[idx] = { umsatz: 0, anzahl: 0 });
    st.umsatz += v.summe; st.anzahl++;
    for (const pos of v.positionen) {
      let e = proProdukt.get(pos.produktId);
      if (!e) {
        e = { produktId: pos.produktId, name: pos.name, kategorie: pos.kategorie || '', menge: 0, umsatz: 0, letzter: null };
        proProdukt.set(pos.produktId, e);
      }
      e.menge += pos.menge;
      e.umsatz += pos.preis * pos.menge;
      e.letzter = v.zeit;
      e.name = pos.name;
      artikel += pos.menge;
    }
  }
  // Produkte mit Bestandsangaben, aber ohne Verkauf
  for (const [pid, b] of Object.entries(f.bestand)) {
    if (proProdukt.has(pid) || (b.eingekauft == null && b.rest == null)) continue;
    const p = produkt(pid);
    proProdukt.set(pid, { produktId: pid, name: p ? p.name : '(gelöschtes Produkt)', kategorie: p ? (kategorie(p.kategorieId)?.name || '') : '', menge: 0, umsatz: 0, letzter: null });
  }

  let einkaufskosten = 0, einkaufVollstaendig = true, einkaufVorhanden = false;
  const zeilen = [...proProdukt.values()].map(e => {
    const b = f.bestand[e.produktId] || {};
    const p = produkt(e.produktId);
    const ekPreis = b.ekPreis ?? p?.ekPreis ?? null;
    const eingekauft = b.eingekauft ?? null;
    const rest = b.rest ?? null;
    const schwund = eingekauft != null && rest != null ? eingekauft - e.menge - rest : null;
    const ausverkauft = eingekauft != null && eingekauft > 0 && rest === 0;
    const vorschlag = e.menge > 0 ? Math.ceil(e.menge * (ausverkauft ? 1.25 : 1.1)) : null;
    if (eingekauft != null) {
      einkaufVorhanden = true;
      if (ekPreis != null) einkaufskosten += eingekauft * ekPreis; else einkaufVollstaendig = false;
    }
    return { ...e, eingekauft, rest, schwund, ausverkauft, vorschlag, ekPreis, anteil: umsatz ? e.umsatz / umsatz : 0 };
  }).sort((a, b) => (reihenfolge.get(a.produktId) ?? 1e9) - (reihenfolge.get(b.produktId) ?? 1e9) || a.name.localeCompare(b.name));

  const kategorien = new Map();
  for (const z of zeilen) kategorien.set(z.kategorie || 'Sonstige', (kategorien.get(z.kategorie || 'Sonstige') || 0) + z.umsatz);

  const soll = f.anfangsbestand + umsatz;
  return {
    anzahl: vk.length,
    storniert: f.verkaeufe.length - vk.length,
    umsatz, artikel,
    durchschnitt: vk.length ? Math.round(umsatz / vk.length) : 0,
    zeilen, kategorien,
    stunden: { start: startStunde, werte: Array.from(stunden, s => s || { umsatz: 0, anzahl: 0 }) },
    einkaufskosten: einkaufVorhanden ? einkaufskosten : null,
    einkaufVollstaendig,
    erster: vk[0]?.zeit, letzter: vk.at(-1)?.zeit,
    soll,
    differenz: f.endbestand != null ? f.endbestand - soll : null,
  };
}

/* ---------- Kasse ---------- */
const warenkorbSumme = () => ui.warenkorb.reduce((s, w) => s + (produkt(w.produktId)?.preis || 0) * w.menge, 0);

function renderKasse() {
  const f = aktivesFest();
  if (!f) {
    return `<div class="hinweis-box"><h2>Kein aktives Fest</h2>
      <p>Lege zuerst ein Fest an oder setze eines aktiv. Alle Verkäufe werden diesem Fest zugeordnet.</p>
      <button class="btn primaer" data-action="zu-fest-neu">Fest anlegen</button></div>`;
  }
  const kats = daten.kategorien.map(k => {
    const ps = daten.produkte.filter(p => p.kategorieId === k.id && p.aktiv);
    if (!ps.length) return '';
    return `<section class="kat"><h2>${esc(k.name)}</h2><div class="kacheln">${ps.map(kachel).join('')}</div></section>`;
  }).join('');
  return `<div class="kasse">
    <div class="kasse-produkte">${kats || '<p class="leer">Keine aktiven Produkte. Unter „Produkte" anlegen.</p>'}</div>
    <aside class="bon" id="bon">${renderBon()}</aside>
  </div>`;
}

function kachel(p) {
  return `<button class="kachel f-${p.farbe}" data-action="add" data-id="${p.id}">
    <span class="k-name">${esc(p.name)}</span><span class="k-preis">${euro(p.preis)}</span>
    <span class="k-menge" data-menge="${p.id}" hidden></span></button>`;
}

function renderBon() {
  const f = aktivesFest();
  const summe = warenkorbSumme();
  const erh = ui.erhalten;
  const zeilen = ui.warenkorb.map(w => {
    const p = produkt(w.produktId);
    return `<li><div class="b-name">${esc(p.name)}<small>${euro(p.preis)}</small></div>
      <div class="b-menge"><button class="rund" data-action="minus" data-id="${p.id}" aria-label="weniger">−</button>
      <span>${w.menge}</span><button class="rund" data-action="add" data-id="${p.id}" aria-label="mehr">+</button></div>
      <div class="b-summe">${euro(p.preis * w.menge)}</div></li>`;
  }).join('');
  let wg;
  if (!erh) wg = '<span class="gedimmt">–</span>';
  else if (erh < summe) wg = `<span class="fehlt">fehlt ${euro(summe - erh)}</span>`;
  else wg = euro(erh - summe);
  const vk = gueltigeVerkaeufe(f);
  const ums = vk.reduce((s, v) => s + v.summe, 0);
  const geldText = c => c >= 100 ? `${c / 100} €` : `${c} ct`;
  return `
    <div class="bon-kopf"><h2>Warenkorb</h2>${ui.warenkorb.length ? '<button class="link" data-action="leeren">Leeren</button>' : ''}</div>
    <ul class="bon-liste">${zeilen || '<li class="leer">Produkt antippen</li>'}</ul>
    <div class="bon-summe"><span>Gesamt</span><strong>${euro(summe)}</strong></div>
    <div class="geld">
      ${GELD.map(c => `<button class="geld-btn" data-action="geld" data-wert="${c}" ${summe ? '' : 'disabled'}>${geldText(c)}</button>`).join('')}
      <button class="geld-btn passend" data-action="passend" ${summe ? '' : 'disabled'}>Passend</button>
      <button class="geld-btn" data-action="geld-c" ${erh ? '' : 'disabled'}>C</button>
    </div>
    <div class="bon-zeile"><span>Erhalten</span><strong>${erh ? euro(erh) : '–'}</strong></div>
    <div class="bon-zeile wechsel"><span>Wechselgeld</span><strong>${wg}</strong></div>
    <button class="btn primaer gross" data-action="bezahlt" ${!summe || (erh && erh < summe) ? 'disabled' : ''}>Bezahlt ✓</button>
    <div class="bon-fuss"><span>${vk.length} Verkäufe · ${euro(ums)}</span>${vk.length ? '<button class="link" data-action="storno">Letzten stornieren</button>' : ''}</div>`;
}

/** Aktualisiert nur Warenkorb und Mengen-Plaketten, damit die Scrollposition erhalten bleibt */
function aktualisiereKasse() {
  const bon = $('#bon');
  if (!bon) return render();
  bon.innerHTML = renderBon();
  for (const el of $$('[data-menge]')) {
    const m = ui.warenkorb.find(w => w.produktId === el.dataset.menge)?.menge || 0;
    el.hidden = !m;
    el.textContent = m;
  }
  $('#fest-anzeige').textContent = festAnzeige();
}

function buchen() {
  const f = aktivesFest();
  if (!f || !ui.warenkorb.length) return;
  const summe = warenkorbSumme();
  const erhalten = ui.erhalten || summe;
  if (erhalten < summe) return;
  const positionen = ui.warenkorb.map(w => {
    const p = produkt(w.produktId);
    return { produktId: p.id, name: p.name, kategorie: kategorie(p.kategorieId)?.name || '', preis: p.preis, menge: w.menge };
  });
  f.verkaeufe.push({ id: uid(), zeit: new Date().toISOString(), positionen, summe, erhalten, storniert: false });
  speichern();
  ui.warenkorb = [];
  ui.erhalten = 0;
  toast(`Gebucht: ${euro(summe)}` + (erhalten > summe ? ` · Wechselgeld ${euro(erhalten - summe)}` : ''));
  aktualisiereKasse();
}

function stornieren(f, v) {
  if (!v) return;
  const text = v.positionen.map(p => `${p.menge}× ${p.name}`).join(', ');
  if (!confirm(`Verkauf von ${uhrzeit(v.zeit)} Uhr stornieren?\n\n${text}\nSumme: ${euro(v.summe)}`)) return;
  v.storniert = true;
  v.stornoZeit = new Date().toISOString();
  speichern();
  toast('Verkauf storniert');
}

/* ---------- Feste ---------- */
function festAnzeige() {
  const f = aktivesFest();
  return f ? `${f.name} · ${datumDE(f.datum)}` : 'Kein aktives Fest';
}

function renderFeste() {
  const f = fest(ui.festDetailId);
  if (f) return renderFestDetail(f);
  const liste = festeNachDatum().reverse();
  return `<div class="seite">
    <div class="seite-kopf"><h1>Feste</h1>${ui.neuesFestOffen ? '' : '<button class="btn primaer" data-action="fest-neu-zeigen">+ Neues Fest</button>'}</div>
    ${ui.neuesFestOffen ? formNeuesFest() : ''}
    ${liste.length ? liste.map(festKarte).join('') : '<p class="leer">Noch keine Feste angelegt.</p>'}
  </div>`;
}

function formNeuesFest() {
  const vorlagen = festeNachDatum().reverse().filter(f => gueltigeVerkaeufe(f).length);
  return `<form class="karte formular" data-form="fest-neu">
    <h2>Neues Fest</h2>
    <label>Name<input name="name" required placeholder="z. B. Sommerfest 2027" autocomplete="off"></label>
    <label>Datum<input name="datum" type="date" value="${heute()}" required></label>
    <label>Wechselgeld-Anfangsbestand in der Kasse (€)<input name="anfang" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
    ${vorlagen.length ? `<label>Einkaufsmengen vorbelegen mit dem Vorschlag aus
      <select name="vorlage"><option value="">– nicht vorbelegen –</option>
      ${vorlagen.map(f => `<option value="${f.id}">${esc(f.name)} (${datumDE(f.datum)})</option>`).join('')}</select></label>` : ''}
    <div class="knoepfe"><button type="button" class="btn" data-action="fest-neu-abbrechen">Abbrechen</button>
    <button class="btn primaer" type="submit">Anlegen und aktiv setzen</button></div>
  </form>`;
}

function festKarte(f) {
  const a = auswerten(f);
  const status = f.abgeschlossen ? '<span class="tag">abgeschlossen</span>'
    : f.id === daten.aktivesFestId ? '<span class="tag gruen">aktiv an der Kasse</span>' : '<span class="tag">offen</span>';
  return `<div class="karte fest-karte">
    <div><h3>${esc(f.name)} ${status}</h3><p>${datumDE(f.datum)} · ${a.anzahl} Verkäufe · <strong>${euro(a.umsatz)}</strong></p></div>
    <div class="knoepfe">
      ${!f.abgeschlossen && f.id !== daten.aktivesFestId ? `<button class="btn" data-action="fest-aktiv" data-id="${f.id}">Aktiv setzen</button>` : ''}
      <button class="btn" data-action="fest-detail" data-id="${f.id}">Einkauf &amp; Abschluss</button>
      <button class="btn" data-action="zur-auswertung" data-id="${f.id}">Auswertung</button>
    </div></div>`;
}

function festNeuAnlegen(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const anfang = parseEuro(fd.get('anfang'));
  if (!name) return toast('Bitte einen Namen eingeben', 'fehler');
  if (Number.isNaN(anfang)) return toast('Anfangsbestand ungültig', 'fehler');
  const f = { id: uid(), name, datum: fd.get('datum') || heute(), anfangsbestand: anfang || 0, endbestand: null,
    abgeschlossen: false, bestand: {}, verkaeufe: [], angelegt: new Date().toISOString() };
  const vorlage = fest(fd.get('vorlage'));
  if (vorlage) {
    for (const z of auswerten(vorlage).zeilen) {
      if (z.vorschlag && produkt(z.produktId)) f.bestand[z.produktId] = { eingekauft: z.vorschlag, rest: null, ekPreis: null };
    }
  }
  daten.feste.push(f);
  daten.aktivesFestId = f.id;
  speichern();
  ui.neuesFestOffen = false;
  ui.festDetailId = f.id;
  ui.warenkorb = []; ui.erhalten = 0;
  toast('Fest angelegt und aktiv gesetzt');
  render();
}

function renderFestDetail(f) {
  const a = auswerten(f);
  const verkauft = new Map(a.zeilen.map(z => [z.produktId, z]));
  const gesperrt = f.abgeschlossen ? 'disabled' : '';
  const ps = daten.produkte.filter(p => p.aktiv || f.bestand[p.id] || verkauft.has(p.id));
  const geloescht = a.zeilen.filter(z => !produkt(z.produktId));
  const zeile = (pid, name, z) => {
    const b = f.bestand[pid] || {};
    const p = produkt(pid);
    return `<tr>
      <td>${esc(name)}</td>
      <td><input class="mini" type="number" min="0" step="1" inputmode="numeric" data-feld="b-eingekauft" data-pid="${pid}" value="${b.eingekauft ?? ''}" ${gesperrt}></td>
      <td class="zahl" data-zelle="verkauft" data-pid="${pid}">${z?.menge ?? 0}</td>
      <td><input class="mini" type="number" min="0" step="1" inputmode="numeric" data-feld="b-rest" data-pid="${pid}" value="${b.rest ?? ''}" ${gesperrt}></td>
      <td class="zahl" data-zelle="schwund" data-pid="${pid}">${z?.schwund ?? '–'}</td>
      <td><input class="mini" inputmode="decimal" data-feld="b-ek" data-pid="${pid}" value="${b.ekPreis != null ? zahlDE(b.ekPreis) : ''}" placeholder="${p?.ekPreis != null ? zahlDE(p.ekPreis) : ''}" ${gesperrt}></td>
    </tr>`;
  };
  const journal = [...f.verkaeufe].reverse();
  return `<div class="seite">
    <div class="seite-kopf"><h1>${esc(f.name)} <small>${datumDE(f.datum)}</small></h1>
      <div class="knoepfe"><button class="btn" data-action="fest-zurueck">← Alle Feste</button>
      <button class="btn" data-action="zur-auswertung" data-id="${f.id}">Auswertung</button></div></div>
    ${f.abgeschlossen ? '<p class="hinweis">Dieses Fest ist abgeschlossen. Zum Ändern zuerst wieder öffnen.</p>' : ''}

    <section class="karte"><h2>Stammdaten</h2>
      <div class="raster-2">
        <label>Name<input class="feld" data-feld="f-name" value="${esc(f.name)}" ${gesperrt}></label>
        <label>Datum<input class="feld" type="date" data-feld="f-datum" value="${esc(f.datum)}" ${gesperrt}></label>
      </div>
    </section>

    <section class="karte"><h2>Einkauf und Restbestand</h2>
      <p class="fussnote" style="margin:0 0 8px">Vor dem Fest die eingekaufte Menge eintragen, nach dem Fest den gezählten Rest. „Verkauft" kommt aus der Kasse.
      EK-Preis je Stück ist optional (leer = Wert aus „Produkte").</p>
      <div class="tabelle-scroll"><table class="tabelle">
        <thead><tr><th>Produkt</th><th>Eingekauft</th><th class="zahl">Verkauft</th><th>Rest</th><th class="zahl">Schwund</th><th>EK-Preis €</th></tr></thead>
        <tbody>${ps.map(p => zeile(p.id, p.name, verkauft.get(p.id))).join('')}${geloescht.map(z => zeile(z.produktId, z.name, z)).join('')}</tbody>
      </table></div>
    </section>

    <section class="karte"><h2>Kassenabschluss</h2>
      <div class="tabelle-scroll"><table class="tabelle">
        <tr><td>Wechselgeld-Anfangsbestand</td><td><input class="mini" inputmode="decimal" data-feld="f-anfang" value="${zahlDE(f.anfangsbestand)}" ${gesperrt}></td></tr>
        <tr><td>Einnahmen laut Kasse</td><td class="zahl" data-zelle="umsatz">${euro(a.umsatz)}</td></tr>
        <tr><td><strong>Soll-Bestand</strong></td><td class="zahl" data-zelle="soll"><strong>${euro(a.soll)}</strong></td></tr>
        <tr><td>Gezählter Bestand nach dem Fest</td><td><input class="mini" inputmode="decimal" data-feld="f-ende" value="${f.endbestand != null ? zahlDE(f.endbestand) : ''}" placeholder="0,00" ${gesperrt}></td></tr>
        <tr><td><strong>Differenz (Ist − Soll)</strong></td><td class="zahl" data-zelle="differenz">${differenzText(a.differenz)}</td></tr>
      </table></div>
    </section>

    <section class="karte"><details><summary>Verkaufsjournal (${f.verkaeufe.length} Buchungen, davon ${a.storniert} storniert)</summary>
      <div class="tabelle-scroll"><table class="tabelle">
        <thead><tr><th>Uhrzeit</th><th>Positionen</th><th class="zahl">Summe</th><th></th></tr></thead>
        <tbody>${journal.map(v => `<tr class="${v.storniert ? 'storniert' : ''}"><td>${uhrzeit(v.zeit)}</td>
          <td>${esc(v.positionen.map(p => `${p.menge}× ${p.name}`).join(', '))}</td><td class="zahl">${euro(v.summe)}</td>
          <td>${v.storniert ? '<span class="tag rot">storniert</span>' : f.abgeschlossen ? '' : `<button class="btn klein" data-action="journal-storno" data-vid="${v.id}">Stornieren</button>`}</td></tr>`).join('')
          || '<tr><td colspan="4" class="leer">Noch keine Verkäufe.</td></tr>'}</tbody>
      </table></div></details>
    </section>

    <div class="knoepfe">
      ${f.abgeschlossen
        ? `<button class="btn" data-action="fest-oeffnen" data-id="${f.id}">Wieder öffnen</button>`
        : `<button class="btn primaer" data-action="fest-abschliessen" data-id="${f.id}">Fest abschließen</button>`}
      <button class="btn gefahr" data-action="fest-loeschen" data-id="${f.id}">Fest löschen</button>
    </div>
  </div>`;
}

function differenzText(d) {
  if (d == null) return '<span class="gedimmt">–</span>';
  if (d === 0) return `<span class="positiv">${euro(0)} ✓</span>`;
  return `<span class="${d > 0 ? 'positiv' : 'negativ'}">${d > 0 ? '+' : ''}${euro(d)}</span>`;
}

function aktualisiereFestZellen(f) {
  const a = auswerten(f);
  const z = new Map(a.zeilen.map(x => [x.produktId, x]));
  for (const el of $$('[data-zelle="verkauft"]')) el.textContent = z.get(el.dataset.pid)?.menge ?? 0;
  for (const el of $$('[data-zelle="schwund"]')) el.textContent = z.get(el.dataset.pid)?.schwund ?? '–';
  const set = (k, html) => { const el = $(`[data-zelle="${k}"]`); if (el) el.innerHTML = html; };
  set('umsatz', euro(a.umsatz));
  set('soll', `<strong>${euro(a.soll)}</strong>`);
  set('differenz', differenzText(a.differenz));
}

/* ---------- Produkte ---------- */
function renderProdukte() {
  const katOptionen = sel => daten.kategorien.map(k => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.name)}</option>`).join('');
  const farbOptionen = sel => Object.entries(FARBEN).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}</option>`).join('');
  return `<div class="seite">
    <div class="seite-kopf"><h1>Produkte</h1><button class="btn" data-action="kat-neu">+ Kategorie</button></div>
    <p class="hinweis">Änderungen an Namen und Preisen gelten nur für künftige Verkäufe; gebuchte Verkäufe behalten ihren Preis.
    Produkte, die gerade nicht verkauft werden, besser auf „inaktiv" setzen statt löschen.</p>
    ${daten.kategorien.map((k, ki) => {
      const ps = daten.produkte.filter(p => p.kategorieId === k.id);
      return `<section class="karte">
        <div class="kat-kopf"><input class="kat-name" data-feld="kat-name" data-kid="${k.id}" value="${esc(k.name)}" aria-label="Kategoriename">
          <div class="knoepfe">
            <button class="btn klein" data-action="kat-schieben" data-kid="${k.id}" data-richtung="-1" ${ki === 0 ? 'disabled' : ''} aria-label="nach oben">↑</button>
            <button class="btn klein" data-action="kat-schieben" data-kid="${k.id}" data-richtung="1" ${ki === daten.kategorien.length - 1 ? 'disabled' : ''} aria-label="nach unten">↓</button>
            <button class="btn klein gefahr" data-action="kat-loeschen" data-kid="${k.id}">Kategorie löschen</button>
          </div></div>
        <div class="tabelle-scroll"><table class="tabelle">
          <thead><tr><th>Name</th><th>Preis €</th><th>EK-Preis €</th><th>Farbe</th><th>Kategorie</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>${ps.map((p, i) => `<tr>
            <td><input data-feld="p-name" data-pid="${p.id}" value="${esc(p.name)}"></td>
            <td><input class="mini" inputmode="decimal" data-feld="p-preis" data-pid="${p.id}" value="${zahlDE(p.preis)}"></td>
            <td><input class="mini" inputmode="decimal" data-feld="p-ek" data-pid="${p.id}" value="${p.ekPreis != null ? zahlDE(p.ekPreis) : ''}" placeholder="optional"></td>
            <td><div class="knoepfe" style="flex-wrap:nowrap"><span class="farb-punkt f-${p.farbe}"></span><select data-feld="p-farbe" data-pid="${p.id}">${farbOptionen(p.farbe)}</select></div></td>
            <td><select data-feld="p-kat" data-pid="${p.id}">${katOptionen(p.kategorieId)}</select></td>
            <td><input type="checkbox" data-feld="p-aktiv" data-pid="${p.id}" ${p.aktiv ? 'checked' : ''} aria-label="aktiv"></td>
            <td><div class="knoepfe" style="flex-wrap:nowrap">
              <button class="btn klein" data-action="p-schieben" data-pid="${p.id}" data-richtung="-1" ${i === 0 ? 'disabled' : ''} aria-label="nach oben">↑</button>
              <button class="btn klein" data-action="p-schieben" data-pid="${p.id}" data-richtung="1" ${i === ps.length - 1 ? 'disabled' : ''} aria-label="nach unten">↓</button>
              <button class="btn klein gefahr" data-action="p-loeschen" data-pid="${p.id}" aria-label="löschen">✕</button></div></td>
          </tr>`).join('') || '<tr><td colspan="7" class="leer">Keine Produkte in dieser Kategorie.</td></tr>'}</tbody>
        </table></div>
        <button class="btn" data-action="p-neu" data-kid="${k.id}" style="margin-top:10px">+ Produkt</button>
      </section>`;
    }).join('')}
  </div>`;
}

function produktSchieben(pid, richtung) {
  const p = produkt(pid);
  const liste = daten.produkte;
  const i = liste.indexOf(p);
  let j = i + richtung;
  while (j >= 0 && j < liste.length && liste[j].kategorieId !== p.kategorieId) j += richtung;
  if (j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
}

/* ---------- Auswertung ---------- */
function stundenDiagramm(st) {
  if (!st.werte.length) return '<p class="leer">Noch keine Verkäufe.</p>';
  const B = 64, H = 200, oben = 22, unten = 34;
  const max = Math.max(...st.werte.map(w => w.umsatz)) || 1;
  const W = Math.max(st.werte.length * B, 320);
  const startH = new Date(st.start).getHours();
  const balken = st.werte.map((w, i) => {
    const h = Math.round((w.umsatz / max) * (H - oben - unten));
    const x = i * B + 8, y = H - unten - h;
    const stunde = (startH + i) % 24;
    return `<rect class="balken" x="${x}" y="${y}" width="${B - 16}" height="${h}" rx="3"><title>${stunde}–${(stunde + 1) % 24} Uhr: ${euro(w.umsatz)}, ${w.anzahl} Verkäufe</title></rect>
      <text x="${x + (B - 16) / 2}" y="${y - 6}" text-anchor="middle">${w.umsatz ? Math.round(w.umsatz / 100) + ' €' : ''}</text>
      <text x="${x + (B - 16) / 2}" y="${H - unten + 15}" text-anchor="middle">${stunde} Uhr</text>
      <text class="klein" x="${x + (B - 16) / 2}" y="${H - unten + 29}" text-anchor="middle">${w.anzahl} Verk.</text>`;
  }).join('');
  return `<div class="tabelle-scroll"><svg class="diagramm" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 900)}px" role="img" aria-label="Umsatz je Stunde">
    <line x1="0" x2="${W}" y1="${H - unten}" y2="${H - unten}" stroke="#999"/>${balken}</svg></div>`;
}

function renderAuswertung() {
  if (!daten.feste.length) return `<div class="hinweis-box"><h2>Noch keine Feste</h2><p>Sobald ein Fest angelegt ist und Verkäufe gebucht sind, erscheint hier die Auswertung.</p></div>`;
  const f = fest(ui.auswertungFestId) || aktivesFest() || festeNachDatum().at(-1);
  ui.auswertungFestId = f.id;
  const a = auswerten(f);
  const kpi = (t, w) => `<div class="kpi"><span>${t}</span><strong>${w}</strong></div>`;
  const summeMenge = a.zeilen.reduce((s, z) => s + z.menge, 0);
  return `<div class="seite">
    <div class="nur-druck druck-kopf" style="display:none"><span>${esc(daten.vereinsname)}</span><span>Erstellt am ${new Date().toLocaleString('de-DE')}</span></div>
    <div class="seite-kopf"><h1>Auswertung: ${esc(f.name)} <small>${datumDE(f.datum)}</small></h1>
      <div class="knoepfe nicht-drucken">
        <select class="feld" style="width:auto" data-feld="auswertung-fest" aria-label="Fest wählen">
          ${festeNachDatum().reverse().map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${esc(x.name)} (${datumDE(x.datum)})</option>`).join('')}
        </select>
        <button class="btn" data-action="csv-produkte">CSV Produkte</button>
        <button class="btn" data-action="csv-verkaeufe">CSV Einzelverkäufe</button>
        <button class="btn primaer" data-action="drucken">PDF / Drucken</button>
      </div></div>
    ${f.abgeschlossen ? '' : '<p class="hinweis nicht-drucken">Das Fest ist noch nicht abgeschlossen; die Zahlen können sich noch ändern.</p>'}
    <div class="kpis">
      ${kpi('Einnahmen', euro(a.umsatz))}
      ${kpi('Verkäufe', a.anzahl)}
      ${kpi('Ø je Verkauf', euro(a.durchschnitt))}
      ${kpi('Verkaufte Artikel', a.artikel)}
      ${kpi('Verkaufszeit', a.erster ? `${uhrzeit(a.erster)}–${uhrzeit(a.letzter)}` : '–')}
      ${a.einkaufskosten != null ? kpi('Einkaufskosten' + (a.einkaufVollstaendig ? '' : '*'), euro(a.einkaufskosten)) : ''}
      ${a.einkaufskosten != null ? kpi('Überschuss Waren' + (a.einkaufVollstaendig ? '' : '*'), euro(a.umsatz - a.einkaufskosten)) : ''}
    </div>
    ${a.einkaufskosten != null ? `<p class="fussnote" style="margin:-6px 0 14px">Einkaufskosten = eingekaufte Menge × EK-Preis. Überschuss = Einnahmen − Einkaufskosten, ohne sonstige Kosten (Miete, Deko, Strom).
      ${a.einkaufVollstaendig ? '' : '* Unvollständig: bei einigen Produkten fehlt der EK-Preis.'}</p>` : ''}

    <section class="karte"><h2>Produkte</h2>
      <div class="tabelle-scroll"><table class="tabelle">
        <thead><tr><th>Produkt</th><th class="zahl">Verkauft</th><th class="zahl">Einnahmen</th><th class="zahl">Anteil</th>
          <th class="zahl">Eingekauft</th><th class="zahl">Rest</th><th class="zahl">Schwund</th><th class="zahl">Letzter Verkauf</th><th class="zahl">Vorschlag nächstes Fest</th></tr></thead>
        <tbody>${a.zeilen.map(z => `<tr>
          <td>${esc(z.name)}</td><td class="zahl">${z.menge}</td><td class="zahl">${euro(z.umsatz)}</td><td class="zahl">${prozent(z.anteil)}</td>
          <td class="zahl">${z.eingekauft ?? '–'}</td><td class="zahl">${z.rest ?? '–'}${z.ausverkauft ? ' <span class="tag rot">ausverkauft</span>' : ''}</td>
          <td class="zahl">${z.schwund ?? '–'}</td><td class="zahl">${z.letzter ? uhrzeit(z.letzter) : '–'}</td><td class="zahl">${z.vorschlag ?? '–'}</td>
        </tr>`).join('') || '<tr><td colspan="9" class="leer">Keine Daten.</td></tr>'}</tbody>
        <tfoot><tr><td>Summe</td><td class="zahl">${summeMenge}</td><td class="zahl">${euro(a.umsatz)}</td><td colspan="6"></td></tr></tfoot>
      </table></div>
      <p class="fussnote">Schwund = Eingekauft − Verkauft − Rest (Bruch, Eigenverbrauch, Freigetränke, Zählfehler).
      Vorschlag = Verkauft + 10 %, bei ausverkauften Produkten + 25 %. Das ist ein Richtwert; Wetter und Besucherzahl selbst einschätzen.</p>
    </section>

    <section class="karte"><h2>Einnahmen je Stunde</h2>${stundenDiagramm(a.stunden)}</section>

    <section class="karte"><h2>Je Kategorie</h2>
      <table class="tabelle"><tbody>${[...a.kategorien].map(([k, u]) => `<tr><td>${esc(k)}</td><td class="zahl">${euro(u)}</td><td class="zahl">${prozent(a.umsatz ? u / a.umsatz : 0)}</td></tr>`).join('')}</tbody></table>
    </section>

    <section class="karte"><h2>Kassenabschluss</h2>
      <table class="tabelle"><tbody>
        <tr><td>Wechselgeld-Anfangsbestand</td><td class="zahl">${euro(f.anfangsbestand)}</td></tr>
        <tr><td>Einnahmen laut Kasse</td><td class="zahl">${euro(a.umsatz)}</td></tr>
        <tr><td><strong>Soll-Bestand</strong></td><td class="zahl"><strong>${euro(a.soll)}</strong></td></tr>
        <tr><td>Gezählter Bestand</td><td class="zahl">${f.endbestand != null ? euro(f.endbestand) : '–'}</td></tr>
        <tr><td><strong>Differenz (Ist − Soll)</strong></td><td class="zahl">${differenzText(a.differenz)}</td></tr>
        <tr><td>Stornierte Buchungen</td><td class="zahl">${a.storniert}</td></tr>
      </tbody></table>
    </section>
    <div class="nur-druck unterschriften" style="display:none"><div>Datum, Kassierer/in</div><div>Datum, Kassenprüfer/in</div></div>
  </div>`;
}

/* ---------- Vergleich ---------- */
function renderVergleich() {
  const alle = festeNachDatum();
  if (!alle.length) return `<div class="hinweis-box"><h2>Noch keine Feste</h2><p>Für einen Vergleich werden mindestens zwei Feste benötigt.</p></div>`;
  if (!ui.vergleichIds) ui.vergleichIds = alle.slice(-3).map(f => f.id);
  const daten2 = vergleichsDaten();
  const { gewaehlt, zeilen } = daten2;
  const zelle = (z, i) => {
    const e = z.werte[i];
    if (!e) return '<td class="zahl gedimmt">–</td>';
    return `<td class="zahl">${ui.vergleichModus === 'menge' ? e.menge : euro(e.umsatz)}</td>`;
  };
  return `<div class="seite">
    <div class="seite-kopf"><h1>Vergleich</h1>
      <div class="knoepfe">
        <button class="chip ${ui.vergleichModus === 'menge' ? 'an' : ''}" data-action="vergleich-modus" data-modus="menge">Stück</button>
        <button class="chip ${ui.vergleichModus === 'umsatz' ? 'an' : ''}" data-action="vergleich-modus" data-modus="umsatz">Einnahmen</button>
        <button class="btn" data-action="csv-vergleich" ${gewaehlt.length ? '' : 'disabled'}>CSV exportieren</button>
      </div></div>
    <p class="gedimmt" style="margin-top:0">Feste zum Vergleichen antippen:</p>
    <div class="chips">${alle.map(f => `<button class="chip ${ui.vergleichIds.includes(f.id) ? 'an' : ''}" data-action="vergleich-toggle" data-id="${f.id}">${esc(f.name)} · ${datumDE(f.datum)}</button>`).join('')}</div>
    ${gewaehlt.length ? `<section class="karte"><div class="tabelle-scroll"><table class="tabelle">
      <thead><tr><th>Produkt</th>${gewaehlt.map(g => `<th class="zahl">${esc(g.f.name)}<br><small>${datumDE(g.f.datum)}</small></th>`).join('')}</tr></thead>
      <tbody>${zeilen.map(z => `<tr><td>${esc(z.name)}</td>${gewaehlt.map((_, i) => zelle(z, i)).join('')}</tr>`).join('')}</tbody>
      <tfoot>
        <tr><td>Einnahmen</td>${gewaehlt.map(g => `<td class="zahl">${euro(g.a.umsatz)}</td>`).join('')}</tr>
        <tr><td>Verkäufe</td>${gewaehlt.map(g => `<td class="zahl">${g.a.anzahl}</td>`).join('')}</tr>
        <tr><td>Ø je Verkauf</td>${gewaehlt.map(g => `<td class="zahl">${euro(g.a.durchschnitt)}</td>`).join('')}</tr>
      </tfoot></table></div></section>` : '<p class="leer">Kein Fest ausgewählt.</p>'}
  </div>`;
}

function vergleichsDaten() {
  const gewaehlt = festeNachDatum().filter(f => ui.vergleichIds.includes(f.id)).map(f => ({ f, a: auswerten(f) }));
  const reihenfolge = new Map(daten.produkte.map((p, i) => [p.id, i]));
  const zeilenMap = new Map();
  gewaehlt.forEach((g, i) => {
    for (const z of g.a.zeilen) {
      if (!z.menge) continue;
      let e = zeilenMap.get(z.produktId);
      if (!e) { e = { produktId: z.produktId, name: produkt(z.produktId)?.name || z.name, werte: [] }; zeilenMap.set(z.produktId, e); }
      e.werte[i] = { menge: z.menge, umsatz: z.umsatz };
    }
  });
  const zeilen = [...zeilenMap.values()].sort((a, b) => (reihenfolge.get(a.produktId) ?? 1e9) - (reihenfolge.get(b.produktId) ?? 1e9) || a.name.localeCompare(b.name));
  return { gewaehlt, zeilen };
}

/* ---------- Daten / Einstellungen ---------- */
function renderDaten() {
  const groesse = new Blob([localStorage.getItem(SPEICHER_KEY) || '']).size;
  return `<div class="seite">
    <div class="seite-kopf"><h1>Daten und Einstellungen</h1></div>
    <section class="karte formular"><h2>Verein</h2>
      <label>Vereinsname (erscheint auf dem PDF)<input data-feld="vereinsname" value="${esc(daten.vereinsname)}"></label>
    </section>
    <section class="karte"><h2>Sicherung</h2>
      <p>Alle Daten liegen nur auf diesem Gerät im Browser. Nach jedem Fest eine Sicherung exportieren und z. B. per Mail oder USB ablegen.
      Werden die Browserdaten gelöscht, sind sonst alle Feste weg.</p>
      <div class="knoepfe">
        <button class="btn primaer" data-action="backup-export">Sicherung exportieren (.json)</button>
        <label class="btn">Sicherung importieren<input type="file" accept=".json,application/json" data-feld="backup-import" hidden></label>
      </div>
      <p class="fussnote">Belegter Speicher: ${(groesse / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB · <span id="persist-status"></span></p>
    </section>
    <section class="karte"><h2>Auf dem Tablet installieren</h2>
      <p>In Chrome das Menü ⋮ öffnen und „Zum Startbildschirm hinzufügen" bzw. „App installieren" wählen. Danach startet die Kasse wie eine App und funktioniert ohne Internet.</p>
    </section>
    <section class="karte"><h2>Ausprobieren</h2>
      <p>Legt ein Beispielfest mit zufälligen Verkäufen an, um Auswertung und Vergleich zu testen. Es wird nicht aktiv gesetzt und kann unter „Feste" wieder gelöscht werden.</p>
      <button class="btn" data-action="demo">Beispielfest erzeugen</button>
    </section>
    <section class="karte"><h2>Alles zurücksetzen</h2>
      <p>Löscht alle Feste, Verkäufe und Produkte auf diesem Gerät. Vorher eine Sicherung exportieren!</p>
      <button class="btn gefahr" data-action="reset">Alle Daten löschen</button>
    </section>
    <p class="fussnote">Vereinskasse Version ${APP_VERSION}</p>
  </div>`;
}

function demoFest() {
  const ps = daten.produkte.filter(p => p.aktiv);
  if (!ps.length) return toast('Keine aktiven Produkte', 'fehler');
  const gewicht = ps.map(p => /bier/i.test(p.name) ? 6 : /wurst|wiener|cola/i.test(p.name) ? 4 : 1 + Math.random() * 2);
  const gSumme = gewicht.reduce((a, b) => a + b, 0);
  const zufall = () => { let r = Math.random() * gSumme; for (let i = 0; i < ps.length; i++) { r -= gewicht[i]; if (r <= 0) return ps[i]; } return ps.at(-1); };
  const d = new Date(); d.setDate(d.getDate() - 7 * (daten.feste.length + 1)); d.setHours(15, 0, 0, 0);
  const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const f = { id: uid(), name: 'Beispielfest', datum, anfangsbestand: 15000, endbestand: null, abgeschlossen: true,
    bestand: {}, verkaeufe: [], angelegt: new Date().toISOString() };
  let t = d.getTime();
  const ende = t + 8.5 * 3600000;
  while (t < ende) {
    const stunde = new Date(t).getHours();
    const takt = stunde >= 18 && stunde < 21 ? 45000 : 120000;   // abends mehr Andrang
    t += Math.random() * takt * 2;
    const korb = new Map();
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const p = zufall(); korb.set(p.id, (korb.get(p.id) || 0) + 1); }
    const positionen = [...korb].map(([id, menge]) => { const p = produkt(id); return { produktId: id, name: p.name, kategorie: kategorie(p.kategorieId)?.name || '', preis: p.preis, menge }; });
    const summe = positionen.reduce((s, x) => s + x.preis * x.menge, 0);
    f.verkaeufe.push({ id: uid(), zeit: new Date(t).toISOString(), positionen, summe, erhalten: summe, storniert: Math.random() < 0.01 });
  }
  const a = auswerten(f);
  for (const z of a.zeilen) {
    const eingekauft = Math.ceil(z.menge * (0.95 + Math.random() * 0.4));
    const rest = Math.max(0, eingekauft - z.menge - (Math.random() < 0.3 ? 1 : 0));
    f.bestand[z.produktId] = { eingekauft: Math.max(eingekauft, z.menge), rest: eingekauft < z.menge ? 0 : rest, ekPreis: Math.round(z.umsatz / z.menge * 0.45) };
  }
  f.endbestand = auswerten(f).soll - 150;
  daten.feste.push(f);
  speichern();
  toast(`Beispielfest mit ${f.verkaeufe.length} Verkäufen angelegt`);
  ui.auswertungFestId = f.id;
  wechsel('auswertung');
}

/* ---------- Export ---------- */
function csv(zeilen) {
  const zelle = v => { if (v == null) return ''; const s = String(v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + zeilen.map(z => z.map(zelle).join(';')).join('\r\n');
}
function herunterladen(name, inhalt, typ) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvProdukte() {
  const f = fest(ui.auswertungFestId); const a = auswerten(f);
  const z = [['Fest', f.name], ['Datum', datumDE(f.datum)], ['Einnahmen', betragCSV(a.umsatz)], ['Verkäufe', a.anzahl], ['Ø je Verkauf', betragCSV(a.durchschnitt)],
    ['Wechselgeld-Anfangsbestand', betragCSV(f.anfangsbestand)], ['Soll-Bestand', betragCSV(a.soll)], ['Gezählter Bestand', betragCSV(f.endbestand)], ['Differenz', betragCSV(a.differenz)], [],
    ['Produkt', 'Kategorie', 'Verkauft', 'Einnahmen €', 'Anteil %', 'Eingekauft', 'Rest', 'Schwund', 'Ausverkauft', 'EK-Preis €', 'Letzter Verkauf', 'Vorschlag nächstes Fest']];
  for (const r of a.zeilen) z.push([r.name, r.kategorie, r.menge, betragCSV(r.umsatz), (r.anteil * 100).toFixed(1).replace('.', ','), r.eingekauft, r.rest, r.schwund,
    r.ausverkauft ? 'ja' : '', betragCSV(r.ekPreis), r.letzter ? uhrzeit(r.letzter) : '', r.vorschlag]);
  herunterladen(`Auswertung_${dateiname(f.name)}_${f.datum}.csv`, csv(z), 'text/csv;charset=utf-8');
}
function csvVerkaeufe() {
  const f = fest(ui.auswertungFestId);
  const z = [['Bon-Nr.', 'Datum', 'Uhrzeit', 'Produkt', 'Kategorie', 'Menge', 'Einzelpreis €', 'Betrag €', 'Bon-Summe €', 'Erhalten €', 'Storniert']];
  f.verkaeufe.forEach((v, i) => {
    const d = new Date(v.zeit);
    for (const p of v.positionen) z.push([i + 1, d.toLocaleDateString('de-DE'), d.toLocaleTimeString('de-DE'), p.name, p.kategorie, p.menge,
      betragCSV(p.preis), betragCSV(p.preis * p.menge), betragCSV(v.summe), betragCSV(v.erhalten), v.storniert ? 'ja' : '']);
  });
  herunterladen(`Einzelverkäufe_${dateiname(f.name)}_${f.datum}.csv`, csv(z), 'text/csv;charset=utf-8');
}
function csvVergleich() {
  const { gewaehlt, zeilen } = vergleichsDaten();
  const kopf = ['Produkt'];
  for (const g of gewaehlt) kopf.push(`${g.f.name} ${datumDE(g.f.datum)} Stück`, `${g.f.name} ${datumDE(g.f.datum)} Einnahmen €`);
  const z = [kopf];
  for (const r of zeilen) z.push([r.name, ...gewaehlt.flatMap((_, i) => [r.werte[i]?.menge ?? 0, betragCSV(r.werte[i]?.umsatz ?? 0)])]);
  z.push(['Einnahmen gesamt', ...gewaehlt.flatMap(g => ['', betragCSV(g.a.umsatz)])]);
  z.push(['Verkäufe', ...gewaehlt.flatMap(g => [g.a.anzahl, ''])]);
  herunterladen(`Vergleich_Feste_${heute()}.csv`, csv(z), 'text/csv;charset=utf-8');
}

/* ---------- Navigation und Rendering ---------- */
function render() {
  for (const b of $$('.nav button')) b.classList.toggle('aktiv', b.dataset.ansicht === ui.ansicht);
  $('#fest-anzeige').textContent = festAnzeige();
  const ansichten = { kasse: renderKasse, auswertung: renderAuswertung, vergleich: renderVergleich, feste: renderFeste, produkte: renderProdukte, daten: renderDaten };
  $('#inhalt').innerHTML = ansichten[ui.ansicht]();
  if (ui.ansicht === 'kasse') aktualisiereKasse();
  if (ui.ansicht === 'daten') persistStatus();
}
function wechsel(ansicht) {
  ui.ansicht = ansicht;
  render();
  $('#inhalt').scrollTop = 0;
}

function toast(text, art = '') {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast zeigen ' + art;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = 'toast'; }, art === 'fehler' ? 4000 : 2600);
}
const tippen = () => navigator.vibrate?.(12);

const aktionen = {
  nav: el => { if (el.dataset.ansicht === 'feste') ui.festDetailId = null; wechsel(el.dataset.ansicht); },

  // Kasse
  add: el => {
    const w = ui.warenkorb.find(x => x.produktId === el.dataset.id);
    if (w) w.menge++; else ui.warenkorb.push({ produktId: el.dataset.id, menge: 1 });
    tippen(); aktualisiereKasse();
  },
  minus: el => {
    const w = ui.warenkorb.find(x => x.produktId === el.dataset.id);
    if (!w) return;
    if (--w.menge <= 0) ui.warenkorb = ui.warenkorb.filter(x => x !== w);
    if (!ui.warenkorb.length) ui.erhalten = 0;
    tippen(); aktualisiereKasse();
  },
  leeren: () => { ui.warenkorb = []; ui.erhalten = 0; aktualisiereKasse(); },
  geld: el => { ui.erhalten += Number(el.dataset.wert); tippen(); aktualisiereKasse(); },
  passend: () => { ui.erhalten = warenkorbSumme(); aktualisiereKasse(); },
  'geld-c': () => { ui.erhalten = 0; aktualisiereKasse(); },
  bezahlt: () => buchen(),
  storno: () => {
    const f = aktivesFest();
    stornieren(f, [...f.verkaeufe].reverse().find(v => !v.storniert));
    aktualisiereKasse();
  },
  'zu-fest-neu': () => { ui.festDetailId = null; ui.neuesFestOffen = true; wechsel('feste'); },

  // Feste
  'fest-neu-zeigen': () => { ui.neuesFestOffen = true; render(); $('[name=name]')?.focus(); },
  'fest-neu-abbrechen': () => { ui.neuesFestOffen = false; render(); },
  'fest-aktiv': el => {
    daten.aktivesFestId = el.dataset.id; speichern();
    ui.warenkorb = []; ui.erhalten = 0;
    toast(`„${fest(el.dataset.id).name}" ist jetzt an der Kasse aktiv`); render();
  },
  'fest-detail': el => { ui.festDetailId = el.dataset.id; wechsel('feste'); },
  'fest-zurueck': () => { ui.festDetailId = null; wechsel('feste'); },
  'zur-auswertung': el => { ui.auswertungFestId = el.dataset.id; wechsel('auswertung'); },
  'fest-abschliessen': el => {
    const f = fest(el.dataset.id);
    const a = auswerten(f);
    const fehlt = [];
    if (f.endbestand == null) fehlt.push('gezählter Kassenbestand');
    if (a.zeilen.some(z => z.eingekauft != null && z.rest == null)) fehlt.push('Restbestände');
    if (!confirm(`Fest „${f.name}" abschließen?\nDanach sind keine Buchungen und Änderungen mehr möglich (wieder öffnen geht).` +
      (fehlt.length ? `\n\nNoch nicht eingetragen: ${fehlt.join(', ')}.` : ''))) return;
    // EK-Preise einfrieren, damit spätere Preisänderungen die Auswertung nicht verfälschen
    for (const z of a.zeilen) {
      const p = produkt(z.produktId);
      if (p?.ekPreis != null) { const b = f.bestand[z.produktId] || (f.bestand[z.produktId] = { eingekauft: null, rest: null, ekPreis: null }); if (b.ekPreis == null) b.ekPreis = p.ekPreis; }
    }
    f.abgeschlossen = true;
    if (daten.aktivesFestId === f.id) { daten.aktivesFestId = null; ui.warenkorb = []; ui.erhalten = 0; }
    speichern(); toast('Fest abgeschlossen'); render();
  },
  'fest-oeffnen': el => { fest(el.dataset.id).abgeschlossen = false; speichern(); toast('Fest wieder geöffnet. Zum Kassieren noch „Aktiv setzen".'); render(); },
  'fest-loeschen': el => {
    const f = fest(el.dataset.id);
    const eingabe = prompt(`Fest „${f.name}" mit ${f.verkaeufe.length} Buchungen endgültig löschen?\nZum Bestätigen den Namen des Fests eintippen:`);
    if (eingabe == null) return;
    if (eingabe.trim() !== f.name) return toast('Name stimmt nicht überein, nichts gelöscht', 'fehler');
    daten.feste = daten.feste.filter(x => x !== f);
    if (daten.aktivesFestId === f.id) daten.aktivesFestId = null;
    if (ui.vergleichIds) ui.vergleichIds = ui.vergleichIds.filter(id => id !== f.id);
    ui.festDetailId = null;
    speichern(); toast('Fest gelöscht'); render();
  },
  'journal-storno': el => {
    const f = fest(ui.festDetailId);
    stornieren(f, f.verkaeufe.find(v => v.id === el.dataset.vid));
    render();
  },

  // Produkte
  'kat-neu': () => {
    const name = prompt('Name der neuen Kategorie:');
    if (!name?.trim()) return;
    daten.kategorien.push({ id: uid(), name: name.trim() }); speichern(); render();
  },
  'kat-schieben': el => {
    const i = daten.kategorien.findIndex(k => k.id === el.dataset.kid);
    const j = i + Number(el.dataset.richtung);
    [daten.kategorien[i], daten.kategorien[j]] = [daten.kategorien[j], daten.kategorien[i]];
    speichern(); render();
  },
  'kat-loeschen': el => {
    const k = kategorie(el.dataset.kid);
    if (daten.produkte.some(p => p.kategorieId === k.id)) return toast('Kategorie enthält noch Produkte. Erst verschieben oder löschen.', 'fehler');
    if (!confirm(`Kategorie „${k.name}" löschen?`)) return;
    daten.kategorien = daten.kategorien.filter(x => x !== k); speichern(); render();
  },
  'p-neu': el => {
    daten.produkte.push({ id: uid(), name: 'Neues Produkt', preis: 100, ekPreis: null, kategorieId: el.dataset.kid, farbe: 'gruen', aktiv: true });
    speichern(); render();
    const inputs = $$('[data-feld="p-name"]'); const neu = inputs.at(-1);
    const ziel = inputs.filter(i => i.value === 'Neues Produkt').at(-1) || neu;
    ziel?.focus(); ziel?.select();
  },
  'p-schieben': el => { produktSchieben(el.dataset.pid, Number(el.dataset.richtung)); speichern(); render(); },
  'p-loeschen': el => {
    const p = produkt(el.dataset.pid);
    const verkauft = daten.feste.some(f => f.verkaeufe.some(v => v.positionen.some(x => x.produktId === p.id)));
    if (!confirm(`Produkt „${p.name}" löschen?` + (verkauft ? '\n\nEs wurde bereits verkauft. Bisherige Auswertungen bleiben erhalten. Empfehlung: lieber auf „inaktiv" setzen.' : ''))) return;
    daten.produkte = daten.produkte.filter(x => x !== p);
    ui.warenkorb = ui.warenkorb.filter(w => w.produktId !== p.id);
    speichern(); render();
  },

  // Auswertung / Vergleich
  'csv-produkte': () => csvProdukte(),
  'csv-verkaeufe': () => csvVerkaeufe(),
  'csv-vergleich': () => csvVergleich(),
  drucken: () => window.print(),
  'vergleich-toggle': el => {
    const id = el.dataset.id;
    ui.vergleichIds = ui.vergleichIds.includes(id) ? ui.vergleichIds.filter(x => x !== id) : [...ui.vergleichIds, id];
    render();
  },
  'vergleich-modus': el => { ui.vergleichModus = el.dataset.modus; render(); },

  // Daten
  'backup-export': () => {
    herunterladen(`Vereinskasse_Sicherung_${heute()}.json`, JSON.stringify({ ...daten, exportiert: new Date().toISOString(), appVersion: APP_VERSION }, null, 1), 'application/json');
  },
  demo: () => demoFest(),
  reset: () => {
    const e = prompt('Wirklich ALLE Daten auf diesem Gerät löschen? Zum Bestätigen LÖSCHEN eintippen:');
    if (e?.trim().toUpperCase() !== 'LÖSCHEN') return;
    daten = standardDaten(); speichern();
    Object.assign(ui, { warenkorb: [], erhalten: 0, auswertungFestId: null, vergleichIds: null, festDetailId: null });
    toast('Alle Daten gelöscht'); render();
  },
};

/** Eingabefelder: Rückgabe true = Feld ist verarbeitet */
function feldEingabe(el, ereignis) {
  const feld = el.dataset.feld;
  const f = fest(ui.festDetailId);
  const p = el.dataset.pid ? produkt(el.dataset.pid) : null;
  const fehler = (msg, alt) => { toast(msg, 'fehler'); el.value = alt; };

  if (ereignis === 'input') {
    if (feld === 'b-eingekauft' || feld === 'b-rest') {
      const n = parseMenge(el.value);
      if (Number.isNaN(n)) return;
      const b = f.bestand[el.dataset.pid] || (f.bestand[el.dataset.pid] = { eingekauft: null, rest: null, ekPreis: null });
      b[feld === 'b-eingekauft' ? 'eingekauft' : 'rest'] = n;
      speichern(); aktualisiereFestZellen(f);
    }
    return;
  }

  switch (feld) {
    case 'b-eingekauft': case 'b-rest':
      if (Number.isNaN(parseMenge(el.value))) fehler('Bitte eine ganze Zahl eingeben', '');
      break;
    case 'b-ek': {
      const c = parseEuro(el.value);
      const b = f.bestand[el.dataset.pid] || (f.bestand[el.dataset.pid] = { eingekauft: null, rest: null, ekPreis: null });
      if (Number.isNaN(c)) return fehler('Ungültiger Betrag', b.ekPreis != null ? zahlDE(b.ekPreis) : '');
      b.ekPreis = c; el.value = c != null ? zahlDE(c) : '';
      speichern(); break;
    }
    case 'f-name':
      if (!el.value.trim()) return fehler('Name darf nicht leer sein', f.name);
      f.name = el.value.trim(); speichern(); $('#fest-anzeige').textContent = festAnzeige(); break;
    case 'f-datum':
      if (el.value) { f.datum = el.value; speichern(); $('#fest-anzeige').textContent = festAnzeige(); } break;
    case 'f-anfang': case 'f-ende': {
      const c = parseEuro(el.value);
      const key = feld === 'f-anfang' ? 'anfangsbestand' : 'endbestand';
      if (Number.isNaN(c)) return fehler('Ungültiger Betrag', f[key] != null ? zahlDE(f[key]) : '');
      f[key] = key === 'anfangsbestand' ? (c ?? 0) : c;
      el.value = f[key] != null ? zahlDE(f[key]) : '';
      speichern(); aktualisiereFestZellen(f); break;
    }
    case 'kat-name': {
      const k = kategorie(el.dataset.kid);
      if (!el.value.trim()) return fehler('Name darf nicht leer sein', k.name);
      k.name = el.value.trim(); speichern(); break;
    }
    case 'p-name':
      if (!el.value.trim()) return fehler('Name darf nicht leer sein', p.name);
      p.name = el.value.trim(); speichern(); break;
    case 'p-preis': {
      const c = parseEuro(el.value);
      if (c == null || Number.isNaN(c)) return fehler('Ungültiger Preis', zahlDE(p.preis));
      p.preis = c; el.value = zahlDE(c); speichern(); break;
    }
    case 'p-ek': {
      const c = parseEuro(el.value);
      if (Number.isNaN(c)) return fehler('Ungültiger Betrag', p.ekPreis != null ? zahlDE(p.ekPreis) : '');
      p.ekPreis = c; el.value = c != null ? zahlDE(c) : ''; speichern(); break;
    }
    case 'p-farbe': p.farbe = el.value; speichern(); render(); break;
    case 'p-kat': p.kategorieId = el.value; speichern(); render(); break;
    case 'p-aktiv': p.aktiv = el.checked; speichern(); break;
    case 'vereinsname': daten.vereinsname = el.value.trim(); speichern(); break;
    case 'auswertung-fest': ui.auswertungFestId = el.value; render(); break;
    case 'backup-import': backupImport(el.files[0]); el.value = ''; break;
  }
}

async function backupImport(datei) {
  if (!datei) return;
  try {
    const obj = JSON.parse(await datei.text());
    if (!Array.isArray(obj.produkte) || !Array.isArray(obj.feste)) throw new Error('Keine Vereinskasse-Sicherung');
    const anzahl = obj.feste.length;
    if (!confirm(`Sicherung vom ${obj.exportiert ? new Date(obj.exportiert).toLocaleString('de-DE') : '?'} mit ${anzahl} Festen laden?\n\nDie aktuellen Daten auf diesem Gerät werden dabei ERSETZT.`)) return;
    delete obj.exportiert; delete obj.appVersion;
    daten = migrieren(obj);
    speichern();
    Object.assign(ui, { warenkorb: [], erhalten: 0, auswertungFestId: null, vergleichIds: null, festDetailId: null });
    toast('Sicherung geladen'); render();
  } catch (e) {
    console.error(e);
    toast('Datei konnte nicht gelesen werden: ' + e.message, 'fehler');
  }
}

async function persistStatus() {
  const el = $('#persist-status');
  if (!el || !navigator.storage?.persisted) return;
  const ok = await navigator.storage.persisted();
  el.textContent = ok ? 'Speicher ist dauerhaft geschützt' : 'Speicher nicht dauerhaft geschützt (App installieren hilft)';
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  aktionen[el.dataset.action]?.(el);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-feld]'); if (el) feldEingabe(el, 'input'); });
document.addEventListener('change', e => { const el = e.target.closest('[data-feld]'); if (el) feldEingabe(el, 'change'); });
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'fest-neu') festNeuAnlegen(form);
});

// Bildschirm während des Kassierens wach halten
let wakeLock = null;
async function wachHalten() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* nicht unterstützt oder verweigert */ }
}
document.addEventListener('visibilitychange', wachHalten);

// Start
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
}
if (!aktivesFest() && !daten.feste.length) { ui.ansicht = 'feste'; ui.neuesFestOffen = true; }
render();
wachHalten();
