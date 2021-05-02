import { nanoid } from 'nanoid'
// make CommonJS work (module.exports and require) in ES6 modules, see https://stackoverflow.com/a/61947868
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// now do the CommonJS module imports
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob')

class Zwila {
  /**
   * Init the zwila.
   *
   * @param {String} options.account - name of the Azure Storage Account that holds the container and the table
   * @param {String} options.accessKey - the corresponding Shared Access key
   * @param {String} options.container - name of container that holds the blobs
   */
  constructor (options = {}) {
    const sharedKeyCredential = new StorageSharedKeyCredential(options.account, options.accessKey)
    this.blobServiceClient = new BlobServiceClient(`https://${options.account}.blob.core.windows.net`, sharedKeyCredential)
    this.containerClient = this.blobServiceClient.getContainerClient(options.container) // holds account and container props, see
    // https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/containerclient?view=azure-node-latest
  }

  /**
   * Check if our container exists.
   *
   * @returns {Promise<Boolean>}
   */
  async hasContainer () {
    const exists = await this.containerClient.exists()
    return exists
  }

  /**
   * Create a folder - Store its meta info as a application/json object, to pathname: foldername/foldermeta.json.
   *
   * @param {String?} options.foldername - defaults to nanoid() of len 21, eg: '2uT_9rJpk5T8-UCUBLFtJ'
   * @param {Date|String?} options.expiry - Date object or ISO string, defaults to 31 days from now
   * @param {String?} options.note - defaults to empty
   *
   * @returns {Promise<Object>}
   *  {
   *    foldermeta: { foldername: {String}, expiry: {String}, note: {String}, downloads: 0 },
   *    url: 'of created blob',
   *    serverResponse: { of Azure SDK }
   *  }
   */
  async createFolder (options = {}) {
    const params = {}
    params.foldername = options.foldername ? options.foldername : nanoid()
    if (!options.expiry) {
      // no expiry date specified -> default is 31 days (one month)
      const d = new Date()
      d.setDate(d.getDate() + 31)
      params.expiry = d.toISOString()
    } else {
      params.expiry = new Date(options.expiry).toISOString() // make an ISO string of either incoming Date or String
    }
    params.note = options.note ? options.note : ''
    params.downloads = 0
    // upload content as foldername/foldermeta.json -> creates the "folder"
    const content = JSON.stringify(params)
    const blockBlobClient = this.containerClient.getBlockBlobClient(`${params.foldername}/foldermeta.json`)
    const blockBlobUploadOptions = {
      blobHTTPHeaders: {
        blobContentType: 'application/json'
      }
    } // https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/blockblobuploadoptions?view=azure-node-latest
    const res = await blockBlobClient.upload(content, content.length, blockBlobUploadOptions)
    res.url = decodeURIComponent(blockBlobClient.url) // bbc has the blob path encoded, eg "/"" -> "%2F", undo this
    res.foldermeta = params
    return res
  }

  /**
   * Get a folder's meta.
   *
   * @see https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs#download-blobs
   *
   * @param {String} foldername - name of the top-level folder (= first path element) within the container
   * @returns {Promise<Object>} - { foldername: {String}, expiry: {String}, note: {String}, downloads: {Int} }
   */
  async getFolderMeta (foldername) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(`${foldername}/foldermeta.json`)
    // see https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs#download-blobs
    const downloadBlockBlobResponse = await blockBlobClient.download(0)
    const json = await this.streamToString(downloadBlockBlobResponse.readableStreamBody)
    return JSON.parse(json)
  }

  /**
   * List a folder's blobs.
   *
   * @param {String} foldername - the substring preceeding the first "/" in the blob path
   * @returns {Promise<Array>} - of blob metadata objects
   */
  async listFolderBlobs (foldername) {
    const blobs = []
    for await (const item of this.containerClient.listBlobsByHierarchy('/', { prefix: `${foldername}/` })) {
      if (item.kind === 'blob' && !item.name.includes('foldermeta.json')) {
        blobs.push(item)
      }
    }
    return blobs
  }

  /**
   * List foldermeta and contained blobs for each (or one) folder within container.
   *
   * @param {String?} foldername - optional, limit list to this one folder only
   * @returns {Promise<Array>} - of objects { foldermeta: { }, folderblobs: [ {}, {}, .. ] }
   */
  async listFolders (foldername = null) {
    const folders = []
    for await (const item of this.containerClient.listBlobsByHierarchy('/')) {
      if (item.kind === 'prefix') {
        const f = item.name.slice(0, -1) // chop off the trailing "/"
        if (foldername && (f !== foldername)) {
          continue // we just want one folder, but it is not the current one
        }
        const meta = await this.getFolderMeta(f)
        const blobs = await this.listFolderBlobs(f)
        folders.push({ foldermeta: meta, folderblobs: blobs })
      }
    }
    return folders
  }

  /**
   * A helper function used to read a Node.js readable stream into a string
   *
   * @see https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs#download-blobs
   *
   * @param {ReadableStream} readableStream - incoming stream
   * @returns {Promise<String>} - the pieced-together string after streaming has finished
   */
  async streamToString (readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = []
      readableStream.on('data', (data) => {
        chunks.push(data.toString())
      })
      readableStream.on('end', () => {
        resolve(chunks.join(''))
      })
      readableStream.on('error', reject)
    })
  }
}

export { Zwila }
