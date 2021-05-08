/**
 * Helpers for file handling.
 *
 * @author hirnidrin - 20210705 - Add text/markdown MIME type.
 *
 * @author Julie Ng https://github.com/julie-ng
 * @see https://github.com/julie-ng/blocklift-js/blob/master/source/util.js
 */

const FileType = require('file-type')
const isBinaryPath = require('is-binary-path')
const textMimeTypes = {
  txt: 'text/plain',
  xml: 'text/xml',
  csv: 'text/csv',
  md: 'text/markdown; charset=UTF-8'
}

function _getFilename (filepath) {
  const parts = filepath.split('/')
  return parts[parts.length - 1]
}

function _getFileExtension (filename) {
  const parts = filename.split('.')
  return parts[parts.length - 1]
}

async function _getContentTypeFromFile (filepath) {
  const filetype = await FileType.fromFile(filepath)
  const isBinary = isBinaryPath(filepath)
  let type = ''

  if (filetype && isBinary) {
    type = filetype.mime
  } else if (filetype === undefined && !isBinary) {
    type = textMimeTypes[_getFileExtension(filepath)] // refactor
  }

  return type
}

function _capitalize (str) {
  return str[0].toUpperCase() + str.slice(1)
}

module.exports = {
  capitalize: _capitalize,
  getContentTypeFromFile: _getContentTypeFromFile,
  getFilename: _getFilename,
  getFileExtension: _getFileExtension
}
