const { ASSERTION } = require('hypercore-errors')

module.exports = class TipList {
  constructor () {
    this.offset = 0
    this.removed = 0
    this.data = []
  }

  length () {
    return this.offset + this.data.length
  }

  end () {
    if (this.removed) return this.removed
    return this.offset + this.data.length
  }

  delete (start, end) {
    if (end !== -1) {
      if (end < this.length() || (this.length() < start && this.length() !== 0)) {
        throw ASSERTION('Invalid delete on tip list')
      }
    }

    if (this.end() === 0) this.offset = start
    if (this.removed < end || end === -1) this.removed = end

    if (start < this.offset) {
      this.offset = start
      this.data = [] // clear everything
      return
    }

    while (this.length() > start) this.data.pop()
  }

  put (index, value) {
    if (this.end() === 0) {
      this.offset = index
      this.data.push(value)
      return
    }

    if (!this.removed && this.end() === index) {
      this.data.push(value)
      return
    }

    throw ASSERTION('Invalid put on tip list')
  }

  get (index) {
    index -= this.offset
    if (index >= this.data.length || index < 0) return null
    return this.data[index]
  }

  * [Symbol.iterator] () {
    for (let i = 0; i < this.data.length; i++) {
      yield [i + this.offset, this.data[i]]
    }
  }

  merge (tip) {
    const invalidDeletion = tip.removed && tip.end() !== -1 && tip.end() < this.end()
    const invalidTip = (tip.removed !== -1 && tip.end() < this.offset) || this.end < tip.offset

    if (invalidTip || invalidDeletion) throw ASSERTION('Cannot merge tip list')

    while (this.end() !== tip.offset && tip.offset >= this.offset && tip.end() >= this.end()) this.data.pop()
    while (tip.removed && this.end() > tip.length() && this.data.length) this.data.pop()

    for (const data of tip.data) this.data.push(data)

    return this
  }
}
