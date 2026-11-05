/**
 * Icons drawn for the game in an "engraving" style: 1.6 px ink outline + flat
 * fills from the palette. 24×24 viewBox. No emoji anywhere.
 */
const INK = '#2a2035';
const s = (body: string, cls = 'ico') =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  shard: s(`<path d="M12 1.8 18.6 9 12 22.2 5.4 9z" fill="#52f0ff"/><path d="M12 1.8V22.2M5.4 9h13.2" stroke-width="1.1"/><path d="M12 1.8 18.6 9H12z" fill="#c4fbff" stroke="none"/>`),
  lumen: s(`<g stroke-width="1.4"><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></g><circle cx="12" cy="12" r="5.6" fill="#ffbe3b"/><path d="M9.4 10.6a3 3 0 0 1 2.6-1.9" stroke="#fff3cc" stroke-width="1.4"/>`),
  seed: s(`<path d="M12 2.2l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.4l-5.8 3.4 1.5-6.5-5-4.4 6.6-.6z" fill="#c59bff"/><path d="M12 2.2v14.2" stroke-width="1"/>`),
  hammer: s(`<path d="M13.2 10.8 4 20a1.7 1.7 0 0 1-2.4-2.4l9.2-9.2" fill="#d9b48a"/><path d="M10.4 5.4l3.4-3 7.8 7.8-3 3.4-2.4-2.4-2.6 2.6-3.2-3.2 2.6-2.6z" fill="#c38a3c"/><path d="M14.6 6.2l3.2 3.2" stroke-width="1.1"/>`),
  menu: s(`<path d="M5 5.5h14v13H5z" fill="#f3e6cc"/><path d="M8 9h8M8 12h8M8 15h5"/><path d="M5 5.5 3.5 4v15.5L5 18.5" fill="#c38a3c"/>`),
  close: s(`<path d="M6 6l12 12M18 6 6 18" stroke-width="2.2"/>`),
  sound: s(`<path d="M4 9.5h3.6L12.5 5v14l-4.9-4.5H4z" fill="#f3e6cc"/><path d="M15.6 9a4.5 4.5 0 0 1 0 6M18.2 6.6a8 8 0 0 1 0 10.8"/>`),
  mute: s(`<path d="M4 9.5h3.6L12.5 5v14l-4.9-4.5H4z" fill="#f3e6cc"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="#a8433a" stroke-width="2"/>`),
  lighthouse: s(`<path d="M9 9.5h6l1.7 12.5H7.3z" fill="#f4eefb"/><path d="M8.5 14h7M8.1 17.5h7.8" stroke-width="1.1"/><path d="M8.5 6.5h7v3h-7z" fill="#c38a3c"/><path d="M12 1.6 16.2 6.5H7.8z" fill="#b7a2e8"/><path d="M5 8 2 7M19 8l3-1" stroke="#c59bff"/>`),
  pick: s(`<path d="M5 20.5 14.5 11" stroke-width="2.4" stroke="#76503a"/><path d="M5 20.5 14.5 11"/><path d="M5.5 7C9 3.3 15.5 3 20 6.5c-4-.6-7.6.6-10.4 3.6z" fill="#b9bccb"/><path d="M12.6 8.8l2.6 2.6" stroke-width="2"/>`),
  drill: s(`<path d="M6 21.5 9 10.5M18 21.5 15 10.5M12 10.5v11" stroke="#c38a3c"/><path d="M6.5 4h11v6.5h-11z" fill="#f3e6cc"/><path d="M5.5 4 12 1.2 18.5 4z" fill="#3b3552"/><path d="M10 10.5h4l-2 7z" fill="#b9bccb"/><circle cx="12" cy="7.2" r="1.6" fill="#52f0ff"/>`),
  excavator: s(`<path d="M2.5 16.5h15a2.5 2.5 0 0 1 0 5h-15a2.5 2.5 0 0 1 0-5z" fill="#3b3552"/><path d="M4.5 9h9.5v7.5H4.5z" fill="#f3e6cc"/><path d="M6.5 10.8h4.5v3H6.5z" fill="#ffbe3b"/><circle cx="19.2" cy="11.5" r="3.3" fill="#b9bccb"/><path d="M19.2 8.2v6.6M15.9 11.5h6.6" stroke-width="1"/>`),
  refinery: s(`<path d="M4.5 10h11v11.5h-11z" fill="#f3e6cc"/><path d="M4.5 10a5.5 4 0 0 1 11 0z" fill="#c38a3c"/><path d="M14.5 2.5h3v8h-3z" fill="#3b3552"/><path d="M7.5 14h5v4h-5z" fill="#ffbe3b"/><path d="M19.5 4c1 1 1 2.2 0 3.2" stroke="#8c7c86"/>`),
  geyser: s(`<path d="M9.6 19C8.6 14 10.6 10 9.6 4.5c1.6 2 3.2 2 4.8 0-1 5.5 1 9.5 0 14.5z" fill="#c4fbff"/><path d="M2.5 20.5c2-2.4 17-2.4 19 0-2 1.8-17 1.8-19 0z" fill="#9e6d50"/><path d="M7 20.2c2-.9 8-.9 10 0" stroke="#52f0ff" stroke-width="2"/>`),
  prism: s(`<path d="M12 1.5l5.2 8.2L12 18.5 6.8 9.7z" fill="#fff2c4"/><path d="M12 5.5l2.4 4.2L12 14l-2.4-4.3z" fill="#52f0ff"/><path d="M7 19.5h10v3H7z" fill="#efe7f7"/>`),
  belt: s(`<path d="M3.5 13h17a3 3 0 0 1 0 6h-17a3 3 0 0 1 0-6z" fill="#3b3552"/><circle cx="6.5" cy="16" r="1.4" fill="#c38a3c"/><circle cx="12" cy="16" r="1.4" fill="#c38a3c"/><circle cx="17.5" cy="16" r="1.4" fill="#c38a3c"/><path d="M5 6.5h4.5V11H5z" fill="#52f0ff"/><path d="M13.5 6.5H18V11h-4.5z" fill="#ffbe3b"/>`),
  star: s(`<circle cx="12" cy="12" r="4.4" fill="#52f0ff"/><ellipse cx="12" cy="12" rx="10" ry="3.6" stroke="#c38a3c"/><ellipse cx="12" cy="12" rx="3.6" ry="10" transform="rotate(45 12 12)" stroke="#c38a3c"/>`),
  bridge: s(`<path d="M2 12.5q10-6.5 20 0" stroke="#76503a"/><path d="M3 13.5h3.2v6H3zM8.3 11.6h3.2v6H8.3zM13.4 11.6h3.2v6h-3.2zM18.6 13.5h3.2v6h-3.2z" fill="#a8724b"/>`),
  hand: s(`<path d="M12 2.5l6.2 7.5L12 21.5 5.8 10z" fill="#52f0ff"/><path d="M5.8 10h12.4" stroke-width="1.1"/>`),
  jump: s(`<path d="M12 3.5l7 7.5h-4v8h-6v-8H5z" fill="#f3e6cc"/>`),
  rune: s(`<path d="M12 1.8 20.5 7v10L12 22.2 3.5 17V7z" fill="#e7dcf7"/><path d="M12 6v12M8.5 9.5 12 12l3.5-2.5M9 15.5h6" stroke="#6f45b8" stroke-width="1.8"/>`),
  altar: s(`<path d="M4 21.5h16v-3H4z" fill="#c38a3c"/><path d="M6 18.5V11h12v7.5" fill="#efe7f7"/><path d="M12 2l3.5 4.5L12 11 8.5 6.5z" fill="#c59bff"/><path d="M9.5 14.5h5" stroke-width="1.2"/>`),
  book: s(`<path d="M3.5 4.5c3-1 6-1 8.5 1v15c-2.5-2-5.5-2-8.5-1z" fill="#f3e6cc"/><path d="M20.5 4.5c-3-1-6-1-8.5 1v15c2.5-2 5.5-2 8.5-1z" fill="#ead8b6"/><path d="M6 8.5c1.5-.3 3-.2 4 .3M6 11.5c1.5-.3 3-.2 4 .3" stroke-width="1.1"/>`),
  trophy: s(`<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ebbd6a"/><path d="M7 5H3.8a3.5 3.5 0 0 0 3.6 4.3M17 5h3.2a3.5 3.5 0 0 1-3.6 4.3"/><path d="M10.5 13h3v4h-3z" fill="#c38a3c"/><path d="M7.5 17h9v4h-9z" fill="#7d5321"/>`),
  meteor: s(`<path d="M3 3l9 9M7 2.5l7 7M2.5 7l7 7" stroke="#ebbd6a" stroke-width="1.4"/><circle cx="15.5" cy="15.5" r="5.5" fill="#52f0ff"/><path d="M13 14.5l2 2 3-3" stroke-width="1.2"/>`),
  lock: s(`<path d="M6 11h12v10H6z" fill="#c38a3c"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/><path d="M12 14.5v3" stroke-width="2"/>`),
  check: s(`<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.6"/>`),
  clock: s(`<circle cx="12" cy="12" r="9" fill="#f3e6cc"/><path d="M12 7v5.5l3.5 2"/>`),
  clover: s(`<path d="M12 11.5C9 4 3.5 8 8 12c-4.5 4 1 8 4-.5 3 8.5 8.5 4.5 4-.5 4.5-4-1-8-4 .5z" fill="#8fd18a"/><path d="M12 12l2.5 9.5" stroke="#3f7f43"/>`),
  bolt: s(`<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z" fill="#ebbd6a"/>`),
  fragment: s(`<path d="M12 2.5 18 7l-1.5 9.5L12 21.5 7.5 16.5 6 7z" fill="#f08cb0"/><path d="M12 2.5v19M6 7l6 4 6-4M7.5 16.5 12 11l4.5 5.5" stroke-width="1"/><path d="M12 2.5 6 7l6 4z" fill="#ffd1e1" stroke="none"/>`),
  cauldron: s(`<path d="M3.5 9.5h17l-1.6 7.2A4 4 0 0 1 15 20h-6a4 4 0 0 1-3.9-3.3z" fill="#5d4e66"/><path d="M3 9.5h18" stroke-width="2.2"/><path d="M6.5 9.5c1-1.6 2.5-1.6 3.5 0 1-1.6 2.5-1.6 3.5 0 1-1.6 2.5-1.6 3.5 0" fill="#f08cb0"/><path d="M7 20.5 6 22.5M17 20.5l1 2"/><circle cx="10" cy="5" r="1.3" fill="#f08cb0"/><circle cx="14" cy="3" r="1" fill="#f08cb0"/>`),
  moon: s(`<path d="M15.5 3.2A8.8 8.8 0 1 0 20.8 15 7 7 0 0 1 15.5 3.2z" fill="#e6dcff"/><circle cx="10" cy="10.5" r="1.3" fill="#b7a2e8" stroke="none"/><circle cx="13.5" cy="16" r="1" fill="#b7a2e8" stroke="none"/>`),
  sun: s(`<g stroke-width="1.4"><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></g><circle cx="12" cy="12" r="5.2" fill="#ffd27a"/>`),
  dice: s(`<path d="M4 6.5 12 2l8 4.5v11L12 22l-8-4.5z" fill="#efe7f7"/><path d="M4 6.5l8 4.5 8-4.5M12 11v11" stroke-width="1.2"/><circle cx="12" cy="6.5" r="1" fill="${INK}"/><circle cx="7.5" cy="13" r="1" fill="${INK}"/><circle cx="16.5" cy="13" r="1" fill="${INK}"/>`),
};

export type IconName = keyof typeof ICONS;
