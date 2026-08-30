/**
 * Dos apuntes que en el teléfono van uno debajo de otro y en el escritorio
 * comparten línea separados por un punto medio.
 *
 * No es que no quepan: «derivado de los movimientos · nunca almacenado» entra
 * de sobra en 338 px. Es que a 10,5 px una línea larga de versalitas apagadas
 * se lee como una sola cosa, y son dos — una dice de dónde sale la cifra y la
 * otra qué no hacemos con ella. Partirlas las devuelve a ser dos.
 *
 * El punto medio se pinta aparte y no dentro del texto porque en el teléfono no
 * existe: no es puntuación, es la junta entre las dos mitades.
 */
export function SplitNote({ first, second }: { first: string; second: string }) {
  return (
    <>
      <span className="block nav:inline">{first}</span>
      <span className="hidden nav:inline"> · </span>
      <span className="block nav:inline">{second}</span>
    </>
  );
}
