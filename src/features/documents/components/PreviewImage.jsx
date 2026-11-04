'use client';

import { useCallback, useState } from 'react';
import { Image as ImageIcon, ImageOff } from 'lucide-react';

/**
 * The picture of an image preview, and what stands in for it: a skeleton with an image icon until the
 * bytes have actually arrived (the picture then fades in over it), a quiet "Anteprima non disponibile"
 * if they never do. `src` is null while the download URL is still being resolved, and `unavailable`
 * says it never will be.
 *
 * It fills its parent, which must be `relative` and have the size the finished preview will have, so
 * nothing moves when the picture appears. The parent keeps the checkerboard, the border and the link.
 */

// URLs whose picture has already been shown in this session. A preview that is rebuilt (its row moves
// from "Da indicizzare" to "Indicizzati", a tab is reopened, the message list re-renders) comes straight
// back as loaded instead of going through the skeleton again.
const shownUrls = new Set();

const UNAVAILABLE = 'Anteprima non disponibile';

export default function PreviewImage({
  src,
  unavailable = false,
  alt = '',
  loading,
  decoding,
  imgClassName = 'max-h-full max-w-full object-contain',
  iconSize = 16,
  caption = false,
  onError
}) {
  // what happened to one URL: tied to it, so a new URL starts over without any reset logic
  const [outcome, setOutcome] = useState({ src: null, status: 'loading' });
  const status = !src
    ? 'loading'
    : outcome.src === src
      ? outcome.status
      : shownUrls.has(src)
        ? 'loaded'
        : 'loading';

  const settle = useCallback(
    next => {
      if (!src) return;
      if (next === 'loaded') shownUrls.add(src);
      else shownUrls.delete(src);
      setOutcome(previous =>
        previous.src === src && previous.status === next ? previous : { src, status: next }
      );
    },
    [src]
  );

  // a picture served from the cache can be complete by the time the element is in the page, with its
  // load event already gone: look at the element instead of waiting for an onLoad that will not come
  const checkIfComplete = useCallback(
    node => {
      if (node?.complete && node.naturalWidth > 0) settle('loaded');
    },
    [settle]
  );

  const failed = status === 'error' || (!src && unavailable);
  const loaded = status === 'loaded';

  return (
    <>
      {src && !failed && (
        // keyed by URL: a new URL is a new element, so `complete` never describes the previous picture
        // eslint-disable-next-line @next/next/no-img-element -- a Storage download URL: nothing for next/image to optimise
        <img
          key={src}
          ref={checkIfComplete}
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          onLoad={() => settle('loaded')}
          onError={() => {
            settle('error');
            onError?.();
          }}
          className={`${imgClassName} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {failed ? (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface text-slate-soft"
          title={UNAVAILABLE}
          {...(caption ? {} : { role: 'img', 'aria-label': UNAVAILABLE })}
        >
          <ImageOff size={iconSize} />
          {caption && <span className="px-2 text-center text-[11px] leading-snug">{UNAVAILABLE}</span>}
        </span>
      ) : (
        // fades out as the picture fades in; once invisible it is no longer painted
        <span
          aria-hidden
          className={`skeleton absolute inset-0 flex items-center justify-center text-slate-soft/60 transition-[opacity,visibility] duration-300 ${
            loaded ? 'invisible opacity-0' : 'opacity-100'
          }`}
        >
          <ImageIcon size={iconSize} />
        </span>
      )}
    </>
  );
}
