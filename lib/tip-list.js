const { ASSERTION } = require('hypercore-errors')

module.exports = class TipList {
  constructor () {
    this.offset = 0
    this.data = []
  }

  end () {
    return this.offset + this.data.length
  }

  put (index, value) {
    if (this.data.length === 0) {
      this.offset = index
      this.data.push(value)
      return
    }

    if (this.end() === index) {
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
    if (this.end() < tip.offset) throw ASSERTION('Cannot merge tip list')
    while (this.end() !== tip.offset && tip.offset >= this.offset && tip.end() >= this.end()) this.data.pop()
    for (const data of tip.data) this.data.push(data)

    return this
  }
}
