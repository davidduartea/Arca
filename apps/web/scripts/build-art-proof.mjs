import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Monta la prueba de plancha: una página con todo el ornamento a tamaño real.
 *
 * Los SVG entran como `data:` URI y no en línea porque cada uno lleva sus
 * `<defs>` con ids cortos — `#r`, `#s`, `#i` — y al meterlos todos en el mismo
 * documento los `<use>` del segundo resolverían contra el primero. Como imagen
 * suelta cada uno es su propio documento, que además es como los va a usar la
 * aplicación.
 */
const ART = path.resolve(import.meta.dirname, "..", "public", "art");
const OUT = process.argv[2];

const uri = (name) =>
  `data:image/svg+xml;base64,${Buffer.from(readFileSync(path.join(ART, name), "utf8")).toString("base64")}`;

const weight = (name) => (readFileSync(path.join(ART, name)).length / 1024).toFixed(1);

/** Una pieza de la plancha, con su peso — que es media historia de esto. */
const piece = (name, label, note, width) => `
  <figure class="piece">
    <div class="plate"><img src="${uri(name)}" alt="${label}" style="width:${width}px"></div>
    <figcaption>
      <span class="name">${label}</span>
      <span class="note">${note}</span>
      <span class="kb">${weight(name)} KB</span>
    </figcaption>
  </figure>`;

