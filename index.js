const RocksDB = require('rocksdb-native')
const c = require('compact-encoding')
const { UINT } = require('index-encoder')
const RW = require('read-write-mutexify')
const b4a = require('b4a')
const flat = require('flat-tree')
const assert = require('nanoassert')
const m = require('./lib/messages')

const INF = b4a.from([0xff])

// <TL_INFO> = { version, free, total }
// <TL_LOCAL_SEED> = seed
// <TL_CORE_INFO><discovery-key-32-bytes> = { version, owner, core, data }

// <core><CORE_MANIFEST>        = { key, manifest? }
// <core><CORE_LOCAL_SEED>      = seed
// <core><CORE_ENCRYPTION_KEY>  = encryptionKey // should come later, not important initially
// <core><CORE_BATCHES><name>   = <data>

// <data><CORE_INFO>            = { version }
// <core><CORE_HEAD><data>      = { fork, length, byteLength, signature }
// <data><CORE_UPDATES>         = { contiguousLength, blocks }
// <data><CORE_DEPENDENCY       = { data, length, roots }
// <data><CORE_HINTS>           = { reorg } // should come later, not important initially
// <data><CORE_TREE><index>     = { index, size, hash }
// <data><CORE_BITFIELD><index> = <4kb buffer>
// <data><CORE_BLOCKS><index>   = <buffer>
// <data><CORE_USER_DATA><key>  = <value>

// top level prefixes
const TL = {
  STORAGE_INFO: 0,
  LOCAL_SEED: 1,
  DKEYS: 2,
  CORE: 3,
  DATA: 4,
  DEFAULT_KEY: 5
}

// core prefixes
const CORE = {
  MANIFEST: 0,
  LOCAL_SEED: 1,
  ENCRYPTION_KEY: 2,
  HEAD: 3,
  BATCHES: 4
}

// data prefixes
const DATA = {
  INFO: 0,
  UPDATES: 1,
  DEPENDENCY: 2,
  HINTS: 3,
  TREE: 4,
  BITFIELD: 5,
  BLOCK: 6,
  USER_DATA: 7
}

const SLAB = {
  start: 0,
  end: 65536,
  buffer: b4a.allocUnsafe(65536)
}

// PREFIX + BATCH + TYPE + INDEX

class WriteBatch {
  constructor (storage, write) {
    this.storage = storage
    this.write = write
  }

  setCoreHead (head) {
    this.write.tryPut(encodeCoreIndex(this.storage.dataPointer, CORE.HEAD), c.encode(m.CoreHead, head))
  }

  setCoreAuth ({ key, manifest }) {
    this.write.tryPut(encodeCoreIndex(this.storage.corePointer, CORE.MANIFEST), c.encode(m.CoreAuth, { key, manifest }))
  }

  setBatchPointer (name, pointer) {
    this.write.tryPut(encodeBatch(this.storage.corePointer, CORE.BATCHES, name), encode(m.DataPointer, pointer))
  }

  setDataDependency ({ data, length }) {
    this.write.tryPut(encodeDataIndex(this.storage.dataPointer, DATA.DEPENDENCY), encode(m.DataDependency, { data, length }))
  }

  setLocalKeyPair (keyPair) {
    this.write.tryPut(encodeCoreIndex(this.storage.corePointer, CORE.LOCAL_SEED), encode(m.KeyPair, keyPair))
  }

  setEncryptionKey (encryptionKey) {
    this.write.tryPut(encodeCoreIndex(this.storage.corePointer, CORE.ENCRYPTION_KEY), encryptionKey)
  }

  setDataInfo (info) {
    if (info.version !== 0) throw new Error('Version > 0 is not supported')
    this.write.tryPut(encodeDataIndex(this.storage.dataPointer, DATA.INFO), encode(m.DataInfo, info))
  }

  setUserData (key, value) {
    this.write.tryPut(encodeUserDataIndex(this.storage.dataPointer, DATA.USER_DATA, key), value)
  }

  putBlock (index, data) {
    this.write.tryPut(encodeDataIndex(this.storage.dataPointer, DATA.BLOCK, index), data)
  }

