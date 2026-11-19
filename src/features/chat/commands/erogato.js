/**
 * The answer of the `erogato` format of the commands without AI, composed in the browser from the rows of
 * the fixed query the server runs (`command` action of the `database` function; the default query and the
 * column contract are `EROGATO_SQL` and `EROGATO_COLUMNS` in functions/src/db/commandFormats.js). No model
 * is involved: same format as the model's old erogato answer, shown as a normal assistant message
 * (`renderMarkdownLite` draws the headings, tables and code blocks).
 *
 * Pure: rows in, markdown out, no dependencies. The names of the row fields (`oggi`, `cur`, `pratiche`…)
 * are the columns of that query, which the server checks before sending anything.
 */

const PRODOTTI = [
  ['Mutuo', '🏠 Mutui'],
  ['Cessione del quinto', '📄 Cessioni'],
  ['Prestito', '💶 Prestiti']
];
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Sett', 'Ott', 'Nov', 'Dic'];
const MESI_LUNGHI = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
];

const num = x => Number(x) || 0;
const fmt = (x, dec) =>
  num(x).toLocaleString('it-IT', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: 'always'
  });
/** EUR 5,2 Mln above a million, EUR 312 mila below it (never "EUR 0,3 Mln"). */
const euro = x => (num(x) >= 999500 ? `EUR ${fmt(num(x) / 1e6, 1)} Mln` : `EUR ${fmt(num(x) / 1e3, 0)} mila`);
const corto = x =>
  (num(x) >= 999500 ? `${fmt(num(x) / 1e6, 1)} Mln ` : `${fmt(num(x) / 1e3, 0)} mila`).padStart(10);
const variazione = (cur, ap) => {
  if (!(ap > 0)) return '';
  if (cur >= 10 * ap) return '▲ >900%';
  const v = 100 * (cur / ap - 1);
  return `${v >= 0 ? '▲' : '▼'} ${fmt(Math.abs(v), 1)}%`;
};
const barra = (x, max, larghezza) => {
  const pieni = x > 0 && max > 0 ? Math.min(larghezza, Math.max(1, Math.round((larghezza * x) / max))) : 0;
  return '█'.repeat(pieni) + '·'.repeat(larghezza - pieni);
};

/** Sums per key: { key: { pratiche, erogato, mediazione, daStato } }. */
function somma(righe, chiave) {
  const out = new Map();
  for (const r of righe) {
    const k = chiave(r);
    const s = out.get(k) || { pratiche: 0, erogato: 0, mediazione: 0, daStato: 0 };
    s.pratiche += num(r.pratiche);
    s.erogato += num(r.erogato);
    s.mediazione += num(r.mediazione);
    s.daStato += num(r.con_data_da_cambio_stato);
    out.set(k, s);
  }
  return out;
}

/** Table by product for one period (rows already filtered on the period, with cur = 1 / 0). */
function tabellaPeriodo(righe) {
  const cur = righe.filter(r => num(r.cur) === 1);
  const ap = righe.filter(r => num(r.cur) === 0);
  const pc = somma(cur, r => r.prodotto);
  const pa = somma(ap, r => r.prodotto);
  const linee = ['| | Pratiche | Erogato | vs anno prima |', '|---|---:|---:|---:|'];
  let tot = 0,
    totAp = 0,
    totN = 0;
  for (const [codice, etichetta] of PRODOTTI) {
    const c = pc.get(codice),
      a = pa.get(codice);
    tot += c?.erogato || 0;
    totAp += a?.erogato || 0;
    totN += c?.pratiche || 0;
    if (!c?.pratiche) continue; // products at zero are left out
    linee.push(
      `| ${etichetta} | ${fmt(c.pratiche, 0)} | ${euro(c.erogato)} | ${variazione(c.erogato, a?.erogato)} |`
    );
  }
  const vt = variazione(tot, totAp);
  linee.push(`| **Totale** | **${fmt(totN, 0)}** | **${euro(tot)}** | ${vt ? `**${vt}**` : ''} |`);
  const fs = somma(
    cur.filter(r => r.fuori_sistema !== 'NO'),
    r => r.fuori_sistema
  );
  if (fs.get('SI')?.pratiche)
    linee.push(
      `| ↳ di cui fuori sistema | ${fmt(fs.get('SI').pratiche, 0)} | ${euro(fs.get('SI').erogato)} | |`
    );
  if (fs.get('NON MIGRATA')?.pratiche)
    linee.push(
      `| ↳ di cui non ancora migrate in 7hub | ${fmt(fs.get('NON MIGRATA').pratiche, 0)} | ${euro(fs.get('NON MIGRATA').erogato)} | |`
    );
  return {
    testo: linee.join('\n'),
    pratiche: totN,
    mediazioneMutui: pc.get('Mutuo')?.mediazione || 0,
    daStato: [...pc.values()].reduce((s, x) => s + x.daStato, 0)
  };
}

