// buildroot update files
import path from 'path'
import { readFile, ensureDir } from 'fs-extra'
import { app } from 'electron'

import createLogger from '../log'
import { getConfig } from '../config'
import { CURRENT_VERSION } from '../update'
import { downloadManifest, getReleaseSet } from './release-manifest'
import { getReleaseFiles, readUserFileInfo } from './release-files'
import { startPremigration, uploadSystemFile } from './update'

import { Action, Dispatch } from '../types'
import { ReleaseSetUrls, ReleaseSetFilepaths } from './types'
import { BuildrootUpdateInfo } from '@opentrons/app'

const log = createLogger(__filename)

const DIRECTORY = path.join(app.getPath('userData'), '__ot_buildroot__')

let checkingForUpdates = false
let updateSet: ReleaseSetFilepaths | null = null

export function registerBuildrootUpdate(dispatch: Dispatch) {
  return function handleAction(action: Action) {
    switch (action.type) {
      case 'shell:CHECK_UPDATE':
        if (!checkingForUpdates) {
          checkingForUpdates = true
          checkForBuildrootUpdate(dispatch).then(
            () => (checkingForUpdates = false)
          )
        }
        break

      case 'buildroot:START_PREMIGRATION': {
        const robot = action.payload

        log.info('Starting robot premigration', { robot })

        startPremigration(robot)
          .then(
            (): Action => ({
              type: 'buildroot:PREMIGRATION_DONE',
              payload: robot.name,
            })
          )
          .catch(
            (error: Error): Action => ({
              type: 'buildroot:PREMIGRATION_ERROR',
              payload: { message: error.message },
            })
          )
          .then(dispatch)

        break
      }

      case 'buildroot:UPLOAD_FILE': {
        const { host, path, systemFile } = action.payload
        const file =
          systemFile !== null ? systemFile : updateSet && updateSet.system

        if (file == null) {
          return dispatch({
            type: 'buildroot:UNEXPECTED_ERROR',
            payload: { message: 'Buildroot update file not downloaded' },
          })
        }

        uploadSystemFile(host, path, file)
          .then(
            (): Action => ({
              type: 'buildroot:FILE_UPLOAD_DONE',
              payload: host.name,
            })
          )
          .catch(
            (error: Error): Action => {
              log.warn('Error uploading update to robot', { path, file, error })

              return {
                type: 'buildroot:UNEXPECTED_ERROR',
                payload: {
                  message: `Error uploading update to robot: ${error.message}`,
                },
              }
            }
          )
          .then(dispatch)

        break
      }

      case 'buildroot:READ_USER_FILE': {
        const { systemFile } = action.payload

        readUserFileInfo(systemFile)
          .then(
            (userFile): Action => ({
              type: 'buildroot:USER_FILE_INFO',
              payload: {
                systemFile: userFile.systemFile,
                version: userFile.versionInfo.opentrons_api_version,
              },
            })
          )
          .catch(
            (error: Error): Action => ({
              type: 'buildroot:UNEXPECTED_ERROR',
              payload: { message: error.message },
            })
          )
          .then(dispatch)

        break
      }
    }
  }
}

export function getBuildrootUpdateUrls(): Promise<ReleaseSetUrls | null> {
  const manifestUrl: string = getConfig('buildroot').manifestUrl

  return downloadManifest(manifestUrl).then(manifest => {
    const urls = getReleaseSet(manifest, CURRENT_VERSION)

    if (urls === null) {
      log.debug('No release files in manifest', {
        version: CURRENT_VERSION,
        manifest,
      })
    }

    return urls
  })
}

// check for a buildroot update matching the current app version
//   1. Ensure the buildroot directory exists
//   2. Download the manifest file from S3
//   3. Get the release files according to the manifest
//      a. If the files need downloading, dispatch progress updates to UI
//   4. Cache the filepaths of the update files in memory
//   5. Dispatch info or error to UI
export function checkForBuildrootUpdate(dispatch: Dispatch): Promise<unknown> {
  const fileDownloadDir = path.join(DIRECTORY, CURRENT_VERSION)

  return getBuildrootUpdateUrls().then(urls => {
    if (urls === null) return Promise.resolve()

    dispatch({ type: 'buildroot:UPDATE_VERSION', payload: CURRENT_VERSION })

    return ensureDir(fileDownloadDir)
      .then(() => {
        let prevPercentDone = 0

        return getReleaseFiles(urls, fileDownloadDir, progress => {
          const { downloaded, size } = progress
          if (size !== null) {
            const percentDone = Math.round((downloaded / size) * 100)

            if (Math.abs(percentDone - prevPercentDone) > 0) {
              dispatch({
                type: 'buildroot:DOWNLOAD_PROGRESS',
                payload: percentDone,
              })
              prevPercentDone = percentDone
            }
          }
        })
      })
      .then(filepaths => cacheUpdateSet(filepaths))
      .then(updateInfo => {
        dispatch({ type: 'buildroot:UPDATE_INFO', payload: updateInfo })
      })
      .catch((error: Error) => {
        dispatch({ type: 'buildroot:DOWNLOAD_ERROR', payload: error.message })
      })
  })
}

function cacheUpdateSet(
  filepaths: ReleaseSetFilepaths
): Promise<BuildrootUpdateInfo> {
  updateSet = filepaths

  return readFile(updateSet.releaseNotes, 'utf8').then(releaseNotes => ({
    version: CURRENT_VERSION,
    releaseNotes,
  }))
}