  deleteBlock (index) {
    this.write.tryDelete(encodeDataIndex(this.storage.dataPointer, DATA.BLOCK, index))
  }

  deleteBlockRange (start, end) {
    return this._deleteRange(DATA.BLOCK, start, end)
  }

  putTreeNode (node) {
    this.write.tryPut(encodeDataIndex(this.storage.dataPointer, DATA.TREE, node.index), encode(m.TreeNode, node))
  }

  deleteTreeNode (index) {
    this.write.tryDelete(encodeDataIndex(this.storage.dataPointer, DATA.TREE, index))
  }

  deleteTreeNodeRange (start, end) {
    return this._deleteRange(DATA.TREE, start, end)
  }

  putBitfieldPage (index, page) {
    this.write.tryPut(encodeDataIndex(this.storage.dataPointer, DATA.BITFIELD, index), page)
  }

  deleteBitfieldPage (index) {
    this.write.tryDelete(encodeDataIndex(this.storage.dataPointer, DATA.BITFIELD, index))
  }

  deleteBitfieldPageRange (start, end) {
    return this._deleteRange(DATA.BITFIELD, start, end)
  }

  _deleteRange (type, start, end) {
    const s = encodeDataIndex(this.storage.dataPointer, type, start)
    const e = encodeDataIndex(this.storage.dataPointer, type, end === -1 ? Infinity : end)

    return this.write.deleteRange(s, e)
  }

  flush () {
    return this.write.flush()
  }
}

class ReadBatch {
  constructor (storage, read) {
    this.storage = storage
    this.read = read
  }

  async getCoreHead () {
    return this._get(encodeCoreIndex(this.storage.dataPointer, CORE.HEAD), m.CoreHead)
  }

  async getCoreAuth () {
    return this._get(encodeCoreIndex(this.storage.corePointer, CORE.MANIFEST), m.CoreAuth)
  }

  async getLocalKeyPair () {
    return this._get(encodeCoreIndex(this.storage.corePointer, CORE.LOCAL_SEED), m.KeyPair)
  }

  async getEncryptionKey () {
    return this._get(encodeCoreIndex(this.storage.corePointer, CORE.ENCRYPTION_KEY), null)
  }

  getDataInfo (info) {
    return this._get(encodeDataIndex(this.storage.dataPointer, DATA.INFO), m.DataInfo)
  }

  getUserData (key) {
    return this._get(encodeUserDataIndex(this.storage.dataPointer, DATA.USER_DATA, key), null)
  }

  async hasBlock (index) {
    return this._has(encodeDataIndex(this.storage.dataPointer, DATA.BLOCK, index))
  }

  async getBlock (index, error) {
    const deps = this.storage.dependencies
    const dataPointer = deps.length && index < deps[0].length
      ? deps[0].data
      : this.storage.dataPointer

    const key = encodeDataIndex(dataPointer, DATA.BLOCK, index)
    const block = await this._get(key, null)

    if (block === null && error === true) {
      throw new Error('Node not found: ' + index)
    }

    return block
  }

  async hasTreeNode (index) {
    return this._has(encodeDataIndex(this.storage.dataPointer, DATA.TREE, index))
  }

  async getTreeNode (index, error) {
    const deps = this.storage.dependencies
    const dataPointer = deps.length && flat.rightSpan(index) <= deps[0].length * 2 - 2
      ? deps[0].data
      : this.storage.dataPointer

    const key = encodeDataIndex(dataPointer, DATA.TREE, index)
    const node = await this._get(key, m.TreeNode)

    if (node === null && error === true) {
      throw new Error('Node not found: ' + index)
    }

    return node
  }

  async getBitfieldPage (index) {
    const key = encodeDataIndex(this.storage.dataPointer, DATA.BITFIELD, index)
    return this._get(key, null)
  }

  async _has (key) {
    return (await this.read.get(key)) !== null
  }

  async _get (key, enc) {
    const buffer = await this.read.get(key)
    if (buffer === null) return null

    if (enc) return c.decode(enc, buffer)

    return buffer
  }

  flush () {
    return this.read.flush()
  }

  tryFlush () {
    this.read.tryFlush()
  }
}

