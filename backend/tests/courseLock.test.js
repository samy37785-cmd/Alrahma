import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockCourseContent } from '../controllers/courseController.js';

// lockCourseContent is the server-side gate that stops paid course material
// (flat resources + module lesson bodies) from reaching a user without an
// active subscription. These tests prove no URL or lesson content leaks while
// the outline (titles/types) is preserved so the catalogue still renders.

const sampleCourse = {
  title: 'Tajweed',
  resources: [{ type: 'pdf', label: 'Book', url: 'https://files/book.pdf' }],
  modules: [
    {
      title: 'Module 1',
      lessons: [
        { _id: 'l1', title: 'Intro', type: 'video', duration: '10 min', url: 'https://youtu.be/secret', content: '', resources: [{ type: 'link', label: 'x', url: 'https://x' }] },
        { _id: 'l2', title: 'Notes', type: 'text', duration: '', url: '', content: '<p>secret notes</p>', resources: [] },
      ],
    },
  ],
};

test('locked course exposes no resource URLs and no lesson bodies', () => {
  const locked = lockCourseContent(sampleCourse);

  assert.equal(locked.locked, true);
  assert.deepEqual(locked.resources, []);

  const serialized = JSON.stringify(locked);
  assert.ok(!serialized.includes('youtu.be/secret'), 'lesson video URL must not leak');
  assert.ok(!serialized.includes('secret notes'), 'text lesson content must not leak');
  assert.ok(!serialized.includes('files/book.pdf'), 'flat resource URL must not leak');

  for (const m of locked.modules) {
    for (const l of m.lessons) {
      assert.equal(l.url, '');
      assert.equal(l.content, '');
      assert.deepEqual(l.resources, []);
    }
  }
});

test('locked course keeps the outline (titles + types) for display', () => {
  const locked = lockCourseContent(sampleCourse);
  assert.equal(locked.title, 'Tajweed');
  assert.equal(locked.modules[0].title, 'Module 1');
  assert.equal(locked.modules[0].lessons[0].title, 'Intro');
  assert.equal(locked.modules[0].lessons[0].type, 'video');
  assert.equal(locked.modules[0].lessons[0].duration, '10 min');
});

test('lockCourseContent does not mutate the original course', () => {
  const original = JSON.parse(JSON.stringify(sampleCourse));
  lockCourseContent(sampleCourse);
  assert.deepEqual(sampleCourse, original, 'input must be left untouched');
});

test('handles a course with no modules', () => {
  const locked = lockCourseContent({ title: 'X', resources: [{ url: 'a' }] });
  assert.deepEqual(locked.modules, []);
  assert.deepEqual(locked.resources, []);
  assert.equal(locked.locked, true);
});
