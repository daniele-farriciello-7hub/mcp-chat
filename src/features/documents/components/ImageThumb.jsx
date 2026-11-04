import { useEffect, useRef, useState } from 'react';
import { useDocumentUrl } from '@/features/documents/useDocumentUrl';
import PreviewImage from './PreviewImage';

/**
 * Preview of an archived image on a checkerboard, so a transparent or white logo can be seen. Sized by
 * the caller (`className`); the picture is `object-contain`, never cropped. It asks for the file only
 * once it scrolls into view, and `openable` makes it a link to the full-size image. Until the picture
 * has really loaded (URL still being resolved included) a skeleton with an image icon fills the frame;
 * if it cannot be had, the frame says so quietly (`caption`: in words, for a frame big enough to hold them).
 */
export default function ImageThumb({ document, className = 'h-10 w-10', openable = false, caption = false }) {
  const frameRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState(null);
  const { url, failed: urlFailed } = useDocumentUrl(document, visible);

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
    openable && url && brokenUrl !== url
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
      <PreviewImage
        src={url}
        unavailable={urlFailed}
        loading="lazy"
        decoding="async"
        imgClassName="h-full w-full object-contain"
        caption={caption}
        onError={() => setBrokenUrl(url)}
      />
    </Frame>
  );
}
