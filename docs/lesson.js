import { ZONES } from './zones.js?v=0.3.0';

export const LEARNING_STEPS = {
  explore: ['head', 'neck', 'thorax'],
  orient: ['fore_left', 'fore_right', 'hind_left', 'hind_right'],
  assemble: ['head', 'fore_left', 'hind_right'],
};
export const QUESTIONS = [
  {
    question: '¿Desde qué perspectiva se definen izquierda y derecha?',
    options: ['Desde el propio animal', 'Desde la persona que observa', 'Desde la cámara'],
    correct: 0,
    explanation:
      'Los lados se nombran desde el animal. De frente, su izquierda aparece a tu derecha.',
  },
  {
    question: '¿Qué región une la cabeza con el tronco?',
    options: ['La grupa', 'El cuello', 'La cola'],
    correct: 1,
    explanation: 'El cuello conecta la cabeza con el tronco.',
  },
  {
    question: '¿Dónde localizarías la grupa?',
    options: [
      'En la parte posterior del tronco',
      'En el extremo de la cabeza',
      'En el extremo del miembro anterior',
    ],
    correct: 0,
    explanation:
      'La grupa es una región posterior del tronco, próxima a la cola y los miembros posteriores.',
  },
  {
    question: '¿Qué representan las piezas de este montaje?',
    options: [
      'Órganos internos',
      'Huesos independientes',
      'Segmentos didácticos de la superficie externa',
    ],
    correct: 2,
    explanation:
      'El montaje trabaja regiones externas. Sus cortes son didácticos y no representan una disección.',
  },
  {
    question: 'Al comparar las colas del caballo y de la vaca, ¿qué puedes observar directamente?',
    options: [
      'La edad exacta',
      'La forma y la distribución del pelo',
      'El estado de sus órganos internos',
    ],
    correct: 1,
    explanation:
      'La observación externa permite comparar su apariencia; no permite deducir por sí sola la edad exacta o el estado interno.',
  },
];
const STAGES = ['explore', 'orient', 'assemble', 'quiz', 'done'];
const fresh = () => ({
  schema: 1,
  active: false,
  stage: 'explore',
  index: 0,
  score: 0,
  mistakes: 0,
  taskMistakes: 0,
  assisted: 0,
  assembled: [],
  answers: [],
  answered: false,
  feedback: 'Identifica, orienta y reconstruye antes de responder cinco preguntas.',
});
const regionName = (id) => ZONES.find((zone) => zone.id === id)?.name || id;

