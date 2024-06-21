const RocksDB = require('rocksdb-native')
const c = require('compact-encoding')
const { UINT } = require('index-encoder')
const RW = require('read-write-mutexify')
const m = require('./lib/messages')

const INF = Buffer.from([0xff])

const TOP_LEVEL_STORAGE_INFO = Buffer.from([0x00])
const TOP_LEVEL_CORE_INFO = Buffer.from([0x01])

const CORE_META = 0
const CORE_TREE = 1
const CORE_BLOCK = 2

const META_UPDATE = 0

const SLAB = {
  start: 0,
  end: 65536,
  buffer: Buffer.allocUnsafe(65536)
}

// PREFIX + BATCH + TYPE + INDEX

class WriteBatch {
  constructor (storage, write) {
    this.storage = storage
    this.write = write
  }

  setUpgrade (batch, upgrade) {
    this.write.tryPut(encodeBatchIndex(this.storage.authPrefix, batch, CORE_META, META_UPDATE), encodeUpgrade(upgrade))
  }

  putBlock (batch, index, data) {
    this.write.tryPut(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_BLOCK, index), data)
  }

  deleteBlock (batch, index) {
    this.write.tryDelete(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_BLOCK, index))
  }

  deleteBlockRange (batch, start, end) {
    return this._deleteRange(batch, CORE_BLOCK, start, end)
  }

  putTreeNode (batch, node) {
    this.write.tryPut(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_TREE, node.index), encodeTreeNode(node))
  }

  deleteTreeNode (batch, index) {
    this.write.tryDelete(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_TREE, index))
  }

  deleteTreeNodeRange (batch, start, end) {
    return this._deleteRange(batch, CORE_TREE, start, end)
  }

  _deleteRange (batch, type, start, end) {
    const s = encodeBatchIndex(this.storage.dataPrefix, batch, type, start)
    const e = encodeBatchIndex(this.storage.dataPrefix, batch, type, end === -1 ? Infinity : end)

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

  async getUpgrade (batch) {
    return this._get(encodeBatchIndex(this.storage.authPrefix, batch, CORE_META, META_UPDATE), m.Upgrade, false)
  }

  async hasBlock (batch, index) {
    return this._has(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_BLOCK, index))
  }

  async getBlock (batch, index, error) {
    const key = encodeBatchIndex(this.storage.dataPrefix, batch, CORE_BLOCK, index)
    const block = await this._get(key, null, error)

    if (block === null && error === true) {
      throw new Error('Node not found: ' + index)
    }

    return block
  }

  async hasTreeNode (batch, index) {
    return this._has(encodeBatchIndex(this.storage.dataPrefix, batch, CORE_TREE, index))
  }

  async getTreeNode (batch, index, error) {
    const key = encodeBatchIndex(this.storage.dataPrefix, batch, CORE_TREE, index)
    const node = await this._get(key, m.TreeNode, error)

    if (node === null && error === true) {
      throw new Error('Node not found: ' + index)
    }

    return node
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
      gt: TOP_LEVEL_CORE_INFO,
      lt: Buffer.from([TOP_LEVEL_CORE_INFO[0] + 1])
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
    b.tryDeleteRange(TOP_LEVEL_STORAGE_INFO, INF)
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
    this.discoveryKey = discoveryKey
    this.authPrefix = null
    this.dataPrefix = null
  }

  async open () {
    const val = await this.db.get(Buffer.concat([TOP_LEVEL_CORE_INFO, this.discoveryKey]))
    if (val === null) return false
    this._onopen(c.decode(m.CoreInfo, val))
    return true
  }

  async create ({ key, manifest, localKeyPair }) {
    await this.mutex.write.lock()
    try {
      const write = this.db.write()
      const info = (await getStorageInfo(this.db)) || { free: 16, total: 0 }

      const auth = info.free++
      const data = auth // separating these only relavent for re-keying

      info.total++

      write.tryPut(Buffer.concat([TOP_LEVEL_CORE_INFO, this.discoveryKey]), c.encode(m.CoreInfo, { auth, data }))
      write.tryPut(TOP_LEVEL_STORAGE_INFO, c.encode(m.StorageInfo, info))

      await write.flush()

      this._onopen({ auth, data })
    } finally {
      this.mutex.write.unlock()
    }
  }

  _onopen ({ auth, data }) {
    this.authPrefix = c.encode(UINT, auth)
    this.dataPrefix = c.encode(UINT, data)
  }

  createReadBatch () {
    return new ReadBatch(this, this.db.read())
  }

  createWriteBatch () {
    return new WriteBatch(this, this.db.write())
  }

  createTreeNodeStream (batch, opts = {}) {
    const r = encodeIndexRange(encodeBatchPrefix(this.dataPrefix, batch, CORE_TREE), opts)
    const s = this.db.iterator(r)
    s._readableState.map = mapStreamTreeNode
    return s
  }

  getUpgrade (batch) {
    const b = this.createReadBatch()
    const p = b.getUpgrade(batch)
    b.tryFlush()
    return p
  }

  hasTreeNode (batch, index) {
    const b = this.createReadBatch()
    const p = b.hasTreeNode(batch, index)
    b.tryFlush()
    return p
  }

  getTreeNode (batch, index, error) {
    const b = this.createReadBatch()
    const p = b.getTreeNode(batch, index, error)
    b.tryFlush()
    return p
  }

  async peakLastTreeNode (batch, opts = {}) {
    const last = await this.db.peek(encodeIndexRange(encodeBatchPrefix(this.dataPrefix, batch, CORE_TREE), { reverse: true }))
    if (last === null) return null
    return c.decode(m.TreeNode, last.value)
  }

  close () {
    return this.db.close()
  }
}

