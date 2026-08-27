/** Una de las tres ideas de la portada: rombo, titular y una frase. */
export function Idea({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <img className="w-[26px]" src="/art/lozenge.svg" alt="" width={26} height={13} />
      <h2 className="mt-s1 mb-[3px] text-[17px]">{title}</h2>
      <p className="text-[12.5px] leading-[1.5] text-ink-3">{children}</p>
    </div>
  );
}
