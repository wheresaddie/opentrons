// @flow
import flatten from 'lodash/flatten'
import memoize from 'lodash/memoize'
import isEmpty from 'lodash/isEmpty'
import {computeWellAccess, getLabware} from '@opentrons/shared-data'
import type {Wells, ContentsByWell} from '../labware-ingred/types'

type WellSetByWell = Array<Array<string>>

/** Compute all well sets for a labware type.
  * A well set is array of 8 wells that an 8 channel pipettes can fit into,
  * eg ['A1', 'C1', 'D1', 'E1', 'G1', 'I1', 'K1', 'M1'] is a well set in a 384 plate.
**/
function _getAllWellSetsForLabware (labwareName: string): ?WellSetByWell {
  const labware = getLabware(labwareName)

  if (!labware) {
    console.warn(`No labware definition found for labware ${labwareName}`)
    return null
  }

  const allWells = flatten(labware.ordering)
  const allWellSets: WellSetByWell = allWells.reduce((acc: WellSetByWell, well: string) => {
    const wellSet = computeWellAccess(labwareName, well)

    return (wellSet === null)
      ? acc
      : [...acc, wellSet]
  }, [])

  return allWellSets
}

/** Memoize _getAllWellSetsForLabware so well sets don't need to be computed
  * for the same labware more than once.
  * NOTE: This assumes labware definitions are static. Custom labware must
  * somehow invalidate this cache.
**/
const _getAllWellSetsForLabwareMemoized = memoize(_getAllWellSetsForLabware)

function _getWellSetForMultichannel (labwareName: string, well: string): ?Array<string> {
  /** Given a well for a labware, returns the well set it belongs to (or null)
    * for 8-channel access.
    * Ie: C2 for 96-flat => ['A2', 'B2', 'C2', ... 'H2']
  **/
  const allWellSets = _getAllWellSetsForLabwareMemoized(labwareName)
  if (!allWellSets) {
    return null
  }

  return allWellSets.find((wellSet: Array<string>) => wellSet.includes(well))
}

export const getWellSetForMultichannel = memoize(
  _getWellSetForMultichannel,
  (labwareName: string, well: string) => `$LABWARE:${labwareName}--WELL:${well}`
)

export function wellSetToWellObj (wellSet: ?Array<string>): Wells {
  return wellSet
    ? wellSet.reduce((acc: Wells, well: string) => ({...acc, [well]: well}), {})
    : {}
}

export const getSelectedWellsCommonValues = (wellContents: ContentsByWell, selectedWells: Wells) => {
  let commonSelectedLiquidId = null
  let commonSelectedVolume = null
  if (!isEmpty(wellContents) && !isEmpty(selectedWells)) {
    const firstSelectedWell = Object.keys(selectedWells)[0]
    const volumesByLiquidId = (wellContents[firstSelectedWell] && wellContents[firstSelectedWell].ingreds) || {}
    const firstSelectedLiquidId = Object.keys(volumesByLiquidId)[0] || null
    const firstSelectedVolume = firstSelectedLiquidId && volumesByLiquidId[firstSelectedLiquidId].volume

    const hasCommonSelectedLiquidId = Object.keys(selectedWells).every(well => {
      const ingreds = (wellContents[well] && wellContents[well].ingreds) ? Object.keys(wellContents[well].ingreds) : []
      return ingreds.length === 1 && ingreds[0] === firstSelectedLiquidId
    })
    const hasCommonSelectedVolume = Object.keys(selectedWells).every(well => {
      if (!(wellContents[well] && wellContents[well].ingreds && wellContents[well].ingreds[firstSelectedLiquidId])) return false
      return wellContents[well].ingreds[firstSelectedLiquidId].volume === firstSelectedVolume
    })
    commonSelectedLiquidId = hasCommonSelectedLiquidId ? firstSelectedLiquidId : null
    commonSelectedVolume = hasCommonSelectedVolume ? firstSelectedVolume : null
  }
  return {commonSelectedLiquidId, commonSelectedVolume}
}
