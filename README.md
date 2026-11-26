# INMERVIA · Laboratorio animal

Laboratorio de anatomía externa para secundaria con caballo y vaca, diez regiones
seleccionables, once controles de articulación ilustrativa y montaje de piezas.

**[Abrir la experiencia](https://jeckpep50-bit.github.io/inmervia-laboratorio/?v=0.4.0)**.

## Meta Quest 2 y Quest 3

Abrir el enlace directamente en Meta Quest Browser, con HTTPS, y pulsar el botón
**«Entrar en realidad mixta»**, situado encima del visor 3D. Una comprobación de
compatibilidad negativa no oculta el botón ni impide solicitar el permiso.
Si falla, «Comprobar mis gafas» muestra un diagnóstico copiable con la versión,
el estado de WebXR y el error recibido. No pide datos personales.

- Gatillo: seleccionar regiones y botones del panel.
- Agarre: mover y girar una pieza en «Montar»; soltar cerca de su silueta para encajar.
- B/Y: acercar el panel. Sus pestañas son Explorar, Montar y Aula MR.
- Aula MR: colocar sobre una superficie, reubicar, anclar durante la sesión y activar la oclusión.

El anclaje y la oclusión solicitan capacidades **opcionales**. La aplicación muestra
el estado efectivo, incluidas las funciones ausentes. La oclusión utiliza planos
o mallas reales que exponga el navegador; necesita la habitación configurada y el
permiso correspondiente. No supone que Quest 2 suministre profundidad dinámica,
ni garantiza ocultación por personas en movimiento. El ancla no persiste entre
sesiones. Si no hay superficies, sigue disponible la colocación frente al usuario
sobre el suelo de referencia de WebXR.

La entrada, seguimiento, mandos, visibilidad de textos y fluidez requieren prueba
física en Quest 2 y 3. Las comprobaciones de escritorio no certifican estas gafas.

## Explorar y montar

En MR, el tamaño está fijado al máximo anterior (1,2×). Apunta al animal con el gatillo para identificar la región. «Mostrar nombres» activa rótulos en la escena de exploración y montaje. «Ver salto» y «Ver lamida» reproducen una animación breve según el animal. Los mandos compatibles vibran al seleccionar y encajar.

Las piezas se pueden girar en tres ejes; la guía de encaje indica proximidad y
orientación. Las once articulaciones son controles de animación, no valores de
movilidad fisiológica normal. No se simulan fuerzas ni tejidos.

## Modelos y límites

La versión 0.3 utiliza bases CC0 de Grab3D, con texturas PBR de hasta 2048 px,
geometría reducida, trece huesos y diez regiones por animal. El proveedor identifica
su origen como asistido por IA. No son escaneos anatómicos validados.
Los cierres de las piezas son neutros y didácticos; se ocultan al estar montadas.
En la vaca se separan los tramos inferiores de las extremidades, con un corte
transversal por debajo del vientre. La ubre permanece con el tronco.
No representan órganos, huesos o músculos internos. Los cortes y contenidos
requieren revisión docente. C1 es una referencia visual, no el origen de un escaneo.

La meta de 8/10 en realismo, manipulación y educación exige una rúbrica y prueba
de usuario; no se considera alcanzada automáticamente por añadir funciones.
La evaluación inicial de 4/10 se conserva como línea base en `AUDITORIA.md`.
La aceptación de esta entrega se registra en `VALIDACION-MR.md`.

## Abrir y desarrollar

Requiere Node.js. `npm start` abre un servidor en http://127.0.0.1:4173 y funciona
sin instalar dependencias. La carpeta `docs/` es autónoma y se aloja mediante
GitHub Pages desde `main`; Three.js, el decodificador y los recursos son locales.

```sh
npm ci
npm run check
npm test
npm run format:check
npx playwright install chromium
npm run test:browser
```

Las dependencias son herramientas de desarrollo. `TEST_BROWSER` permite usar un
Chrome instalado y `TEST_URL` comprobar una publicación HTTPS. Sin `TEST_URL`,
las pruebas abren y cierran su servidor local. Usan un perfil temporal aislado.

`tools/build_animals.py` reproduce la adaptación en Blender 5.2 desde las bases
originales indicadas en `LICENSES.md`. `assets/src/` contiene proyectos editables;
`assets/spec.json` define sus presupuestos y `assets/review/` sus comprobaciones.
Las QA distinguen la piel ensamblada de cada pieza aislada con su cierre.
La geometría se comprime con Meshopt antes de distribuirla. Solo se representa
un animal a la vez; el rendimiento real en el visor sigue pendiente.

Tras ejecutar `tools/build_animals.py`, `tools/optimize-models.mjs` recibe como
argumento la ruta instalada de `@gltf-transform/cli` (CLI 4.3.0; SDK 4.5.1 en esta
entrega). Normaliza tangentes, conserva la fuente en `assets/cache/` y comprime
los GLB públicos. `tools/validate-models.mjs` necesita `gltf-validator` instalado
o su ruta en `GLTF_VALIDATOR_MODULE`; comprueba ambas versiones del archivo.

Los créditos completos están en `LICENSES.md` y en la página pública de créditos.
