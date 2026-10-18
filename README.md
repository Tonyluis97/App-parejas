# Nosotros

App web instalable para parejas a distancia (Android e iPhone), sincronizada con Firebase.

- `src/` código fuente; `sh build.sh` genera `web/` (PWA para GitHub Pages) y `dist/` (archivo único).
- `node tests/engine.test.js` pruebas del motor; `node tests/e2e.js <carpeta-capturas>` prueba con dos pestañas en modo demo.
- Sin `config.js` la app arranca en modo demo (localStorage). Con `config.js` (`window.FIREBASE_CONFIG = {...};`) usa Firestore + Auth anónima.
- Reglas de Firestore: `firestore.rules` (pegarlas en Firebase > Firestore > Reglas).
- Llamada: WebRTC con STUN de Google; para un TURN, definir `window.TURN_SERVERS = [...]` en `config.js`.
