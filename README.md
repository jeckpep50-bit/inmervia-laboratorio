# INMERVIA · Laboratorio animal

Prototipo educativo de anatomía externa para secundaria: un caballo y una vaca
texturizados, diez regiones seleccionables por animal, información en español,
cinco controles de movimiento ilustrativo y separación/montaje de superficies.

## Abrir en computador

Requiere Node.js. Ejecutar `npm start` y abrir http://127.0.0.1:4173.
No hay dependencias que instalar: Three.js y los recursos están incluidos.
También puede alojarse la carpeta `docs/` en un servidor HTTPS estático.

## Meta Quest 2 y Quest 3

La aplicación implementa WebXR `immersive-ar`. Abrir una dirección HTTPS
compatible en el navegador de las gafas y pulsar «Entrar en realidad mixta».
El gatillo selecciona; el botón de agarre mueve las piezas en modo montaje.
La interfaz XR permite cambiar animal, región, modo, postura, tamaño y ubicación.
La colocación, el rendimiento y los mandos requieren prueba física en ambas gafas.
La comprobación de escritorio no certifica el funcionamiento en las Quest.

## Estado de alojamiento

Repositorio público, publicado con autorización de su propietario.
GitHub Pages está configurado desde `main`, carpeta `docs/`, con rutas relativas
y `.nojekyll`.

**[Abrir la experiencia](https://jeckpep50-bit.github.io/inmervia-laboratorio/)**.
La web y sus recursos son accesibles en Internet sin iniciar sesión en ChatGPT.
Las nuevas entregas de `main` se publican mediante GitHub Pages.

## Alcance y límites

Los modelos son ligeros y facetados; no son fotorrealistas ni reconstrucciones
de las fotografías. La segmentación es superficial y aproximada. Las piezas
tienen bordes abiertos: no son huesos, músculos u órganos independientes.
El esqueleto digital es un rig de animación. Los movimientos no representan
rangos fisiológicos normales. El contenido requiere revisión docente.

La imagen C1 sirve como referencia visual. C2–C9 no se distribuyen.
No hay sincronización multijugador ni registro de datos personales.

## Archivos

- `docs/`: aplicación web y recursos de ejecución, todos locales.
- `server.mjs`: servidor de demostración local.
- `assets/src/`: bases originales y proyectos Blender con texturas incorporadas.
- `assets/spec.json`: alcance y presupuesto técnico del prototipo.
- `assets/review/`: informes de comprobación de la versión de escritorio.

## Validación

Comandos de desarrollo:

```sh
npm ci
npm run check
npm test
npm run format:check
npx playwright install chromium
npm run test:browser
```

`npm start` continúa funcionando sin instalar dependencias. Las dependencias son
herramientas de desarrollo. Para usar un Chrome ya instalado en las pruebas,
definir `TEST_BROWSER` con su ruta. `TEST_URL` permite comprobar una publicación
HTTPS; sin esa variable, las pruebas abren su propio servidor local y lo cierran
al terminar. Se utiliza un perfil temporal, sin datos del navegador del usuario.

La depuración incorpora carga compartida de modelos, recuperación de errores,
límites de tamaño, inicio MR con referencia de suelo obligatoria y limpieza de
recursos al cerrar la página. Las pruebas de sesión usan dobles de prueba y no
sustituyen una prueba física de gafas. El informe de inmersión y las prioridades
de mejora están en [AUDITORIA.md](AUDITORIA.md).

La versión de escritorio pasó 55 comprobaciones funcionales y su copia autónoma
pasó otras 9 sin conexión, incluido arrastre real con puntero en ambos animales.
Los informes conservan su alcance original: ninguna prueba física de gafas.

Los archivos glTF tienen cero errores y diez avisos `NODE_SKINNED_MESH_NON_ROOT`
por modelo, derivados de la jerarquía exportada por Blender. La representación y
articulación se comprobaron en Three.js. Esa jerarquía puede limitar la portabilidad.
Se aceptan costuras UV coincidentes y bordes abiertos de la segmentación didáctica.

## Créditos

Caballo y vaca: Microsoft © 2020, licencia MIT. Copias obtenidas de
[Horse Brown](https://models.codelove.in/models/horse-brown-01/) y
[Cow Black](https://models.codelove.in/models/cow-black-01/).
Three.js 0.186.1: autores de Three.js, MIT.
Avisos completos en `docs/credits.html` y `docs/vendor/three/LICENSE`.
Logo INMERVIA e imagen C1: proporcionados por Daniel; la licencia MIT de las bases
animales no concede derechos sobre estos elementos de marca o imagen.
