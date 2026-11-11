import { IDENTITY, LOGO } from '../identity.js';
import { h } from '../ui.js';
export function renderAbout(root) {
  const logo = h('div', { class: 'logo-about' }); logo.innerHTML = LOGO;
  root.append(h('div', { class: 'block' }, logo, h('h1', null, 'Acerca de NetThreshold'), h('p', { class: 'lede' }, IDENTITY.about),
    h('p', null, `Proyecto del curso ${IDENTITY.course}, ${IDENTITY.university}. Autor: ${IDENTITY.team}.`),
    h('p', { class: 'hint' }, 'Es una estimación a partir de datos y de un modelo, no una garantía de capacidad.')));
}
