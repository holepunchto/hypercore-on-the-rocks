const test = require('brittle')
const tmp = require('test-tmp')
const CoreStorage = require('../')

const DK_0 = Buffer.alloc(32).fill('dk0')
const DK_1 = Buffer.alloc(32).fill('dk1')
const HASH = Buffer.alloc(32).fill('hash')

test('basic', async function (t) {
  const c = await getCore(t)

  {
    const b = c.createWriteBatch()

    b.putTreeNode({
      index: 42,
      hash: HASH,
      size: 10
    })

    b.putTreeNode({
      index: 43,
      hash: HASH,
      size: 2
    })

    await b.flush()
  }

  {
    const b = c.createReadBatch()
    const node1 = b.getTreeNode(42)
    const node2 = b.getTreeNode(43)
    b.tryFlush()

    t.alike(await node1, { index: 42, hash: HASH, size: 10 })
    t.alike(await node2, { index: 43, hash: HASH, size: 2 })
  }
})

test('delete nodes', async function (t) {
  const c = await getCore(t)

  {
    const b = c.createWriteBatch()

    b.putTreeNode({
      index: 10244242,
      hash: HASH,
      size: 10
    })

    await b.flush()
  }

  {
    const b = c.createReadBatch()
    const node = b.getTreeNode(10244242)
    b.tryFlush()

    t.alike(await node, { index: 10244242, hash: HASH, size: 10 })
  }

  {
    const b = c.createWriteBatch()

    b.deleteTreeNode(10244242)

    await b.flush()
  }

  {
    const b = c.createReadBatch()
    const node = b.getTreeNode(10244242)
    b.tryFlush()

    t.is(await node, null)
  }
})

test('delete tree node range', async function (t) {
  const c = await getCore(t)

  {
    let index = 10244242

    const b = c.createWriteBatch()

    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })

    await b.flush()
  }

  {
    let index = 10244242

    const b = c.createReadBatch()

    const node1 = b.getTreeNode(index++)
    const node2 = b.getTreeNode(index++)
    const node3 = b.getTreeNode(index++)
    const node4 = b.getTreeNode(index++)
    b.tryFlush()

    t.alike(await node1, { index: 10244242, hash: HASH, size: 10 })
    t.alike(await node2, { index: 10244243, hash: HASH, size: 10 })
    t.alike(await node3, { index: 10244244, hash: HASH, size: 10 })
    t.alike(await node4, { index: 10244245, hash: HASH, size: 10 })
  }

  {
    const b = c.createWriteBatch()

    b.deleteTreeNodeRange(10244242, 10244246)

    await b.flush()
  }

  {
    let index = 10244242

    const b = c.createReadBatch()

    const node1 = b.getTreeNode(index++)
    const node2 = b.getTreeNode(index++)
    const node3 = b.getTreeNode(index++)
    const node4 = b.getTreeNode(index++)
    b.tryFlush()

    t.alike(await node1, null)
    t.alike(await node2, null)
    t.alike(await node3, null)
    t.alike(await node4, null)
  }
})

test('delete tree node range: no end', async function (t) {
  const c = await getCore(t)

  {
    let index = 10244242

    const b = c.createWriteBatch()

    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })
    b.putTreeNode({ index: index++, hash: HASH, size: 10 })

    await b.flush()
  }

  {
    let index = 10244242

    const b = c.createReadBatch()

    const node1 = b.getTreeNode(index++)
    const node2 = b.getTreeNode(index++)
    const node3 = b.getTreeNode(index++)
    const node4 = b.getTreeNode(index++)
    b.tryFlush()

    t.alike(await node1, { index: 10244242, hash: HASH, size: 10 })
    t.alike(await node2, { index: 10244243, hash: HASH, size: 10 })
    t.alike(await node3, { index: 10244244, hash: HASH, size: 10 })
    t.alike(await node4, { index: 10244245, hash: HASH, size: 10 })
  }

  {
    const b = c.createWriteBatch()

    b.deleteTreeNodeRange(10244242, -1)

    await b.flush()
  }

  {
    let index = 10244242

    const b = c.createReadBatch()

    const node1 = b.getTreeNode(index++)
    const node2 = b.getTreeNode(index++)
    const node3 = b.getTreeNode(index++)
    const node4 = b.getTreeNode(index++)
    b.tryFlush()

    t.alike(await node1, null)
    t.alike(await node2, null)
    t.alike(await node3, null)
    t.alike(await node4, null)
  }
})

