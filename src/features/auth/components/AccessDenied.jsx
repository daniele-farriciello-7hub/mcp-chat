export default function AccessDenied({ onSignOut }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface px-8 text-center">
      <p className="text-fs-15 text-ink">Il tuo account non è abilitato all’assistente.</p>
      <p className="max-w-[38ch] text-fs-13 text-slate-soft">
        Chiedi l’abilitazione a chi gestisce gli account della suite.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-2 rounded-xl border border-line bg-panel px-4 py-2 text-fs-14 font-medium text-ink transition hover:bg-surface"
      >
        Esci
      </button>
    </div>
  );
}
