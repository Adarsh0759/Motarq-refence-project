import React from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconTruck = (p) => (<svg {...base} {...p}><path d="M1 3h13v13H1z" /><path d="M14 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="1.8" /><circle cx="17.5" cy="18.5" r="1.8" /></svg>);
export const IconBolt = (p) => (<svg {...base} {...p}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" /></svg>);
export const IconAlert = (p) => (<svg {...base} {...p}><path d="M10.3 3.9 1.8 18a1.6 1.6 0 0 0 1.4 2.4h17.6a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" /><path d="M12 9v4" /><path d="M12 16.5h.01" /></svg>);
export const IconWallet = (p) => (<svg {...base} {...p}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" /><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H16a2.5 2.5 0 0 0 0 5h5" /></svg>);
export const IconMap = (p) => (<svg {...base} {...p}><path d="M9 20 3 17V4l6 3m0 13 6-3m-6 3V7m6 10 6 3V7l-6-3m0 16V4m0 3-6-3" /></svg>);
export const IconBell = (p) => (<svg {...base} {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>);
export const IconLogout = (p) => (<svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>);
export const IconCheck = (p) => (<svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>);
export const IconChevron = (p) => (<svg {...base} {...p}><path d="m9 18 6-6-6-6" /></svg>);
export const IconShield = (p) => (<svg {...base} {...p}><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconGauge = (p) => (<svg {...base} {...p}><path d="M12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="m13.6 13.6 3.6-5.1" /><path d="M3.3 16A10 10 0 0 1 12 3a10 10 0 0 1 8.7 13" /></svg>);
export const IconUpload = (p) => (<svg {...base} {...p}><path d="M12 16V4m0 0 4 4m-4-4-4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>);
export const IconRefresh = (p) => (<svg {...base} {...p}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></svg>);
export const IconInbox = (p) => (<svg {...base} {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3.5-7Z" /></svg>);
export const IconSpinner = (p) => (<svg {...base} className="spin" {...p}><path d="M21 12a9 9 0 1 1-9-9" /></svg>);
