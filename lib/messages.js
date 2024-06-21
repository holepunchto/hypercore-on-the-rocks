const c = require('compact-encoding')

const KeyPair = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.publicKey)
    c.fixed32.preencode(state, m.secretKey)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.publicKey)
    c.fixed32.encode(state, m.secretKey)
  },
  decode (state) {
    return {
      publicKey: c.fixed32.decode(state),
      secretKey: c.fixed32.decode(state)
    }
  }
}

exports.StorageInfo = {
  preencode (state, m) {
    c.uint.preencode(state, 0) // version
    c.uint.preencode(state, 0) // flags, reserved
    c.uint.preencode(state, m.free)
    c.uint.preencode(state, m.total)
  },
  encode (state, m) {
    c.uint.encode(state, 0) // version
    c.uint.encode(state, 0) // flags, reserved
    c.uint.encode(state, m.free)
    c.uint.encode(state, m.total)
  },
  decode (state, m) {
    const v = c.uint.decode(state)
    if (v !== 0) throw new Error('Invalid version: ' + v)

    c.uint.decode(state) // flags, ignore

    return {
      free: c.uint.decode(state),
      total: c.uint.decode(state)
    }
  }
}

exports.DiscoveryKey = {
  preencode (state, m) {
    c.uint.preencode(state, m.auth)
    c.uint.preencode(state, m.data)
  },
  encode (state, m) {
    c.uint.encode(state, m.auth)
    c.uint.encode(state, m.data)
  },
  decode (state) {
    return {
      auth: c.uint.decode(state),
      data: c.uint.decode(state)
    }
  }
}

exports.Upgrade = {
  preencode (state, m) {
    c.uint.preencode(state, m.fork)
    c.uint.preencode(state, m.length)
    c.uint.preencode(state, m.byteLength)
    c.buffer.preencode(state, m.signature)
  },
  encode (state, m) {
    c.uint.encode(state, m.fork)
    c.uint.encode(state, m.length)
    c.uint.encode(state, m.byteLength)
    c.buffer.encode(state, m.signature)
  },
  decode (state) {
    return {
      fork: c.uint.decode(state),
      length: c.uint.decode(state),
      byteLength: c.uint.decode(state),
      signature: c.buffer.decode(state)
    }
  }
}

exports.TreeNode = {
  preencode (state, m) {
    c.uint.preencode(state, m.index)
    c.uint.preencode(state, m.size)
    c.fixed32.preencode(state, m.hash)
  },
  encode (state, m) {
    c.uint.encode(state, m.index)
    c.uint.encode(state, m.size)
    c.fixed32.encode(state, m.hash)
  },
  decode (state) {
    return {
      index: c.uint.decode(state),
      size: c.uint.decode(state),
      hash: c.fixed32.decode(state)
    }
  }
}

exports.CoreAuth = {
  preencode (state, m) {
    c.uint.preencode(state, (m.localKeyPair ? 1 : 0) | (m.manifest ? 2 : 0))
    c.fixed32.preencode(state, m.key)
    if (m.localKeyPair) KeyPair.preencode(state, m.localKeyPair)
    if (m.manifest) c.buffer.preencode(state, m.manifest)
  },
  encode (state, m) {
    c.uint.encode(state, (m.localKeyPair ? 1 : 0) | (m.manifest ? 2 : 0))
    c.fixed32.encode(state, m.key)
    if (m.localKeyPair) KeyPair.encode(state, m.localKeyPair)
    if (m.manifest) c.buffer.encode(state, m.manifest)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      key: c.fixed32.decode(state),
      localKeyPair: flags & 1 ? KeyPair.decode(state) : null,
      manifest: flags & 2 ? c.buffer.decode(state) : null
    }
  }
}