module.exports = class CoreStorage {
  constructor (dir) {
    this.db = new RocksDB(dir)
    this.mutex = new RW()
  }

  // just a helper to make tests easier
  static async clear (dir) {
    const s = new this(dir)
    await s.clear()
    return s
  }

  info () {
    return getStorageInfo(this.db)
  }

  list () {
    const s = this.db.iterator({
      gt: b4a.from([TL.DKEYS]),
      lt: b4a.from([TL.DKEYS + 1])
    })

    s._readableState.map = mapOnlyDiscoveryKey
    return s
  }

  ready () {
    return this.db.ready()
  }

  close () {
    return this.db.close()
  }

  async clear () {
    const b = this.db.write()
    b.tryDeleteRange(b4a.from([TL.STORAGE_INFO]), INF)
    await b.flush()
  }

  get (discoveryKey) {
    return new HypercoreStorage(this.db, this.mutex, discoveryKey)
  }
}

class HypercoreStorage {
  constructor (db, mutex, discoveryKey) {
    this.db = db
    this.mutex = mutex

    this.discoveryKey = discoveryKey || null

    this.dependencies = []

    // pointers
    this.corePointer = -1
    this.dataPointer = -1
  }

  async open () {
    if (!this.discoveryKey) {
      const discoveryKey = await getDefaultKey(this.db)
      if (!discoveryKey) return null

      this.discoveryKey = discoveryKey
    }

    const val = await this.db.get(encodeDiscoveryKey(this.discoveryKey))
    if (val === null) return null

    const { core, data } = c.decode(m.CorePointer, val)

    this.corePointer = core
    this.dataPointer = data

    return this.getCoreInfo()
  }

  async create ({ key, manifest, keyPair, encryptionKey, discoveryKey }) {
    await this.mutex.write.lock()

    try {
      const existing = await this.open()

      if (existing) {
        // todo: verify key/manifest etc.
        return false
      }

      if (this.discoveryKey && discoveryKey && !b4a.equals(this.discoveryKey, discoveryKey)) {
        throw new Error('Discovery key does correspond')
      }

      if (!this.discoveryKey && !discoveryKey) {
        throw new Error('No discovery key is provided')
      }

      if (!this.discoveryKey) this.discoveryKey = discoveryKey

      if (!key) throw new Error('No key was provided')

      let info = await getStorageInfo(this.db)

      const write = this.db.write()

      if (!info) {
        write.tryPut(b4a.from([TL.DEFAULT_KEY]), this.discoveryKey)
        info = { free: 0, total: 0 }
      }

      const core = info.total++
      const data = info.free++

      write.tryPut(encodeDiscoveryKey(this.discoveryKey), encode(m.CorePointer, { core, data }))
      write.tryPut(b4a.from([TL.STORAGE_INFO]), encode(m.StorageInfo, info))

      this.corePointer = core
      this.dataPointer = data

      const batch = new WriteBatch(this, write)

      this.initialiseCoreInfo(batch, { key, manifest, keyPair, encryptionKey })
      this.initialiseCoreData(batch)

      await write.flush()
    } finally {
      this.mutex.write.unlock()
    }

    return true
  }

  async registerBatch (name, length) {
    // todo: make sure opened
    const existing = await this.db.get(encodeBatch(this.corePointer, CORE.BATCHES, name))
    const storage = new HypercoreStorage(this.db, this.mutex, this.discoveryKey)

    storage.corePointer = this.corePointer

    if (existing) {
      storage.dataPointer = c.decode(m.DataPointer, existing)
      storage.dependencies = await addDependencies(this.db, storage.dataPointer)

      return storage
    }

    await this.mutex.write.lock()

    try {
      const info = await getStorageInfo(this.db)

      const write = this.db.write()

      storage.dataPointer = info.free++

      write.tryPut(b4a.from([TL.STORAGE_INFO]), encode(m.StorageInfo, info))

      const batch = new WriteBatch(storage, write)

      this.initialiseCoreData(batch)

      batch.setDataDependency({ data: this.dataPointer, length })
      batch.setBatchPointer(name, storage.dataPointer)

      await write.flush()

      storage.dependencies = await addDependencies(this.db, storage.dataPointer)

      return storage
    } finally {
      this.mutex.write.unlock()
    }
  }

