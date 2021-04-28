class Zwila {
  /**
   * Init the zwila.
   *
   * @param {String} options.account - name of the Azure Storage Account that holds the container and the table
   * @param {String} options.authkey - the corresponding Shared Access key
   * @param {String} options.container - name of container that holds the blobs
   * @param {String} options.table - name of the table that holds meta info about the blobs
   */
  constructor (options = {}) {
    this.account = options.account
    this.authkey = options.authkey
    this.container = options.container
    this.table = options.table
  }
}

module.exports = Zwila