function mapStreamTreeNode (data) {
  return c.decode(m.TreeNode, data.value)
}

function mapOnlyDiscoveryKey (data) {
  return data.key.subarray(1)
}

async function getStorageInfo (db) {
  const value = await db.get(TOP_LEVEL_STORAGE_INFO)
  if (value === null) return null
  return c.decode(m.StorageInfo, value)
}

function ensureSlab (size) {
  if (SLAB.buffer.byteLength - SLAB.start < size) {
    SLAB.buffer = Buffer.allocUnsafe(SLAB.end)
    SLAB.start = 0
  }

  return SLAB
}

function encodeIndexRange (prefix, opts) {
  const bounded = { gt: null, gte: null, lte: null, lt: null, reverse: !!opts.reverse, limit: opts.limit || Infinity }

  if (opts.gt || opts.gt === 0) bounded.gt = encodeIndex(prefix, opts.gt)
  else if (opts.gte) bounded.gte = encodeIndex(prefix, opts.gte)
  else bounded.gte = encodeIndex(prefix, 0)

  if (opts.lt || opts.lt === 0) bounded.lt = encodeIndex(prefix, opts.lt)
  else if (opts.lte) bounded.lte = encodeIndex(prefix, opts.lte)
  else bounded.lte = Buffer.concat([prefix, INF]) // infinity

  return bounded
}

function encodeBatchPrefix (prefix, batchId, type) {
  const state = ensureSlab(128)
  const start = state.start
  state.buffer.set(prefix, start)
  state.start += prefix.byteLength
  UINT.encode(state, batchId)
  UINT.encode(state, type)
  return state.buffer.subarray(start, state.start)
}

function encodeBatchIndex (prefix, batchId, type, index) {
  const state = ensureSlab(128)
  const start = state.start
  state.buffer.set(prefix, start)
  state.start += prefix.byteLength
  UINT.encode(state, batchId)
  UINT.encode(state, type)
  UINT.encode(state, index)
  return state.buffer.subarray(start, state.start)
}

function encodeIndex (prefix, index) {
  const state = ensureSlab(128)
  const start = state.start
  state.buffer.set(prefix, start)
  state.start += prefix.byteLength
  UINT.encode(state, index)
  return state.buffer.subarray(start, state.start)
}

function encodeTreeNode (node) {
  const state = ensureSlab(64)
  const start = state.start
  m.TreeNode.encode(state, node)
  return state.buffer.subarray(start, state.start)
}

function encodeUpgrade (upgrade) {
  const state = ensureSlab(128)
  const start = state.start
  m.Upgrade.encode(state, upgrade)
  return state.buffer.subarray(start, state.start)
}