  initialiseCoreInfo (db, { key, manifest, keyPair, encryptionKey }) {
    assert(this.corePointer >= 0)

    db.setCoreAuth({ key, manifest })
    if (keyPair) db.setLocalKeyPair(keyPair)
    if (encryptionKey) db.setEncryptionKey(encryptionKey)
  }

  initialiseCoreData (db) {
    assert(this.dataPointer >= 0)

    db.setDataInfo({ version: 0 })
  }

  createReadBatch () {
    return new ReadBatch(this, this.db.read())
  }

  createWriteBatch () {
    return new WriteBatch(this, this.db.write())
  }

  createUserDataStream (opts = {}) {
    const r = encodeIndexRange(this.dataPointer, DATA.USER_DATA, opts)
    const s = this.db.iterator(r)
    s._readableState.map = mapStreamUserData
    return s
  }

  createTreeNodeStream (opts = {}) {
    const r = encodeIndexRange(this.dataPointer, DATA.TREE, opts)
    const s = this.db.iterator(r)
    s._readableState.map = mapStreamTreeNode
    return s
  }

  createBitfieldPageStream (opts = {}) {
    const r = encodeIndexRange(this.dataPointer, DATA.BITFIELD, opts)
    const s = this.db.iterator(r)
    s._readableState.map = mapStreamBitfieldPage
    return s
  }

  getCoreHead () {
    const b = this.createReadBatch()
    const p = b.getCoreHead()
    b.tryFlush()
    return p
  }

  hasTreeNode (index) {
    const b = this.createReadBatch()
    const p = b.hasTreeNode(index)
    b.tryFlush()
    return p
  }

  getCoreAuth () {
    const b = this.createReadBatch()
    const p = b.getCoreAuth()
    b.tryFlush()
    return p
  }

  getDataInfo () {
    const b = this.createReadBatch()
    const p = b.getDataInfo()
    b.tryFlush()
    return p
  }

  getUserData (key) {
    const b = this.createReadBatch()
    const p = b.getUserData(key)
    b.tryFlush()
    return p
  }

  getLocalKeyPair () {
    const b = this.createReadBatch()
    const p = b.getLocalKeyPair()
    b.tryFlush()
    return p
  }

  getEncryptionKey () {
    const b = this.createReadBatch()
    const p = b.getEncryptionKey()
    b.tryFlush()
    return p
  }

  getTreeNode (index, error) {
    const b = this.createReadBatch()
    const p = b.getTreeNode(index, error)
    b.tryFlush()
    return p
  }

  async getCoreInfo () {
    const r = this.createReadBatch()

    const auth = r.getCoreAuth()
    const localKeyPair = r.getLocalKeyPair()
    const encryptionKey = r.getEncryptionKey()
    const head = r.getCoreHead()

    await r.flush()

    return {
      auth: await auth,
      localKeyPair: await localKeyPair,
      encryptionKey: await encryptionKey,
      head: await head
    }
  }

  getBitfieldPage (index) {
    const b = this.createReadBatch()
    const p = b.getBitfieldPage(index)
    b.tryFlush()
    return p
  }

  async peakLastTreeNode () {
    const last = await this.db.peek(encodeIndexRange(this.dataPointer, DATA.TREE, { reverse: true }))
    if (last === null) return null
    return c.decode(m.TreeNode, last.value)
  }

  async peakLastBitfieldPage () {
    const last = await this.db.peek(encodeIndexRange(this.dataPointer, DATA.BITFIELD, { reverse: true }))
    if (last === null) return null
    return mapStreamBitfieldPage(last)
  }

  close () {
    return this.db.close()
  }
}

function mapStreamUserData (data) {
  const state = { start: 0, end: data.key.byteLength, buffer: data.key }

  UINT.decode(state) // TL.DATA
  UINT.decode(state) // pointer
  UINT.decode(state) // DATA.USER_DATA

  const key = c.string.decode(state)

  return { key, value: data.value }
}

