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
