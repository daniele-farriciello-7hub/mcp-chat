'use client';

import { createContext, useContext } from 'react';

/**
 * The title of the page the sections are on, when the page already has one: the standalone configuration shows one subsection at
 * a time under its own title (SettingsPanel.jsx), and a section called the same does not say it a second time (its description
 * stays). Null (the default, and /embed) = every section keeps its title.
 */
export const PageTitleContext = createContext(null);

export default function Section({ title, description, children }) {
  const repeated = title === useContext(PageTitleContext);
  return (
    <section className="flex flex-col gap-3.5">
      {(!repeated || description) && (
        <div>
          {!repeated && (
            <h3 className="text-fs-11 font-bold uppercase tracking-[0.12em] text-brand-600">{title}</h3>
          )}
          {description && (
            <p className={`${repeated ? '' : 'mt-1 '}text-fs-11 leading-snug text-slate-soft`}>
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
