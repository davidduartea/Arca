import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Genera el ornamento de guilloché de Arca.
 *
 * El guilloché no es un dibujo: es una máquina. Un torno de grabar traza una
 * curva rizada y va girando la pieza un poco entre pasada y pasada; el moaré
 * que aparece al superponerse dos familias de frecuencias distintas es lo que
 * hacía imposible copiar un billete a mano.
 *
 * Aquí es lo mismo con una función:
 *
 *   r(θ) = 1 + a·cos(k·θ)
 *
 * Una familia con k = 19 y otra con k = 13. Al ser primos entre sí, sus lóbulos
 * no vuelven a coincidir hasta dar la vuelta entera, y de ahí sale el tejido.
 *
 * Se genera en vez de dibujarse punto a punto por dos motivos. Uno: así los
 * parámetros quedan a la vista y se pueden mover. Y dos, el que manda — trazar
 * los veintiocho anillos como polilíneas pesaba cien kilobytes por roseta, y la
 * portada habría cargado casi un megabyte de adorno.
 */

const GREEN = "#1F4634";
const GREEN_LIGHT = "#2F6B4D";
const PAPER = "#FDFBF7";

/** El desajuste de registro del diseño: la plancha fantasma va 0,7 px corrida. */
const GHOST_OFFSET = 0.7;

const OUT = path.resolve(import.meta.dirname, "..", "public", "art");

// ─── el torno ────────────────────────────────────────────────────────────────

/**
 * Una pasada del torno: círculo rizado con `lobes` lóbulos.
 *
 * Se traza en **radio unidad** para poder reutilizarla escalada, que es lo que
 * hace un torno de verdad: la misma leva, la pieza a otra distancia.
 *
 * Ocho puntos por lóbulo bastan para que la curva se vea lisa, y tres decimales
 * sobran en una figura que luego se multiplica por ciento noventa.
 */
function unitRipple({ lobes, amplitude }) {
  const samples = lobes * 8;
  const points = [];

  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const r = 1 + amplitude * Math.cos(lobes * theta);

    points.push(`${round(r * Math.cos(theta), 3)},${round(r * Math.sin(theta), 3)}`);
  }

  return `M${points.join("L")}Z`;
}

/**
 * Una roseta: dos familias de curvas que se cruzan.
 *
 * En lugar de trazar cada anillo se define **una curva por familia** y se
 * repite escalada y girada. Cada pasada gira un poco — `twist` — y eso es lo
 * que teje el moaré; sin ese giro sólo habría anillos concéntricos.
 *
 * `vector-effect="non-scaling-stroke"` es lo que mantiene el pelo en 0,4 px
 * pase lo que pase con la escala. Sin él, un anillo escalado por 190 tendría un
 * trazo de 76 píxeles.
 */
