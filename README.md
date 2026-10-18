# Nosotros

App web instalable para parejas a distancia (Android e iPhone), sincronizada con Firebase.

- `src/` código fuente; `sh build.sh` genera `web/` (PWA para GitHub Pages) y `dist/` (archivo único).
- `node tests/engine.test.js` pruebas del motor; `node tests/e2e.js <carpeta-capturas>` prueba con dos pestañas en modo demo.
- Sin `config.js` la app arranca en modo demo (localStorage). Con `config.js` (`window.FIREBASE_CONFIG = {...};`) usa Firestore + Auth anónima.
- Reglas de Firestore: `firestore.rules` (pegarlas en Firebase > Firestore > Reglas).
- Llamada: WebRTC con STUN de Google; para un TURN, definir `window.TURN_SERVERS = [...]` en `config.js`.
- Escape room 3D (`src/escape3d.js`): texturas, muebles y HDRI CC0 de Poly Haven en `web/assets/` (ver `web/assets/LICENSE.txt`). Si no cargan, usa texturas de canvas y primitivas. Para bajar más: añadir ids a `tools/polyhaven-wanted.json` y subirlo a una rama `claude/**` (el workflow `assets.yml` los descarga en `assets-raw/`). `node tests/tour-escape3d.js <carpeta>` saca capturas de las tres salas.
- Escape rooms para dos (`src/rooms-engine.js` motor puro, `src/rooms.js` pantallas): leen `src/rooms-data.js`, que se genera con `node design/escape-rooms/tools/slim.mjs` a partir de `design/escape-rooms/ERxx.json` y `ui/ERxx.json` (emojis y textos de cada acertijo). Para activar otro escenario: añadir su id a `PLAYABLE` en `slim.mjs`. Pruebas: `node tests/rooms.test.js` (motor, base y variantes) y `node tests/e2e-rooms.js <carpeta>` (dos pestañas juegan ER09 tocando).
