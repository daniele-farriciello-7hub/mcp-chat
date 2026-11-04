import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useDocumentUrl } from '@/features/documents/useDocumentUrl';

/**
 * Preview of an archived image on a checkerboard, so a transparent or white logo can be seen. Sized by
 * the caller (`className`); the picture is `object-contain`, never cropped. It asks for the file only
 * once it scrolls into view, and `openable` makes it a link to the full-size image.
 */
export default function ImageThumb({ document, className = 'h-10 w-10', openable = false }) {
  const frameRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = useDocumentUrl(document, visible);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, []);

  const Frame = openable ? 'a' : 'div';
  const linkProps =
    openable && url
      ? {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': `Apri ${document.name} a grandezza intera`
        }
      : { 'aria-hidden': true };

  return (
    <Frame
      ref={frameRef}
      {...linkProps}
      className={`thumb-checker relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line ${className}`}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Storage download URL: nothing for next/image to optimise
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageIcon size={16} className={`text-slate-soft ${visible && !failed ? 'animate-pulse' : ''}`} />
      )}
    </Frame>
  );
}
