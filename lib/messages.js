const c = require('compact-encoding')

exports.DataPointer = c.uint

exports.KeyPair = {
  preencode (state, m) {
    c.uint.preencode(state, m.secretKey ? 1 : 0)
    c.fixed32.preencode(state, m.publicKey)
    if (m.secretKey) c.fixed32.preencode(state, m.secretKey)
  },
  encode (state, m) {
    c.uint.encode(state, m.secretKey ? 1 : 0)
    c.fixed32.encode(state, m.publicKey)
    if (m.secretKey) c.fixed32.encode(state, m.secretKey)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      publicKey: c.fixed32.decode(state),
      secretKey: flags & 1 ? c.fixed32.decode(state) : null
    }
  }
}

exports.StorageInfo = {
  preencode (state, m) {
    c.uint.preencode(state, m.version)
    c.uint.preencode(state, 0) // flags, reserved
    c.uint.preencode(state, m.free)
    c.uint.preencode(state, m.total)
  },
  encode (state, m) {
    c.uint.encode(state, m.version)
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

exports.CorePointer = {
  preencode (state, m) {
    c.uint.preencode(state, m.core)
    c.uint.preencode(state, m.data)
  },
  encode (state, m) {
    c.uint.encode(state, m.core)
    c.uint.encode(state, m.data)
  },
  decode (state) {
    return {
      core: c.uint.decode(state),
      data: c.uint.decode(state)
    }
  }
}

exports.CoreHead = {
  preencode (state, m) {
    c.uint.preencode(state, m.fork)
    c.uint.preencode(state, m.length)
    c.fixed32.preencode(state, m.rootHash)
    c.buffer.preencode(state, m.signature)
  },
  encode (state, m) {
    c.uint.encode(state, m.fork)
    c.uint.encode(state, m.length)
    c.fixed32.encode(state, m.rootHash)
    c.buffer.encode(state, m.signature)
  },
  decode (state) {
    return {
      fork: c.uint.decode(state),
      length: c.uint.decode(state),
      rootHash: c.fixed32.decode(state),
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
    c.uint.preencode(state, m.manifest ? 1 : 0)
    c.fixed32.preencode(state, m.key)
    if (m.manifest) c.buffer.preencode(state, m.manifest)
  },
  encode (state, m) {
    c.uint.encode(state, m.manifest ? 1 : 0)
    c.fixed32.encode(state, m.key)
    if (m.manifest) c.buffer.encode(state, m.manifest)
  },
  decode (state) {
    const flags = c.uint.decode(state)

    return {
      key: c.fixed32.decode(state),
      manifest: flags & 1 ? c.buffer.decode(state) : null
    }
  }
}

exports.DataDependency = {
  preencode (state, m) {
    c.uint.preencode(state, m.data)
    c.uint.preencode(state, m.length)
  },
  encode (state, m) {
    c.uint.encode(state, m.data)
    c.uint.encode(state, m.length)
  },
  decode (state) {
    return {
      data: c.uint.decode(state),
      length: c.uint.decode(state)
    }
  }
}

exports.CoreSeed = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.seed)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.seed)
  },
  decode (state) {
    return {
      seed: c.fixed32.decode(state)
    }
  }
}

exports.CoreEncryptionKey = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.encryptionKey)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.encryptionKey)
  },
  decode (state) {
    return {
      encryptionKey: c.fixed32.decode(state)
    }
  }
}

exports.DataInfo = {
  preencode (state, m) {
    c.uint.preencode(state, m.version)
  },
  encode (state, m) {
    c.uint.encode(state, m.version)
  },
  decode (state) {
    return {
      version: c.uint.decode(state)
    }
  }
}