/** Ranking in characters: the first `primi` by erogato and an "(altri N)" line. */
function classifica(mappa, mappaAp, primi, conVariazione) {
  const voci = [...mappa.entries()]
    .filter(([, s]) => s.pratiche > 0)
    .sort((a, b) => b[1].erogato - a[1].erogato);
  const top = voci.slice(0, primi);
  const altri = voci.slice(primi);
  const max = top.length ? top[0][1].erogato : 0;
  const totale = voci.reduce((s, [, x]) => s + x.erogato, 0);
  const linee = top.map(([nome, s]) => {
    const extra = conVariazione
      ? variazione(s.erogato, mappaAp?.get(nome)?.erogato).padEnd(8)
      : `${fmt((100 * s.erogato) / (totale || 1), 1).padStart(4)}%  `;
    return `${barra(s.erogato, max, 10)} ${corto(s.erogato)} ${extra} ${nome.slice(0, 30)}`;
  });
  if (altri.length && conVariazione) {
    const resto = altri.reduce((s, [, x]) => s + x.erogato, 0);
    linee.push(`${' '.repeat(10)} ${corto(resto)} ${''.padEnd(8)} (altri ${altri.length})`);
  }
  return linee.join('\n');
}

/**
 * righe: the rows of the erogato query. Returns the markdown of the answer.
 * With no rows: a short message (the user sees no liquidated practice in the period).
 */
export function componiErogato(righe) {
  if (!righe.length)
    return 'Nessuna pratica liquidata visibile da inizio anno.\n\n_Criterio: pratiche oggi in perfezionamento o perfezionate, data di liquidazione da inizio anno a oggi._';
  const oggi = righe[0].oggi; // YYYY-MM-DD, from the database: never the browser's date
  const [aa, mm, gg] = oggi.split('-').map(Number);
  const curAnno = righe.filter(r => (num(r.cur) === 1 ? num(r.anno) === aa : num(r.anno) === aa - 1));
  const delMese = righe.filter(r => num(r.mese) === mm);
  const mese = tabellaPeriodo(delMese);
  const anno = tabellaPeriodo(curAnno);
  const out = [
    `**Erogato · aggiornato al ${String(gg).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${aa}**`,
    ''
  ];
  out.push(`### ${MESI_LUNGHI[mm - 1]} ${aa} (dal 1 al ${gg}) · tutti i prodotti`, mese.testo, '');
  out.push('### Da inizio anno · tutti i prodotti', anno.testo, '');
  if (anno.mediazioneMutui > 0) out.push(`Mediazione mutui: ${euro(anno.mediazioneMutui)}`, '');

  // monthly trend, one block per product
  if (mm > 1) {
    out.push('### Andamento mensile');
    for (const [codice, etichetta] of PRODOTTI) {
      const pc = somma(
        curAnno.filter(r => r.prodotto === codice && num(r.cur) === 1),
        r => num(r.mese)
      );
      const pa = somma(
        curAnno.filter(r => r.prodotto === codice && num(r.cur) === 0),
        r => num(r.mese)
      );
      if (!pc.size) continue;
      const max = Math.max(...[...pc.values()].map(s => s.erogato));
      const linee = [];
      const primo = Math.min(...pc.keys()); // from the first month with erogato
      for (let m = primo; m <= mm; m++) {
        const c = pc.get(m)?.erogato || 0;
        linee.push(
          `${MESI[m - 1].padEnd(4)} ${barra(c, max, 14)} ${c > 0 ? corto(c) : '—'.padStart(10)} ${variazione(c, pa.get(m)?.erogato)}`.trimEnd()
        );
      }
      out.push(etichetta, '```', ...linee, '```');
    }
    out.push('');
  }

  // territorial directors (left out if there is only one) and top 5 banks, year to date
  const dtC = somma(
    curAnno.filter(r => num(r.cur) === 1),
    r => r.dt
  );
  const dtA = somma(
    curAnno.filter(r => num(r.cur) === 0),
    r => r.dt
  );
  if ([...dtC.values()].filter(s => s.pratiche > 0).length > 1)
    out.push(
      '### Direttori territoriali · da inizio anno, tutti i prodotti',
      '```',
      classifica(dtC, dtA, 10, true),
      '```',
      ''
    );
  const bc = somma(
    curAnno.filter(r => num(r.cur) === 1),
    r => r.banca
  );
  out.push(
    '### Prime 5 banche · da inizio anno, tutti i prodotti',
    '```',
    classifica(bc, null, 5, false),
    '```',
    ''
  );

  const note = [];
  if (anno.daStato)
    note.push(
      anno.daStato === 1
        ? '1 pratica senza data di liquidazione datata con il passaggio in perfezionamento'
        : `${fmt(anno.daStato, 0)} pratiche senza data di liquidazione datate con il passaggio in perfezionamento`
    );
  out.push(
    `_Criterio: pratiche oggi in perfezionamento o perfezionate, data di liquidazione (se manca, primo passaggio in perfezionamento) da inizio anno al ${String(gg).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${aa}, confronto con gli stessi giorni dell'anno prima; comprese le righe fuori sistema e non ancora migrate${note.length ? '; ' + note.join('; ') : ''}. Il mese in corso e' sottostimato finche' gli stati non sono aggiornati._`
  );
  return out.join('\n');
}
