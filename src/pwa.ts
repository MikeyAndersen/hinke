// Registrerer service workeren. Astro injicerer ikke scriptet automatisk,
// så det importeres fra app-shell-layoutet.
import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onOfflineReady() {
    // App-shellen er cachet — montøren kan nu bruge app'en uden net.
    document.dispatchEvent(new CustomEvent('pwa:offline-ready'));
  },
});