const html = `<title>Plancha de Arca</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --green: #1F4634;
    --green-light: #2F6B4D;
    --ground: #F0EEE9;
    --paper: #FDFBF7;
    --ink: #1A1A1A;
    --ink-2: #4A4A45;
    --ink-3: #6B6B63;
    --ink-4: #8A8A80;
    --hair: rgba(31, 70, 52, 0.22);

    --serif: "Bodoni Moda", Georgia, serif;
    --sans: "IBM Plex Sans", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, monospace;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.6;
  }

  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px 80px; }

  header {
    background: var(--green);
    color: var(--paper);
    padding: 34px 0 0;
    margin-bottom: 44px;
  }
  header .wrap { padding-bottom: 0; }
  .brand { display: flex; align-items: center; gap: 13px; }
  .brand img { width: 34px; height: 34px; }
  .brand span { font-family: var(--serif); font-size: 27px; letter-spacing: .07em; }
  header h1 {
    font-family: var(--serif);
    font-size: clamp(30px, 5vw, 46px);
    line-height: 1.1;
    font-weight: 400;
    margin: 20px 0 6px;
    text-wrap: balance;
  }
  header p { max-width: 62ch; color: rgba(253, 251, 247, .78); margin: 0 0 26px; }
  header .band { display: block; width: 100%; height: 16px; opacity: .4; }

  h2 {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
    margin: 0 0 18px;
  }

  section { margin-bottom: 56px; }
  section > p { max-width: 66ch; color: var(--ink-2); margin: 0 0 24px; }

  .sheet {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 22px;
  }
  .piece { margin: 0; }
  .plate {
    background: var(--paper);
    border: 1px solid var(--hair);
    min-height: 150px;
    display: grid;
    place-items: center;
    padding: 16px;
    overflow: hidden;
  }
  .plate img { display: block; max-width: 100%; height: auto; }
  figcaption { display: grid; gap: 1px; padding-top: 8px; }
  .name { font-size: 13.5px; }
  .note { font-size: 12px; color: var(--ink-3); line-height: 1.45; }
  .kb { font-family: var(--mono); font-size: 10.5px; color: var(--ink-4); }

  .true-scale {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 34px;
    background: var(--paper);
    border: 1px solid var(--hair);
    padding: 24px 26px;
  }
  .true-scale figure { margin: 0; text-align: center; }
  .true-scale figcaption { font-family: var(--mono); font-size: 10.5px; color: var(--ink-4); padding-top: 8px; }
  .dark-tabs {
    background: #26262b;
    padding: 16px 26px;
    display: flex;
    align-items: center;
    gap: 22px;
    color: #C9C9C2;
    font-size: 12.5px;
  }

  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 26px; align-items: start; }

  .zoom {
    background: var(--paper);
    border: 1px solid var(--hair);
    padding: 20px;
    overflow: hidden;
  }
  .zoom img { display: block; width: 900px; max-width: none; margin: -60px 0 -60px -90px; }
  .zoom-frame { overflow: hidden; height: 190px; }

  /* La muestra aplicada: el extracto con la tipografía de verdad. */
  .statement { background: var(--paper); border: 1px solid var(--hair); padding: 26px 28px 24px; position: relative; overflow: hidden; }
  .statement .mark { position: absolute; right: -60px; top: -50px; width: 240px; pointer-events: none; }
  .statement .head { position: relative; }
  .eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--green-light); }
  .account { font-family: var(--serif); font-size: 20px; color: var(--ink-3); margin-top: 10px; }
  .total { font-family: var(--serif); font-size: 52px; line-height: 1.02; }
  .derived { font-family: var(--mono); font-size: 10.5px; color: var(--ink-4); }
  .statement img.rule { display: block; width: 100%; height: auto; margin: 16px 0 10px; }

  table { width: 100%; border-collapse: collapse; position: relative; }
  thead th {
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--ink-4);
    font-weight: 500;
    text-align: right;
    padding-bottom: 7px;
    border-bottom: 1.5px solid var(--green);
  }
  thead th:first-child { text-align: left; }
  tbody td { padding: 11px 0; border-bottom: 1px solid rgba(31, 70, 52, .16); vertical-align: top; }
  td.desc { font-size: 14.5px; }
  td.desc .when { font-family: var(--mono); font-size: 11px; color: var(--ink-4); display: block; margin-top: 2px; }
  td.amount, td.running {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  td.amount { font-size: 14px; }
  td.running { font-size: 13px; color: var(--ink-3); }
  .in { font-weight: 500; }
  tr.reversal td.desc { display: flex; gap: 9px; align-items: flex-start; }
  tr.reversal img { width: 22px; margin-top: 6px; }
  .voided { color: var(--ink-3); }
  .tag {
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: .14em;
    text-transform: uppercase;
    border: 1px solid rgba(31, 70, 52, .45);
    color: var(--green);
    padding: 1.5px 6px;
    margin-left: 6px;
    white-space: nowrap;
  }

  .empty { text-align: center; padding: 22px 16px; position: relative; overflow: hidden; background: var(--paper); border: 1px solid var(--hair); }
  .empty img.vig { width: 56px; position: relative; }
  .empty img.mark { position: absolute; right: -50px; top: -44px; width: 190px; }
  .empty .title { font-family: var(--serif); font-size: 18px; margin-top: 4px; position: relative; }
  .empty p { font-size: 12.5px; color: var(--ink-3); margin: 4px 0 0; position: relative; }

  .end { text-align: center; }
  .end img { display: block; margin: 0 auto; max-width: 100%; height: auto; }
  .end .title { font-family: var(--serif); font-size: 17px; }
  .end .when { font-family: var(--mono); font-size: 10.5px; color: var(--ink-4); }

  footer {
    border-top: 1px solid var(--hair);
    padding-top: 18px;
    font-size: 12.5px;
    color: var(--ink-3);
    max-width: 70ch;
  }
  b { color: var(--green); font-weight: 500; }
</style>

<header>
  <div class="wrap">
    <div class="brand"><img src="${uri("symbol-a-light.svg")}" alt=""><span>Arca</span></div>
    <h1>Prueba de plancha</h1>
    <p>Todo el ornamento del sistema, a tamaño real y recién salido del torno. Veinte piezas, sesenta y tres kilobytes.</p>
  </div>
  <img class="band" src="${uri("band-light.svg")}" alt="">
</header>

<div class="wrap">

<section>
  <h2>La plancha</h2>
  <p>Doce de estas piezas se generan con un script a partir de dos curvas rizadas de diecinueve y trece lóbulos. Las otras ocho vienen del diseño tal cual, sin tocar.</p>
  <div class="sheet">
    ${piece("rosette.svg", "Roseta", "La pieza de firma. Una vez por página, nunca dos.", 172)}
    ${piece("rosette-watermark.svg", "Marca de agua", "La misma al 14 % de tinta, para ir detrás del texto.", 172)}
    ${piece("symbol-a.svg", "Símbolo", "La bóveda dentro del cuño.", 120)}
    ${piece("vig-seal.svg", "Cuño", "Algo quedó registrado.", 110)}
    ${piece("corner.svg", "Esquina", "Marco de certificado. El abanico es el original.", 130)}
    ${piece("vig-arca.svg", "Arcón", "Cuenta nueva. Verbatim.", 110)}
    ${piece("vig-ledger.svg", "Hoja rayada", "Extracto vacío. Verbatim.", 110)}
    ${piece("lozenge.svg", "Rombo", "Separador. Verbatim.", 96)}
    ${piece("rule.svg", "Filete", "Entre secciones. Lleva el fantasma.", 250)}
    ${piece("vig-end.svg", "Remate", "Aquí empieza la cuenta.", 250)}
    ${piece("band-tight.svg", "Banda", "Cabecera y pie.", 250)}
    ${piece("pattern.svg", "Trama", "Diagonal al 16 %. Nunca tras una tabla.", 72)}
  </div>
</section>

<section>
  <h2>El icono, a tamaño real</h2>
  <p>Cada salto quita una capa: a 180 el torno entero, a 32 vuelve el anillo liso, y a 16 queda la silueta triangular con dintel y nada más. En una fila de veinte pestañas lo que distingue es la forma, no el detalle.</p>
  <div class="true-scale">
    <figure><img src="${uri("icon-16.svg")}" width="16" height="16" alt=""><figcaption>16</figcaption></figure>
    <figure><img src="${uri("icon-32.svg")}" width="32" height="32" alt=""><figcaption>32</figcaption></figure>
    <figure><img src="${uri("icon-180.svg")}" width="90" height="90" alt=""><figcaption>180</figcaption></figure>
    <figure><img src="${uri("symbol-a.svg")}" width="128" height="128" alt=""><figcaption>símbolo 128</figcaption></figure>
  </div>
  <div class="dark-tabs">
    <img src="${uri("icon-16-inv.svg")}" width="16" height="16" alt="">
    <img src="${uri("icon-32-inv.svg")}" width="32" height="32" alt="">
    <img src="${uri("icon-180-inv.svg")}" width="48" height="48" alt="">
    <span>Pestaña oscura: la misma bóveda en crema sobre teja verde.</span>
  </div>
</section>

<section>
  <h2>El desajuste de registro</h2>
  <div class="split">
    <div>
      <p>El diseño pide una imperfección deliberada: una plancha fantasma corrida 0,7 px en verde claro, como si el papel hubiera entrado mal calzado. No es un fallo y no debe corregirse.</p>
      <p>En el original eso costaba duplicar el dibujo entero. Aquí es un <code>&lt;use&gt;</code> y pesa cien bytes.</p>
    </div>
    <div class="zoom">
      <div class="zoom-frame"><img src="${uri("rosette.svg")}" alt="Detalle de la roseta"></div>
    </div>
  </div>
</section>

<section>
  <h2>Aplicado</h2>
  <p>El extracto con la tipografía del sistema. Los importes no llevan color: se distinguen por el signo y el peso, que es lo que decidimos.</p>
  <div class="statement">
    <img class="mark" src="${uri("rosette-watermark.svg")}" alt="">
    <div class="head">
      <div class="eyebrow">Extracto · agosto 2026</div>
      <div class="account">Cuenta corriente</div>
      <div class="total">$1,250.00</div>
      <div class="derived">derivado de 34 movimientos · nunca almacenado</div>
    </div>
    <img class="rule" src="${uri("rule.svg")}" alt="">
    <table>
      <thead>
        <tr><th>Movimiento</th><th>Importe</th><th>Saldo después</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="desc">Nómina de agosto<span class="when">26 ago 2026, 14:32</span></td>
          <td class="amount in">+$3,000.00</td>
          <td class="running">$4,398.50</td>
        </tr>
        <tr>
          <td class="desc">Alquiler<span class="when">25 ago 2026, 09:10</span></td>
          <td class="amount">−$1,100.00</td>
          <td class="running">$1,398.50</td>
        </tr>
        <tr class="reversal">
          <td class="desc">
            <img src="${uri("lozenge.svg")}" alt="">
            <span>Anulación de «Cena del viernes»<span class="when">23 ago 2026, 10:02</span></span>
          </td>
          <td class="amount in">+$48.50</td>
          <td class="running">$2,498.50</td>
        </tr>
        <tr>
          <td class="desc"><span class="voided"><s>Cena del viernes</s><span class="tag">anulado</span></span><span class="when">22 ago 2026, 21:04</span></td>
          <td class="amount voided">−$48.50</td>
          <td class="running">$2,450.00</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="split" style="margin-top:26px">
    <div class="empty">
      <img class="mark" src="${uri("rosette-watermark.svg")}" alt="">
      <img class="vig" src="${uri("vig-ledger.svg")}" alt="">
      <div class="title">Extracto en blanco</div>
      <p>El saldo es $0.00 porque todavía no hay nada que sumar.</p>
    </div>
    <div class="empty end">
      <img src="${uri("vig-end.svg")}" width="240" alt="">
      <div class="title">Aquí empieza la cuenta</div>
      <div class="when">1 mar 2026 · 34 asientos en total</div>
    </div>
  </div>
</section>

<footer>
  <b>Lo que cambió respecto al original:</b> las piezas de torno se generan en vez de venir trazadas punto a punto. Pesaban 250 KB cada una y el lector no las traía enteras; ahora el conjunto entero son 63 KB y los parámetros —diecinueve lóbulos contra trece, trazo de 0,4 pt, catorce pasadas— están a la vista y se pueden mover. La técnica es la misma; la curva exacta, no.
</footer>

</div>`;

writeFileSync(OUT, html);
console.log(`  ${OUT} · ${(html.length / 1024).toFixed(0)} KB`);
