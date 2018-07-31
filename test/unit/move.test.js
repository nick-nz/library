'use strict'

const {expect} = require('chai')
let {google} = require('googleapis')
const sinon = require('sinon')
const moment = require('moment')
const {promisify} = require('util')

let auth = require('../../server/auth')
let list = require('../../server/list')
let move = require('../../server/move')
let cache = require('../../server/cache')
const {page1, page2, page3} = require('../fixtures/driveListing')

const sampleFile = {
  fileId: 'xxxxxhz2Km1y-dFv3AVeUD4fkIdh6syCL8NDV2NxxxxxiTe74',
  destination: 'xxxxxz3-SzaA2bosRlItwcP8GEP5xxxxx3nSxT',
  html: '<html><h1>Test file </h1></html>',
  path: '/article-21-2/article-afia',
  modified: moment(0).format(),
  newPath: '/article-10-1/team-folder-1/article-afia'
}

let count = 0
const nextModified = () => {
  count += 1
  return moment(sampleFile.modified).add(count, 'days').format()
}

/* eslint-disable no-unused-expressions */

describe('Move files', () => {
  describe('results from getFolders', async () => {
    let folders
    
    before(async () => {
      folders = await move.getFolders()
    })

    it('should return only folders', () => {
      const onlyFolders = folders[0].children
        .reduce((acc, val) => acc && list.getMeta(val.id).resourceType === 'folder', true)

      expect(onlyFolders).to.be.true
    })

    it('should return a single object nested in an array', () => {
      expect(folders).to.be.an('array')
      expect(folders.length).to.equal(1)
      expect(folders[0]).to.be.an('object')
    })

    it('should specify the drive id on the top level', () => {
      expect(folders[0].id).to.equal(process.env.DRIVE_ID)
    })
    
    it('should specify a prettyName on the top level', () => {
      expect(folders[0].prettyName).to.be.a('string')
    })
  })

  describe('moveFile function', () => {
    let updateSpy, newUrl
    beforeEach(async () => {
      updateSpy = sinon.spy(updateFile)
      google.drive = () => {
        return {
          files: {
            update: updateSpy
          }
        }
      }

      const addToCache = promisify(cache.add)
      await addToCache(fileId, nextModified(), path, html)
    })

    const {fileId, destination, html, path, newPath} = sampleFile
    it('should return an error when file has no parents', async () => {
      const result = await move.moveFile('fakeId', 'fakeDest')
      expect(result).to.exist.and.be.an.instanceOf(Error)
    })

    it('should return an error when the drive id is supplied', async () => {
      const result = await move.moveFile(process.env.DRIVE_ID, 'fakeDest')
      expect(result).to.exist.and.be.an.instanceOf(Error)
    })

    describe('in team drive', () => {
      it('should use team drive options with update API', async () => {
        newUrl = await move.moveFile(fileId, destination, 'team')
        const options = updateSpy.args[0][0]
        
        expect(options.corpora).to.equal('teamDrive')
        expect(options.teamDriveId).to.equal(process.env.DRIVE_ID)
        expect(options.fileId).to.equal(fileId)
      })
    })

    describe('in shared drive', () => {
      it('should use shared drive options with update API', async () => {
        newUrl = await move.moveFile(fileId, destination, 'shared')
        const options = updateSpy.args[0][0]
        
        expect(updateSpy.calledOnce).to.be.true
        expect(options.teamDriveId).to.equal(undefined)
        expect(options.fileId).to.equal(fileId)
      })
    })

    describe('when trashing files', () => {
      let oldGetMeta = list.getMeta
      before(() => {
        list.getMeta = (id) => {
          if(id === 'trash') return {path: '/trash'}
          return oldGetMeta(id)
        }
      })

      it('should redirect to home if destination is trash', async () => {
        newUrl = await move.moveFile(fileId, 'trash', 'shared')
        expect(newUrl).to.equal('/')
      })

      after(() => {
        list.getMeta = oldGetMeta
      })

    })

    describe('cache interaction', () => {
      it('should redirect to home if no html is found with file id', async () => {
        const getCacheStub = sinon.stub(cache, 'get')
        getCacheStub.callsFake((path, cb) => {
          cb(null, [{html: null}])
        })
        
        newUrl = await move.moveFile(fileId, destination, 'shared')
        expect(newUrl).to.equal('/')
        
        getCacheStub.restore()
      })

      it('should return new url when successfully added to cache', async () => {
        newUrl = await move.moveFile(fileId, destination)

        expect(newUrl).to.equal(newPath)
      })

      it('should redirect to home if cache errors', async () => {
        const addToCacheStub = sinon.stub(cache, 'add')
        addToCacheStub.callsFake((id, modified, newurl, html, cb) => cb(Error('Add to cache error')))

        newUrl = await move.moveFile(fileId, destination, 'shared')

        expect(newUrl).to.equal('/')
      })
    })

    afterEach(async () => {
      const purgeCache = promisify(cache.purge)
      await cache.purge({url: newUrl, modified: nextModified()})
    })

  })

})

function updateFile() { return }