test('peek last tree node', async function (t) {
  const c = await getCore(t)

  {
    const b = c.createWriteBatch()

    b.putTreeNode({
      index: 10000000,
      hash: HASH,
      size: 10
    })

    b.putTreeNode({
      index: 1,
      hash: HASH,
      size: 10
    })

    b.putTreeNode({
      index: 10,
      hash: HASH,
      size: 10
    })

    await b.flush()
  }

  {
    const node = await c.peekLastTreeNode()
    t.alike(await node, { index: 10000000, hash: HASH, size: 10 })
  }
})

test('put blocks', async function (t) {
  const c = await getCore(t)

  const data = Buffer.alloc(32, 1)

  {
    const b = c.createWriteBatch()

    b.putBlock(10244242, data)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const has = b.hasBlock(10244242)
    const node = b.getBlock(10244242)
    const treeNode = b.getTreeNode(10244242)
    b.tryFlush()

    t.alike(await has, true)
    t.alike(await node, data)
    t.alike(await treeNode, null)
  }

  {
    const b = c.createWriteBatch()

    b.deleteBlock(10244242)

    await b.flush()
  }

  {
    const b = c.createReadBatch()
    const node = b.getBlock(10244242)
    b.tryFlush()

    t.is(await node, null)
  }
})

test('delete block range', async function (t) {
  const c = await getCore(t)

  const data1 = Buffer.alloc(32, 1)
  const data2 = Buffer.alloc(32, 2)
  const data3 = Buffer.alloc(32, 3)
  const data4 = Buffer.alloc(32, 4)

  {
    const b = c.createWriteBatch()

    b.putBlock(10244242, data1)
    b.putBlock(10244243, data2)
    b.putBlock(10244244, data3)
    b.putBlock(10244245, data4)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const node1 = b.getBlock(10244242)
    const node2 = b.getBlock(10244243)
    const node3 = b.getBlock(10244244)
    const node4 = b.getBlock(10244245)
    b.tryFlush()

    t.alike(await node1, data1)
    t.alike(await node2, data2)
    t.alike(await node3, data3)
    t.alike(await node4, data4)
  }

  {
    const b = c.createWriteBatch()

    b.deleteBlockRange(10244242, 10244246)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const node1 = b.getBlock(10244242)
    const node2 = b.getBlock(10244243)
    const node3 = b.getBlock(10244244)
    const node4 = b.getBlock(10244245)
    b.tryFlush()

    t.alike(await node1, null)
    t.alike(await node2, null)
    t.alike(await node3, null)
    t.alike(await node4, null)
  }
})

test('delete block range: no end', async function (t) {
  const c = await getCore(t)

  const data1 = Buffer.alloc(32, 1)
  const data2 = Buffer.alloc(32, 2)
  const data3 = Buffer.alloc(32, 3)
  const data4 = Buffer.alloc(32, 4)

  {
    const b = c.createWriteBatch()

    b.putBlock(10244242, data1)
    b.putBlock(10244243, data2)
    b.putBlock(10244244, data3)
    b.putBlock(10244245, data4)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const node1 = b.getBlock(10244242)
    const node2 = b.getBlock(10244243)
    const node3 = b.getBlock(10244244)
    const node4 = b.getBlock(10244245)
    b.tryFlush()

    t.alike(await node1, data1)
    t.alike(await node2, data2)
    t.alike(await node3, data3)
    t.alike(await node4, data4)
  }

  {
    const b = c.createWriteBatch()

    b.deleteBlockRange(10244243, -1)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const node1 = b.getBlock(10244242)
    const node2 = b.getBlock(10244243)
    const node3 = b.getBlock(10244244)
    const node4 = b.getBlock(10244245)
    b.tryFlush()

    t.alike(await node1, data1)
    t.alike(await node2, null)
    t.alike(await node3, null)
    t.alike(await node4, null)
  }
})

