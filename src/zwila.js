const nanoid = require('nanoid')
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob')
const util = require('./util.js')

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
    this.metafilename = '_zwila.md'
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
   * Create a folder - Store meta info in a text/markdown file within the folder.
   *
   * @param {String=} slug - foldername, defaults to nanoid() of len 21, eg: '2uT_9rJpk5T8-UCUBLFtJ'
   * @param {String=} description - internal description, defaults to empty string
   * @param {Date|String=} expiry - Date object or ISO string, defaults to 31 days from now
   * @param {String=} message - remark formatted message to be shown to recipient of downloads
   * @returns {Promise<Object>}
   *  {
   *    meta: string with TOML frontmatter holding meta info, remark as message
   *    url: 'of created blob',
   *    serverResponse: { of Azure SDK }
   *  }
   */
  async createFolder (slug = null, description = null, expiry = null, message = null) {
    if (!slug) slug = nanoid.nanoid()
    if (!description) description = ''
    if (!expiry) {
      expiry = new Date(new Date().valueOf() + 31 * 24 * 60 * 60 * 1000).toISOString() // 31 days from now
    } else {
      expiry = new Date(expiry).toISOString() // convert any incoming date type to a string representation
    }
    let md = `+++
slug = '${slug}'
description = '${description}'
expiry = ${expiry}
downloads = 0
+++
`
    if (message) md += `\n${message}\n`

    // upload meta text as slug/this.metafilename -> creates the "folder"
    const blockBlobClient = this.containerClient.getBlockBlobClient(`${slug}/${this.metafilename}`)
    const blockBlobUploadOptions = {
      blobHTTPHeaders: {
        blobContentType: 'text/markdown; charset=UTF-8'
      }
    } // https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/blockblobuploadoptions?view=azure-node-latest
    const res = await blockBlobClient.upload(md, md.length, blockBlobUploadOptions)
    const url = decodeURIComponent(blockBlobClient.url) // bbc has the blob path encoded, eg "/"" -> "%2F", undo this
    return { meta: md, url: url, serverResponse: res }
  }

  /**
   * Upload a file to a folder.
   *
   * @param {String} sourcepath - local path to the file to be uploaded
   * @param {String} slug - target zwila folder
   * @param {String} filename - name of file created in zwila folder
   * @returns {Promise<Object>} - { url: 'blob url', serverResponse: { Azure SDK response } }
   */
  async uploadFile (sourcepath, slug, filename) {
    const filetype = await util.getContentTypeFromFile(sourcepath)
    const blockBlobClient = this.containerClient.getBlockBlobClient(`${slug}/${filename}`)
    const blockBlobUploadOptions = {
      blobHTTPHeaders: {
        blobContentType: filetype
      }
    } // https://docs.microsoft.com/en-us/javascript/api/@azure/storage-blob/blockblobuploadoptions?view=azure-node-latest
    const res = await blockBlobClient.uploadFile(sourcepath, blockBlobUploadOptions)
    const url = decodeURIComponent(blockBlobClient.url) // bbc has the blob path encoded, eg "/"" -> "%2F", undo this
    return { url: url, serverResponse: res }
  }

  /**
   * Get a folder's meta.
   *
   * @see https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs#download-blobs
   *
   * @param {String} slug - name of the top-level folder (= first path element) within the container
   * @returns {Promise<String>} - content of this.metafilename file: toml frontmatter + optional remark message
   */
  async getFolderMeta (slug) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(`${slug}/${this.metafilename}`)
    // see https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs#download-blobs
    const downloadBlockBlobResponse = await blockBlobClient.download()
    const md = await this.streamToString(downloadBlockBlobResponse.readableStreamBody)
    return md
  }

  /**
   * List a folder's blobs.
   *
   * @param {String} slug - the substring preceeding the first "/" in the blob path
   * @returns {Promise<Array>} - of blob metadata objects
   */
  async listFolderBlobs (slug) {
    const blobs = []
    for await (const item of this.containerClient.listBlobsByHierarchy('/', { prefix: `${slug}/` })) {
      if (item.kind === 'blob' && !item.name.includes(this.metafilename)) {
        blobs.push(item)
      }
    }
    return blobs
  }

  /**
   * List meta and blobs of each (or only one) folder within container.
   *
   * @param {String=} slug - optional, limit list to this one folder only
   * @returns {Promise<Array>} - of objects { meta: { }, blobs: [ {}, {}, .. ] }
   */
  async listFolders (slug = null) {
    const folders = []
    for await (const item of this.containerClient.listBlobsByHierarchy('/')) {
      if (item.kind === 'prefix') {
        const f = item.name.slice(0, -1) // chop off the trailing "/"
        if (slug && (f !== slug)) {
          continue // we just want one folder, but it is not the current one
        }
        const meta = await this.getFolderMeta(f)
        const blobs = await this.listFolderBlobs(f)
        folders.push({ meta: meta, blobs: blobs })
      }
    }
    return folders
  }

  /**
   * Create a short-lived Shared Access Signature (SAS) URL for the given blob.
   *
   * @param {String} slug
   * @param {String} filename
   * @param {Int=} minutes - SAS lifetime in minutes, defaults to 60
   * @returns {String} - SAS URL
   */
  async getSASUrl (slug, filename, minutes = 60) {
    const blobname = `${slug}/${filename}`
    const sastoken = generateBlobSASQueryParameters({
      containerName: this.containerClient.containerName,
      blobName: blobname,
      startsOn: new Date(new Date().valueOf() - 10 * 60 * 1000), // 10 mins ago, tolerate eventual clock misalignment
      expiresOn: new Date(new Date().valueOf() + minutes * 60 * 1000), // expires in: now + minutes
      permissions: BlobSASPermissions.parse('r')
    }, this.containerClient.credential)
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobname)
    const url = decodeURIComponent(blockBlobClient.url) // bbc has the blob path encoded, eg "/"" -> "%2F", undo this
    return `${url}?${sastoken}`
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

module.exports = Zwila
