/**
 * Pixel position of a caret inside a plain `<textarea>`, relative to the textarea's own top-left
 * corner — there is no native browser API for this. Standard technique: build an offscreen mirror
 * `<div>` with the exact same font/box metrics, fill it with the text up to the caret, and read the
 * offset of a marker placed right after it. Used to anchor the "@" mention dropdown under the
 * caret instead of at a fixed spot, which breaks the moment the field has more than a couple lines.
 */
const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'tabSize'
];

export function getCaretCoordinates(textarea, position) {
  const style = window.getComputedStyle(textarea);

  const mirror = document.createElement('div');
  MIRROR_PROPS.forEach(prop => {
    mirror.style[prop] = style[prop];
  });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.height = 'auto';

  document.body.appendChild(mirror);

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  // a marker with no content collapses to zero width and mismeasures at the end of a line
  marker.textContent = textarea.value.slice(position, position + 1) || '.';
  mirror.appendChild(marker);

  const coords = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: parseFloat(style.lineHeight) || marker.offsetHeight
  };

  document.body.removeChild(mirror);
  return coords;
}