test('make two cores', async function (t) {
  const s = await getStorage(t)

  let c1 = await s.resume(DK_0)
  let c2 = s.resume(DK_1)

  if (c1 === null) c1 = await s.create({ key: DK_0, discoveryKey: DK_0 })
  if (c2 === null) c2 = await s.create({ key: DK_1, discoveryKey: DK_1 })

  t.unlike(c1.corePointer, c2.corePointer)
})

test('bitfield pages', async function (t) {
  const c = await getCore(t)

  const empty = Buffer.alloc(4096)
  const full = Buffer.alloc(4096, 0xff)

  {
    const b = c.createWriteBatch()

    b.putBitfieldPage(0, empty)
    b.putBitfieldPage(1, full)
    b.putBitfieldPage(10244243, empty)
    b.putBitfieldPage(10244244, full)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const page1 = b.getBitfieldPage(0)
    const page2 = b.getBitfieldPage(1)
    const page3 = b.getBitfieldPage(10244243)
    const page4 = b.getBitfieldPage(10244244)
    const pageNull = b.getBitfieldPage(2)
    b.tryFlush()

    t.alike(await page1, empty)
    t.alike(await page2, full)
    t.alike(await page3, empty)
    t.alike(await page4, full)
    t.alike(await pageNull, null)
  }

  t.alike(await c.peekLastBitfieldPage(), { index: 10244244, page: full })

  {
    const pages = []
    for await (const page of c.createBitfieldPageStream()) {
      pages.push(page)
    }

    t.alike(pages, [
      { index: 0, page: empty },
      { index: 1, page: full },
      { index: 10244243, page: empty },
      { index: 10244244, page: full }
    ])
  }

  {
    const b = c.createWriteBatch()

    b.deleteBitfieldPage(0)
    b.deleteBitfieldPage(1)
    b.deleteBitfieldPage(10244243)
    b.deleteBitfieldPage(10244244)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const page1 = b.getBitfieldPage(0)
    const page2 = b.getBitfieldPage(1)
    const page3 = b.getBitfieldPage(10244243)
    const page4 = b.getBitfieldPage(10244244)
    b.tryFlush()

    t.alike(await page1, null)
    t.alike(await page2, null)
    t.alike(await page3, null)
    t.alike(await page4, null)
  }

  t.alike(await c.peekLastBitfieldPage(), null)

  {
    const pages = []
    for await (const page of c.createBitfieldPageStream()) {
      pages.push(page)
    }

    t.alike(pages, [])
  }
})

