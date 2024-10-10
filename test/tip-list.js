const test = require('brittle')
const b4a = require('b4a')
const TipList = require('../lib/tip-list')

test('tip list - write + read', async function (t) {
  const tip = new TipList()

  tip.put(0, b4a.from('hello'))
  tip.put(1, b4a.from('world'))

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), b4a.from('world'))
})

test('tip list - merge', async function (t) {
  const tip = new TipList()

  const w = new TipList()
  w.put(0, b4a.from('hello'))
  w.put(1, b4a.from('world'))

  tip.merge(w)

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), b4a.from('world'))
})

test('tip list - multiple merge', async function (t) {
  const tip = new TipList()

  {
    const w = new TipList()
    w.put(0, b4a.from('hello'))
    w.put(1, b4a.from('world'))
    tip.merge(w)
  }

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), b4a.from('world'))

  {
    const w = new TipList()
    w.put(2, b4a.from('goodbye'))
    w.put(3, b4a.from('test'))
    tip.merge(w)
  }

  t.alike(tip.get(2), b4a.from('goodbye'))
  t.alike(tip.get(3), b4a.from('test'))
})

test('tip list - overwrite merge', async function (t) {
  const tip = new TipList()
  tip.put(0, b4a.from('hello'))
  tip.put(1, b4a.from('world'))

  {
    const w = new TipList()
    w.put(0, b4a.from('goodbye'))
    w.put(1, b4a.from('test'))
    tip.merge(w)
  }

  t.alike(tip.get(0), b4a.from('goodbye'))
  t.alike(tip.get(1), b4a.from('test'))
})

test('tip list - write + read with offset', async function (t) {
  const tip = new TipList()
  tip.put(3, null)

  const w = new TipList()
  w.put(3, b4a.from('hello'))
  w.put(4, b4a.from('world'))
  tip.merge(w)

  t.alike(tip.get(0), null)
  t.alike(tip.get(3), b4a.from('hello'))
  t.alike(tip.get(4), b4a.from('world'))
})

test('tip list - multiple merges with offset', async function (t) {
  const tip = new TipList()
  tip.put(5, null)

  {
    const w = new TipList()
    w.put(5, b4a.from('hello'))
    w.put(6, b4a.from('world'))
    tip.merge(w)
  }

  {
    const w = new TipList()
    w.put(7, b4a.from('goodbye'))
    w.put(8, b4a.from('test'))
    tip.merge(w)
  }

  t.alike(tip.get(5), b4a.from('hello'))
  t.alike(tip.get(6), b4a.from('world'))
  t.alike(tip.get(7), b4a.from('goodbye'))
  t.alike(tip.get(8), b4a.from('test'))
})

test('tip list - overwrite merge with offset', async function (t) {
  const tip = new TipList()

  tip.put(3, b4a.from('hello'))
  tip.put(4, b4a.from('world'))

  const w = new TipList()
  w.put(3, b4a.from('goodbye'))
  w.put(4, b4a.from('test'))
  tip.merge(w)

  t.alike(tip.get(0), null)
  t.alike(tip.get(3), b4a.from('goodbye'))
  t.alike(tip.get(4), b4a.from('test'))
})

test('tip list - deletion', async function (t) {
  const tip = new TipList()

  tip.put(0, b4a.from('hello'))
  tip.put(1, b4a.from('world'))
  tip.put(2, b4a.from('goodbye'))

  tip.delete(1, 10)

  t.exception(() => tip.put(2, b4a.from('fail')), 'no put after deletion')

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), null)
  t.alike(tip.get(2), null)
})

test('tip list - deletion merge', async function (t) {
  const tip = new TipList()

  tip.put(0, b4a.from('hello'))
  tip.put(1, b4a.from('world'))
  tip.put(2, b4a.from('goodbye'))

  {
    const w = new TipList()
    w.delete(1, 10)

    t.exception(() => w.put(2, b4a.from('fail')), 'no put after deletion')

    tip.merge(w)
  }

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), null)
  t.alike(tip.get(2), null)
})

test('tip list - deletion on put batch', async function (t) {
  const tip = new TipList()

  {
    const w = new TipList()
    w.put(0, b4a.from('hello'))
    w.put(1, b4a.from('world'))
    w.put(2, b4a.from('goodbye'))
    w.delete(2, 10)
    tip.merge(w)
  }

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), b4a.from('world'))
  t.alike(tip.get(2), null)
})

test('tip list - deletion with offset', async function (t) {
  const tip = new TipList()
  tip.put(4, b4a.from('hello'))
  tip.put(5, b4a.from('world'))
  tip.put(6, b4a.from('goodbye'))

  {
    const w = new TipList()
    w.delete(5, 10)
    tip.merge(w)
  }

  t.alike(tip.get(4), b4a.from('hello'))
  t.alike(tip.get(5), null)
  t.alike(tip.get(6), null)
})

test('tip list - overlap deletions in batch', async function (t) {
  const tip = new TipList()
  tip.put(0, b4a.from('hello'))
  tip.put(1, b4a.from('world'))
  tip.put(2, b4a.from('goodbye'))
  tip.put(3, b4a.from('test'))

  {
    const w = new TipList()
    w.delete(3, 4)
    w.delete(2, 3)
    w.delete(1, 2)
    tip.merge(w)
  }

  t.alike(tip.get(0), b4a.from('hello'))
  t.alike(tip.get(1), null)
  t.alike(tip.get(2), null)
  t.alike(tip.get(3), null)
})

test('tip list - overlap deletions in batch with offset', async function (t) {
  const tip = new TipList()
  tip.put(5, b4a.from('hello'))
  tip.put(6, b4a.from('world'))
  tip.put(7, b4a.from('goodbye'))
  tip.put(8, b4a.from('test'))

  {
    const w = new TipList()
    w.delete(8, 10)
    w.delete(7, 8)
    w.delete(6, 7)
    tip.merge(w)
  }

  t.alike(tip.get(5), b4a.from('hello'))
  t.alike(tip.get(6), null)
  t.alike(tip.get(7), null)
  t.alike(tip.get(8), null)
})

test('tip list - invalid deletion', async function (t) {
  const tip = new TipList()
  tip.put(4, b4a.from('hello'))
  tip.put(5, b4a.from('world'))
  tip.put(6, b4a.from('goodbye'))

  await t.exception(() => tip.delete(0, 2))
  await t.exception(() => tip.delete(8, 10))

  {
    const w = new TipList()
    w.delete(0, 2)
    t.exception(() => tip.merge(w))
  }

  {
    const w = new TipList()
    w.delete(8, 10)
    t.exception(() => tip.merge(w))
  }

  t.alike(tip.get(4), b4a.from('hello'))
  t.alike(tip.get(5), b4a.from('world'))
  t.alike(tip.get(6), b4a.from('goodbye'))
})

test('tip list - put before offset', async function (t) {
  const tip = new TipList()
  tip.put(100000, b4a.from('hello'))

  {
    const b = new TipList()
    b.put(1, b4a.from('world'))
    await t.exception(() => tip.merge(b))
  }

  {
    const b = new TipList()
    b.put(10, b4a.from('goodbye'))
    await t.exception(() => tip.merge(b))
  }
})
