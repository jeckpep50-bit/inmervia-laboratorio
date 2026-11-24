export const ZONES = [
  {
    id: 'head',
    name: 'Cabeza',
    text: 'Observa la forma de la cabeza, las orejas, los ojos y el hocico. La mandíbula pertenece a esta región; no está separada como hueso en este modelo.',
    prompt: 'Localiza las orejas y compara la cabeza con el cuello.',
  },
  {
    id: 'neck',
    name: 'Cuello',
    text: 'Región que une la cabeza con el tronco. En el modo articular puedes explorar un movimiento ilustrativo del cuello.',
    prompt: 'Observa cómo cambia la posición de la cabeza al mover el cuello.',
  },
  {
    id: 'shoulder',
    name: 'Región del hombro',
    text: 'Zona de transición entre el cuello, el tórax y los miembros anteriores. El resaltado representa una región superficial aproximada.',
    prompt: 'Compara el hombro con la región de la grupa.',
  },
  {
    id: 'thorax',
    name: 'Tronco',
    text: 'Parte central del cuerpo, entre las regiones del cuello y la grupa. Aquí se estudia su superficie externa; no se muestran órganos ni costillas separadas.',
    prompt: 'Gira el animal y observa el volumen del tronco desde ambos lados.',
  },
  {
    id: 'pelvis',
    name: 'Grupa',
    text: 'Región posterior del tronco, próxima a la inserción de la cola y a los miembros posteriores. El modelo no contiene una pelvis ósea independiente.',
    prompt: 'Identifica dónde comienza la cola y dónde se unen los miembros posteriores.',
  },
  {
    id: 'fore_left',
    name: 'Miembro anterior izquierdo',
    text: 'Extremidad delantera del lado izquierdo del animal. La orientación izquierda y derecha se toma desde el propio animal, no desde quien lo observa.',
    prompt: 'Compáralo con el miembro posterior del mismo lado.',
  },
  {
    id: 'fore_right',
    name: 'Miembro anterior derecho',
    text: 'Extremidad delantera del lado derecho del animal. Observa su forma y su apoyo sobre el suelo.',
    prompt: 'Colócate de frente e identifica el lado derecho del animal.',
  },
  {
    id: 'hind_left',
    name: 'Miembro posterior izquierdo',
    text: 'Extremidad trasera del lado izquierdo del animal. Observa las diferencias de forma respecto del miembro anterior.',
    prompt: 'Sigue su contorno desde la grupa hasta el extremo de apoyo.',
  },
  {
    id: 'hind_right',
    name: 'Miembro posterior derecho',
    text: 'Extremidad trasera del lado derecho del animal. En el montaje se manipula como un segmento superficial didáctico.',
    prompt: 'Compara ambos miembros posteriores al girar el animal.',
  },
  {
    id: 'tail',
    name: 'Cola',
    text: 'Apéndice situado en la parte posterior del animal. Su apariencia y distribución del pelo varían entre caballo y vaca.',
    prompt: 'Compara la cola del caballo con la de la vaca.',
  },
];
export const ANIMALS = {
  horse: {
    name: 'Caballo',
    scientific: 'Equus caballus',
    file: 'models/horse.glb',
    prefix: 'horse',
    source: 'Microsoft · MIT',
    reference: 'reference/C1.jpg',
  },
  cow: {
    name: 'Vaca',
    scientific: 'Bos taurus',
    file: 'models/cow.glb',
    prefix: 'cow',
    source: 'Microsoft · MIT',
  },
};
export const JOINTS = [
  { label: 'Cuello', suffix: 'Neck', axis: 'x' },
  { label: 'Cabeza', suffix: 'Head', axis: 'x' },
  { label: 'Miembro anterior izquierdo', suffix: 'L UpperArm', axis: 'x' },
  { label: 'Miembro posterior izquierdo', suffix: 'L Thigh', axis: 'x' },
  { label: 'Cola', suffix: 'Tail', axis: 'y' },
];