test('bitfield page: delete range', async function (t) {
  const c = await getCore(t)

  const empty = Buffer.alloc(4096)
  const full = Buffer.alloc(4096, 0xff)

  {
    const b = c.createWriteBatch()

    b.putBitfieldPage(0, empty)
    b.putBitfieldPage(1, full)
    b.putBitfieldPage(10244243, empty)
    b.putBitfieldPage(10244244, full)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const page1 = b.getBitfieldPage(0)
    const page2 = b.getBitfieldPage(1)
    const page3 = b.getBitfieldPage(10244243)
    const page4 = b.getBitfieldPage(10244244)
    const pageNull = b.getBitfieldPage(2)
    b.tryFlush()

    t.alike(await page1, empty)
    t.alike(await page2, full)
    t.alike(await page3, empty)
    t.alike(await page4, full)
    t.alike(await pageNull, null)
  }

  {
    const b = c.createWriteBatch()

    b.deleteBitfieldPageRange(1, 10244244)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const page1 = b.getBitfieldPage(0)
    const page2 = b.getBitfieldPage(1)
    const page3 = b.getBitfieldPage(10244243)
    const page4 = b.getBitfieldPage(10244244)
    b.tryFlush()

    t.alike(await page1, empty)
    t.alike(await page2, null)
    t.alike(await page3, null)
    t.alike(await page4, full)
  }

  {
    const b = c.createWriteBatch()

    b.deleteBitfieldPageRange(0, -1)

    await b.flush()
  }

  {
    const b = c.createReadBatch()

    const page1 = b.getBitfieldPage(0)
    const page4 = b.getBitfieldPage(10244244)
    b.tryFlush()

    t.alike(await page1, null)
    t.alike(await page4, null)
  }

  t.alike(await c.peekLastBitfieldPage(), null)

  {
    const pages = []
    for await (const page of c.createBitfieldPageStream()) {
      pages.push(page)
    }

    t.alike(pages, [])
  }
})

test('make lots of cores in parallel', async function (t) {
  const s = await getStorage(t)
  const promises = []

  for (let i = 0; i < 1024; i++) {
    const key = Buffer.alloc(32).fill('#' + i)
    promises.push(s.create({ key, discoveryKey: key }))
  }

  await Promise.all(promises)

  const info = await s.info()
  t.is(info.total, 1024)
})

test('header', async function (t) {
  const dir = await tmp()

  const keyPair = {
    publicKey: Buffer.alloc(32, 0),
    secretKey: Buffer.alloc(64, 1)
  }

  const encryptionKey = Buffer.alloc(32, 2)

  const s1 = await getStorage(t, dir)
  const c1 = (await s1.resume(DK_0)) || (await s1.create({ key: DK_0, discoveryKey: DK_0, keyPair, encryptionKey }))

  const head = {
    fork: 1,
    length: 2,
    rootHash: Buffer.alloc(32, 0xff),
    signature: Buffer.alloc(32, 4) // signature is arbitrary length
  }

  const w = c1.createWriteBatch()
  w.setCoreHead(head)
  await w.flush()

  await s1.close()

  const s2 = await getStorage(t, dir)
  const c2 = await s2.resume(DK_0)

  t.ok(c2)

  const batch = c2.createReadBatch()
  const auth = batch.getCoreAuth()
  const kp = batch.getLocalKeyPair()
  const enc = batch.getEncryptionKey()

  await batch.flush()

  t.alike((await auth).key, DK_0)
  t.alike((await auth).manifest, null)
  t.alike(await kp, keyPair)
  t.alike(await enc, encryptionKey)
})

test('user data', async function (t) {
  const c = await getCore(t)

  {
    const b = c.createWriteBatch()

    b.setUserData('hello', Buffer.from('world'))
    b.setUserData('hej', Buffer.from('verden'))

    await b.flush()
  }

  {
    const b = c.createReadBatch()
    const data1 = b.getUserData('hello')
    const data2 = b.getUserData('hej')
    b.tryFlush()

    t.alike(await data1, Buffer.from('world'))
    t.alike(await data2, Buffer.from('verden'))
  }

  const exp = [
    { key: 'hej', value: Buffer.from('verden') },
    { key: 'hello', value: Buffer.from('world') }
  ]

  const userData = []
  for await (const e of c.createUserDataStream()) {
    userData.push(e)
  }

  t.alike(userData, exp)

  {
    const b = c.createWriteBatch()

    b.setUserData('hello', null)
    b.setUserData('hej', Buffer.from('verden'))

    await b.flush()
  }

  const batch = c.createReadBatch()
  const [a, b] = [batch.getUserData('hello'), batch.getUserData('hej')]

  await batch.flush()

  t.alike(await a, null)
  t.alike(await b, Buffer.from('verden'))
})