function mapStreamTreeNode (data) {
  return c.decode(m.TreeNode, data.value)
}

function mapStreamBitfieldPage (data) {
  const state = { start: 0, end: data.key.byteLength, buffer: data.key }

  UINT.decode(state) // TL.DATA
  UINT.decode(state) // pointer
  UINT.decode(state) // DATA.BITFIELD

  const index = UINT.decode(state)

  return { index, page: data.value }
}

function mapOnlyDiscoveryKey (data) {
  return data.key.subarray(1)
}

async function getDefaultKey (db) {
  return db.get(b4a.from([TL.DEFAULT_KEY]))
}

async function getStorageInfo (db) {
  const value = await db.get(b4a.from([TL.STORAGE_INFO]))
  if (value === null) return null
  return c.decode(m.StorageInfo, value)
}

function ensureSlab (size) {
  if (SLAB.buffer.byteLength - SLAB.start < size) {
    SLAB.buffer = b4a.allocUnsafe(SLAB.end)
    SLAB.start = 0
  }

  return SLAB
}

function encodeIndexRange (pointer, type, opts) {
  const bounded = { gt: null, gte: null, lte: null, lt: null, reverse: !!opts.reverse, limit: opts.limit || Infinity }

  if (opts.gt || opts.gt === 0) bounded.gt = encodeDataIndex(pointer, type, opts.gt)
  else if (opts.gte) bounded.gte = encodeDataIndex(pointer, type, opts.gte)
  else bounded.gte = encodeDataIndex(pointer, type, 0)

  if (opts.lt || opts.lt === 0) bounded.lt = encodeDataIndex(pointer, type, opts.lt)
  else if (opts.lte) bounded.lte = encodeDataIndex(pointer, type, opts.lte)
  else bounded.lte = encodeDataIndex(pointer, type, Infinity) // infinity

  return bounded
}

function encode (encoding, value) {
  const state = ensureSlab(128)
  const start = state.start
  encoding.encode(state, value)

  assert(state.start <= state.end)

  return state.buffer.subarray(start, state.start)
}

function encodeBatch (pointer, type, name) {
  const end = 128 + name.length
  const state = { start: 0, end, buffer: b4a.allocUnsafe(end) }
  const start = state.start
  UINT.encode(state, TL.CORE)
  UINT.encode(state, pointer)
  UINT.encode(state, type)
  c.string.encode(state, name)

  return state.buffer.subarray(start, state.start)
}

function encodeCoreIndex (pointer, type, index) {
  const state = ensureSlab(128)
  const start = state.start
  UINT.encode(state, TL.CORE)
  UINT.encode(state, pointer)
  UINT.encode(state, type)
  if (index !== undefined) UINT.encode(state, index)

  return state.buffer.subarray(start, state.start)
}

function encodeDataIndex (pointer, type, index) {
  const state = ensureSlab(128)
  const start = state.start
  UINT.encode(state, TL.DATA)
  UINT.encode(state, pointer)
  UINT.encode(state, type)
  if (index !== undefined) UINT.encode(state, index)

  return state.buffer.subarray(start, state.start)
}

function encodeUserDataIndex (pointer, type, key) {
  const end = 128 + key.length
  const state = { start: 0, end, buffer: b4a.allocUnsafe(end) }
  const start = state.start
  UINT.encode(state, TL.DATA)
  UINT.encode(state, pointer)
  UINT.encode(state, type)
  c.string.encode(state, key)

  return state.buffer.subarray(start, state.start)
}

function encodeDiscoveryKey (discoveryKey) {
  const state = ensureSlab(128)
  const start = state.start
  UINT.encode(state, TL.DKEYS)
  c.fixed32.encode(state, discoveryKey)
  return state.buffer.subarray(start, state.start)
}

async function addDependencies (db, dataPointer) {
  const dependencies = []

  let dep = await db.get(encodeDataIndex(dataPointer, DATA.DEPENDENCY))
  while (dep) {
    const { data, length } = c.decode(m.DataDependency, dep)
    dependencies.push({ data, length })

    dep = await db.get(encodeDataIndex(data, DATA.DEPENDENCY))
  }

  return dependencies
}