function rosette({
  id,
  inner,
  outer,
  rings,
  lobesA = 19,
  lobesB = 13,
  amplitude,
  width = 0.4,
}) {
  const uses = [];

  for (let i = 0; i < rings; i++) {
    const t = rings === 1 ? 0 : i / (rings - 1);
    const radius = round(inner + (outer - inner) * t, 2);
    const twist = round(t * 180, 1);

    uses.push(`<use href="#${id}a" transform="rotate(${twist}) scale(${radius})"/>`);
    uses.push(`<use href="#${id}b" transform="rotate(${-twist}) scale(${radius})"/>`);
  }

  const relative = amplitude / outer;

  return (
    `<path id="${id}a" d="${unitRipple({ lobes: lobesA, amplitude: relative })}" vector-effect="non-scaling-stroke"/>` +
    `<path id="${id}b" d="${unitRipple({ lobes: lobesB, amplitude: -relative })}" vector-effect="non-scaling-stroke"/>` +
    `<g id="${id}" fill="none" stroke-width="${width}">${uses.join("")}</g>`
  );
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

// ─── envoltorios ─────────────────────────────────────────────────────────────

function svg({ width, height, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

/**
 * La misma pieza dos veces: la de abajo desplazada y en verde claro.
 *
 * Es el desajuste de registro que pide el diseño — una plancha mal calzada. Va
 * primero para que la tinta buena caiga encima. Cuesta cien bytes porque es un
 * `<use>` y no una copia.
 */
function withGhost({ id, x, y, color = GREEN }) {
  return (
    `<use href="#${id}" transform="translate(${x + GHOST_OFFSET},${y + GHOST_OFFSET})" stroke="${GREEN_LIGHT}" opacity=".5"/>` +
    `<use href="#${id}" transform="translate(${x},${y})" stroke="${color}"/>`
  );
}

// ─── la bóveda ───────────────────────────────────────────────────────────────

/**
 * La «A» como arco de bóveda, en el espacio de 128 del diseño original.
 *
 * Dos machones, un dintel y el interior grabado a líneas que se cierran hacia
 * el suelo. La geometría es la del icono de 32 píxeles, que sí llegó entero.
 */
function vault({ color = GREEN, hatch = true, clipId = "v" }) {
  const lines = [];

  if (hatch) {
    for (let y = 30; y <= 106; y += 4) {
      const opacity = (0.16 + ((y - 30) / 76) * 0.49).toFixed(2);
      lines.push(`<line x1="28" y1="${y}" x2="100" y2="${y}" opacity="${opacity}"/>`);
    }
  }

  return [
    hatch ? `<clipPath id="${clipId}"><path d="M32,106 Q64,26 96,106 Z"/></clipPath>` : "",
    hatch
      ? `<g clip-path="url(#${clipId})" stroke="${color}" stroke-width="0.55">${lines.join("")}</g>`
      : "",
    `<path d="M32,106 Q64,26 96,106" fill="none" stroke="${color}" stroke-width="0.9"/>`,
    `<g fill="${color}">`,
    `<path d="M9,110 L27,110 L70,15 L59,15 Z"/>`,
    `<path d="M119,110 L101,110 L58,15 L69,15 Z"/>`,
    `<path d="M31,72 H97 V81 H31 Z"/>`,
    `</g>`,
  ].join("");
}

// ─── las piezas ──────────────────────────────────────────────────────────────

/** La pieza de firma. Una vez por página, nunca dos. */
function heroRosette() {
  const defs = rosette({ id: "r", inner: 58, outer: 188, rings: 14, amplitude: 13 });

  return svg({
    width: 400,
    height: 400,
    body: `<defs>${defs}</defs>${withGhost({ id: "r", x: 200, y: 200 })}`,
  });
}

/** La misma, al 14 % de tinta, para ir detrás del texto. */
function watermarkRosette() {
  const defs = rosette({ id: "w", inner: 70, outer: 190, rings: 9, amplitude: 15, width: 0.6 });

  return svg({
    width: 400,
    height: 400,
    body: `<defs>${defs}</defs><use href="#w" transform="translate(200,200)" stroke="${GREEN}" opacity=".14"/>`,
  });
}

/** El símbolo: la bóveda dentro del cuño. */
function symbol(color) {
  const defs = rosette({ id: "s", inner: 50, outer: 62, rings: 4, amplitude: 2.2 });

  return svg({
    width: 128,
    height: 128,
    body:
      `<defs>${defs}</defs>` +
      `<use href="#s" transform="translate(64,64)" stroke="${color}"/>` +
      `<g transform="translate(14,12) scale(0.78)">${vault({ color })}</g>`,
  });
}

/** Icono grande: torno completo y rayado. */
function appIcon({ color, background }) {
  const defs = rosette({ id: "i", inner: 68, outer: 86, rings: 5, amplitude: 3, width: 0.6 });
  const plate = background
    ? `<rect width="180" height="180" rx="16" fill="${background}"/>`
    : "";

  return svg({
    width: 180,
    height: 180,
    body:
      `<defs>${defs}</defs>${plate}` +
      `<use href="#i" transform="translate(90,90)" stroke="${color}"/>` +
      `<g transform="translate(19,16) scale(1.1)">${vault({ color })}</g>`,
  });
}

/** El cuño: la marca de que algo quedó registrado. */
function seal() {
  const defs = rosette({ id: "c", inner: 51, outer: 58, rings: 3, amplitude: 2.4, width: 0.6 });

  return svg({
    width: 128,
    height: 128,
    body:
      `<defs>${defs}</defs>` +
      `<use href="#c" transform="translate(64,64)" stroke="${GREEN}"/>` +
      `<circle cx="64" cy="64" r="44" fill="none" stroke="${GREEN}" stroke-width="1"/>` +
      `<circle cx="64" cy="64" r="40" fill="none" stroke="${GREEN}" stroke-width="0.4" opacity=".5"/>` +
      `<g transform="translate(20,18) scale(0.53)">${vault({ hatch: false })}</g>`,
  });
}

/**
 * La banda: dos ondas de frecuencia distinta, dibujadas a varias fases.
 *
 * Es el mismo principio que la roseta, estirado en una línea.
 */
function band({ color, opacity }) {
  const paths = [];

  for (let pass = 0; pass < 5; pass++) {
    const phase = (pass / 5) * Math.PI * 2;
    const points = [];

    for (let x = 0; x <= 600; x += 6) {
      const y =
        11 +
        4.4 * Math.sin((x / 600) * Math.PI * 19 + phase) +
        2.6 * Math.sin((x / 600) * Math.PI * 13 - phase);

      points.push(`${x},${round(y)}`);
    }

    paths.push(`<path d="M${points.join("L")}"/>`);
  }

  return svg({
    width: 600,
    height: 22,
    body: `<g fill="none" stroke="${color}" stroke-width="0.5" opacity="${opacity}">${paths.join("")}</g>`,
  });
}

/** Esquina de marco de certificado. El abanico es el del diseño original. */
function corner() {
  const fan = [];

  for (let i = 0; i < 11; i++) {
    const offset = 132 - i * 6;
    const control = 16 + i * 8;
    const opacity = (0.62 - i * 0.04).toFixed(2);

    fan.push(
      `<path d="M5,${offset} Q${control},${control} ${offset},5" opacity="${opacity}"/>`,
    );
  }

  const defs = rosette({ id: "k", inner: 12, outer: 34, rings: 5, amplitude: 4, width: 0.35 });

  return svg({
    width: 140,
    height: 140,
    body:
      `<defs>${defs}</defs>` +
      `<g fill="none" stroke="${GREEN}" stroke-width="0.5">${fan.join("")}` +
      `<path d="M2,138 L2,2 L138,2" stroke-width="1"/>` +
      `<path d="M6.5,138 L6.5,6.5 L138,6.5" stroke-width="0.4" opacity=".45"/></g>` +
      `<use href="#k" transform="translate(54,54)" stroke="${GREEN}"/>`,
  });
}

/** Remate de «aquí empieza la cuenta». */
function endVignette() {
  const defs = rosette({ id: "e", inner: 6, outer: 18, rings: 4, amplitude: 2.6, width: 0.35 });

  return svg({
    width: 280,
    height: 44,
    body:
      `<defs>${defs}</defs>` +
      `<g fill="none" stroke="${GREEN}">` +
      `<line x1="0" y1="22" x2="100" y2="22" stroke-width="0.9"/>` +
      `<line x1="180" y1="22" x2="280" y2="22" stroke-width="0.9"/></g>` +
      `<use href="#e" transform="translate(140,22)" stroke="${GREEN}"/>`,
  });
}

/** Trama diagonal. Nunca detrás de una tabla de importes. */
function pattern() {
  return svg({
    width: 24,
    height: 24,
    body:
      `<g stroke="${GREEN}" stroke-width="0.5" opacity="0.16">` +
      `<line x1="0" y1="24" x2="24" y2="0"/>` +
      `<line x1="-6" y1="6" x2="6" y2="-6"/>` +
      `<line x1="18" y1="30" x2="30" y2="18"/>` +
      `</g>`,
  });
}

/**
 * El reloj de la sesión caducada.
 *
 * No es un candado ni un aviso de seguridad: es que ha pasado una hora. La
 * esfera va grabada como el resto — sesenta marcas cada seis grados, las de
 * las horas más largas, y un abanico de sombreado al 22 % que hace de sombra
 * proyectada sin usar un degradado.
 *
 * Las coordenadas salen de la trigonometría, no de una lista: es exactamente
 * como está trazado en el diseño, pero en veinte líneas en vez de ocho mil
 * caracteres.
 */
function clock() {
  const CENTER = 64;
  const marks = [];

  for (let i = 0; i < 60; i++) {
    const angle = (i * 6 * Math.PI) / 180;
    const hour = i % 5 === 0;
    const inner = hour ? 38 : 43;

    marks.push(
      `<line x1="${round(CENTER + inner * Math.cos(angle), 2)}" y1="${round(CENTER + inner * Math.sin(angle), 2)}"` +
        ` x2="${round(CENTER + 47 * Math.cos(angle), 2)}" y2="${round(CENTER + 47 * Math.sin(angle), 2)}"` +
        ` stroke-width="${hour ? 0.9 : 0.4}"/>`,
    );
  }

  // La sombra: un abanico de radios, no un degradado. Es una tinta.
  const fan = [];
  for (let i = 0; i < 72; i++) {
    const angle = (i * 5 * Math.PI) / 180;

    fan.push(
      `<line x1="${round(CENTER + 10 * Math.cos(angle), 2)}" y1="${round(CENTER + 10 * Math.sin(angle), 2)}"` +
        ` x2="${round(CENTER + 37 * Math.cos(angle), 2)}" y2="${round(CENTER + 37 * Math.sin(angle), 2)}"/>`,
    );
  }

  return svg({
    width: 128,
    height: 128,
    body:
      `<g fill="none" stroke="${GREEN}"><circle cx="64" cy="64" r="52" stroke-width="1.2"/>` +
      `<circle cx="64" cy="64" r="47" stroke-width="0.45"/></g>` +
      `<g stroke="${GREEN}" stroke-width="0.45" opacity=".6">${marks.join("")}</g>` +
      `<g stroke="${GREEN}" stroke-width="0.4" opacity=".22">${fan.join("")}</g>` +
      `<g fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="square">` +
      `<line x1="64" y1="64" x2="64" y2="34"/></g>` +
      `<g fill="none" stroke="${GREEN}" stroke-width="1.4"><line x1="64" y1="64" x2="86" y2="72"/></g>` +
      `<circle cx="64" cy="64" r="2.6" fill="${GREEN}"/>` +
      `<g fill="none" stroke="${GREEN}" stroke-width="0.9"><path d="M10,118 h108"/></g>`,
  });
}
// ─── al disco ────────────────────────────────────────────────────────────────

const pieces = {
  "rosette.svg": heroRosette,
  "rosette-watermark.svg": watermarkRosette,
  "symbol-a.svg": () => symbol(GREEN),
  "symbol-a-light.svg": () => symbol(PAPER),
  "icon-180.svg": () => appIcon({ color: GREEN, background: null }),
  "icon-180-inv.svg": () => appIcon({ color: PAPER, background: GREEN }),
  "vig-seal.svg": seal,
  "vig-end.svg": endVignette,
  "vig-clock.svg": clock,
  "band-tight.svg": () => band({ color: GREEN, opacity: 1 }),
  "band-light.svg": () => band({ color: PAPER, opacity: 0.9 }),
  "corner.svg": corner,
  "pattern.svg": pattern,
};

mkdirSync(OUT, { recursive: true });

let total = 0;

for (const [name, build] of Object.entries(pieces)) {
  const content = build();
  writeFileSync(path.join(OUT, name), content);
  total += content.length;

  console.log(`  ${name.padEnd(24)} ${(content.length / 1024).toFixed(1)} KB`);
}

console.log(
  `\n  ${Object.keys(pieces).length} piezas · ${(total / 1024).toFixed(1)} KB en total`,
);
