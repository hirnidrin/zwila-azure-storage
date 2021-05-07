import { Zwila } from '../../src/zwila.mjs'
import remark from 'remark'
import remarkFrontmatter from 'remark-frontmatter'
// make CommonJS work (module.exports and require) in ES6 modules, see https://stackoverflow.com/a/61947868
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// now do the CommonJS module imports
const test = require('ava')
const { ContainerClient } = require('@azure/storage-blob')
const TOML = require('@iarna/toml')

require('dotenv').config()

test.before(t => {
  t.context.endpoint = {
    account: process.env.ZWILA_STORAGEACCOUNT,
    accessKey: process.env.ZWILA_ACCESSKEY,
    container: process.env.ZWILA_CONTAINER
  }
  const d = new Date(new Date().valueOf() + 1 * 24 * 60 * 60 * 1000) // 1 day from now
  t.context.testfolder = {
    slug: 'zwila-test',
    description: 'Test folder used by AVA test runner during development.',
    expiry: d.toISOString(),
    message: `## Your downloads are available until ${d.toISOString()}`
  }
  t.context.testfolder.md = `+++
slug = '${t.context.testfolder.slug}'
description = '${t.context.testfolder.description}'
expiry = ${t.context.testfolder.expiry}
downloads = 0
+++

${t.context.testfolder.message}
`
  t.context.testfolderii = {
    foldername: 'zwila-test',
    expiry: new Date(),
    note: 'Test folder created by AVA test runner.'
  }
  // set expiry date to one day from now, see https://stackoverflow.com/a/9989458
  t.context.testfolderii.expiry.setDate(t.context.testfolderii.expiry.getDate() + 1)
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
  const res = await z.createFolder(t.context.testfolder.slug, t.context.testfolder.description, t.context.testfolder.expiry, t.context.testfolder.message)
  // console.log(t.context.testfolder.md)
  // console.log(res.markdown)
  // const tree = remark().use(remarkFrontmatter, 'toml').parse(res.markdown)
  // console.log(tree)
  t.is(t.context.testfolder.md, res.markdown)
  t.is(`https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.slug}/_zwila.md`, res.url)
  t.truthy(res.serverResponse)
})

test.serial('create a folder with omitted params', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.createFolder()
  const tree = remark().use(remarkFrontmatter, 'toml').parse(res.markdown)
  const tomlobj = tree.children.find(e => e.type === 'toml') // extract the child object representing the toml frontmatter
  const props = TOML.parse(tomlobj.value) // convert the toml props to a javascript object
  // console.log(res)
  // console.log(res.markdown)
  // console.log(tree)
  // console.log(tomlobj.value)
  // console.log(props)
  t.is(21, props.slug.length)
  const d = new Date(new Date().valueOf() + 31 * 24 * 60 * 60 * 1000).toISOString() // 31 days from now
  t.is(d.slice(0, 10), props.expiry.toISOString().slice(0, 10), 'expiry is not 31 days from now') // omit time
  t.truthy(res.serverResponse)
})

test.serial('upload the test file to the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const testfileurl = new URL(t.context.testfile.localpath, import.meta.url) // use this trick to convert relative path to absolute path
  const res = await z.uploadFile(testfileurl.pathname, t.context.testfolder.slug, t.context.testfile.blobfilename)
  t.is(res.url, `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.slug}/${t.context.testfile.blobfilename}`)
  t.truthy(res.serverResponse)
})

test('get the meta of the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.getFolderMeta(t.context.testfolder.slug)
  t.is(t.context.testfolder.md, res)
})

test('list all folders (meta and blobs of each)', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.listFolders()
  t.true(res.length >= 2)
  t.truthy(res[0].markdown)
  t.true(Array.isArray(res[0].blobs))
})

test('list the blobs in the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.listFolderBlobs(t.context.testfolder.slug)
  t.true(Array.isArray(res))
  t.true(res.length === 1)
})

test('list the test folder (meta and blobs)', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.listFolders(t.context.testfolder.slug)
  t.true(res.length === 1)
  t.truthy(res[0].markdown)
  t.true(Array.isArray(res[0].blobs))
})

test('generate SAS URL for the test file in the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.getSASUrl(t.context.testfolder.slug, t.context.testfile.blobfilename)
  // console.log(res)
  const url = res.split('?')[0]
  const token = res.split('?')[1]
  t.is(url, `https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.slug}/${t.context.testfile.blobfilename}`)
  t.regex(token, /.*sp=r&.*sig=.+$/)
})