test('reopen default core', async function (t) {
  const dir = await tmp(t)

  const manifest = Buffer.from('manifest')
  const keyPair = {
    publicKey: Buffer.alloc(32, 2),
    secretKey: Buffer.alloc(64, 3)
  }
  const encryptionKey = Buffer.alloc(32, 4)

  const s1 = await getStorage(t, dir)
  const c1 = (await s1.resume(DK_1)) || (await s1.create({ key: DK_1, discoveryKey: DK_1, manifest, keyPair, encryptionKey }))

  await c1.close()
  await s1.close()

  const s2 = await getStorage(t, dir)
  const c2 = await s2.resume()

  t.alike(await getCoreInfo(c2), {
    auth: {
      key: DK_1,
      manifest
    },
    keyPair,
    encryptionKey,
    head: null
  })

  t.alike(c2.discoveryKey, DK_1)
})

test('large manifest', async function (t) {
  const dir = await tmp(t)

  const manifest = Buffer.alloc(1000, 0xff)
  const keyPair = {
    publicKey: Buffer.alloc(32, 2),
    secretKey: Buffer.alloc(64, 3)
  }
  const encryptionKey = Buffer.alloc(32, 4)

  const s1 = await getStorage(t, dir)
  const c1 = (await s1.resume(DK_1)) || (await s1.create({ key: DK_1, discoveryKey: DK_1, manifest, keyPair, encryptionKey }))

  await c1.close()
  await s1.close()

  const s2 = await getStorage(t, dir)
  const c2 = await s2.resume(DK_1)

  t.alike(await getCoreInfo(c2), {
    auth: {
      key: DK_1,
      manifest
    },
    keyPair,
    encryptionKey,
    head: null
  })

  t.alike(c2.discoveryKey, DK_1)
})

test('idle', async function (t) {
  const s = await getStorage(t)
  const c = await getCore(t, s)

  t.ok(s.isIdle())

  {
    const b = c.createWriteBatch()

    t.absent(s.isIdle())

    b.putTreeNode({
      index: 42,
      hash: HASH,
      size: 10
    })

    b.putTreeNode({
      index: 43,
      hash: HASH,
      size: 2
    })

    const idle = s.idle()

    await b.flush()

    await t.execution(idle)

    t.ok(s.isIdle())
  }

  {
    let idle = false

    const b1 = c.createReadBatch()
    const b2 = c.createReadBatch()
    const b3 = c.createReadBatch()

    const node1 = b1.getTreeNode(42)
    const node2 = b2.getTreeNode(43)
    const node3 = b3.getTreeNode(44)

    const promise = s.idle().then(() => { idle = true })

    b1.tryFlush()

    t.absent(idle)
    t.absent(s.isIdle())

    b2.tryFlush()

    t.absent(idle)
    t.absent(s.isIdle())

    b3.tryFlush()

    await t.execution(promise)

    t.ok(idle)
    t.ok(s.isIdle())

    t.alike(await node1, { index: 42, hash: HASH, size: 10 })
    t.alike(await node2, { index: 43, hash: HASH, size: 2 })
    t.alike(await node3, null)
  }
})

async function getStorage (t, dir) {
  if (!dir) dir = await tmp(t)
  const s = new CoreStorage(dir)

  t.teardown(() => s.close())

  return s
}

async function getCore (t, s) {
  if (!s) s = await getStorage(t)

  const c = await s.resume(DK_0)
  t.is(c, null)

  return await s.create({ key: DK_0, discoveryKey: DK_0 })
}

async function getCoreInfo (storage) {
  const r = storage.createReadBatch()

  const auth = r.getCoreAuth()
  const localKeyPair = r.getLocalKeyPair()
  const encryptionKey = r.getEncryptionKey()
  const head = r.getCoreHead()

  await r.flush()

  return {
    auth: await auth,
    keyPair: await localKeyPair,
    encryptionKey: await encryptionKey,
    head: await head
  }
}
