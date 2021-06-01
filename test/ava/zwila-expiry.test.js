const Zwila = require('../../src/zwila.js')
const test = require('ava')

require('dotenv').config()

test.before(t => {
  t.context.endpoint = {
    account: process.env.ZWILA_STORAGEACCOUNT,
    accessKey: process.env.ZWILA_ACCESSKEY,
    container: process.env.ZWILA_CONTAINER
  }
  const d = new Date(new Date().getTime() - 5 * 60 * 1000) // 5 mins ago
  t.context.testfolder = {
    slug: 'zwila-test-expired',
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
})

test.serial('create a folder with our t.context.testfolder params', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.createFolder(t.context.testfolder.slug, t.context.testfolder.description, t.context.testfolder.expiry, t.context.testfolder.message)
  t.is(t.context.testfolder.md, res.meta)
  t.is(`https://${t.context.endpoint.account}.blob.core.windows.net/${t.context.endpoint.container}/${t.context.testfolder.slug}/_zwila.md`, res.url)
  t.truthy(res.serverResponse)
})

test('get the meta of the test folder', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.getFolderMeta(t.context.testfolder.slug)
  t.is(t.context.testfolder.md, res)
})

test('list the test folder (meta and blobs), unless expired', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.listFolders(t.context.testfolder.slug)
  t.true(Array.isArray(res))
  t.is(0, res.length, 'expired folder must not show up')
})

test('list the test folder (meta and blobs), regardless of expiry', async t => {
  const z = new Zwila(t.context.endpoint)
  const res = await z.listFolders(t.context.testfolder.slug, true)
  t.true(Array.isArray(res))
  t.is(1, res.length, 'expired folder must show up')
})
