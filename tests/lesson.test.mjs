import test from 'node:test';
import assert from 'node:assert/strict';
import { LessonSession, LEARNING_STEPS, QUESTIONS } from '../docs/lesson.js';
const reachAssembly = (lesson) => {
  lesson.start();
  for (const stage of ['explore', 'orient'])
    for (const id of LEARNING_STEPS[stage]) lesson.select(id);
};
test('guided practice includes exploration, orientation, assembly and assessment', () => {
  const lesson = new LessonSession('horse');
  reachAssembly(lesson);
  assert.equal(lesson.view.stage, 'assemble');
  for (const id of LEARNING_STEPS.assemble) lesson.assemble(id);
  for (const q of QUESTIONS) {
    assert.equal(lesson.answer(q.correct), true);
    lesson.next();
  }
  assert.equal(lesson.view.stage, 'done');
  assert.equal(lesson.view.progress, 100);
  assert.equal(lesson.view.score, 100);
  assert.equal(lesson.result().completed, true);
});
test('wrong and assisted selections receive feedback and less credit', () => {
  const lesson = new LessonSession('cow');
  lesson.start();
  assert.equal(lesson.select('tail'), false);
  assert.equal(lesson.select('head'), true);
  lesson.select('neck', { assisted: true });
  assert.equal(lesson.view.score, 5);
  assert.equal(lesson.view.mistakes, 1);
  assert.equal(lesson.view.assisted, 1);
});
test('repeated encajes and answers do not inflate practice points', () => {
  const lesson = new LessonSession('horse');
  reachAssembly(lesson);
  lesson.assemble('head', { assisted: true });
  const score = lesson.view.score;
  lesson.assemble('head');
  assert.equal(lesson.view.score, score);
  lesson.assemble('fore_left');
  lesson.assemble('hind_right');
  lesson.answer(0);
  const answeredScore = lesson.view.score;
  lesson.answer(0);
  assert.equal(lesson.view.score, answeredScore);
});
test('practice persists per animal and still works when storage is denied', () => {
  const data = new Map(),
    storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const lesson = new LessonSession('horse', storage);
  lesson.start();
  lesson.select('head');
  assert.equal(new LessonSession('horse', storage).expected(), 'neck');
  assert.equal(new LessonSession('cow', storage).view.active, false);
  assert.doesNotThrow(() => {
    const denied = new LessonSession('cow', {
      getItem() {
        throw Error('denied');
      },
      setItem() {
        throw Error('denied');
      },
    });
    denied.start();
    denied.select('head');
  });
});
test('reset clears practice and incorrect quiz answers explain the concept', () => {
  const lesson = new LessonSession('cow');
  reachAssembly(lesson);
  for (const id of LEARNING_STEPS.assemble) lesson.assemble(id);
  assert.equal(lesson.answer(1), false);
  assert.match(lesson.view.feedback, /desde el animal/);
  lesson.reset();
  assert.equal(lesson.view.score, 0);
  assert.equal(lesson.view.active, false);
});
