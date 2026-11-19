export default function Section({ title, description, children }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div>
        <h3 className="text-fs-11 font-bold uppercase tracking-[0.12em] text-brand-600">{title}</h3>
        {description && <p className="mt-1 text-fs-11 leading-snug text-slate-soft">{description}</p>}
      </div>
      {children}
    </section>
  );
}