export class LessonSession {
  constructor(animal, storage = null) {
    this.animal = animal;
    this.storage = storage;
    this.key = 'inmervia.practice.v1.' + animal;
    this.data = fresh();
    try {
      const saved = JSON.parse(storage?.getItem(this.key) || 'null');
      if (
        saved?.schema === 1 &&
        STAGES.includes(saved.stage) &&
        Number.isInteger(saved.index) &&
        saved.index >= 0 &&
        saved.index < { explore: 3, orient: 4, assemble: 1, quiz: 5, done: 1 }[saved.stage] &&
        Number.isFinite(saved.score) &&
        saved.score >= 0 &&
        saved.score <= 100 &&
        Array.isArray(saved.assembled) &&
        Array.isArray(saved.answers)
      ) {
        this.data = {
          ...fresh(),
          ...saved,
          assembled: saved.assembled.filter((id) => LEARNING_STEPS.assemble.includes(id)),
          answers: saved.answers.slice(0, 5),
        };
      }
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }
  save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data));
    } catch {}
  }
  start() {
    if (this.data.stage === 'done') this.data = fresh();
    this.data.active = true;
    this.data.feedback =
      'Sigue la instrucción y selecciona sobre el modelo. La lista de nombres cuenta como ayuda.';
    this.save();
  }
  reset() {
    this.data = fresh();
    this.save();
  }
  expected() {
    return LEARNING_STEPS[this.data.stage]?.[this.data.index] || null;
  }
  select(id, { assisted = false } = {}) {
    if (
      !this.data.active ||
      !['explore', 'orient'].includes(this.data.stage) ||
      !ZONES.some((z) => z.id === id)
    )
      return null;
    const expected = this.expected();
    if (id !== expected) {
      this.data.mistakes++;
      this.data.taskMistakes++;
      this.data.feedback =
        'Has señalado ' +
        regionName(id) +
        '. Busca ' +
        regionName(expected) +
        '. Gira el animal y vuelve a observar.';
      this.save();
      return false;
    }
    this.data.score += assisted ? 2 : this.data.taskMistakes ? 3 : 5;
    if (assisted) this.data.assisted++;
    this.data.taskMistakes = 0;
    this.data.index++;
    this.data.feedback = 'Correcto: ' + regionName(id) + '.';
    if (this.data.index === LEARNING_STEPS[this.data.stage].length) {
      this.data.stage = this.data.stage === 'explore' ? 'orient' : 'assemble';
      this.data.index = 0;
    }
    this.save();
    return true;
  }
  assemble(id, { assisted = false } = {}) {
    if (
      !this.data.active ||
      this.data.stage !== 'assemble' ||
      !LEARNING_STEPS.assemble.includes(id) ||
      this.data.assembled.includes(id)
    )
      return null;
    this.data.assembled.push(id);
    this.data.score += assisted ? 5 : 10;
    if (assisted) this.data.assisted++;
    this.data.feedback =
      (assisted ? 'Colocada con ayuda: ' : 'Buen encaje: ') + regionName(id) + '.';
    if (this.data.assembled.length === 3) {
      this.data.stage = 'quiz';
      this.data.index = 0;
    }
    this.save();
    return true;
  }
  answer(index) {
    if (
      !this.data.active ||
      this.data.stage !== 'quiz' ||
      this.data.answered ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 2
    )
      return null;
    const question = QUESTIONS[this.data.index];
    const correct = index === question.correct;
    this.data.answered = true;
    this.data.answers.push({ question: this.data.index, option: index, correct });
    if (correct) this.data.score += 7;
    else this.data.mistakes++;
    this.data.feedback = (correct ? 'Correcto. ' : 'Repasemos. ') + question.explanation;
    this.save();
    return correct;
  }
  next() {
    if (this.data.stage !== 'quiz' || !this.data.answered) return false;
    this.data.index++;
    this.data.answered = false;
    if (this.data.index === QUESTIONS.length) {
      this.data.stage = 'done';
      this.data.active = false;
      this.data.index = 0;
      this.data.feedback =
        'Recorrido completado. Revisa tus respuestas y repite las actividades donde utilizaste ayuda.';
    }
    this.save();
    return true;
  }
  get view() {
    const d = this.data,
      question = d.stage === 'quiz' ? QUESTIONS[d.index] : null;
    const names = {
      explore: '1 · Reconoce las regiones',
      orient: '2 · Comprende la orientación',
      assemble: '3 · Reconstruye el animal',
      quiz: '4 · Comprueba lo aprendido',
      done: 'Recorrido completado',
    };
    const remaining = LEARNING_STEPS.assemble.filter((id) => !d.assembled.includes(id));
    const instruction =
      d.stage === 'quiz'
        ? question.question
        : d.stage === 'assemble'
          ? 'Encaja sin usar «Rearmar todo»: ' + remaining.map(regionName).join(', ') + '.'
          : d.stage === 'done'
            ? 'Compara ahora el otro animal y revisa tus resultados.'
            : 'Selecciona ' +
              regionName(this.expected()) +
              '.' +
              (d.stage === 'orient' ? ' Recuerda: los lados se definen desde el animal.' : '');
    const completed =
      d.stage === 'done'
        ? 15
        : d.stage === 'quiz'
          ? 10 + d.index + (d.answered ? 1 : 0)
          : d.stage === 'assemble'
            ? 7 + d.assembled.length
            : d.stage === 'orient'
              ? 3 + d.index
              : d.index;
    return {
      title: names[d.stage],
      instruction,
      progress: Math.round((completed / 15) * 100),
      question,
      feedback: d.feedback,
      score: d.score,
      mistakes: d.mistakes,
      assisted: d.assisted,
      active: d.active,
      stage: d.stage,
      answered: d.answered,
      remaining,
    };
  }
  result() {
    return {
      activity: 'INMERVIA · Anatomía externa',
      animal: this.animal,
      completed: this.data.stage === 'done',
      points: this.data.score,
      maxPoints: 100,
      mistakes: this.data.mistakes,
      assistedActions: this.data.assisted,
      answers: this.data.answers,
      createdAt: new Date().toISOString(),
      scope: 'Práctica formativa local; no es una certificación académica.',
    };
  }
}
