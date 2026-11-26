# Aceptación de la versión 0.3

Esta entrega mejora la línea base de `AUDITORIA.md`. Una captura de escritorio o
una prueba automática no certifican una puntuación de inmersión dentro del visor.

| Área | Cambio comprobable | Aceptación pendiente |
|---|---|---|
| Acceso MR | Botón permanente encima del animal, nombre estable, intento permitido aunque la detección previa sea negativa, diagnóstico copiable. | Abrir en Meta Quest Browser y confirmar el permiso y entrada efectiva en Quest 2 y 3. |
| Realismo | Bases PBR CC0, texturas de 2048 px, sombras, encuadre por animal, respiración leve y selección localizada. | Revisión visual dentro del visor a distancia de trabajo; comprobar detalle y fluidez. |
| Manipulación | Diez piezas por animal, once movimientos ilustrativos, giro en tres ejes, guía de encaje, cierre de uniones expuestas, liberación segura de agarres. | Completar selección, agarre, giro, retirada y encaje con ambos mandos, sin bloqueos. |
| Integración espacial | Anclas durante la sesión, colocación sobre superficies horizontales detectadas, oclusores de profundidad a partir de planos o mallas reales. | Configurar habitación, verificar seguimiento al caminar y ocultación detrás de una superficie detectada. |
| Aprendizaje | Reconocimiento, orientación, montaje y cinco preguntas; explicación de errores, ayudas y descarga del resultado. | Revisión docente de regiones y lenguaje, y prueba de comprensión con estudiantes de secundaria. |

## Evidencia técnica

La revisión independiente final de las capturas aprobó apariencia y legibilidad
con **8/10**, sin mayores pendientes. Esto incluye el montaje con cortes limpios
en los tramos inferiores de las patas de la vaca. No equivale a una calificación
global de inmersión ni a validación docente. Véase `assets/review/visual-v2.md`.

La entrega pasó 20 pruebas Node, 33 comprobaciones funcionales de navegador y 56
comprobaciones de modelos y ruta educativa. Estas últimas incluyen tres puntos
de referencia geométrica para conservar la ubre con el tronco.

Los informes de `assets/review/` registran su alcance y marcan que **no se han
probado físicamente las gafas**:

- `current-browser-checks.json`: entrada MR visible, arrastre con puntero en ambos
  animales, móvil, recuperación de carga y límite de veinte grupos de geometría
  al separar todas las piezas. Se usan perfiles temporales aislados.
- `experience-checks.json`: movimientos de las once articulaciones, visibilidad
  de cierres, ruta guiada completa, puntuación con errores y ayudas, descarga
  anónima y recuperación del progreso.
- Pruebas Node: carga compartida, límites, cierre de sesiones fallidas, servidor,
  puntuación y persistencia, geometría de planos y ciclo de vida de anclas.
- `*-v2-qa.json`: ensamblado completo, cada pieza aislada y once estados de
  montaje parcial por animal. En los estados parciales, retirar el cuello o la
  grupa deja deliberadamente otras piezas suspendidas; esto se registra como
  advertencia. En piezas aisladas, los fragmentos desconectados siguen siendo
  error. Se comprueba oclusión de cierres entre vecinos para evitar z-fighting.
- `*-v2-gltf.json` y `*-v2-uncompressed-gltf.json`: validación Khronos antes y
  después de comprimir. Las diez advertencias `NODE_SKINNED_MESH_NON_ROOT` por
  animal se conservan por la jerarquía de Blender; el destino probado es Three.js.
  El validador no interpreta `EXT_meshopt_compression`; por eso también se valida
  la exportación sin comprimir y se carga la versión comprimida en el navegador.

Los UV de algunas tapas neutras exceden el intervalo 0–1; esas tapas no utilizan
texturas, y el optimizador conserva sus coordenadas sin cuantizarlas. La salida
normaliza las tangentes y repara direcciones nulas antes de comprimir.

## Qué significa alcanzar 8/10

La revisión visual independiente valora apariencia y legibilidad de las capturas
del motor. Su puntuación no se extiende a precisión clínica, desempeño educativo
o rendimiento del dispositivo. El objetivo de 8/10 para manipulación e inmersión
se mantiene pendiente hasta completar una prueba física y revisar sus resultados.

Para aceptarlo en clase, el alumno debe poder localizar las regiones pedidas,
manipular y rearmar las tres piezas, entender sus errores y leer la interfaz sin
salir de MR. Conviene observar al menos una sesión completa en cada modelo de
Quest y registrar pérdida de seguimiento, fallos de agarre y fluidez. No se han
publicado cifras de FPS de Quest a partir de los ensayos de escritorio.

La oclusión depende de los datos y permisos del navegador y del espacio
configurado. No implica ocultación dinámica de personas. El ancla no se conserva
entre sesiones. Las fotografías aportadas sirven de referencia; los modelos no
son un escaneo de esos ejemplares. Los cortes y movimientos son didácticos y no
simulan disección ni rangos fisiológicos normales.
