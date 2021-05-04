import { Zwila } from '../../src/zwila.mjs'
// make CommonJS work (module.exports and require) in ES6 modules, see https://stackoverflow.com/a/61947868
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// now do the CommonJS module imports
const test = require('ava')
const { ContainerClient } = require('@azure/storage-blob')

require('dotenv').config()

test.before(t => {
  t.context.endpoint = {
    account: process.env.ZWILA_STORAGEACCOUNT,
    accessKey: process.env.ZWILA_ACCESSKEY,
    container: process.env.ZWILA_CONTAINER
  }
  t.context.testfolder = {
    foldername: 'zwila-test',
    expiry: new Date(),
    note: 'Test folder created by AVA test runner.'
  }
  // set expiry date to one day from now, see https://stackoverflow.com/a/9989458
  t.context.testfolder.expiry.setDate(t.context.testfolder.expiry.getDate() + 1)
  // relative path to local testfile
  t.context.testfile = {
    localpath: '../rhino.png',
    blobfilename: 'Northern_White_Rhino.png'
  }
})

test.serial('ZWILA_ env vars are set?', t => {
  t.truthy(process.env.ZWILA_STORAGEACCOUNT)
  t.truthy(process.env.ZWILA_ACCESSKEY)
  t.truthy(process.env.ZWILA_CONTAINER)
})

test.serial('zwila container exists?', async t => {
  const z = new Zwila(t.context.endpoint)
  t.true(z instanceof Zwila)
  t.true(z.containerClient instanceof ContainerClient)
  t.true(await z.hasContainer())
})

test.serial('create a folder with our t.context.testfolder params', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.createFolder(t.context.testfolder)
  t.like(res, {
    foldermeta: { downloads: 0 },
    url: `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.foldername}/foldermeta.json`
  })
  t.truthy(res.serverResponse)
})

test.serial.skip('create a folder with omitted params', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.createFolder()
  t.like(res, {
    foldermeta: { note: '', downloads: 0 },
    url: `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${res.foldermeta.foldername}/foldermeta.json`
  })
  t.truthy(res.serverRespose)
  // check if expiry date is 31 days in the future (omit time)
  const d = new Date()
  d.setDate(d.getDate() + 31)
  t.is(res.foldermeta.expiry.slice(0, 10), d.toISOString().slice(0, 10))
})

test.serial('upload the test file to the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const testfileurl = new URL(t.context.testfile.localpath, import.meta.url) // use this trick to convert relative path to absolute path
  const res = await z.uploadFile(testfileurl.pathname, t.context.testfolder.foldername, t.context.testfile.blobfilename)
  t.is(res.url, `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.foldername}/${t.context.testfile.blobfilename}`)
  t.truthy(res.serverResponse)
})

test('get the foldermeta of the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const folder = await z.getFolderMeta(t.context.testfolder.foldername)
  t.context.testfolder.expiry = t.context.testfolder.expiry.toISOString() // the Date got converted toISOString by createFolder(), so expect that
  t.like(folder,
    t.context.testfolder
  )
  t.is(folder.downloads, 0)
})

test('list blobs within the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const blobs = await z.listFolderBlobs(t.context.testfolder.foldername)
  // console.log(blobs)
  t.true(Array.isArray(blobs))
  t.true(blobs.length >= 1) // foldermeta.json must not appear
})

test('list all folders (meta and contained blobs of each)', async t => {
  const z = new Zwila(t.context.endpoint)
  const folders = await z.listFolders()
  t.true(folders.length >= 2)
  t.truthy(folders[0].foldermeta)
  t.true(Array.isArray(folders[0].folderblobs))
})

test('list the test folder (meta and contained blobs)', async t => {
  const z = new Zwila(t.context.endpoint)
  const folders = await z.listFolders(t.context.testfolder.foldername)
  t.true(folders.length === 1)
  t.truthy(folders[0].foldermeta)
  t.true(Array.isArray(folders[0].folderblobs))
})

test('generate SAS URL on test file in the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.getSASUrl(t.context.testfolder.foldername, t.context.testfile.blobfilename)
  // console.log(res)
  const url = res.split('?')[0]
  const token = res.split('?')[1]
  t.is(url, `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.foldername}/${t.context.testfile.blobfilename}`)
  t.regex(token, /.*sp=r&.*sig=.+$/)
})
