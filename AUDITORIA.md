# Evaluación de INMERVIA · Laboratorio animal

Fecha: 24 de noviembre de 2026. Alcance: código de `main`, modelos existentes,
pruebas en Chromium de escritorio y vista móvil. No hubo prueba física en Quest.

## Valoración: 4/10 de inmersión

Es una valoración técnica orientativa, con cinco dimensiones de igual peso.
No es una escala científica validada ni una medición con estudiantes.
La presencia y el confort en gafas siguen pendientes de observación directa.

| Dimensión               |              Nota | Evidencia y límite actual                                                                                                                                                                                                                 |
| ----------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realismo visual         |              3/10 | Animales reconocibles y texturizados, con geometría facetada y cortes superficiales abiertos. No hay respiración, parpadeo ni conducta animal.                                                                                            |
| Manipulación            |              6/10 | Se puede seleccionar, articular con cinco controles, separar, arrastrar, rotar y encajar. No hay manipulación anatómica validada, agarre directo con manos ni física de tejidos.                                                          |
| Integración espacial MR | 5/10, provisional | Implementa passthrough, mandos y colocación relativa al suelo. No implementa detección de superficies, anclas ni oclusión del entorno. Sin prueba física, no se certifican escala percibida, estabilidad espacial, legibilidad o confort. |
| Respuesta sensorial     |              2/10 | Hay resaltado, texto y contador de piezas. Faltan sonido espacial, narración, vibración y señales de proximidad/encaje antes de soltar.                                                                                                   |
| Actividad educativa     |              4/10 | Diez regiones, información, indicaciones y seguimiento de regiones visitadas en la sesión. Faltan retos verificables, evaluación, guía progresiva y validación docente del contenido.                                                     |

Promedio: **(3 + 6 + 5 + 2 + 4) / 5 = 4/10**.
La limpieza de código mejora la estabilidad; no equivale por sí sola a mayor realismo
o a una mejora demostrada del aprendizaje. Tampoco se convierte esta nota en una
promesa de alcanzar otra puntuación mediante una lista de funciones.

## Mejoras con mayor impacto

1. **Validar presencia y confort en las Quest disponibles.** Probar entrada/salida,
   colocación, tamaño, alcance del mando, lectura y ensamblaje. Medir la fluidez
   en las gafas y ajustar el presupuesto de render según la frecuencia real de la sesión.
   La primera entrega verificable debe ser un registro de estas pruebas.
2. **Hacer más clara la manipulación.** Añadir una previsualización del encaje,
   selección al apuntar y confirmaciones de sonido y vibración, con opción de
   desactivarlas. Reducir el peso del panel durante la exploración. Evaluar agarre
   cercano antes de añadir seguimiento de manos.
3. **Convertir la exploración en una actividad docente.** Preparar tres retos:
   identificar regiones, distinguir izquierda/derecha desde el animal y reconstruir
   segmentos. Incluir una comprobación de respuesta, explicación y cierre. Un docente
   debe validar nombres, contenidos y movimientos antes de usarlo como evaluación.
4. **Mejorar los animales y las piezas.** Usar una base de mejor calidad con licencia
   compatible o trabajar los modelos: contorno, texturas, uniones y cierres de los cortes.
   Añadir animaciones sutiles de reposo. Las fotografías aportan referencia, pero no
   garantizan una reconstrucción 3D realista ni una anatomía interna correcta.
5. **Profundizar la integración MR.** Explorar superficies detectadas, anclas y oclusión
   cuando las funciones estén disponibles en cada navegador y dispositivo. Mantener
   una colocación manual como alternativa. Son ampliaciones pendientes, no funciones
   presentes en esta versión.

Para priorizar con presupuesto cero, empezaría por la prueba de gafas, la actividad
guiada y la claridad de selección/encaje. El salto visual importante requiere trabajo
de arte 3D y revisión, además de programación.

## Depuración y limpieza realizadas

- Las cargas simultáneas del mismo animal comparten una petición y una preparación.
  El último animal solicitado es el que queda activo; un fallo antiguo no reemplaza
  una selección posterior.
- La identidad y la información se actualizan tras una carga correcta. Un error
  conserva el animal anterior y ofrece **Reintentar**, también si falla la carga inicial.
- Se validan animales, regiones, modos y valores de postura antes de modificar el estado.
- El inicio de MR solicita `local-floor`, el espacio que utiliza el renderizador.
  Si falla la vinculación con el renderizador, se intenta cerrar la sesión adquirida.
  Se evita solicitar sesiones simultáneas.
- La primera colocación espera una pose válida de un fotograma XR, en lugar de
  asumir que estará disponible después de 250 ms. Esto requiere verificación física.
- Se limita la escala relativa a 0,2–1,2 para impedir tamaños extremos por pulsaciones
  repetidas. Es un límite de interfaz, no una calibración anatómica del tamaño.
- Se restablece el estado de interacción tras cancelar un puntero o cambiar de modo.
- Se liberan controles, geometrías, materiales, texturas, esqueletos y el entorno al
  cerrar una página que no se conserva en la caché de navegación del navegador.
- Se elimina una variable sin uso y una transformación de normales que se descartaba
  inmediatamente al recalcularlas. El código propio queda formateado y con pruebas
  reproducibles. Las bibliotecas de terceros mantienen sus avisos de licencia.
- El panel móvil queda debajo del área 3D para que no tape al animal.
- El servidor local sirve SVG con su tipo correcto, admite HEAD, distingue errores
  de URL/archivo/método y resuelve los recursos desde su propia carpeta.

## Qué se comprobó y qué falta

- `npm run check`: sintaxis del código de ejecución.
- `npm test`: diez pruebas de cargas compartidas, reintento, escala, inicio/cierre
  fallido de MR y comportamiento HTTP del servidor.
- `npm run test:browser`: selección, postura, arrastre real, montaje, pantalla móvil,
  cambios rápidos, fallos de red y recuperación. Resultado en
  `assets/review/current-browser-checks.json`.
- Regresión de las interacciones existentes: `assets/review/browser-checks.json`.
- `assets/review/render-metrics.json` recoge un fotograma de escritorio: doce llamadas
  de dibujo y 3.274 triángulos visibles para el caballo. Es una observación puntual,
  no una medición de FPS en Quest ni un benchmark comparativo de rendimiento.

Los modelos siguen teniendo cero errores y diez avisos de jerarquía por archivo
en los informes glTF existentes. No se modificó su geometría en esta depuración.
Quedan pendientes la anatomía validada, el acabado realista y todas las pruebas
físicas de MR: seguimiento, agarre, referencia de suelo, escala, confort y rendimiento.

## Documentación técnica consultada

- [Three.js: liberación de recursos](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).
- [MDN: solicitud de una sesión WebXR](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession).
- [Meta: soporte de realidad mixta en el navegador](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/).
- [Meta: flujo de trabajo WebXR](https://developers.meta.com/vr/documentation/web/webxr-overview/).
