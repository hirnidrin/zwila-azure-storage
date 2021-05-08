# zwila-azure-storage

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)

## Synopsis

npm package to manage and use a single container of an Azure Storage Account (ASA) as backend for anonymous (but targeted and restricted) file distribution.

### Data structure in container
* Top level "folders": blob name prefix, string up to first "/" char.
  * "Cryptographic" autonaming of folders with [nanoid](https://www.npmjs.com/package/nanoid) -> hard to guess folder names.
* Each folder may contain a number of blobs.

### Access control
* The package facilitates building a proxy webservice for access control on folder level.
  * The ASA container does not need to allow public anonymous access.
  * The package authenticates to the ASA with an access key. 
* On download requests, the proxy generates a short-lived Shared Access Signature (SAS) URL and gives it to the client, which downloads the blob straight from the ASA.
* Folders expire after a number of days (default 31), proxy stops giving access.

### Typical use case - download page on your website
* Use the package to create a folder in the ASA container. Upload files to it. Note the generated foldername, eg "V1StGXR8_Z5jdHi6B-myT".
* Have an empty "one-way file transfer" landing page on your website that takes a link with a zwila folder name, eg https://example.com/transit/V1StGXR8_Z5jdHi6B-myT
* Use the package to check if the link is valid and the folder is non-expired, and to list the corresponding files on the landing page. Otherwise leave page empty, or show a message.
* Distribute the link to persons that shall have anonymous, temporally restricted access to the downloads within that folder.
* Persons see the downloads on the landing page, as if stored on your website. On click, they download from Azure.

## Usage, API

Todo. For now, study and run the unit tests to see how it works.

## Run unit tests
To run the tests in the `test/ava` directory
1. Have an Azure Storage Account, and create a container.
1. Create an `.env` file in the package root, with these 3 vars:

var | for
-|-
ZWILA_STORAGEACCOUNT | ASA name
ZWILA_ACCESSKEY | ASA access key
ZWILA_CONTAINER | name of container for our tests
 
1. Run `yarn test` in the package root.
